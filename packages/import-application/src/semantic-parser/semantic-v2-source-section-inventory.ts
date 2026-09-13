import type { ResumeSemanticParseRequest } from "@nuvitae/contracts";

import type {
  V2CanonicalizationResult,
  V2RejectedField,
} from "./semantic-extraction-v2-canonicalizer.js";

/**
 * Presence/absence must come from independent source review (for example,
 * fixture truth), never provider output or heading recognition. null means
 * unknown: text alone cannot prove semantic section coverage in any language.
 */
export interface SemanticV2SourceSectionInventory {
  readonly summary: boolean | null;
  readonly workExperience: boolean | null;
  readonly education: boolean | null;
}

export type SemanticV2CompletenessSection =
  keyof SemanticV2SourceSectionInventory;

export type SemanticV2CompletenessDiagnostic =
  | {
      readonly kind: "expected_section_omitted";
      readonly section: SemanticV2CompletenessSection;
    }
  | {
      readonly kind: "provider_section_rejected";
      readonly section: SemanticV2CompletenessSection;
    }
  | {
      readonly kind: "source_section_not_expected";
      readonly section: SemanticV2CompletenessSection;
    }
  | {
      readonly kind: "source_section_unknown";
      readonly section: SemanticV2CompletenessSection;
    };

export function inventorySemanticV2SourceSections(
  _request: Pick<ResumeSemanticParseRequest, "sourceFragments">,
): SemanticV2SourceSectionInventory {
  return {
    summary: null,
    workExperience: null,
    education: null,
  };
}

export function evaluateSemanticV2Completeness(input: {
  readonly sourceInventory: SemanticV2SourceSectionInventory;
  readonly canonical: Extract<V2CanonicalizationResult, { readonly ok: true }>;
}): readonly SemanticV2CompletenessDiagnostic[] {
  const diagnostics: SemanticV2CompletenessDiagnostic[] = [];
  for (const section of Object.keys(
    input.sourceInventory,
  ) as SemanticV2CompletenessSection[]) {
    if (input.sourceInventory[section] === false) {
      diagnostics.push({ kind: "source_section_not_expected", section });
      continue;
    }
    if (hasAcceptedCandidate(input.canonical, section)) continue;
    diagnostics.push(
      hasRejectedField(input.canonical.rejected, section)
        ? { kind: "provider_section_rejected", section }
        : input.sourceInventory[section] === true
          ? { kind: "expected_section_omitted", section }
          : { kind: "source_section_unknown", section },
    );
  }
  return diagnostics;
}

function hasAcceptedCandidate(
  canonical: Extract<V2CanonicalizationResult, { readonly ok: true }>,
  section: SemanticV2CompletenessSection,
): boolean {
  const prefix = `${section}.`;
  return canonical.candidates.some(
    (candidate) =>
      candidate.fieldPath === section || candidate.fieldPath.startsWith(prefix),
  );
}

function hasRejectedField(
  rejected: readonly V2RejectedField[],
  section: SemanticV2CompletenessSection,
): boolean {
  return rejected.some(
    (field) => field.path[0] === "sections" && field.path[1] === section,
  );
}
