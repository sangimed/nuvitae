import { describe, expect, it } from "vitest";
import { buildExtractionDraft } from "./extraction-draft.js";
import type { ImportedDocument } from "./types.js";

const document: ImportedDocument = {
  id: "import-1",
  ownerUserId: "user-1",
  visibleFilename: "synthetic.pdf",
  contentType: "application/pdf",
  fileExtension: "pdf",
  sizeBytes: 10,
  uploadStatus: "uploaded",
  validationStatus: "accepted",
  processingStatus: "processing",
  deletionStatus: "not_scheduled",
  detectedLanguage: "english",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  retentionExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
};
const ids = {
  draftId: () => "draft-1",
  fieldId: () => "field-1",
  warningId: () => "warning-1",
};
const location = {
  kind: "pdf_text_item" as const,
  pageNumber: 1,
  itemIndex: 0,
  readingOrder: 0,
  boundingBox: { x: 0, y: 0, width: 1, height: 1, unit: "pdf_point" as const },
};

describe("buildExtractionDraft", () => {
  it("uses explicit provenance and preserves the source retention deadline", () => {
    const result = buildExtractionDraft({
      importedDocument: document,
      fields: [
        {
          section: "contact",
          fieldPath: "contact.email",
          value: { kind: "text", value: "candidate@example.invalid" },
          sourceLocation: location,
          confidence: "high",
          inferenceStatus: "not_inferred",
          sourceOrder: 0,
        },
      ],
      warnings: [],
      missingOrUnprocessedSections: ["skills"],
      ids,
      now: new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(result.category).toBe("partial");
    expect(result.draft?.retentionExpiresAt).toEqual(
      document.retentionExpiresAt,
    );
    expect(result.draft?.fields[0]?.sourceLocation).toMatchObject({
      kind: "pdf",
      textItemIndex: 0,
    });
  });

  it("rejects a location-less inferred candidate", () => {
    const result = buildExtractionDraft({
      importedDocument: document,
      fields: [
        {
          section: "skills",
          fieldPath: "skills.name",
          value: { kind: "text", value: "TypeScript" },
          sourceLocation: undefined,
          confidence: "low",
          inferenceStatus: "inferred_needs_review",
          sourceOrder: 0,
        },
      ],
      warnings: [],
      missingOrUnprocessedSections: [],
      ids,
      now: new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(result.draft).toBeUndefined();
    expect(result.category).toBe("no_supported_field");
  });

  it("preserves an unsupported language as a typed draft-admission failure", () => {
    const result = buildExtractionDraft({
      importedDocument: { ...document, detectedLanguage: "unknown" },
      fields: [
        {
          section: "summary",
          fieldPath: "summary",
          value: { kind: "text", value: "نص محفوظ مع دليل المصدر" },
          sourceLocation: location,
          confidence: "high",
          inferenceStatus: "not_inferred",
          sourceOrder: 0,
        },
      ],
      warnings: [],
      missingOrUnprocessedSections: [],
      ids,
      now: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      category: "no_supported_field",
      failureCode: "unsupported_language",
    });
    expect(result).not.toHaveProperty("draft");
  });

  it("preserves a provenance-bearing inferred-only candidate for review", () => {
    const value = "Designs durable delivery systems.";
    const result = buildExtractionDraft({
      importedDocument: document,
      fields: [
        {
          section: "summary",
          fieldPath: "summary",
          value: { kind: "text", value },
          sourceLocation: {
            kind: "semantic",
            documentId: document.id,
            evidence: [
              {
                fragmentId: "synthetic-summary",
                fragmentHash: "a".repeat(64),
                line: 4,
                start: 80,
                end: 80 + value.length,
              },
            ],
          },
          confidence: "high",
          inferenceStatus: "inferred_needs_review",
          sourceOrder: 4,
        },
      ],
      warnings: [],
      missingOrUnprocessedSections: [],
      ids,
      now: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.category).toBe("complete");
    expect(result.draft?.fields).toEqual([
      expect.objectContaining({
        fieldPath: "summary",
        inferenceStatus: "inferred_needs_review",
        reviewStatus: "unreviewed",
        sourceLocation: expect.objectContaining({ kind: "semantic" }),
      }),
    ]);
  });
});
