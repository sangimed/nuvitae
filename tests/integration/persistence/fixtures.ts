import type {
  ImportDraft,
  ImportedDocument,
  ImportWarning,
  ExtractedField,
} from "@nuvitae/domain";

export const ids = {
  ownerA: "10000000-0000-4000-8000-000000000001",
  ownerB: "10000000-0000-4000-8000-000000000002",
  document: "20000000-0000-4000-8000-000000000001",
  artifact: "30000000-0000-4000-8000-000000000001",
  draft: "40000000-0000-4000-8000-000000000001",
  warning: "50000000-0000-4000-8000-000000000001",
  field: "60000000-0000-4000-8000-000000000001",
} as const;

export function importedDocument(
  overrides: Partial<ImportedDocument> = {},
): ImportedDocument {
  const createdAt = new Date("2026-07-28T08:00:00.000Z");
  return {
    id: ids.document,
    ownerUserId: ids.ownerA,
    visibleFilename: "synthetic-resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 1024,
    renderedPageCount: 1,
    detectedLanguage: "english",
    storageKey: "imports/synthetic/source",
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "ready_for_review",
    deletionStatus: "not_scheduled",
    createdAt,
    retentionExpiresAt: new Date("2026-08-04T08:00:00.000Z"),
    ...overrides,
  };
}

export function importWarning(): ImportWarning {
  return {
    id: ids.warning,
    importDraftId: ids.draft,
    warningType: "low_confidence",
    section: "headline",
    fieldPath: "headline",
    message: "Review this synthetic field.",
    severity: "needs_attention",
    reviewStatus: "needs_review",
    requiresResolution: true,
    createdAt: new Date("2026-07-28T08:01:00.000Z"),
  };
}

export function extractedField(): ExtractedField {
  return {
    id: ids.field,
    importDraftId: ids.draft,
    section: "headline",
    fieldPath: "headline",
    value: { kind: "text", value: "Synthetic headline" },
    sourceStatus: "explicit_source",
    sourceLocation: {
      kind: "pdf",
      pageNumber: 1,
      textItemIndex: 0,
      boundingBox: {
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        unit: "pdf_point",
      },
    },
    confidenceStatus: "low",
    inferenceStatus: "not_inferred",
    reviewStatus: "unreviewed",
    warningId: ids.warning,
    createdAt: new Date("2026-07-28T08:01:00.000Z"),
    updatedAt: new Date("2026-07-28T08:01:00.000Z"),
  };
}

export function importDraft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    id: ids.draft,
    importedDocumentId: ids.document,
    ownerUserId: ids.ownerA,
    status: "review_required",
    fields: [extractedField()],
    warnings: [importWarning()],
    createdAt: new Date("2026-07-28T08:01:00.000Z"),
    retentionExpiresAt: new Date("2026-08-04T08:00:00.000Z"),
    ...overrides,
  };
}
