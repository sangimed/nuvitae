import type {
  GroupedReviewSection,
  ReviewDraftReadResponse,
  ReviewField,
} from "@nuvitae/contracts";
import { reviewFieldLabel, reviewSectionLabel } from "./review-labels";

export type ActionableReviewItem = {
  readonly key: string;
  readonly kind: "field" | "warning";
  readonly section: GroupedReviewSection["section"];
  readonly label: string;
  readonly href: string;
};

/**
 * The persisted review read model is the source of truth for this list:
 * Category-B fields need explicit confirmation, and required unresolved
 * warnings need a user action. A warning linked to a pending field is the
 * same review item, so it is represented by the field item once.
 */
export function actionableReviewItems(
  draft: ReviewDraftReadResponse,
): readonly ActionableReviewItem[] {
  return draft.sections.flatMap((section) =>
    sectionActionableReviewItems(section),
  );
}

export function needsExplicitConfirmation(field: ReviewField): boolean {
  return (
    field.inferenceStatus === "inferred_needs_review" &&
    field.reviewStatus === "unreviewed"
  );
}

function sectionActionableReviewItems(
  section: GroupedReviewSection,
): readonly ActionableReviewItem[] {
  const unresolvedWarnings = section.warnings.filter(
    (warning) =>
      warning.requiresResolution && warning.reviewStatus === "needs_review",
  );
  const linkedWarningIds = new Set<string>();
  const items: ActionableReviewItem[] = [];

  for (const field of section.fields) {
    if (!needsExplicitConfirmation(field)) continue;
    for (const warning of unresolvedWarnings) {
      if (field.warningIds.includes(warning.warningId)) {
        linkedWarningIds.add(warning.warningId);
      }
    }
    items.push({
      key: `field:${field.fieldId}`,
      kind: "field",
      section: section.section,
      label: reviewFieldLabel(field.fieldPath),
      href: `#${field.fieldId}-label`,
    });
  }

  for (const warning of unresolvedWarnings) {
    if (linkedWarningIds.has(warning.warningId)) continue;
    items.push({
      key: `warning:${warning.warningId}`,
      kind: "warning",
      section: section.section,
      label:
        warning.fieldPath === undefined
          ? reviewSectionLabel(section.section, section.label)
          : reviewFieldLabel(warning.fieldPath),
      href: `#${section.section}-review-heading`,
    });
  }

  return items;
}
