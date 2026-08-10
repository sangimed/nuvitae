import { describe, expect, it, vi } from "vitest";

import {
  createImportEventEmitter,
  emitImportEvent,
  importEventSchemas,
  type ImportEventEmitter,
  type ImportEventRecord,
  type ImportEventSink,
} from "./import-events.js";

class RecordingSink implements ImportEventSink {
  readonly records: ImportEventRecord[] = [];

  write(record: ImportEventRecord): void {
    this.records.push(record);
  }
}

const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("privacy-safe import events (T075)", () => {
  it("exposes a closed event-name vocabulary with strict per-event metadata", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);

    emitter.emit("import.created", {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
      unexpected: "dropped-value",
      resumeContent: "full resume text",
    });
    emitter.emit("import.created" as never, {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });

    expect(sink.records).toHaveLength(2);
    expect(sink.records[0]?.metadata).toEqual({
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });
    expect(JSON.stringify(sink.records)).not.toContain("dropped-value");
    expect(JSON.stringify(sink.records)).not.toContain("full resume text");
  });

  it("drops unknown event names and rejects invalid known metadata", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);

    emitter.emit("import.created" as never, {
      importId,
      statusCode: "not-a-number" as never,
      fileSizeBucket: "under_1_mib",
    });
    emitter.emit("not.a.real.event" as never, { importId });
    emitter.emit("import.created" as never, {
      importId: "x".repeat(200),
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });

    expect(sink.records).toEqual([]);
  });

  it("bounds oversized strings and rejects control characters in identifiers", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);

    emitter.emit("import.created" as never, {
      importId: `valid-id-${"x".repeat(70)}`,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });
    emitter.emit("import.created" as never, {
      importId: "valid-id-with-control\u0000char",
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });

    expect(sink.records).toEqual([]);
  });

  it("never serializes raw Error objects and drops nested errors", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);
    const error = new Error(
      "provider-native password=secret stack=at /private",
    );

    emitter.emit("import.created" as never, {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
      error,
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.metadata).toEqual({
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });
    expect(JSON.stringify(sink.records)).not.toContain("password=secret");
  });

  it("does not invoke hostile getters, custom toJSON, symbols, or circular values", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);
    const getter = vi.fn(() => "PRIVLOG-GETTER-VALUE");
    const toJSON = vi.fn(() => ({ leaked: "PRIVLOG-TOJSON-VALUE" }));
    const hostile: Record<string, unknown> = {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    };
    Object.defineProperty(hostile, "importId", {
      enumerable: true,
      get: getter,
    });
    hostile.circular = hostile;
    hostile[Symbol("private")] = "PRIVLOG-SYMBOL-VALUE";
    (hostile as unknown as { toJSON: unknown }).toJSON = toJSON;

    expect(() =>
      emitter.emit("import.created" as never, hostile),
    ).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(sink.records).toEqual([]);
    expect(JSON.stringify(sink.records)).not.toContain("PRIVLOG-GETTER-VALUE");
    expect(JSON.stringify(sink.records)).not.toContain("PRIVLOG-SYMBOL-VALUE");
    expect(JSON.stringify(sink.records)).not.toContain("PRIVLOG-TOJSON-VALUE");
  });

  it("does not mutate the original metadata and emits deterministic records", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);
    const metadata = {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib" as const,
      extra: { nested: "value" },
    };
    const frozen = Object.freeze({ ...metadata });

    expect(() =>
      emitter.emit("import.created", metadata as never),
    ).not.toThrow();
    expect(metadata.extra).toEqual({ nested: "value" });
    expect(sink.records[0]?.metadata).toEqual({
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });

    emitter.emit("import.created", {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
    });
    expect(JSON.stringify(sink.records[0])).toBe(
      JSON.stringify(sink.records[1]),
    );
    void frozen;
  });

  it("swallows sink failures so logging never breaks an import", () => {
    const failing: ImportEventSink = {
      write: vi.fn(() => {
        throw new Error("sink unavailable");
      }),
    };
    const emitter = createImportEventEmitter(failing);

    expect(() =>
      emitter.emit("import.created", {
        importId,
        statusCode: 201,
        fileSizeBucket: "under_1_mib",
      }),
    ).not.toThrow();
  });

  it("keeps provider and general import events on one coherent privacy model", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);

    emitter.emit("semantic.outcome", {
      importId,
      outcome: "provider_unavailable",
      retryable: true,
      valueCountBucket: "0-4",
      diagnosticCountBucket: "0-4",
      durationBucket: "under_100ms",
      rawProviderOutput: "PRIVLOG-RAW-PROVIDER",
    });
    emitter.emit("import.created", {
      importId,
      statusCode: 201,
      fileSizeBucket: "under_1_mib",
      rawRequestBody: "PRIVLOG-REQUEST-BODY",
    });

    expect(sink.records).toHaveLength(2);
    expect(sink.records[0]?.metadata).not.toHaveProperty("rawProviderOutput");
    expect(sink.records[1]?.metadata).not.toHaveProperty("rawRequestBody");
    expect(JSON.stringify(sink.records)).not.toContain("PRIVLOG-RAW-PROVIDER");
    expect(JSON.stringify(sink.records)).not.toContain("PRIVLOG-REQUEST-BODY");
    expect(Object.keys(sink.records[0]!.metadata)).toEqual([
      "importId",
      "outcome",
      "retryable",
      "valueCountBucket",
      "diagnosticCountBucket",
      "durationBucket",
    ]);
  });

  it("accepts bounded V2 envelope diagnostics without semantic values or raw output", () => {
    const sink = new RecordingSink();
    const emitter = createImportEventEmitter(sink);

    emitter.emit("semantic.provider_v2_envelope_diagnostics", {
      importId,
      responseContractVersion: "nuvitae.semantic-extraction.v2",
      semanticJsonParseSucceeded: true,
      canonicalizerReached: true,
      failureStage: "v2_envelope",
      topLevelValueCategory: "object",
      schemaVersionCategory: "other_string",
      topLevelKeys: ["schemaVersion", "sections"],
      missingTopLevelKeys: ["relationships"],
      unexpectedTopLevelKeys: ["response"],
      unrecognizedTopLevelKeyPresent: false,
      sectionsValueCategory: "object",
      sectionKeys: ["contact", "headline"],
      missingSectionKeys: ["summary"],
      unexpectedSectionKeys: [],
      unrecognizedSectionKeyPresent: false,
      relationshipsValueCategory: "missing",
      ambiguitiesValueCategory: "array",
      conflictsValueCategory: "array",
      firstZodIssueCode: "invalid_type",
      firstZodPath: ["sections", "headline"],
      issueCountBucket: "0-4",
      resumeValue: "PRIVLOG-RESUME-VALUE",
      rawProviderResponse: "PRIVLOG-RAW-RESPONSE",
      prompt: "PRIVLOG-PROMPT",
      sourceText: "PRIVLOG-SOURCE",
    } as never);

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]?.metadata).toMatchObject({
      responseContractVersion: "nuvitae.semantic-extraction.v2",
      topLevelKeys: ["schemaVersion", "sections"],
      unexpectedTopLevelKeys: ["response"],
      firstZodPath: ["sections", "headline"],
    });
    const serialized = JSON.stringify(sink.records);
    expect(serialized).not.toContain("PRIVLOG-RESUME-VALUE");
    expect(serialized).not.toContain("PRIVLOG-RAW-RESPONSE");
    expect(serialized).not.toContain("PRIVLOG-PROMPT");
    expect(serialized).not.toContain("PRIVLOG-SOURCE");
  });

  it("drops provider, model, and error metadata for every registered event without leaking", () => {
    const sink = new RecordingSink();
    const emitter: ImportEventEmitter = createImportEventEmitter(sink);
    for (const event of Object.keys(
      importEventSchemas,
    ) as (keyof typeof importEventSchemas)[]) {
      emitter.emit(event as never, {
        importId,
        correlationId: importId,
        requestId: importId,
        connectionId: importId,
        draftId: importId,
        deletionJobId: importId,
        statusCode: 201,
        errorCategory: "not_found",
        operation: "status",
        retryable: false,
        durationBucket: "under_100ms",
        pageCountBucket: "one",
        languageCategory: "english",
        fileSizeBucket: "under_1_mib",
        documentFormat: "pdf",
        extractionCategory: "complete",
        fieldCountBucket: "0-4",
        warningCountBucket: "0-4",
        fragmentCountBucket: "0-4",
        lineCountBucket: "0-4",
        valueCountBucket: "0-4",
        diagnosticCountBucket: "0-4",
        outcome: "accepted",
        contractVersion: "nuvitae.semantic-extraction.v1",
        category: "schema",
        code: "schema.invalid",
        requiresReview: false,
        path: ["sections", "contact", "fullName"],
        fragmentId: importId,
        line: 1,
        operationType: "edit_field",
        reviewRevision: 0,
        retryAfterSeconds: 30,
        jobType: "validation",
        providerKind: "PRIVLOG-PROVIDER",
        modelName: "PRIVLOG-MODEL",
        rawError: new Error("PRIVLOG-ERROR"),
      });
    }
    const serialized = JSON.stringify(sink.records);
    expect(serialized).not.toContain("PRIVLOG-PROVIDER");
    expect(serialized).not.toContain("PRIVLOG-MODEL");
    expect(serialized).not.toContain("PRIVLOG-ERROR");
  });
});

describe("emitImportEvent direct API", () => {
  it("writes frozen records with only primitives and bounded path arrays", () => {
    const sink = new RecordingSink();
    emitImportEvent(sink, "semantic.validation_diagnostics", {
      importId,
      correlationId: importId,
      category: "no_invention",
      code: "invented_fact",
      retryable: false,
      requiresReview: true,
      path: ["sections", "skills", 0, "name"],
    });

    expect(sink.records[0]?.metadata).toEqual({
      importId,
      correlationId: importId,
      category: "no_invention",
      code: "invented_fact",
      retryable: false,
      requiresReview: true,
      path: ["sections", "skills", 0, "name"],
    });
    expect(Object.isFrozen(sink.records[0])).toBe(true);
    expect(Object.isFrozen(sink.records[0]?.metadata)).toBe(true);
  });
});
