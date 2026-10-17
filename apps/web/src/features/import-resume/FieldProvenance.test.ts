import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("FieldProvenance source contract", () => {
  it("shows only safe provenance labels", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/FieldProvenance.tsx",
      "utf8",
    );
    expect(source).toContain('t("review.provenance.pdf")');
    expect(source).toContain('t("review.provenance.added")');
    expect(source).toContain('t("review.provenance.edited")');
    expect(source).not.toContain("bounding");
    expect(source).not.toContain("characterOffset");
    expect(source).not.toContain("storage");
    expect(source).not.toContain("snippet");
  });
});
