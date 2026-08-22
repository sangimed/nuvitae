import { describe, expect, it } from "vitest";
import {
  resumeEditorSectionIds,
  structuredResumeContentSchema,
} from "./manual-resume.js";

const blankContent = {
  personal: [],
  contact: [],
  workExperiences: [],
  education: [],
  skills: [],
  languages: [],
  projects: [],
  certifications: [],
  professionalLinks: [],
};

describe("manual resume content contract", () => {
  it("accepts a complete section order and rejects duplicate sections", () => {
    expect(
      structuredResumeContentSchema.safeParse({
        ...blankContent,
        sectionOrder: resumeEditorSectionIds,
      }).success,
    ).toBe(true);
    expect(
      structuredResumeContentSchema.safeParse({
        ...blankContent,
        sectionOrder: resumeEditorSectionIds.map((section) =>
          section === "summary" ? "basics" : section,
        ),
      }).success,
    ).toBe(false);
  });

  it("keeps legacy content without an explicit section order readable", () => {
    expect(structuredResumeContentSchema.safeParse(blankContent).success).toBe(
      true,
    );
  });
});
