import { applyReviewCommand } from "@nuvitae/domain";
import { describe, expect, it } from "vitest";
import { importDraft } from "../persistence/fixtures.js";

describe("warning resolution transitions", () => {
  it.each([
    "missing",
    "duplicate",
    "conflicting",
    "low_confidence",
    "inferred",
    "ambiguous",
  ] as const)(
    "addresses %s warnings and preserves intentional leave",
    (warningType) => {
      const base = importDraft({
        warnings: [
          {
            ...importDraft().warnings[0]!,
            warningType,
            reviewStatus: "needs_review",
            requiresResolution: true,
          },
        ],
      });
      const result = applyReviewCommand({
        draft: base,
        ownerUserId: base.ownerUserId,
        command: {
          type: "resolve_warning",
          operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          warningId: base.warnings[0]!.id,
          resolution: "intentionally_left",
        },
        now: new Date("2026-07-29T09:00:00.000Z"),
      });
      expect(result.ok && result.draft.warnings[0]?.reviewStatus).toBe(
        "intentionally_left",
      );
      expect(result.ok && result.draft.warnings[0]?.resolvedAt).toBeInstanceOf(
        Date,
      );
      expect(JSON.stringify(result)).not.toContain("structuredResumeId");
    },
  );
});
