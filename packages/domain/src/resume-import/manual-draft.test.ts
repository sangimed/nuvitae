import { describe, expect, it } from "vitest";
import {
  createBlankManualStructuredResumeDraft,
  manualSourcedText,
  updateManualDraftContent,
  validateManualContent,
} from "./manual-draft.js";

describe("manual structured resume draft domain operations", () => {
  it("creates blank editable content for every supported section", () => {
    const draft = createBlankManualStructuredResumeDraft({
      id: "draft-1",
      ownerUserId: "user-1",
      createdAt: new Date("2026-07-29T09:30:00.000Z"),
    });

    expect(draft.source).toBe("manual_entry");
    expect(draft.status).toBe("editing");
    expect(draft.content).toEqual({
      sectionOrder: [
        "basics",
        "summary",
        "workExperiences",
        "education",
        "projects",
        "skills",
        "certifications",
        "languages",
        "professionalLinks",
      ],
      personal: [],
      contact: [],
      workExperiences: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    });
  });

  it("marks manually entered values as user-added without source locations", () => {
    const result = manualSourcedText(" Synthetic Value ");

    expect(result).toEqual({
      value: "Synthetic Value",
      sourceStatus: "user_added",
      confidenceStatus: "not_applicable",
      inferenceStatus: "not_inferred",
    });
    expect(result).not.toHaveProperty("sourceLocation");
  });

  it("normalizes content, preserves item IDs, and updates time from injected clock", () => {
    const createdAt = new Date("2026-07-29T09:30:00.000Z");
    const updatedAt = new Date("2026-07-29T09:45:00.000Z");
    const draft = createBlankManualStructuredResumeDraft({
      id: "draft-1",
      ownerUserId: "user-1",
      createdAt,
    });
    const updated = updateManualDraftContent(
      draft,
      {
        ...draft.content,
        skills: [
          {
            id: "skill-1",
            name: manualSourcedText("  TypeScript  "),
            reviewStatus: "edited",
          },
        ],
      },
      updatedAt,
    );

    expect(updated.updatedAt).toBe(updatedAt);
    expect(updated.content.skills[0]?.id).toBe("skill-1");
    expect(updated.content.skills[0]?.name.value).toBe("TypeScript");
    expect(updated.content.skills[0]?.name.sourceStatus).toBe("user_added");
    expect(updated.content.skills[0]?.name).not.toHaveProperty(
      "sourceLocation",
    );
  });

  it("preserves the user-selected section order when saving", () => {
    const draft = createBlankManualStructuredResumeDraft({
      id: "draft-1",
      ownerUserId: "user-1",
      createdAt: new Date("2026-07-29T09:30:00.000Z"),
    });
    const sectionOrder = [
      "basics",
      "skills",
      "summary",
      "workExperiences",
      "education",
      "projects",
      "certifications",
      "languages",
      "professionalLinks",
    ] as const;

    const updated = updateManualDraftContent(
      draft,
      { ...draft.content, sectionOrder },
      new Date("2026-07-29T09:35:00.000Z"),
    );

    expect(updated.content.sectionOrder).toEqual(sectionOrder);
  });

  it("rejects unsafe item counts", () => {
    const validation = validateManualContent({
      personal: Array.from({ length: 13 }, (_, index) =>
        manualSourcedText(`Value ${index}`),
      ),
      contact: [],
      workExperiences: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.ok ? [] : validation.issues).toContainEqual(
      expect.objectContaining({ code: "too_many_items", path: "personal" }),
    );
  });
});
