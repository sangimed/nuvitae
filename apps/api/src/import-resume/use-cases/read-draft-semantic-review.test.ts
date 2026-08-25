import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ImportDraft } from "@nuvitae/domain";

import { buildReviewDraftResponse } from "./read-draft.js";

const value = "Coordinates incident learning across service teams.";
const now = new Date("2026-08-20T09:00:00.000Z");

function draft(): ImportDraft {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    importedDocumentId: "10000000-0000-4000-8000-000000000002",
    ownerUserId: "10000000-0000-4000-8000-000000000003",
    status: "review_required",
    reviewRevision: 0,
    fields: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        importDraftId: "10000000-0000-4000-8000-000000000001",
        section: "summary",
        fieldPath: "summary",
        value: { kind: "text", value },
        sourceStatus: "explicit_source",
        sourceLocation: {
          kind: "semantic",
          documentId: "10000000-0000-4000-8000-000000000002",
          evidence: [
            {
              fragmentId: "opaque-summary-fragment",
              fragmentHash: createHash("sha256").update(value).digest("hex"),
              line: 3,
              start: 0,
              end: value.length,
            },
          ],
        },
        confidenceStatus: "high",
        inferenceStatus: "inferred_needs_review",
        reviewStatus: "unreviewed",
        warningId: "30000000-0000-4000-8000-000000000001",
        createdAt: now,
        updatedAt: now,
      },
    ],
    warnings: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        importDraftId: "10000000-0000-4000-8000-000000000001",
        warningType: "ambiguous",
        section: "summary",
        fieldPath: "summary",
        message: "This grounded summary classification needs review.",
        severity: "needs_attention",
        reviewStatus: "needs_review",
        requiresResolution: true,
        createdAt: now,
      },
    ],
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-27T09:00:00.000Z"),
  };
}

describe("grounded Semantic V2 review provenance", () => {
  it("keeps the candidate inactive while exposing canonical evidence without source text", () => {
    const response = buildReviewDraftResponse({
      requestId: "40000000-0000-4000-8000-000000000001",
      importId: "10000000-0000-4000-8000-000000000002",
      draft: draft(),
    });
    const summary = response.sections
      .find((section) => section.section === "summary")
      ?.fields.at(0);

    expect(summary).toMatchObject({
      value: { kind: "text", value },
      inferenceStatus: "inferred_needs_review",
      reviewStatus: "unreviewed",
      provenance: {
        kind: "inferred",
        needsConfirmation: true,
        original: {
          kind: "semantic",
          evidence: [
            expect.objectContaining({
              fragmentId: "opaque-summary-fragment",
              line: 3,
              start: 0,
              end: value.length,
            }),
          ],
        },
      },
      warningIds: ["30000000-0000-4000-8000-000000000001"],
    });
    expect(JSON.stringify(summary?.provenance)).not.toContain("quote");
    expect(response.effectiveResume?.summary).toBeUndefined();
    expect(JSON.stringify(response.effectiveResume)).not.toContain(value);
  });

  it("projects a confirmed correction into the effective canonical content", () => {
    const current = draft();
    const response = buildReviewDraftResponse({
      requestId: "40000000-0000-4000-8000-000000000002",
      importId: current.importedDocumentId,
      draft: {
        ...current,
        reviewRevision: 2,
        fields: current.fields.map((field) => ({
          ...field,
          value: { kind: "text" as const, value: "Corrected grounded summary" },
          sourceStatus: "user_edited" as const,
          inferenceStatus: "not_inferred" as const,
          reviewStatus: "edited" as const,
        })),
      },
    });

    expect(response.effectiveResume?.summary).toMatchObject({
      value: "Corrected grounded summary",
      sourceStatus: "user_edited",
      inferenceStatus: "not_inferred",
    });
    expect(response.effectiveResume?.summary?.provenance.kind).toBe(
      "user_edited",
    );
  });
});
