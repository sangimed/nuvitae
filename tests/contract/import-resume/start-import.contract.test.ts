import {
  draftReadyResponseSchema,
  importInitializationResponseSchema,
  importResumeResponseSchemaVersion,
  partialExtractionResponseSchema,
  processingProgressResponseSchema,
  queuedProcessingResponseSchema,
  recoverableTimeoutResponseSchema,
  terminalFailureResponseSchema,
  validationResponseSchema,
  type ImportInitializationResponse,
} from "@nuvitae/contracts";
import { describe, expect, it } from "vitest";

const requestId = "11111111-1111-4111-8111-111111111111";
const importId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";
const retentionExpiresAt = "2026-08-05T09:30:00.000Z";
const base = {
  version: importResumeResponseSchemaVersion,
  requestId,
  importId,
};
const draft = {
  draftId,
  retentionExpiresAt,
  fieldCount: 8,
  warningCount: 2,
};

describe("start import response contract", () => {
  it("accepts the stable initialization envelope after durable upload", () => {
    const response: ImportInitializationResponse = {
      ...base,
      status: "import_initialization",
      uploadStatus: "uploaded",
      retentionExpiresAt,
      manualEntryUrl: "/resumes/new/manual",
      userMessage:
        "Your resume was uploaded privately and will be kept for up to 7 days.",
    };

    expect(importInitializationResponseSchema.parse(response)).toEqual(
      response,
    );
    expect(response.version).toBe("2026-07-28");
    expect(response.requestId).toBe(requestId);
    expect(response.importId).toBe(importId);
    expect(response.uploadStatus).toBe("uploaded");
    expect(response.retentionExpiresAt).toBe(retentionExpiresAt);
    expect(response.manualEntryUrl).toBe("/resumes/new/manual");
    expect(response.userMessage).not.toContain("storage");
    expect(response.userMessage).not.toContain("database");
  });
});

describe("document validation response contract", () => {
  it("accepts supported and unsupported detected-language categories", () => {
    for (const detectedLanguage of [
      "english",
      "french",
      "bilingual_french_english",
      "unsupported",
      "unknown",
    ] as const) {
      expect(
        validationResponseSchema.parse({
          ...base,
          status: "validation",
          accepted: true,
          renderedPageCount: 3,
          detectedLanguage,
        }),
      ).toMatchObject({
        accepted: true,
        renderedPageCount: 3,
        detectedLanguage,
      });
    }
  });

  it("accepts a rejected validation response with a public failure", () => {
    expect(
      validationResponseSchema.parse({
        ...base,
        status: "validation",
        accepted: false,
        renderedPageCount: 6,
        detectedLanguage: "unsupported",
        failure: {
          code: "over_page_limit",
          userMessage: "Choose a resume with no more than 5 pages.",
          retryable: true,
          recoveryActions: ["replace_upload", "manual_entry"],
        },
      }),
    ).toMatchObject({
      accepted: false,
      renderedPageCount: 6,
      detectedLanguage: "unsupported",
    });
  });

  it("strictly rejects unknown validation properties", () => {
    expect(() =>
      validationResponseSchema.parse({
        ...base,
        status: "validation",
        accepted: true,
        parserMessage: "internal parser output",
      }),
    ).toThrow();
  });
});

describe("processing response contracts", () => {
  it("accepts queued processing, every progress state, and known progress", () => {
    expect(
      queuedProcessingResponseSchema.parse({
        ...base,
        status: "queued_processing",
        userMessage: "Your resume is waiting to be processed.",
        recoveryActions: ["cancel", "manual_entry"],
      }),
    ).toMatchObject({ status: "queued_processing" });

    for (const step of [
      "checking_document",
      "reading_content",
      "organizing_resume_sections",
      "preparing_review",
    ] as const) {
      expect(
        processingProgressResponseSchema.parse({
          ...base,
          status: "processing_progress",
          step,
          progressKnown: true,
          progressPercent: 50,
          userMessage: "Preparing your resume for review.",
        }),
      ).toMatchObject({ step, progressPercent: 50 });
    }
  });

  it("requires progress percentage to be omitted when progress is unknown", () => {
    expect(
      processingProgressResponseSchema.parse({
        ...base,
        status: "processing_progress",
        step: "reading_content",
        progressKnown: false,
        userMessage: "Reading your resume.",
      }).progressPercent,
    ).toBeUndefined();

    expect(() =>
      processingProgressResponseSchema.parse({
        ...base,
        status: "processing_progress",
        step: "reading_content",
        progressKnown: false,
        progressPercent: 10,
        userMessage: "Reading your resume.",
      }),
    ).toThrow();
  });

  it("accepts draft-ready and partial extraction responses", () => {
    expect(
      draftReadyResponseSchema.parse({
        ...base,
        status: "draft_ready",
        draft,
        userMessage: "Your resume is ready to review.",
      }),
    ).toMatchObject({ draft });

    expect(
      partialExtractionResponseSchema.parse({
        ...base,
        status: "partial_extraction",
        draft,
        missingOrUnprocessedSections: ["education"],
        recoveryActions: ["retry", "manual_entry"],
        userMessage: "Some sections need your attention.",
      }),
    ).toMatchObject({ draft, missingOrUnprocessedSections: ["education"] });
  });

  it("accepts recoverable timeout and terminal failure responses", () => {
    expect(
      recoverableTimeoutResponseSchema.parse({
        ...base,
        status: "recoverable_timeout",
        partialDraft: draft,
        failure: {
          code: "processing_timeout",
          userMessage: "Reading your resume took longer than expected.",
          retryable: true,
          recoveryActions: ["retry", "replace_upload", "manual_entry"],
        },
      }),
    ).toMatchObject({ partialDraft: draft });

    expect(
      terminalFailureResponseSchema.parse({
        ...base,
        status: "terminal_failure",
        failure: {
          code: "terminal_failure",
          userMessage: "Your resume could not be processed.",
          retryable: false,
          recoveryActions: ["replace_upload", "manual_entry"],
        },
      }),
    ).toMatchObject({ status: "terminal_failure" });
  });

  it.each([
    ["rawDiagnostics", "private diagnostics"],
    ["parserMessage", "parser internals"],
    ["stackTrace", "Error at private/path.ts:1"],
    ["unsupportedProperty", true],
  ])("strictly rejects %s", (property, value) => {
    expect(() =>
      terminalFailureResponseSchema.parse({
        ...base,
        status: "terminal_failure",
        failure: {
          code: "terminal_failure",
          userMessage: "Your resume could not be processed.",
          retryable: false,
          recoveryActions: ["manual_entry"],
        },
        [property]: value,
      }),
    ).toThrow();
  });

  it.each(["rawDiagnostics", "parserMessage", "stackTrace"])(
    "strictly rejects nested %s",
    (property) => {
      expect(() =>
        terminalFailureResponseSchema.parse({
          ...base,
          status: "terminal_failure",
          failure: {
            code: "terminal_failure",
            userMessage: "Your resume could not be processed.",
            retryable: false,
            recoveryActions: ["manual_entry"],
            [property]: "private detail",
          },
        }),
      ).toThrow();
    },
  );
});
