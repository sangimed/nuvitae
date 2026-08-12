import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ImportedDocument } from "@nuvitae/domain";
import type { ResumeSemanticParserProvider } from "@nuvitae/import-application";
import {
  fallbackTriggerForProviderError,
  SemanticImportProcessor,
  T217_SEMANTIC_FALLBACK_BUDGET,
} from "./semantic-import.processor.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-08-01T09:30:00.000Z");

function document(overrides: Partial<ImportedDocument> = {}): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 42,
    storageKey: "users/a/imports/b/source/c",
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-08T09:30:00.000Z"),
    detectedLanguage: "english",
    ...overrides,
  };
}

function response(text: string) {
  const normalized = text.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const evidence = {
    line: 1,
    start: 0,
    end: normalized.length,
    fragmentHash: createHash("sha256").update(normalized).digest("hex"),
    fragmentId: null,
  };
  const value = {
    value: normalized,
    normalizedValue: null,
    evidence: [evidence],
    classification: "explicit" as const,
    confidence: "high" as const,
  };
  return {
    schemaVersion: "nuvitae.semantic-extraction.v1" as const,
    documentLanguage: {
      value: "english" as const,
      confidence: "high" as const,
      evidence: [evidence],
    },
    sections: {
      contact: {
        fullName: value,
        email: null,
        phone: null,
        location: null,
        website: null,
      },
      headline: null,
      summary: null,
      workExperience: [],
      education: [],
      skills: [{ candidateId: "skill-1", name: value, category: null }],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

function setup(
  provider?: ResumeSemanticParserProvider,
  textItems = ["Ada Lovelace"],
) {
  const logger = { emit: vi.fn() };
  const repository = {
    findImportByOwner: vi.fn(async () => ({
      document: document(),
      artifacts: [],
    })),
    findDraftByImportAndOwner: vi.fn(async () => null),
    saveImportLifecycle: vi.fn(async (value: ImportedDocument) => value),
    saveDraft: vi.fn(async (value: unknown) => value),
  };
  const transactionRunner = {
    transaction: vi.fn(async (work: (manager: object) => Promise<unknown>) =>
      work({}),
    ),
  };
  const textExtractor = {
    extractSelectableText: vi.fn(async () => ({
      ok: true as const,
      value: [
        {
          pageNumber: 1,
          pageReadingOrder: 0,
          items: textItems.map((text, itemIndex) => ({
            text,
            provenance: {
              kind: "pdf_text_item" as const,
              pageNumber: 1,
              itemIndex,
              readingOrder: itemIndex,
              boundingBox: {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                unit: "pdf_point" as const,
              },
            },
          })),
        },
      ],
    })),
  };
  const processor = new SemanticImportProcessor({
    repository: repository as never,
    transactionRunner: transactionRunner as never,
    sourceReader: {} as never,
    pdfTextExtractor: textExtractor as never,
    docxTextExtractor: {} as never,
    provider,
    clock: { now: () => now },
    logger: logger as never,
  });
  return { processor, repository, transactionRunner, textExtractor, logger };
}

const provider = {
  providerKind: "test-stub",
  capabilities: {
    supportedDocumentFormats: ["pdf"],
    supportedDocumentLanguages: ["english"],
    supportsNonInteractiveParsing: true,
    supportsStructuredJson: true,
    supportsCanonicalFlattenedEvidence: true,
    acceptsNormalizedTranscript: true,
    acceptsRawStoragePaths: false,
    exposesCredentialsToDomain: false,
    predictsPhysicalCoordinates: false,
    maxRequestJsonBytes: 256000,
    maxResponseJsonBytes: 256000,
    maxTimeoutMs: 3000,
  },
  inspectConnection: vi.fn(),
  parse: vi.fn(async (request: { normalizedTranscript: { text: string } }) => ({
    ok: true as const,
    response: response(request.normalizedTranscript.text),
  })),
} satisfies ResumeSemanticParserProvider;

describe("SemanticImportProcessor", () => {
  it("exposes the bounded application-owned provider budget", () => {
    expect(T217_SEMANTIC_FALLBACK_BUDGET).toEqual({
      maximumPrimaryProviderAttempts: 1,
      maximumFallbackAttempts: 1,
      maximumTotalSemanticProviderCalls: 1,
      automaticProviderRetry: false,
    });
  });

  it.each([
    ["not_configured", "no_provider"],
    ["provider_unavailable", "provider_unavailable"],
    ["rate_limited", "rate_limited"],
    ["quota_exceeded", "quota_exhausted"],
    ["timeout", "timeout"],
    ["invalid_provider_response", "malformed_provider_output"],
    ["schema_violation", "malformed_provider_output"],
    ["unsupported_contract_version", "malformed_provider_output"],
    ["malformed_flattened_evidence", "malformed_provider_output"],
    ["response_too_large", "malformed_provider_output"],
  ] as const)("classifies eligible failure %s as %s", (code, trigger) => {
    expect(fallbackTriggerForProviderError(code)).toBe(trigger);
  });

  it.each([
    "authentication_expired",
    "authentication_revoked",
    "disconnected",
    "unsupported_capability",
    "invalid_grounding",
    "ambiguous_output",
    "conflicting_output",
    "explicit_absence_mismatch",
    "invented_fact",
    "cancelled",
    "unknown_provider_failure",
  ] as const)("keeps non-fallback failure %s terminal", (code) => {
    expect(fallbackTriggerForProviderError(code)).toBeUndefined();
  });

  it("fails closed with provider_unavailable and does not create a draft", async () => {
    const { processor, repository } = setup();
    await processor.process({ ownerUserId, importedDocumentId: importId });
    expect(repository.saveDraft).not.toHaveBeenCalled();
    expect(repository.saveImportLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ processingStatus: "provider_unavailable" }),
      expect.anything(),
    );
  });

  it("validates provider output before atomically persisting the review draft", async () => {
    const { processor, repository } = setup(provider);
    await processor.process({ ownerUserId, importedDocumentId: importId });
    expect(provider.parse).toHaveBeenCalledTimes(1);
    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
    expect(repository.saveImportLifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingStatus: "ready_for_review" }),
      expect.anything(),
    );
    expect(JSON.stringify(repository.saveDraft.mock.calls)).not.toContain(
      "schemaVersion",
    );
  });

  it("does not label the whole normalized document as source-stage Summary", async () => {
    const harness = setup(provider, [
      "Ada Lovelace",
      ...Array.from({ length: 120 }, (_, index) => `Document line ${index}`),
    ]);

    await harness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });

    const sourceStage = harness.logger.emit.mock.calls.find(
      ([event]) => event === "semantic.source_fidelity",
    );
    expect(sourceStage?.[1]).toMatchObject({
      stage: "source_extraction",
      longFormFieldCategory: "summary",
      sourceCoverageCategory: "unknown",
      sourceRefCountBucket: "unknown",
      sourceCharacterCountBucket: "unknown",
      acceptedCharacterCountBucket: "unknown",
    });
  });

  it.each([
    "provider_unavailable",
    "rate_limited",
    "quota_exceeded",
    "timeout",
  ] as const)(
    "runs one bounded deterministic fallback after eligible %s failure",
    async (code) => {
      const unavailableProvider = {
        ...provider,
        parse: vi.fn(async () => ({
          ok: false as const,
          error: {
            code,
            retryable: true,
            recoveryActions: ["retry"] as const,
            diagnostic: code,
            validationIssues: [],
          },
        })),
      } satisfies ResumeSemanticParserProvider;
      const { processor, repository } = setup(unavailableProvider, [
        "Email: jane@example.com",
      ]);

      await processor.process({ ownerUserId, importedDocumentId: importId });

      expect(unavailableProvider.parse).toHaveBeenCalledTimes(1);
      expect(repository.saveDraft).toHaveBeenCalledTimes(1);
      expect(repository.saveDraft.mock.calls[0]?.[0]).toMatchObject({
        fields: [
          expect.objectContaining({
            fieldPath: "contact.email",
            sourceStatus: "explicit_source",
            confidenceStatus: "high",
            inferenceStatus: "not_inferred",
          }),
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({ warningType: "partial" }),
        ]),
      });
      expect(repository.saveImportLifecycle).toHaveBeenLastCalledWith(
        expect.objectContaining({ processingStatus: "ready_for_review" }),
        expect.anything(),
      );
    },
  );

  it("runs the same bounded fallback when no provider is configured", async () => {
    const { processor, repository } = setup(undefined, [
      "Email: jane@example.com",
    ]);

    await processor.process({ ownerUserId, importedDocumentId: importId });

    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
    expect(repository.saveImportLifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingStatus: "ready_for_review" }),
      expect.anything(),
    );
  });

  it("uses the bounded fallback for protocol/schema-invalid output", async () => {
    const malformedProvider = {
      ...provider,
      parse: vi.fn(async () => ({
        ok: true as const,
        response: {} as never,
      })),
    } satisfies ResumeSemanticParserProvider;
    const { processor, repository } = setup(malformedProvider, [
      "Email: jane@example.com",
    ]);

    await processor.process({ ownerUserId, importedDocumentId: importId });

    expect(malformedProvider.parse).toHaveBeenCalledTimes(1);
    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("leaves a safe terminal provider state when deterministic fallback has no supported field", async () => {
    const unavailableProvider = {
      ...provider,
      parse: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "provider_unavailable" as const,
          retryable: true,
          recoveryActions: ["retry"] as const,
          diagnostic: "provider_unavailable",
          validationIssues: [],
        },
      })),
    } satisfies ResumeSemanticParserProvider;
    const { processor, repository } = setup(unavailableProvider, [
      "Work Experience",
      "Nova Systems",
    ]);

    await processor.process({ ownerUserId, importedDocumentId: importId });

    expect(repository.saveDraft).not.toHaveBeenCalled();
    expect(repository.saveImportLifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingStatus: "provider_unavailable" }),
      expect.anything(),
    );
  });

  it("does not enter fallback after extraction failure or an internal provider failure", async () => {
    const healthyProvider = {
      ...provider,
      parse: vi.fn(
        async (request: { normalizedTranscript: { text: string } }) => ({
          ok: true as const,
          response: response(request.normalizedTranscript.text),
        }),
      ),
    } satisfies ResumeSemanticParserProvider;
    const extractionHarness = setup(healthyProvider, [
      "Email: jane@example.com",
    ]);
    extractionHarness.textExtractor.extractSelectableText.mockResolvedValue({
      ok: false,
      error: { category: "malformed" },
    } as never);
    await extractionHarness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });
    expect(healthyProvider.parse).not.toHaveBeenCalled();
    expect(extractionHarness.repository.saveDraft).not.toHaveBeenCalled();

    const throwingProvider = {
      ...provider,
      parse: vi.fn(async () => {
        throw new Error("internal worker failure");
      }),
    } satisfies ResumeSemanticParserProvider;
    const internalHarness = setup(throwingProvider, [
      "Email: jane@example.com",
    ]);
    await internalHarness.processor.process({
      ownerUserId,
      importedDocumentId: importId,
    });
    expect(internalHarness.repository.saveDraft).not.toHaveBeenCalled();
    expect(
      internalHarness.repository.saveImportLifecycle,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingStatus: "failed" }),
      expect.anything(),
    );
  });

  it("stops fallback and persists cancellation when cancellation arrives", async () => {
    const abortController = new AbortController();
    const cancellableProvider = {
      ...provider,
      parse: vi.fn(async () => {
        abortController.abort();
        return {
          ok: false as const,
          error: {
            code: "provider_unavailable" as const,
            retryable: true,
            recoveryActions: ["retry"] as const,
            diagnostic: "provider_unavailable",
            validationIssues: [],
          },
        };
      }),
    } satisfies ResumeSemanticParserProvider;
    const { processor, repository } = setup(cancellableProvider, [
      "Email: jane@example.com",
    ]);

    await processor.process({
      ownerUserId,
      importedDocumentId: importId,
      abortSignal: abortController.signal,
    });

    expect(cancellableProvider.parse).toHaveBeenCalledTimes(1);
    expect(repository.saveDraft).not.toHaveBeenCalled();
    expect(repository.saveImportLifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({ processingStatus: "cancelled" }),
      expect.anything(),
    );
  });

  it.each([
    "authentication_expired",
    "authentication_revoked",
    "disconnected",
    "unsupported_capability",
    "invalid_grounding",
    "invented_fact",
    "cancelled",
  ] as const)(
    "does not fallback for terminal provider category %s",
    async (code) => {
      const terminalProvider = {
        ...provider,
        parse: vi.fn(async () => ({
          ok: false as const,
          error: {
            code,
            retryable: false,
            recoveryActions: ["manual_entry"] as const,
            diagnostic: code,
            validationIssues: [],
          },
        })),
      } satisfies ResumeSemanticParserProvider;
      const { processor, repository } = setup(terminalProvider, [
        "Email: jane@example.com",
      ]);

      await processor.process({ ownerUserId, importedDocumentId: importId });

      expect(terminalProvider.parse).toHaveBeenCalledTimes(1);
      expect(repository.saveDraft).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["authentication_expired", false],
    ["authentication_revoked", false],
    ["provider_unavailable", true],
    ["rate_limited", true],
    ["quota_exceeded", false],
  ] as const)(
    "emits the provider-neutral semantic outcome %s",
    async (code, retryable) => {
      const terminalProvider = {
        ...provider,
        parse: vi.fn(async () => ({
          ok: false as const,
          error: {
            code,
            retryable,
            recoveryActions: ["manual_entry"] as const,
            diagnostic: code,
            validationIssues: [],
          },
        })),
      } satisfies ResumeSemanticParserProvider;
      const harness = setup(terminalProvider, ["Email: jane@example.com"]);

      await harness.processor.process({
        ownerUserId,
        importedDocumentId: importId,
      });

      const outcome = harness.logger.emit.mock.calls.find(
        ([event]) => event === "semantic.outcome",
      );
      expect(outcome?.[1]).toMatchObject({ outcome: code, retryable });
    },
  );

  it("does not retry or duplicate the accepted fallback result on repeated delivery", async () => {
    let current = document();
    const repository = {
      findImportByOwner: vi.fn(async () => ({
        document: current,
        artifacts: [],
      })),
      findDraftByImportAndOwner: vi.fn(async () => null),
      saveDraft: vi.fn(async (value: unknown) => value),
      saveImportLifecycle: vi.fn(async (value: ImportedDocument) => {
        current = value;
        return value;
      }),
    };
    const unavailableProvider = {
      ...provider,
      parse: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "provider_unavailable" as const,
          retryable: true,
          recoveryActions: ["retry"] as const,
          diagnostic: "provider_unavailable",
          validationIssues: [],
        },
      })),
    } satisfies ResumeSemanticParserProvider;
    const harness = setup(unavailableProvider, ["Email: jane@example.com"]);
    const processor = new SemanticImportProcessor({
      transactionRunner: harness.transactionRunner,
      sourceReader: {} as never,
      pdfTextExtractor: harness.textExtractor as never,
      docxTextExtractor: {} as never,
      provider: unavailableProvider,
      repository: repository as never,
      clock: { now: () => now },
    });

    await processor.process({ ownerUserId, importedDocumentId: importId });
    await processor.process({ ownerUserId, importedDocumentId: importId });

    expect(unavailableProvider.parse).toHaveBeenCalledTimes(1);
    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
  });

  it("does not persist a draft when grounding validation fails", async () => {
    const bad = response("Ada Lovelace");
    const invalidResponse = {
      ...bad,
      sections: {
        ...bad.sections,
        contact: {
          ...bad.sections.contact,
          fullName: {
            ...bad.sections.contact.fullName!,
            evidence: [
              {
                ...bad.sections.contact.fullName!.evidence[0],
                fragmentHash: "0".repeat(64),
              },
            ],
          },
        },
      },
    };
    const invalidProvider = {
      ...provider,
      parse: vi.fn(async () => ({
        ok: true as const,
        response: invalidResponse,
      })),
    } satisfies ResumeSemanticParserProvider;
    const { processor, repository } = setup(invalidProvider);
    await processor.process({ ownerUserId, importedDocumentId: importId });
    expect(repository.saveDraft).not.toHaveBeenCalled();
    expect(repository.saveImportLifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        processingStatus: "semantic_validation_failed",
      }),
      expect.anything(),
    );
  });
});
