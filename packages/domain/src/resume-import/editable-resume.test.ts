import { describe, expect, it } from "vitest";
import {
  updateConfirmedStructuredResumeContent,
  type SourcedText,
  type StructuredResume,
} from "../index.js";

const grounded = (value: string): SourcedText => ({
  value,
  sourceStatus: "explicit_source",
  sourceLocation: {
    kind: "minimal",
    label: "imported_from_initial_resume",
    confirmedByUser: true,
  },
  confidenceStatus: "high",
  inferenceStatus: "not_inferred",
});

describe("confirmed structured resume editing", () => {
  it("preserves unchanged grounding and treats changed values as user edits", () => {
    const current: StructuredResume = {
      id: "10000000-0000-4000-8000-000000000001",
      ownerUserId: "20000000-0000-4000-8000-000000000001",
      provenanceLabel: "imported_from_initial_resume",
      confirmationStatus: "confirmed",
      content: {
        personal: [grounded("Jamie Example")],
        contact: [grounded("jamie@example.test")],
        headline: grounded("Engineer"),
        workExperiences: [],
        education: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            institution: grounded("Example University"),
            credential: grounded("BSc"),
            reviewStatus: "confirmed",
          },
        ],
        skills: [],
        languages: [],
        projects: [],
        certifications: [],
        professionalLinks: [],
      },
      createdAt: new Date("2026-08-20T09:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
    };
    const manual = (value: string): SourcedText => ({
      value,
      sourceStatus: "user_added",
      confidenceStatus: "not_applicable",
      inferenceStatus: "not_inferred",
    });

    const updated = updateConfirmedStructuredResumeContent(
      current,
      {
        sectionOrder: [
          "summary",
          "basics",
          "workExperiences",
          "education",
          "projects",
          "skills",
          "certifications",
          "languages",
          "professionalLinks",
        ],
        personal: [manual("Jamie Example")],
        contact: [manual("jamie@example.test")],
        headline: manual("Staff Engineer"),
        workExperiences: [],
        education: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            institution: manual("Example University"),
            credential: manual("MSc"),
            reviewStatus: "edited",
          },
        ],
        skills: [],
        languages: [],
        projects: [],
        certifications: [],
        professionalLinks: [],
      },
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(updated.content.personal[0]).toEqual(current.content.personal[0]);
    expect(updated.content.contact[0]).toEqual(current.content.contact[0]);
    expect(updated.content.headline).toEqual({
      value: "Staff Engineer",
      sourceStatus: "user_edited",
      confidenceStatus: "not_applicable",
      inferenceStatus: "not_inferred",
    });
    expect(updated.content.education[0]?.institution.sourceStatus).toBe(
      "user_edited",
    );
    expect(updated.content.education[0]?.credential?.sourceStatus).toBe(
      "user_edited",
    );
    expect(updated.content.sectionOrder?.[0]).toBe("summary");
    expect(updated.updatedAt.toISOString()).toBe("2026-08-20T10:00:00.000Z");
  });
});
