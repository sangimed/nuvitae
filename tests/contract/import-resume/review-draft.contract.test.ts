import {
  reviewDraftReadResponseSchema,
  reviewMutationRequestSchema,
  reviewMutationResponseSchema,
} from "@nuvitae/contracts";
import { describe, expect, it } from "vitest";

const requestId = "11111111-1111-4111-8111-111111111111";
const importId = "22222222-2222-4222-8222-222222222222";
const draftId = "33333333-3333-4333-8333-333333333333";
const fieldId = "44444444-4444-4444-8444-444444444444";
const warningId = "55555555-5555-4555-8555-555555555555";

describe("import review draft contract", () => {
  it("accepts an owner-scoped grouped review response with safe provenance only", () => {
    const response = reviewDraftReadResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "review_draft",
      importId,
      draftId,
      draftStatus: "review_required",
      reviewRevision: 0,
      retentionExpiresAt: "2026-08-05T09:30:00.000Z",
      sections: [
        section("personal"),
        section("contact"),
        section("headline"),
        section("summary", true),
        section("work_experience"),
        section("education"),
        section("skills"),
        section("languages"),
        section("projects"),
        section("certifications"),
        section("professional_links"),
      ],
      activeFieldCount: 1,
      unresolvedWarningCount: 1,
      readyToConfirm: false,
      userMessage: "Review the imported information.",
    });
    expect(response.sections.map((item) => item.section)).toEqual([
      "personal",
      "contact",
      "headline",
      "summary",
      "work_experience",
      "education",
      "skills",
      "languages",
      "projects",
      "certifications",
      "professional_links",
    ]);
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("ownerUserId");
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("filename");
    expect(serialized).not.toContain("source snippet");
    expect(serialized).not.toContain("boundingBox");
    expect(serialized).not.toContain("characterOffset");
    expect(serialized).not.toContain("parser");
    expect(serialized).not.toContain("queue");
  });

  it.each([
    { type: "confirm_field", fieldId },
    {
      type: "edit_field",
      fieldId,
      value: { kind: "text", value: "Edited" },
    },
    { type: "remove_field", fieldId },
    {
      type: "add_field",
      section: "skills",
      fieldPath: "skills.manual",
      value: { kind: "text", value: "TypeScript" },
    },
    {
      type: "complete_missing_field",
      warningId,
      section: "summary",
      fieldPath: "summary.manual",
      value: { kind: "text", value: "Completed" },
    },
    {
      type: "resolve_warning",
      warningId,
      resolution: "confirmed",
    },
    {
      type: "resolve_warning",
      warningId,
      resolution: "excluded",
    },
    {
      type: "resolve_warning",
      warningId,
      resolution: "intentionally_left",
    },
    { type: "exclude_section", section: "summary" },
  ])("accepts strict %s mutation", (action) => {
    expect(
      reviewMutationRequestSchema.parse({
        operationId: "66666666-6666-4666-8666-666666666666",
        expectedReviewRevision: 0,
        action,
      }),
    ).toMatchObject({ action });
  });

  it.each([
    ["ownerUserId", "77777777-7777-4777-8777-777777777777"],
    ["sourceStatus", "user_added"],
    ["sourceLocation", { kind: "pdf", pageNumber: 1 }],
    ["draftStatus", "confirmed"],
    ["unknown", true],
  ])("rejects browser-supplied %s", (key, value) => {
    expect(() =>
      reviewMutationRequestSchema.parse({
        operationId: "66666666-6666-4666-8666-666666666666",
        expectedReviewRevision: 0,
        action: { type: "confirm_field", fieldId, [key]: value },
      }),
    ).toThrow();
  });

  it("accepts a strict mutation response and does not create a StructuredResume", () => {
    const draft = reviewDraftReadResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "review_draft",
      importId,
      draftId,
      draftStatus: "ready_to_confirm",
      reviewRevision: 1,
      retentionExpiresAt: "2026-08-05T09:30:00.000Z",
      sections: [
        "personal",
        "contact",
        "headline",
        "summary",
        "work_experience",
        "education",
        "skills",
        "languages",
        "projects",
        "certifications",
        "professional_links",
      ].map((name) => section(name, name === "summary")),
      activeFieldCount: 1,
      unresolvedWarningCount: 0,
      readyToConfirm: true,
      userMessage: "Ready.",
    });
    const response = reviewMutationResponseSchema.parse({
      version: "2026-07-28",
      requestId,
      status: "review_updated",
      importId,
      draftId,
      reviewRevision: 1,
      draft,
      userMessage: "Saved.",
    });
    expect(JSON.stringify(response)).not.toContain("structuredResumeId");
  });
});

function section(sectionName: string, includeField = false) {
  return {
    section: sectionName,
    label: sectionName,
    fields: includeField
      ? [
          {
            fieldId,
            fieldPath: "summary",
            value: { kind: "text", value: "Synthetic summary" },
            sourceStatus: "explicit_source",
            confidenceStatus: "high",
            inferenceStatus: "not_inferred",
            reviewStatus: "unreviewed",
            provenance: { kind: "pdf", pageNumber: 2 },
            warningIds: [warningId],
            allowedActions: ["confirm", "edit", "remove"],
          },
        ]
      : [],
    warnings: includeField
      ? [
          {
            warningId,
            warningType: "missing",
            section: sectionName,
            fieldPath: "summary",
            message: "Review this synthetic warning.",
            severity: "needs_attention",
            reviewStatus: "needs_review",
            requiresResolution: true,
            allowedActions: [
              "confirm",
              "edit",
              "exclude",
              "intentionally_leave",
            ],
          },
        ]
      : [],
    allowedActions: ["add", "exclude"],
  };
}
