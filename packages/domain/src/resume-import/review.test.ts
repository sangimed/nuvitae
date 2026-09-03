import type { ExtractedField, ImportDraft, ImportWarning } from "./types.js";
import { applyReviewCommand } from "./review.js";
import { describe, expect, it } from "vitest";

const now = new Date("2026-07-29T12:00:00.000Z");
const ownerUserId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";

describe("review domain operations", () => {
  it("confirms, edits, removes, adds, completes, resolves, intentionally leaves, and excludes without source mutation", () => {
    const confirmed = applyReviewCommand({
      draft: draft(),
      ownerUserId,
      command: {
        type: "confirm_field",
        operationId,
        fieldId: "33333333-3333-4333-8333-333333333333",
      },
      now,
    });
    expect(confirmed.ok && confirmed.draft.fields[0]?.reviewStatus).toBe(
      "confirmed",
    );
    expect(confirmed.ok && confirmed.correction.action).toBe("confirm");

    const edited = applyReviewCommand({
      draft: draft(),
      ownerUserId,
      command: {
        type: "edit_field",
        operationId,
        fieldId: "33333333-3333-4333-8333-333333333333",
        value: { kind: "text", value: "Edited value" },
      },
      now,
    });
    expect(edited.ok && edited.draft.fields[0]?.sourceStatus).toBe(
      "user_edited",
    );
    expect(edited.ok && edited.correction.previousValue).toMatchObject({
      kind: "text",
    });

    const removed = applyReviewCommand({
      draft: draft(),
      ownerUserId,
      command: {
        type: "remove_field",
        operationId,
        fieldId: "33333333-3333-4333-8333-333333333333",
      },
      now,
    });
    expect(removed.ok && removed.draft.fields[0]?.reviewStatus).toBe(
      "excluded",
    );

    const added = applyReviewCommand({
      draft: draft({ warnings: [] }),
      ownerUserId,
      command: {
        type: "add_field",
        operationId,
        fieldId: "55555555-5555-4555-8555-555555555555",
        section: "skills",
        fieldPath: "skills.manual",
        value: { kind: "text", value: "TypeScript" },
      },
      now,
    });
    expect(added.ok && added.draft.fields.at(-1)?.sourceStatus).toBe(
      "user_added",
    );

    const completed = applyReviewCommand({
      draft: draft(),
      ownerUserId,
      command: {
        type: "complete_missing_field",
        operationId,
        warningId: "44444444-4444-4444-8444-444444444444",
        fieldId: "66666666-6666-4666-8666-666666666666",
        section: "summary",
        fieldPath: "summary.manual",
        value: { kind: "text", value: "Completed summary" },
      },
      now,
    });
    expect(completed.ok && completed.draft.warnings[0]?.reviewStatus).toBe(
      "edited",
    );

    const intentionallyLeft = applyReviewCommand({
      draft: draft(),
      ownerUserId,
      command: {
        type: "resolve_warning",
        operationId,
        warningId: "44444444-4444-4444-8444-444444444444",
        resolution: "intentionally_left",
      },
      now,
    });
    expect(
      intentionallyLeft.ok && intentionallyLeft.draft.warnings[0]?.resolvedAt,
    ).toEqual(now);

    const excludedSection = applyReviewCommand({
      draft: draft(),
      ownerUserId,
      command: { type: "exclude_section", operationId, section: "summary" },
      now,
    });
    expect(
      excludedSection.ok && excludedSection.draft.fields[0]?.reviewStatus,
    ).toBe("excluded");
  });

  it("fails invalid targets and stale lifecycle without partial mutation", () => {
    expect(
      applyReviewCommand({
        draft: draft(),
        ownerUserId,
        command: {
          type: "confirm_field",
          operationId,
          fieldId: "99999999-9999-4999-8999-999999999999",
        },
        now,
      }),
    ).toMatchObject({ ok: false, code: "field_not_found" });

    expect(
      applyReviewCommand({
        draft: draft({ status: "confirmed" }),
        ownerUserId,
        command: {
          type: "confirm_field",
          operationId,
          fieldId: "33333333-3333-4333-8333-333333333333",
        },
        now,
      }),
    ).toMatchObject({ ok: false, code: "draft_not_reviewable" });
  });

  it("confirms grounded inferred fields and their linked warnings atomically", () => {
    const inferred = {
      ...field(),
      inferenceStatus: "inferred_needs_review" as const,
      warningId: "44444444-4444-4444-8444-444444444444",
    };
    const result = applyReviewCommand({
      draft: draft({ fields: [inferred] }),
      ownerUserId,
      command: {
        type: "confirm_inferred_fields",
        operationId,
        fieldIds: [inferred.id],
      },
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.fields[0]).toMatchObject({
      reviewStatus: "confirmed",
      inferenceStatus: "confirmed_inference",
    });
    expect(result.draft.warnings[0]).toMatchObject({
      reviewStatus: "confirmed",
      resolvedAt: now,
    });
    expect(result.correction).toMatchObject({
      targetType: "import_draft",
      targetId: result.draft.id,
      action: "confirm",
    });
  });

  it("rejects invalid inferred-field batches without partial mutation", () => {
    const original = draft();
    for (const fieldIds of [
      [],
      [original.fields[0]!.id, original.fields[0]!.id],
      ["99999999-9999-4999-8999-999999999999"],
      [original.fields[0]!.id],
    ]) {
      const result = applyReviewCommand({
        draft: original,
        ownerUserId,
        command: {
          type: "confirm_inferred_fields",
          operationId,
          fieldIds,
        },
        now,
      });
      expect(result).toMatchObject({
        ok: false,
        code: "invalid_field_transition",
      });
      expect(original.fields[0]?.reviewStatus).toBe("unreviewed");
    }
  });
});

function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    importedDocumentId: "88888888-8888-4888-8888-888888888888",
    ownerUserId,
    status: "review_required",
    reviewRevision: 0,
    fields: [field()],
    warnings: overrides.warnings ?? [warning()],
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-05T12:00:00.000Z"),
    ...overrides,
  };
}

function field(): ExtractedField {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    importDraftId: "77777777-7777-4777-8777-777777777777",
    section: "summary",
    fieldPath: "summary",
    value: { kind: "text", value: "Original summary" },
    sourceStatus: "explicit_source",
    sourceLocation: {
      kind: "pdf",
      pageNumber: 1,
      textItemIndex: 2,
      boundingBox: { x: 1, y: 2, width: 3, height: 4, unit: "pdf_point" },
    },
    confidenceStatus: "high",
    inferenceStatus: "not_inferred",
    reviewStatus: "unreviewed",
    createdAt: now,
    updatedAt: now,
  };
}

function warning(): ImportWarning {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    importDraftId: "77777777-7777-4777-8777-777777777777",
    warningType: "missing",
    section: "summary",
    message: "Summary may be incomplete.",
    severity: "needs_attention",
    reviewStatus: "needs_review",
    requiresResolution: true,
    createdAt: now,
  };
}
