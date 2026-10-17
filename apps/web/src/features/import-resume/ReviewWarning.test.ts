import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ReviewWarning source contract", () => {
  it("uses plain-language action text and no parser terminology", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/ReviewWarning.tsx",
      "utf8",
    );
    expect(source).toContain('t("review.warning.leaveOut")');
    expect(source).toContain('t("review.warning.unsafe.title")');
    expect(source).toContain('t("review.warning.unsafe.message")');
    expect(source).not.toContain("parser");
    expect(source).not.toContain("model");
    expect(source).not.toContain("diagnostic");
  });
});
