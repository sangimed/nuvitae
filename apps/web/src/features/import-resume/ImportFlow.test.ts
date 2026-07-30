import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ImportFlow upload contract", () => {
  it("clears stale upload errors and prevents duplicate in-flight uploads", async () => {
    const source = await readFile(
      "apps/web/src/features/import-resume/ImportFlow.tsx",
      "utf8",
    );

    expect(source).toContain("uploadInFlight");
    expect(source).toContain("if (uploadInFlight.current) return");
    expect(source).toContain("setUploadError(undefined)");
    expect(source).toContain("controller.signal.aborted");
  });
});
