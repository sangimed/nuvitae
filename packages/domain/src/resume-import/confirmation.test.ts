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

  it("includes only confirmed or edited active fields and preserves provenance", () => {
    const result = mapReviewedImportDraftToStructuredResume({
      draft: draft({
        fields: [
          field({ reviewStatus: "confirmed" }),
          field({
            id: id(3),
            fieldPath: "skills",
            section: "skills",
            value: { kind: "text_list", values: ["TypeScript", "PostgreSQL"] },
            reviewStatus: "edited",
            sourceStatus: "user_edited",
          }),
          field({ id: id(4), reviewStatus: "excluded" }),
          field({ id: id(5), reviewStatus: "unreviewed" }),
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
    expect(result.resume.content.headline?.value).toBe("Synthetic headline");
    expect(result.resume.content.skills.map((item) => item.name.value)).toEqual(
      ["TypeScript", "PostgreSQL"],
    );
    expect(result.resume.content.skills[0]?.name.sourceStatus).toBe(
      "user_edited",
    );
    expect(result.resume.sourceImportDraftId).toBe(id(1));
    expect("retentionExpiresAt" in result.resume).toBe(false);
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
