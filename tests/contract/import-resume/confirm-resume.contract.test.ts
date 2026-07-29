import {
  confirmedStructuredResumeReadResponseSchema,
  confirmStructuredResumeErrorResponseSchema,
  confirmStructuredResumeRequestSchema,
  confirmStructuredResumeResponseSchema,
  discardImportRequestSchema,
  discardImportResponseSchema,
} from "@nuvitae/contracts";
import { describe, expect, it } from "vitest";

const requestId = "11111111-1111-4111-8111-111111111111";
const importId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";
const resumeId = "44444444-4444-4444-8444-444444444444";
const operationId = "55555555-5555-4555-8555-555555555555";

describe("confirm structured resume contract", () => {
  it("requires explicit confirmation and returns a safe response", () => {
    expect(
      confirmStructuredResumeRequestSchema.parse({
        operationId,
        expectedReviewRevision: 3,
        explicitConfirmation: true,
      }),
    ).toMatchObject({ explicitConfirmation: true });
    const response = confirmStructuredResumeResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "structured_resume_confirmed",
      importId,
      draftId,
      structuredResumeId: resumeId,
      confirmationStatus: "confirmed",
      provenanceLabel: "imported_from_initial_resume",
      confirmedAt: "2026-07-29T09:00:00.000Z",
      sourceRetentionExpiresAt: "2026-08-04T08:00:00.000Z",
      resumeUrl: `/resumes/${resumeId}`,
      userMessage: "Created.",
    });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("ownerUserId");
    expect(serialized).not.toContain("filename");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("sourceLocation");
    expect(serialized).not.toContain("snippet");
    expect(serialized).not.toContain("queue");
    expect(serialized).not.toContain("parser");
  });

  it.each([
    ["explicitConfirmation", false],
    ["ownerUserId", "10000000-0000-4000-8000-000000000001"],
    ["structuredResumeId", resumeId],
    ["retentionExpiresAt", "2026-08-04T08:00:00.000Z"],
    ["content", []],
  ])("rejects browser-supplied %s", (key, value) => {
    const body = {
      operationId,
      expectedReviewRevision: 0,
      explicitConfirmation: true,
      [key]: value,
    };
    expect(() => confirmStructuredResumeRequestSchema.parse(body)).toThrow();
  });

  it("defines safe blocking errors without personal data", () => {
    const response = confirmStructuredResumeErrorResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "structured_resume_confirmation_error",
      importId,
      draftId,
      code: "unresolved_warnings",
      userMessage: "Review every warning before creating the resume.",
      blockerCount: 1,
    });
    expect(JSON.stringify(response)).not.toContain("Jane Canary");
  });

  it("defines discard and confirmed read contracts", () => {
    discardImportRequestSchema.parse({
      operationId,
      expectedReviewRevision: 0,
      explicitDiscard: true,
    });
    discardImportResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "import_discarded",
      importId,
      draftId,
      discardedAt: "2026-07-29T09:00:00.000Z",
      deletionJobId: operationId,
      deletionState: "scheduled",
      userMessage: "Scheduled.",
      recoveryActions: ["new_import", "manual_entry"],
    });
    confirmedStructuredResumeReadResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "confirmed_structured_resume",
      structuredResumeId: resumeId,
      confirmationStatus: "confirmed",
      provenanceLabel: "imported_from_initial_resume",
      content: {
        personal: [],
        contact: [],
        workExperiences: [],
        education: [],
        skills: [],
        languages: [],
        projects: [],
        certifications: [],
        professionalLinks: [],
      },
      createdAt: "2026-07-29T09:00:00.000Z",
      updatedAt: "2026-07-29T09:00:00.000Z",
      sourceAvailability: "source_no_longer_available",
      userMessage: "Loaded.",
    });
  });
});
