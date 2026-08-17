import { describe, expect, it } from "vitest";
import type { ExtractedField, ImportDraft, ImportWarning } from "./types.js";
import {
  mapReviewedImportDraftToStructuredResume,
  reduceStructuredResumeSourceProvenance,
} from "./structured-resume-mapper.js";

const now = new Date("2026-07-29T09:00:00.000Z");

describe("structured resume confirmation mapper", () => {
  it("requires ready_to_confirm and blocks unresolved warnings", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({ status: "review_required", warnings: [warning()] }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers.map((item) => item.code)).toContain(
      "draft_not_ready",
    );
    expect(!result.ok && result.blockers.map((item) => item.code)).toContain(
      "unresolved_warning",
    );
  });

  it("retains valid unreviewed fields when one field is explicitly confirmed", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            id: id(3),
            section: "contact",
            fieldPath: "contact.email",
            value: { kind: "text", value: "jane@example.invalid" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(4),
            section: "contact",
            fieldPath: "contact.phone",
            value: { kind: "text", value: "+33 1 23 45 67 89" },
          }),
          field({
            id: id(5),
            section: "personal",
            fieldPath: "personal.full_name",
            value: { kind: "text", value: "Jane Example" },
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resume.content.contact.map((item) => item.value)).toEqual([
      "jane@example.invalid",
      "+33 1 23 45 67 89",
    ]);
    expect(result.resume.content.personal.map((item) => item.value)).toEqual([
      "Jane Example",
    ]);
  });

  it("drops exactly the field explicitly excluded by the user", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            id: id(3),
            section: "contact",
            fieldPath: "contact.email",
            value: { kind: "text", value: "jane@example.invalid" },
          }),
          field({
            id: id(4),
            section: "contact",
            fieldPath: "contact.phone",
            value: { kind: "text", value: "+33 1 23 45 67 89" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(5),
            section: "contact",
            fieldPath: "contact.address",
            value: { kind: "text", value: "Excluded address" },
            reviewStatus: "excluded",
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resume.content.contact.map((item) => item.value)).toEqual([
      "jane@example.invalid",
      "+33 1 23 45 67 89",
    ]);
    expect(result.resume.content.contact).toHaveLength(2);
  });

  it("retains edited values and user-added fields with their provenance", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            id: id(3),
            section: "summary",
            fieldPath: "summary",
            value: { kind: "text", value: "Edited summary" },
            sourceStatus: "user_edited",
            reviewStatus: "edited",
          }),
          field({
            id: id(4),
            section: "skills",
            fieldPath: "skills",
            value: { kind: "text", value: "User-added skill" },
            sourceStatus: "user_added",
            sourceLocation: undefined,
            reviewStatus: "edited",
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resume.content.summary?.value).toBe("Edited summary");
    expect(result.resume.content.summary?.value).not.toBe("Original summary");
    expect(result.resume.content.skills[0]?.name).toMatchObject({
      value: "User-added skill",
      sourceStatus: "user_added",
    });
  });

  it("blocks unresolved inferred fields instead of retaining them", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            id: id(3),
            section: "contact",
            fieldPath: "contact.email",
            value: { kind: "text", value: "jane@example.invalid" },
          }),
          field({
            id: id(4),
            section: "summary",
            fieldPath: "summary",
            value: { kind: "text", value: "Inferred summary" },
            sourceStatus: "inferred",
            sourceLocation: undefined,
            inferenceStatus: "inferred_needs_review",
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers.map((item) => item.code)).toContain(
      "unconfirmed_inference",
    );
  });

  it("does not retain invalid reviewed shapes", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            section: "skills",
            fieldPath: "skills",
            value: { kind: "date", value: { year: 2024, precision: "year" } },
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers.map((item) => item.code)).toContain(
      "unsupported_reviewed_shape",
    );
  });

  it("preserves every outcome in a mixed review once inference is resolved", () => {
    const mixedFields: ExtractedField[] = [
      field({
        id: id(3),
        section: "contact",
        fieldPath: "contact.email",
        value: { kind: "text", value: "unreviewed@example.invalid" },
      }),
      field({
        id: id(4),
        section: "contact",
        fieldPath: "contact.phone",
        value: { kind: "text", value: "+33 1 23 45 67 89" },
        reviewStatus: "confirmed",
      }),
      field({
        id: id(5),
        section: "skills",
        fieldPath: "skills",
        value: { kind: "text", value: "Edited skill" },
        sourceStatus: "user_edited",
        reviewStatus: "edited",
      }),
      field({
        id: id(6),
        section: "contact",
        fieldPath: "contact.address",
        value: { kind: "text", value: "Excluded address" },
        reviewStatus: "excluded",
      }),
      field({
        id: id(7),
        section: "summary",
        fieldPath: "summary",
        value: { kind: "text", value: "Inferred summary" },
        sourceStatus: "inferred",
        sourceLocation: undefined,
        inferenceStatus: "inferred_needs_review",
      }),
    ];
    const blocked = mapReviewedImportDraftToStructuredResume({
      draft: draft({ fields: mixedFields }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.blockers.map((item) => item.code)).toContain(
      "unconfirmed_inference",
    );

    const resolved = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: mixedFields.map((item) =>
          item.inferenceStatus === "inferred_needs_review"
            ? {
                ...item,
                reviewStatus: "confirmed" as const,
                inferenceStatus: "confirmed_inference" as const,
              }
            : item,
        ),
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.resume.content.contact.map((item) => item.value)).toEqual([
      "unreviewed@example.invalid",
      "+33 1 23 45 67 89",
    ]);
    expect(
      resolved.resume.content.skills.map((item) => item.name.value),
    ).toEqual(["Edited skill"]);
    expect(resolved.resume.content.summary?.value).toBe("Inferred summary");
  });

  it("retains valid unreviewed Work Experience and Education fields", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            id: id(3),
            section: "work_experience",
            fieldPath: "work_experience.0.employer",
            value: { kind: "text", value: "Example Employer" },
          }),
          field({
            id: id(4),
            section: "work_experience",
            fieldPath: "work_experience.0.roles.0.title",
            value: { kind: "text", value: "Platform Engineer" },
          }),
          field({
            id: id(5),
            section: "work_experience",
            fieldPath: "work_experience.0.roles.0.responsibility",
            value: { kind: "text", value: "Built reliable systems." },
          }),
          field({
            id: id(6),
            section: "education",
            fieldPath: "education.0.institution",
            value: { kind: "text", value: "Example University" },
          }),
          field({
            id: id(7),
            section: "education",
            fieldPath: "education.0.credential",
            value: { kind: "text", value: "MSc Systems Engineering" },
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resume.content.workExperiences).toHaveLength(1);
    expect(result.resume.content.workExperiences[0]).toMatchObject({
      employerName: "Example Employer",
      roles: [
        {
          title: "Platform Engineer",
          responsibilities: [{ value: "Built reliable systems." }],
        },
      ],
    });
    expect(result.resume.content.education).toHaveLength(1);
    expect(result.resume.content.education[0]).toMatchObject({
      institution: { value: "Example University" },
      credential: { value: "MSc Systems Engineering" },
    });
  });

  it("blocks ambiguous singular fields and generic work entries", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({ reviewStatus: "confirmed" }),
          field({ id: id(3), reviewStatus: "edited" }),
          field({
            id: id(4),
            section: "work_experience",
            fieldPath: "work_experience.entry",
            reviewStatus: "confirmed",
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.blockers.map((item) => item.code)).toContain(
      "ambiguous_singular_field",
    );
    expect(!result.ok && result.blockers.map((item) => item.code)).toContain(
      "unsupported_reviewed_shape",
    );
  });

  it("groups education fields and preserves an explicit year without inventing a start date", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            section: "education",
            fieldPath: "education.0.institution",
            value: { kind: "text", value: "Example University" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(3),
            section: "education",
            fieldPath: "education.0.credential",
            value: { kind: "text", value: "MSc Systems Engineering" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(4),
            section: "education",
            fieldPath: "education.0.end_date",
            value: {
              kind: "date",
              value: { year: 2024, precision: "year" },
            },
            reviewStatus: "confirmed",
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resume.content.education).toHaveLength(1);
    expect(result.resume.content.education[0]).toMatchObject({
      institution: { value: "Example University" },
      credential: { value: "MSc Systems Engineering" },
      endDate: { year: 2024, precision: "year" },
    });
    expect(result.resume.content.education[0]?.startDate).toBeUndefined();
  });

  it("groups every repeated structured section by source index", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({
            section: "languages",
            fieldPath: "languages.0.name",
            value: { kind: "language", name: "English" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(3),
            section: "languages",
            fieldPath: "languages.0.proficiency",
            value: { kind: "text", value: "Fluent" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(4),
            section: "projects",
            fieldPath: "projects.0.name",
            value: { kind: "text", value: "Control Plane" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(5),
            section: "projects",
            fieldPath: "projects.0.description",
            value: {
              kind: "text",
              value: "Automated safe deployment workflows.",
            },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(6),
            section: "certifications",
            fieldPath: "certifications.0.name",
            value: { kind: "text", value: "Cloud Architect" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(7),
            section: "certifications",
            fieldPath: "certifications.0.issuer",
            value: { kind: "text", value: "Example Board" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(8),
            section: "work_experience",
            fieldPath: "work_experience.0.employer",
            value: { kind: "text", value: "Example Employer" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(9),
            section: "work_experience",
            fieldPath: "work_experience.0.roles.0.title",
            value: { kind: "text", value: "Platform Engineer" },
            reviewStatus: "confirmed",
          }),
          field({
            id: id(10),
            section: "work_experience",
            fieldPath: "work_experience.0.roles.0.date_range",
            value: {
              kind: "date_range",
              startDate: { year: 2021, month: 3, precision: "month" },
              endDate: { precision: "present", originalText: "Present" },
              isOngoing: true,
            },
            reviewStatus: "confirmed",
          }),
        ],
      }),
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resume.content.languages).toHaveLength(1);
    expect(result.resume.content.languages[0]).toMatchObject({
      name: { value: "English" },
      proficiency: { value: "Fluent" },
    });
    expect(result.resume.content.projects).toHaveLength(1);
    expect(result.resume.content.projects[0]).toMatchObject({
      name: { value: "Control Plane" },
      description: { value: "Automated safe deployment workflows." },
    });
    expect(result.resume.content.certifications).toHaveLength(1);
    expect(result.resume.content.certifications[0]).toMatchObject({
      name: { value: "Cloud Architect" },
      issuer: { value: "Example Board" },
    });
    expect(result.resume.content.workExperiences[0]?.roles[0]).toMatchObject({
      startDate: { year: 2021, month: 3, precision: "month" },
      endDate: { precision: "present", originalText: "Present" },
      isOngoing: true,
    });
  });

  it("does not mutate input and reduces source provenance without deleting content", () => {
    const original = draft({
      fields: [field({ reviewStatus: "confirmed" })],
    });
    const snapshot = JSON.stringify(original);
    const mapped = mapReviewedImportDraftToStructuredResume({
      draft: original,
      corrections: [],
      structuredResumeId: id(9),
      childIds: ids(),
      confirmedAt: now,
      now,
    });
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const reduced = reduceStructuredResumeSourceProvenance(
      mapped.resume,
      new Date("2026-08-04T08:00:00.000Z"),
    );
    expect(reduced.id).toBe(mapped.resume.id);
    expect(reduced.content.headline?.value).toBe("Synthetic headline");
    expect(reduced.content.headline?.sourceLocation?.kind).toBe("minimal");
    expect(mapped.resume.content.headline?.sourceLocation?.kind).toBe("pdf");
  });
});

function id(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function ids() {
  let next = 20;
  return {
    textItemId: () => id(next++),
    workExperienceId: () => id(next++),
    workRoleId: () => id(next++),
    sectionItemId: () => id(next++),
    linkId: () => id(next++),
  };
}

function field(overrides: Partial<ExtractedField> = {}): ExtractedField {
  return {
    id: id(2),
    importDraftId: id(1),
    section: "headline",
    fieldPath: "headline",
    value: { kind: "text", value: "Synthetic headline" },
    sourceStatus: "explicit_source",
    sourceLocation: {
      kind: "pdf",
      pageNumber: 2,
      textItemIndex: 0,
      boundingBox: { x: 1, y: 2, width: 3, height: 4, unit: "pdf_point" },
    },
    confidenceStatus: "high",
    inferenceStatus: "not_inferred",
    reviewStatus: "unreviewed",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function warning(): ImportWarning {
  return {
    id: id(8),
    importDraftId: id(1),
    warningType: "low_confidence",
    section: "headline",
    fieldPath: "headline",
    message: "Review this.",
    severity: "needs_attention",
    reviewStatus: "needs_review",
    requiresResolution: true,
    createdAt: now,
  };
}

function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    id: id(1),
    importedDocumentId: id(10),
    ownerUserId: id(11),
    status: "ready_to_confirm",
    reviewRevision: 2,
    fields: [field({ reviewStatus: "confirmed" })],
    warnings: [],
    createdAt: new Date("2026-07-28T08:00:00.000Z"),
    retentionExpiresAt: new Date("2026-08-04T08:00:00.000Z"),
    ...overrides,
  };
}
