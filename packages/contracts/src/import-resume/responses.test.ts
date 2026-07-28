import { describe, expect, it } from "vitest";

import {
  importResumeResponseSchema,
  importResumeResponseSchemaVersion,
} from "./responses.js";

const requestId = "11111111-1111-4111-8111-111111111111";
const importId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";
const deletionJobId = "44444444-4444-4444-8444-444444444444";

const base = { version: importResumeResponseSchemaVersion, requestId };
const failure = {
  code: "processing_timeout",
  userMessage: "Reading the resume took longer than expected.",
  retryable: true,
  recoveryActions: ["retry", "replace_upload", "manual_entry"],
};
const draft = {
  draftId,
  retentionExpiresAt: "2026-08-04T10:00:00.000Z",
  fieldCount: 3,
  warningCount: 1,
};

describe("import resume REST response contracts", () => {
  it.each([
    {
      status: "import_initialization",
      importId,
      retentionExpiresAt: "2026-08-04T10:00:00.000Z",
      manualEntryUrl: "/resumes/new/manual",
      userMessage: "Your upload can be kept for review for up to 7 days.",
    },
    {
      status: "validation",
      importId,
      accepted: true,
      renderedPageCount: 2,
      detectedLanguage: "english",
    },
    {
      status: "queued_processing",
      importId,
      userMessage: "Your resume is waiting to be processed.",
      recoveryActions: ["cancel", "manual_entry"],
    },
    {
      status: "processing_progress",
      importId,
      step: "reading_content",
      progressKnown: false,
      userMessage: "Reading content.",
    },
    { status: "recoverable_timeout", importId, partialDraft: draft, failure },
    {
      status: "partial_extraction",
      importId,
      draft,
      missingOrUnprocessedSections: ["education"],
      recoveryActions: ["retry", "manual_entry"],
      userMessage: "Some sections need review.",
    },
    {
      status: "draft_ready",
      importId,
      draft,
      userMessage: "Review your imported resume.",
    },
    {
      status: "unsupported_language_contact_preview",
      importId,
      previewId: "55555555-5555-4555-8555-555555555555",
      contactFieldCount: 2,
      warning: {
        ...failure,
        code: "unsupported_language",
        recoveryActions: ["confirm_contact_transfer", "manual_entry"],
      },
    },
    {
      status: "cancellation",
      importId,
      deletionJobId,
      userMessage: "Import cancelled.",
      recoveryActions: ["manual_entry", "reupload"],
    },
    {
      status: "retry",
      importId,
      attemptNumber: 2,
      userMessage: "Retrying import.",
    },
    {
      status: "source_deletion",
      importId,
      deletionState: "deleted",
      verificationStatus: "verified",
      userMessage: "Source deleted.",
    },
    {
      status: "import_expiry",
      importId,
      expiredAt: "2026-08-04T10:00:00.000Z",
      failure: {
        ...failure,
        code: "expired",
        retryable: false,
        recoveryActions: ["reupload", "manual_entry"],
      },
    },
    {
      status: "terminal_failure",
      importId,
      failure: {
        ...failure,
        code: "terminal_failure",
        retryable: false,
        recoveryActions: ["replace_upload", "manual_entry"],
      },
    },
  ])("accepts $status", (payload) => {
    expect(
      importResumeResponseSchema.safeParse({ ...base, ...payload }).success,
    ).toBe(true);
  });

  it("rejects internal diagnostic fields and implementation details", () => {
    expect(
      importResumeResponseSchema.safeParse({
        ...base,
        status: "terminal_failure",
        importId,
        failure: {
          ...failure,
          code: "terminal_failure",
          recoveryActions: ["manual_entry"],
          stackTrace: "Error at parser internals",
        },
      }).success,
    ).toBe(false);

    expect(
      importResumeResponseSchema.safeParse({
        ...base,
        status: "draft_ready",
        importId,
        draft,
        userMessage: "Review your imported resume.",
        rawDocumentText: "must not be exposed",
      }).success,
    ).toBe(false);
  });

  it("does not allow precise progress when progress is unknown", () => {
    expect(
      importResumeResponseSchema.safeParse({
        ...base,
        status: "processing_progress",
        importId,
        step: "reading_content",
        progressKnown: false,
        progressPercent: 40,
        userMessage: "Reading content.",
      }).success,
    ).toBe(false);
  });
});
