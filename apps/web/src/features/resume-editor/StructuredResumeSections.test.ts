import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("StructuredResumeSections source contract", () => {
  it("keeps a controlled reusable editor API and all supported sections", async () => {
    const source = await readFile(
      "apps/web/src/features/resume-editor/StructuredResumeSections.tsx",
      "utf8",
    );

    for (const apiToken of [
      "readonly value: Content",
      "readonly onChange: (value: Content) => void",
      'readonly mode: "manual" | "import_review"',
      "readonly validationErrors?",
      "readonly disabled?",
      "readonly readOnly?",
    ]) {
      expect(source).toContain(apiToken);
    }

    for (const section of [
      "Personal information",
      "Contact information",
      "Headline",
      "Summary",
      "Work experience",
      "Education",
      "Skills",
      "Languages",
      "Projects",
      "Certifications",
      "Professional links",
      "Ongoing role",
      "Responsibilities",
      "Achievements",
      "Project links",
    ]) {
      expect(source).toContain(section);
    }

    expect(source).toContain("Add role");
    expect(source).toContain("Remove role");
    expect(source).toContain('label="role"');
    expect(source).toContain("MoveButtons");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("typeorm");
    expect(source).not.toContain("BullMQ");
  });
});
