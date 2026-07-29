import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ReviewStep source contract", () => {
  it("delegates confirmation UI and keeps import review decoupled from persistence", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/ReviewStep.tsx",
      "utf8",
    );
    expect(source).toContain("readReviewDraft");
    expect(source).toContain("sendReviewMutation");
    expect(source).toContain("projectOptimisticReview");
    expect(source).toContain("ConfirmationStep");
    expect(source).not.toContain("StructuredResume");
    expect(source).not.toContain("typeorm");
    expect(source).not.toContain("BullMQ");
    expect(source).not.toContain("storageKey");
  });
});
