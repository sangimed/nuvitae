import type {
  DeterministicResumeFieldCandidate,
  DeterministicResumeSection,
  DeterministicWarningCandidate,
  ExtractedValue,
  ImportedDocument,
} from "@nuvitae/domain";

import type {
  V2CanonicalSemanticCandidate,
  V2CanonicalSignal,
  V2RejectedField,
} from "./semantic-extraction-v2-canonicalizer.js";
import type { SemanticV2CompletenessDiagnostic } from "./semantic-v2-source-section-inventory.js";

export interface SemanticV2CandidateMappingResult {
  readonly fields: readonly DeterministicResumeFieldCandidate[];
  readonly warnings: readonly DeterministicWarningCandidate[];
}

/**
 * Maps Nuvitae-canonical V2 candidates directly to the existing review draft
 * input. It intentionally does not create a V1 response or accept provider
 * identity/policy fields.
 */
export function mapSemanticV2CandidatesToDraft(input: {
  readonly candidates: readonly V2CanonicalSemanticCandidate[];
  readonly rejected: readonly V2RejectedField[];
  readonly signals: readonly V2CanonicalSignal[];
  readonly completenessDiagnostics?: readonly SemanticV2CompletenessDiagnostic[];
  readonly document: ImportedDocument;
}): SemanticV2CandidateMappingResult {
  const fields: DeterministicResumeFieldCandidate[] = [];
  const dateRanges = new Map<
    string,
    {
      readonly candidates: V2CanonicalSemanticCandidate[];
    }
  >();

  for (const candidate of input.candidates) {
    if (isWorkRoleDate(candidate)) {
      const key = candidate.groupPath;
      const existing = dateRanges.get(key);
      if (existing === undefined) {
        dateRanges.set(key, { candidates: [candidate] });
      } else {
        dateRanges.set(key, {
          candidates: [...existing.candidates, candidate],
        });
      }
      continue;
    }
    fields.push(toField(candidate, input.document));
  }

  for (const range of dateRanges.values()) {
    fields.push(toRoleDateRange(range.candidates, input.document));
  }

  const warnings = [
    ...input.rejected.map(rejectedWarning),
    ...input.signals.flatMap(signalWarning),
    ...input.candidates.flatMap(semanticCompletenessWarning),
    ...(input.completenessDiagnostics ?? []).flatMap(completenessWarning),
  ];
  return { fields, warnings };
}

function semanticCompletenessWarning(
  candidate: V2CanonicalSemanticCandidate,
): readonly DeterministicWarningCandidate[] {
  if (candidate.semanticCompleteness !== "unknown") return [];
  return [
    {
      warningType: "ambiguous",
      section: sectionForFieldPath(candidate.fieldPath),
      fieldPath: draftFieldPath(candidate.fieldPath),
      message:
        "The submitted text is grounded, but semantic completeness could not be deterministically proven and needs review.",
      requiresResolution: true,
    },
  ];
}

function toField(
  candidate: V2CanonicalSemanticCandidate,
  document: ImportedDocument,
): DeterministicResumeFieldCandidate {
  return {
    section: sectionForFieldPath(candidate.fieldPath),
    fieldPath: draftFieldPath(candidate.fieldPath),
    value: extractedValue(candidate),
    sourceLocation:
      candidate.inferenceStatus === "inferred_needs_review"
        ? semanticLocation(document, candidate)
        : minimalLocation(document),
    confidence: candidate.confidence,
    inferenceStatus: candidate.inferenceStatus,
    sourceOrder: candidate.evidence[0]?.line ?? 0,
  };
}

function toRoleDateRange(
  candidates: readonly V2CanonicalSemanticCandidate[],
  document: ImportedDocument,
): DeterministicResumeFieldCandidate {
  const start = candidates.find((candidate) =>
    candidate.fieldPath.endsWith(".startDate"),
  );
  const end = candidates.find((candidate) =>
    candidate.fieldPath.endsWith(".endDate"),
  );
  return {
    section: "work_experience",
    fieldPath: draftFieldPath(
      `${candidates[0]?.groupPath ?? "workExperience"}.date_range`,
    ),
    value: {
      kind: "date_range",
      ...(start === undefined ? {} : { startDate: dateValue(start) }),
      ...(end === undefined ? {} : { endDate: dateValue(end) }),
      isOngoing: end?.normalizedValue === "current",
    },
    sourceLocation: minimalLocation(document),
    confidence: "high",
    inferenceStatus: "not_inferred",
    sourceOrder: Math.min(
      ...candidates.map((candidate) => candidate.evidence[0]?.line ?? 0),
    ),
  };
}

function extractedValue(
  candidate: V2CanonicalSemanticCandidate,
): ExtractedValue {
  switch (candidate.valueKind) {
    case "date":
      return { kind: "date", value: dateValue(candidate) };
    case "link":
      return {
        kind: "link",
        url: candidate.normalizedValue,
        ...(candidate.linkLabel === undefined
          ? {}
          : { label: candidate.linkLabel }),
      };
    case "language":
      return { kind: "language", name: candidate.value };
    case "text":
      return { kind: "text", value: candidate.value };
  }
}

function dateValue(candidate: V2CanonicalSemanticCandidate) {
  if (candidate.normalizedValue === "current") {
    return {
      precision: "present" as const,
      originalText: candidate.value,
    };
  }
  const monthMatch = /^(\d{4})-(\d{2})$/u.exec(candidate.normalizedValue);
  if (monthMatch !== null) {
    return {
      year: Number(monthMatch[1]),
      month: Number(monthMatch[2]),
      precision: "month" as const,
      originalText: candidate.value,
    };
  }
  return {
    year: Number(candidate.normalizedValue),
    precision: "year" as const,
    originalText: candidate.value,
  };
}

function isWorkRoleDate(candidate: V2CanonicalSemanticCandidate): boolean {
  return (
    candidate.valueKind === "date" &&
    candidate.groupPath.includes("workExperience.") &&
    candidate.groupPath.includes(".roles.")
  );
}

function draftFieldPath(fieldPath: string): string {
  const normalized = fieldPath
    .replace(/^workExperience/u, "work_experience")
    .replace(/^professionalLinks/u, "professional_links")
    .replace(/\.startDate$/u, ".start_date")
    .replace(/\.endDate$/u, ".end_date")
    .replace(/\.employerName$/u, ".employer")
    .replace(/\.employerLocation$/u, ".employer_location")
    .replace(/\.fieldOfStudy$/u, ".field_of_study")
    .replace(/\.degree$/u, ".credential")
    .replace(/\.responsibilities\.\d+$/u, ".responsibility")
    .replace(/\.achievements\.\d+$/u, ".achievement");
  if (normalized.startsWith("professional_links."))
    return "professional_links.url";
  return normalized;
}

function sectionForFieldPath(fieldPath: string): DeterministicResumeSection {
  const root = fieldPath.split(".")[0];
  switch (root) {
    case "contact":
    case "headline":
    case "summary":
    case "workExperience":
    case "education":
    case "skills":
    case "languages":
    case "projects":
    case "certifications":
      if (root === "workExperience") return "work_experience";
      return root as Exclude<
        DeterministicResumeSection,
        "personal" | "work_experience" | "professional_links"
      >;
    case "professionalLinks":
      return "professional_links";
    default:
      return "summary";
  }
}

function rejectedWarning(
  rejected: V2RejectedField,
): DeterministicWarningCandidate {
  const fieldPath = rejectedFieldPath(rejected.path);
  return {
    warningType: "unsupported",
    section:
      fieldPath === undefined ? "summary" : sectionForFieldPath(fieldPath),
    ...(fieldPath === undefined
      ? {}
      : { fieldPath: draftFieldPath(fieldPath) }),
    message: rejectedDiagnosticMessage(rejected.code),
    requiresResolution: true,
  };
}

function completenessWarning(
  diagnostic: SemanticV2CompletenessDiagnostic,
): readonly DeterministicWarningCandidate[] {
  if (diagnostic.kind !== "expected_section_omitted") return [];
  return [
    {
      warningType: "missing",
      section:
        diagnostic.section === "workExperience"
          ? "work_experience"
          : diagnostic.section,
      fieldPath:
        diagnostic.section === "workExperience"
          ? "work_experience"
          : diagnostic.section,
      message:
        "A source-supported resume section was omitted and needs review.",
      requiresResolution: true,
    },
  ];
}

function rejectedDiagnosticMessage(code: V2RejectedField["code"]): string {
  if (code === "malformed_atom")
    return "An imported field had an invalid atom shape and was not included.";
  if (code === "malformed_group" || code === "unsupported_group_shape")
    return "An imported section had an invalid group shape and was not included.";
  if (code === "unsupported_typed_value")
    return "An imported typed value was not supported and was not included.";
  if (
    code === "missing_source_refs" ||
    code === "value_not_grounded" ||
    code === "ambiguous_source_refs" ||
    code === "duplicate_source_ref" ||
    code === "overlapping_source_refs" ||
    code === "materially_truncated_value" ||
    code === "value_ambiguous"
  )
    return "An imported field could not be verified against the source and was not included.";
  return "Some imported content was not supported and was not included.";
}

function signalWarning(
  signal: V2CanonicalSignal,
): readonly DeterministicWarningCandidate[] {
  const ambiguous = signal.kind.startsWith("ambiguous");
  const base = {
    warningType: ambiguous ? "ambiguous" : "conflicting",
    message: ambiguous
      ? "Some imported information is ambiguous and needs your review."
      : "Some imported information conflicts and needs your review.",
    requiresResolution: true,
  } as const;
  if (signal.affectedFieldPaths.length === 0) {
    return [{ ...base, section: "summary" }];
  }
  return signal.affectedFieldPaths.map((fieldPath) => ({
    ...base,
    section: sectionForFieldPath(fieldPath),
    fieldPath: draftFieldPath(fieldPath),
  }));
}

function rejectedFieldPath(
  path: readonly (string | number)[],
): string | undefined {
  if (path[0] !== "sections") return undefined;
  return path
    .slice(1)
    .map((part) => (typeof part === "number" ? String(part) : part))
    .join(".");
}

function minimalLocation(document: ImportedDocument) {
  return {
    kind: "minimal" as const,
    label: "imported_from_initial_resume" as const,
    confirmedByUser: false,
    sourceDeletedAt: undefined,
    documentId: document.id,
  };
}

function semanticLocation(
  document: ImportedDocument,
  candidate: V2CanonicalSemanticCandidate,
) {
  return {
    kind: "semantic" as const,
    documentId: document.id,
    evidence: candidate.evidence.map((item) => ({
      fragmentId: item.fragmentId,
      fragmentHash: item.fragmentHash,
      line: item.line,
      start: item.start,
      end: item.end,
    })),
  };
}
