import type { ResumeSemanticParseRequest } from "@nuvitae/contracts";

import type {
  V2CanonicalizationResult,
  V2RejectedField,
} from "./semantic-extraction-v2-canonicalizer.js";

/**
 * This intentionally recognizes only unambiguous, standalone section
 * headings followed by content. It is an expectation inventory, not another
 * extractor: an unlabelled section is never made mandatory by this module.
 */
export interface SemanticV2SourceSectionInventory {
  readonly summary: boolean;
  readonly workExperience: boolean;
  readonly education: boolean;
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
    };

const headingLabels: Readonly<
  Record<SemanticV2CompletenessSection, readonly string[]>
> = {
  summary: [
    "summary",
    "profile",
    "profil",
    "a propos",
    "professional summary",
    "career profile",
    "objectif",
  ],
  workExperience: [
    "work experience",
    "experience",
    "experience professionnelle",
    "professional experience",
    "employment",
  ],
  education: [
    "education",
    "formation",
    "etudes",
    "academic background",
    "academic history",
  ],
};

const recognizedHeadingLabels = new Set([
  ...Object.values(headingLabels).flat(),
  "contact",
  "contact information",
  "personal information",
  "skills",
  "competences",
  "technical skills",
  "core skills",
  "languages",
  "langues",
  "projects",
  "projets",
  "certifications",
  "certificates",
  "links",
  "professional links",
  "interests",
  "hobbies",
  "volunteer experience",
  "volunteering",
  "publications",
  "awards",
  "references",
  "additional information",
]);

export function inventorySemanticV2SourceSections(
  request: Pick<ResumeSemanticParseRequest, "sourceFragments">,
): SemanticV2SourceSectionInventory {
  const lines = request.sourceFragments.flatMap((fragment) =>
    fragment.text.split(/\r?\n/u).map((line) => normalizeHeading(line)),
  );
  return {
    summary: sectionHasHeadingAndContent(lines, headingLabels.summary),
    workExperience: sectionHasHeadingAndContent(
      lines,
      headingLabels.workExperience,
    ),
    education: sectionHasHeadingAndContent(lines, headingLabels.education),
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
    if (!input.sourceInventory[section]) {
      diagnostics.push({ kind: "source_section_not_expected", section });
      continue;
    }
    if (hasAcceptedCandidate(input.canonical, section)) continue;
    diagnostics.push(
      hasRejectedField(input.canonical.rejected, section)
        ? { kind: "provider_section_rejected", section }
        : { kind: "expected_section_omitted", section },
    );
  }
  return diagnostics;
}

function sectionHasHeadingAndContent(
  lines: readonly string[],
  labels: readonly string[],
): boolean {
  return lines.some((line, headingIndex) => {
    if (!labels.includes(line)) return false;
    const nextHeadingIndex = lines.findIndex(
      (nextLine, index) =>
        index > headingIndex && recognizedHeadingLabels.has(nextLine),
    );
    const sectionEnd = nextHeadingIndex < 0 ? lines.length : nextHeadingIndex;
    return lines
      .slice(headingIndex + 1, sectionEnd)
      .some((content) => content.length > 0);
  });
}

function normalizeHeading(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .replace(/:$/u, "")
    .trim();
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
