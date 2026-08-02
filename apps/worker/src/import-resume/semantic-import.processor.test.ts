import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ImportedDocument } from "@nuvitae/domain";
import type { ResumeSemanticParserProvider } from "@nuvitae/import-application";
import { SemanticImportProcessor } from "./semantic-import.processor.js";

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

function setup(provider?: ResumeSemanticParserProvider) {
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
          items: [
            {
              text: "Ada Lovelace",
              provenance: {
                kind: "pdf_text_item" as const,
                pageNumber: 1,
                itemIndex: 0,
                readingOrder: 0,
                boundingBox: {
                  x: 0,
                  y: 0,
                  width: 10,
                  height: 10,
                  unit: "pdf_point" as const,
                },
              },
            },
          ],
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
  });
  return { processor, repository, transactionRunner, textExtractor };
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
