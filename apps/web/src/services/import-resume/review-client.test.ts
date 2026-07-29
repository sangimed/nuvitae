import { describe, expect, it, vi } from "vitest";
import {
  createReviewMutationRequest,
  projectOptimisticReview,
  readReviewDraft,
  sendReviewMutation,
} from "./review-client";

const importId = "22222222-2222-4222-8222-222222222222";
const fieldId = "44444444-4444-4444-8444-444444444444";

describe("review client", () => {
  it("strictly parses read and mutation responses", async () => {
    expect(
      await readReviewDraft({
        importId,
        fetchImpl: vi.fn(async () => jsonResponse(200, reviewDraft())) as never,
      }),
    ).toMatchObject({ ok: true });

    expect(
      await readReviewDraft({
        importId,
        fetchImpl: vi.fn(async () =>
          jsonResponse(200, { ...reviewDraft(), storageKey: "secret" }),
        ) as never,
      }),
    ).toMatchObject({ ok: false, category: "malformed_response" });
  });

  it("maps safe HTTP failures without raw response text", async () => {
    const outcome = await sendReviewMutation({
      importId,
      request: createReviewMutationRequest({
        operationId: "66666666-6666-4666-8666-666666666666",
        expectedReviewRevision: 0,
        action: { type: "confirm_field", fieldId },
      }),
      fetchImpl: vi.fn(
        async () => new Response("CANARY_PRIVATE_VALUE", { status: 409 }),
      ) as never,
    });
    expect(outcome).toMatchObject({ ok: false, category: "stale_review" });
    expect(JSON.stringify(outcome)).not.toContain("CANARY_PRIVATE_VALUE");
  });

  it("supports optimistic projection and rollback snapshots", () => {
    const projected = projectOptimisticReview(reviewDraft(), {
      type: "confirm_field",
      fieldId,
    });
    expect(projected.sections[3]?.fields[0]?.reviewStatus).toBe("confirmed");
    expect(reviewDraft().sections[3]?.fields[0]?.reviewStatus).toBe(
      "unreviewed",
    );
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function reviewDraft() {
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    status: "review_draft",
    importId,
    draftId: "33333333-3333-4333-8333-333333333333",
    draftStatus: "review_required",
    reviewRevision: 0,
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
    ].map((section) => ({
      section,
      label: section,
      fields:
        section === "summary"
          ? [
              {
                fieldId,
                fieldPath: "summary",
                value: { kind: "text", value: "Synthetic" },
                sourceStatus: "explicit_source",
                confidenceStatus: "high",
                inferenceStatus: "not_inferred",
                reviewStatus: "unreviewed",
                provenance: { kind: "pdf", pageNumber: 2 },
                warningIds: [],
                allowedActions: ["confirm", "edit", "remove"],
              },
            ]
          : [],
      warnings: [],
      allowedActions: ["add", "exclude"],
    })),
    activeFieldCount: 1,
    unresolvedWarningCount: 0,
    readyToConfirm: false,
    userMessage: "Review.",
  } as const;
}
