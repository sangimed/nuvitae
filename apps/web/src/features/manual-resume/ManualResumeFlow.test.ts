import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ManualResumeFlow recovery contract", () => {
  it("keeps not-found recovery separate from temporary retry", async () => {
    const source = await readFile(
      "apps/web/src/features/manual-resume/ManualResumeFlow.tsx",
      "utf8",
    );

    expect(source).toContain('"not-found"');
    expect(source).toContain("Create a new draft");
    expect(source).toContain('url.searchParams.delete("draftId")');
    expect(source).toContain('url.searchParams.delete("creationKey")');
    expect(source).toContain("readManualDraft");
    expect(source).toContain("createManualDraft");
    expect(source).toContain("Try again");
  });

  it("does not generate a creation key before reading an existing draft", async () => {
    const source = await readFile(
      "apps/web/src/features/manual-resume/ManualResumeFlow.tsx",
      "utf8",
    );

    expect(source).toContain("existingDraftId === null");
    expect(source).toContain("ensureCreationKey(url)");
    expect(source).toContain("readManualDraft({ draftId: existingDraftId");
  });
});
