import { applyReviewCommand } from "@nuvitae/domain";
import { describe, expect, it } from "vitest";
import { importDraft } from "../persistence/fixtures.js";

describe("review correction integration slice", () => {
  it("applies grouped correction actions without mutating source metadata or creating a StructuredResume", () => {
    const original = importDraft();
    const retention = original.retentionExpiresAt;
    const confirmed = applyReviewCommand({
      draft: original,
      ownerUserId: original.ownerUserId,
      command: {
        type: "confirm_field",
        operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fieldId: original.fields[0]!.id,
      },
      now: new Date("2026-07-29T09:00:00.000Z"),
    });
    expect(confirmed.ok && confirmed.draft.reviewRevision).toBe(0);
    expect(confirmed.ok && confirmed.draft.lastReviewedAt).toEqual(
      new Date("2026-07-29T09:00:00.000Z"),
    );
    expect(confirmed.ok && confirmed.draft.retentionExpiresAt).toBe(retention);
    expect(JSON.stringify(confirmed)).not.toContain("structuredResumeId");
  });
});
