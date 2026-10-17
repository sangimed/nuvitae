import { describe, expect, it } from "vitest";
import {
  deterministicExtractionJobPayloadSchema,
  importResumeJobSchemaVersion,
} from "@nuvitae/contracts";
import {
  createImportEventEmitter,
  emitImportEvent,
  emitImportTiming,
  type ImportEventRecord,
} from "@nuvitae/import-application";

const importId = "11111111-1111-4111-8111-111111111111";
const correlationId = "22222222-2222-4222-8222-222222222222";
const requestedAt = "2026-09-10T00:00:00.000Z";
const payload = {
  schemaVersion: importResumeJobSchemaVersion,
  jobType: "deterministic_extraction",
  importId,
  correlationId,
  owner: { ownerUserId: "33333333-3333-4333-8333-333333333333" },
  idempotencyKey: "evaluation-extraction",
  requestedAt,
  documentFormat: "pdf",
  sourceStorageKey: "synthetic/private-source",
  validationCompletedAt: requestedAt,
  foregroundDeadline: "2026-09-10T00:03:00.000Z",
};

// A serialization/privacy contract probe, not an HTTP/BullMQ/provider trace.
describe("observability evaluation boundary probe", () => {
  it("preserves distinct correlation through job serialization and safe stage records", () => {
    const job = deterministicExtractionJobPayloadSchema.parse(
      JSON.parse(JSON.stringify(payload)),
    );
    const records: ImportEventRecord[] = [];
    const emitter = createImportEventEmitter({
      write: (record) => records.push(record),
    });
    for (const [phase, source, offset] of [
      ["queue_enqueued", "api", 13],
      ["worker_started", "worker", 47],
      ["provider_started", "worker", 109],
      ["draft_persisted", "worker", 503],
      ["review_api_available", "api", 617],
    ] as const) {
      emitImportTiming(emitter, {
        importId: job.importId,
        correlationId: job.correlationId,
        phase,
        source,
        at: new Date(Date.parse(requestedAt) + offset),
      });
    }
    expect(records.map((record) => record.metadata)).toEqual(
      [
        ["queue_enqueued", "api", 13],
        ["worker_started", "worker", 47],
        ["provider_started", "worker", 109],
        ["draft_persisted", "worker", 503],
        ["review_api_available", "api", 617],
      ].map(([phase, source, offset]) => ({
        importId,
        correlationId,
        phase,
        source,
        timestampMs: 1_788_998_400_000 + Number(offset),
      })),
    );
    expect(JSON.stringify(records)).not.toMatch(/owner|sourceStorageKey/);
  });

  it("projects safe metadata instead of exporting a job or arbitrary diagnostic", () => {
    const records: ImportEventRecord[] = [];
    emitImportEvent(
      { write: (record) => records.push(record) },
      "import.timing",
      {
        ...payload,
        jobType: "extraction",
        phase: "provider_started",
        source: "worker",
        timestampMs: 123,
        filename: "synthetic-file",
        resumeContent: "synthetic-content",
        sourceFragments: ["synthetic-fragment"],
        prompt: "synthetic-prompt",
        response: "synthetic-response",
        accessToken: "synthetic-credential",
        contact: "synthetic-contact",
        body: { arbitrary: true },
      },
    );
    expect(records).toEqual([
      {
        level: "info",
        event: "import.timing",
        metadata: {
          importId,
          correlationId,
          phase: "provider_started",
          source: "worker",
          jobType: "extraction",
          timestampMs: 123,
        },
      },
    ]);
  });

  it("rejects malformed correlation and timing rather than inventing a successful span", () => {
    expect(
      deterministicExtractionJobPayloadSchema.safeParse({
        ...payload,
        correlationId: "not-a-uuid",
      }).success,
    ).toBe(false);
    const records: ImportEventRecord[] = [];
    const sink = { write: (record: ImportEventRecord) => records.push(record) };
    emitImportEvent(sink, "import.timing", {
      importId,
      correlationId,
      phase: "provider_started",
      source: "worker",
      timestampMs: -1,
    });
    emitImportEvent(sink, "import.timing", {
      importId,
      correlationId: "line\nbreak",
      phase: "provider_started",
      source: "worker",
      timestampMs: 1,
    });
    expect(records).toEqual([]);
  });

  it("does not let a failed telemetry sink interrupt application work", () => {
    const emitter = createImportEventEmitter({
      write: () => {
        throw new Error("synthetic sink unavailable");
      },
    });
    expect(() =>
      emitImportTiming(emitter, {
        importId,
        correlationId,
        phase: "provider_started",
        source: "worker",
        at: new Date(requestedAt),
      }),
    ).not.toThrow();
  });
});
