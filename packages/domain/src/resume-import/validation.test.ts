import { describe, expect, it } from "vitest";

import type { ExtractedField, ImportDraft, ImportWarning } from "./types.js";
import {
  calculateRetentionExpiresAt,
  canCreateImportDraft,
  evaluateUnsupportedLanguageHandling,
  findUnresolvedRequiredWarnings,
  summarizeExtractionThreshold,
  validateRenderedPageCount,
  validateRetentionDeadline,
  validateSelectableText,
  validateStructuredResumeConfirmation,
  validateUploadEligibility,
} from "./validation.js";

const limits = {
  maxUploadSizeBytes: 10 * 1024 * 1024,
  maxRenderedPageCount: 5,
  foregroundTimeoutSeconds: 180,
  parserMemoryLimitMiB: 512,
  maxActiveJobsPerUser: 1,
  maxQueuedJobsPerUser: 2,
  rollingAttemptLimit: 5,
  rollingAttemptWindowSeconds: 600,
};

const now = new Date("2026-07-28T10:00:00.000Z");
const expiresAt = new Date("2026-08-04T10:00:00.000Z");

describe("resume import domain validation", () => {
  it("accepts an authenticated PDF at the upload size boundary", () => {
    const result = validateUploadEligibility(
      {
        isAuthenticated: true,
        format: "pdf",
        sizeBytes: limits.maxUploadSizeBytes,
      },
      limits,
    );

    expect(result.ok).toBe(true);
  });

  it("rejects invalid upload eligibility without raw content", () => {
    expect(
      validateUploadEligibility(
        { isAuthenticated: false, format: "pdf", sizeBytes: 100 },
        limits,
      ),
    ).toMatchObject({ ok: false, error: { code: "authentication_required" } });
    expect(
      validateUploadEligibility(
        { isAuthenticated: true, format: "txt", sizeBytes: 100 },
        limits,
      ),
    ).toMatchObject({ ok: false, error: { code: "unsupported_format" } });
    expect(
      validateUploadEligibility(
        {
          isAuthenticated: true,
          format: "docx",
          sizeBytes: limits.maxUploadSizeBytes + 1,
        },
        limits,
      ),
    ).toMatchObject({ ok: false, error: { code: "file_too_large" } });
  });

  it("validates rendered page-count limits and selectable text", () => {
    expect(validateRenderedPageCount(5, limits).ok).toBe(true);
    expect(validateRenderedPageCount(6, limits)).toMatchObject({
      ok: false,
      error: { code: "rendered_page_count_exceeds_limit" },
    });
    expect(validateSelectableText(false)).toMatchObject({
      ok: false,
      error: { code: "document_has_no_selectable_text" },
    });
  });

  it("requires an explicitly sourced supported field to create a draft", () => {
    expect(
      canCreateImportDraft(
        [field({ includeSourceLocation: false })],
        "english",
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "no_explicitly_sourced_supported_field" },
    });
    expect(canCreateImportDraft([field()], "english").ok).toBe(true);
  });

  it("classifies partial extraction without weakening the draft threshold", () => {
    expect(
      summarizeExtractionThreshold([field()], ["education"], "english"),
    ).toEqual({
      category: "partial",
      mayCreateDraft: true,
      missingOrUnprocessedSections: ["education"],
    });
    expect(
      summarizeExtractionThreshold([], ["work_experience"], "english"),
    ).toMatchObject({
      category: "no_supported_field",
      mayCreateDraft: false,
    });
  });

  it("handles unsupported language as contact-only preview without import draft creation", () => {
    expect(
      evaluateUnsupportedLanguageHandling("unsupported", [
        field({ section: "contact" }),
      ]),
    ).toEqual({
      action: "contact_only_preview",
      mayCreateImportDraft: false,
      manualEntryRecoveryExpected: true,
    });
    expect(canCreateImportDraft([field()], "unsupported")).toMatchObject({
      ok: false,
      error: { code: "unsupported_language" },
    });
  });

  it("keeps warning review states blocking until required warnings are addressed", () => {
    expect(
      findUnresolvedRequiredWarnings([warning("needs_review")]),
    ).toHaveLength(1);
    expect(
      findUnresolvedRequiredWarnings([warning("intentionally_left")]),
    ).toHaveLength(0);
  });

  it("blocks unresolved warnings but permits valid unreviewed fields", () => {
    const unresolved = validateStructuredResumeConfirmation(
      draft({
        warnings: [warning("needs_review")],
        fields: [field({ reviewStatus: "confirmed" })],
      }),
      now,
      { sourceDeletionStatus: "not_scheduled", sourceArtifactsAvailable: true },
    );
    expect(unresolved).toMatchObject({
      ok: false,
      error: { code: "unresolved_required_warnings" },
    });

    const unreviewedOnly = validateStructuredResumeConfirmation(
      draft({ warnings: [], fields: [field({ reviewStatus: "unreviewed" })] }),
      now,
      { sourceDeletionStatus: "not_scheduled", sourceArtifactsAvailable: true },
    );
    expect(unreviewedOnly).toMatchObject({
      ok: true,
      value: { confirmedFieldCount: 0, addressedWarningCount: 0 },
    });

    const unreviewedWarningField = validateStructuredResumeConfirmation(
      draft({
        warnings: [],
        fields: [
          field({
            reviewStatus: "unreviewed",
            warningId: "warning-1",
          }),
        ],
      }),
      now,
      { sourceDeletionStatus: "not_scheduled", sourceArtifactsAvailable: true },
    );
    expect(unreviewedWarningField).toMatchObject({
      ok: false,
      error: { code: "unreviewed_field_warnings" },
    });
  });

  it("allows valid confirmation and limited source-deleted review when review remains resolved", () => {
    const result = validateStructuredResumeConfirmation(
      draft({
        status: "source_deleted_limited_review",
        warnings: [warning("confirmed")],
        fields: [
          field({ reviewStatus: "confirmed", sourceStatus: "user_edited" }),
        ],
      }),
      now,
      { sourceDeletionStatus: "deleted", sourceArtifactsAvailable: false },
    );

    expect(result).toMatchObject({
      ok: true,
      value: { confirmedFieldCount: 1, addressedWarningCount: 1 },
    });
  });

  it("validates retention deadlines and expiry deterministically", () => {
    expect(calculateRetentionExpiresAt(now, 7)).toEqual(expiresAt);
    expect(validateRetentionDeadline(now, expiresAt, 7).ok).toBe(true);
    expect(
      validateRetentionDeadline(now, new Date("2026-08-05T10:00:00.000Z"), 7),
    ).toMatchObject({
      ok: false,
      error: { code: "retention_deadline_too_late" },
    });

    const expired = validateStructuredResumeConfirmation(
      draft(),
      new Date("2026-08-04T10:00:01.000Z"),
      {
        sourceDeletionStatus: "not_scheduled",
        sourceArtifactsAvailable: true,
      },
    );
    expect(expired).toMatchObject({
      ok: false,
      error: { code: "draft_expired" },
    });
  });
});

function field(
  options: Partial<ExtractedField> & {
    readonly includeSourceLocation?: boolean;
  } = {},
): ExtractedField {
  const { includeSourceLocation = true, ...overrides } = options;
  const sourceLocation = includeSourceLocation
    ? {
        kind: "pdf" as const,
        pageNumber: 1,
        textItemIndex: 2,
        boundingBox: {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          unit: "pdf_point" as const,
        },
      }
    : undefined;

  return {
    id: "field-1",
    importDraftId: "draft-1",
    section: "contact",
    fieldPath: "contact.email",
    value: { kind: "text", value: "person@example.invalid" },
    sourceStatus: "explicit_source",
    ...(sourceLocation === undefined ? {} : { sourceLocation }),
    confidenceStatus: "high",
    inferenceStatus: "not_inferred",
    reviewStatus: "unreviewed",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function warning(reviewStatus: ImportWarning["reviewStatus"]): ImportWarning {
  return {
    id: "warning-1",
    importDraftId: "draft-1",
    warningType: "ambiguous",
    section: "work_experience",
    message: "Review this item.",
    severity: "blocking",
    reviewStatus,
    requiresResolution: true,
    createdAt: now,
  };
}

function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    id: "draft-1",
    importedDocumentId: "import-1",
    ownerUserId: "user-1",
    status: "ready_to_confirm",
    reviewRevision: 0,
    fields: [field({ reviewStatus: "confirmed" })],
    warnings: [],
    createdAt: now,
    retentionExpiresAt: expiresAt,
    ...overrides,
  };
}
