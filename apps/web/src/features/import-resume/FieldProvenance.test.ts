import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("FieldProvenance source contract", () => {
  it("shows only safe provenance labels", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/FieldProvenance.tsx",
      "utf8",
    );
    expect(source).toContain("Imported from page");
    expect(source).toContain("Added by you");
    expect(source).toContain("Edited by you");
    expect(source).not.toContain("bounding");
    expect(source).not.toContain("characterOffset");
    expect(source).not.toContain("storage");
    expect(source).not.toContain("snippet");
  });
});
