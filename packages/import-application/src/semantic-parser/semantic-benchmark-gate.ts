import type { SemanticV2SourceSectionInventory } from "./semantic-v2-source-section-inventory.js";

/**
 * The one canonical quality gate for privacy-safe Semantic V2 benchmark
 * evidence. It evaluates only explicit predicates; warning and field-rejection
 * counts remain diagnostics and do not silently become whole-arm failures.
 */

export type SemanticBenchmarkPredicateStatus =
  "PASS" | "FAIL" | "not_applicable";

export type SemanticBenchmarkPredicateName =
  | "response_completed"
  | "v2_envelope_accepted"
  | "no_fallback"
  | "canonical_draft_produced"
  | "summary_fidelity"
  | "education_fidelity"
  | "work_fidelity"
  | "no_material_invention"
  | "no_material_truncation";

export type SemanticBenchmarkPredicateReason =
  | "observed"
  | "response_not_completed"
  | "v2_envelope_not_accepted"
  | "fallback_used"
  | "canonical_draft_not_produced"
  | "source_section_not_expected"
  | "expected_summary_missing_or_not_grounded"
  | "expected_education_missing_or_not_grounded"
  | "expected_work_missing_or_not_substantially_present"
  | "material_invention_detected"
  | "material_truncation_detected";

export type SemanticBenchmarkRejectionCategory =
  | "invalid_candidate_shape"
  | "typed_value_shape"
  | "source_ref_shape"
  | "schema_violation"
  | "expected_section_omitted"
  | "other_review_diagnostic";

export interface SemanticBenchmarkDiagnostics {
  readonly warningCount: number;
  readonly rejectedFieldCount: number;
  readonly rejectionCategories: readonly SemanticBenchmarkRejectionCategory[];
  readonly activeFieldCount?: number;
}

export interface SemanticBenchmarkGateInput {
  readonly responseCompletedReceived: boolean;
  readonly semanticV2EnvelopeAccepted: boolean;
  readonly deterministicFallbackUsed: boolean;
  readonly canonicalDraftProduced: boolean;
  readonly sourceSectionInventory: SemanticV2SourceSectionInventory;
  readonly summaryFidelity: "intact" | "not_intact" | "not_observed";
  readonly educationFidelity: "intact" | "not_intact" | "not_observed";
  readonly workFidelity:
    "substantially_present" | "not_present" | "not_observed";
  readonly noMaterialInvention: boolean;
  readonly noMaterialTruncation: boolean;
  readonly diagnostics?: SemanticBenchmarkDiagnostics;
}

export type SemanticBenchmarkGateFailure =
  | "response_not_completed"
  | "semantic_v2_envelope_not_accepted"
  | "deterministic_fallback_used"
  | "canonical_draft_not_produced"
  | "summary_fidelity_not_intact"
  | "education_fidelity_not_intact"
  | "work_fidelity_not_substantially_present"
  | "material_invention_detected"
  | "material_truncation_detected";

export interface SemanticBenchmarkPredicateResult {
  readonly name: SemanticBenchmarkPredicateName;
  readonly status: SemanticBenchmarkPredicateStatus;
  readonly reason: SemanticBenchmarkPredicateReason;
}

export interface SemanticBenchmarkGateResult {
  readonly overall: "PASS" | "FAIL";
  /** Compatibility alias for callers that used the original gate result. */
  readonly valid: boolean;
  readonly predicates: readonly SemanticBenchmarkPredicateResult[];
  readonly failures: readonly SemanticBenchmarkGateFailure[];
  readonly diagnostics: SemanticBenchmarkDiagnostics;
}

const emptyDiagnostics: SemanticBenchmarkDiagnostics = {
  warningCount: 0,
  rejectedFieldCount: 0,
  rejectionCategories: [],
};

export function evaluateSemanticBenchmarkGate(
  input: SemanticBenchmarkGateInput,
): SemanticBenchmarkGateResult {
  const predicates: SemanticBenchmarkPredicateResult[] = [
    booleanPredicate(
      "response_completed",
      input.responseCompletedReceived,
      "response_not_completed",
    ),
    booleanPredicate(
      "v2_envelope_accepted",
      input.semanticV2EnvelopeAccepted,
      "v2_envelope_not_accepted",
    ),
    booleanPredicate(
      "no_fallback",
      !input.deterministicFallbackUsed,
      "fallback_used",
    ),
    booleanPredicate(
      "canonical_draft_produced",
      input.canonicalDraftProduced,
      "canonical_draft_not_produced",
    ),
    conditionalFidelityPredicate(
      "summary_fidelity",
      input.sourceSectionInventory.summary,
      input.summaryFidelity === "intact",
      "expected_summary_missing_or_not_grounded",
    ),
    conditionalFidelityPredicate(
      "education_fidelity",
      input.sourceSectionInventory.education,
      input.educationFidelity === "intact",
      "expected_education_missing_or_not_grounded",
    ),
    conditionalFidelityPredicate(
      "work_fidelity",
      input.sourceSectionInventory.workExperience,
      input.workFidelity === "substantially_present",
      "expected_work_missing_or_not_substantially_present",
    ),
    booleanPredicate(
      "no_material_invention",
      input.noMaterialInvention,
      "material_invention_detected",
    ),
    booleanPredicate(
      "no_material_truncation",
      input.noMaterialTruncation,
      "material_truncation_detected",
    ),
  ];

  const failures = predicates
    .filter((predicate) => predicate.status === "FAIL")
    .map((predicate) => failureForPredicate(predicate.name));
  const overall = failures.length === 0 ? "PASS" : "FAIL";

  return {
    overall,
    valid: overall === "PASS",
    predicates,
    failures,
    diagnostics: input.diagnostics ?? emptyDiagnostics,
  };
}

export function serializeSemanticBenchmarkGateResult(
  result: SemanticBenchmarkGateResult,
): string {
  return JSON.stringify(result);
}

function booleanPredicate(
  name: Exclude<
    SemanticBenchmarkPredicateName,
    "summary_fidelity" | "education_fidelity" | "work_fidelity"
  >,
  passes: boolean,
  failureReason: Exclude<SemanticBenchmarkPredicateReason, "observed">,
): SemanticBenchmarkPredicateResult {
  return {
    name,
    status: passes ? "PASS" : "FAIL",
    reason: passes ? "observed" : failureReason,
  };
}

function conditionalFidelityPredicate(
  name: "summary_fidelity" | "education_fidelity" | "work_fidelity",
  expected: boolean,
  passes: boolean,
  failureReason: Exclude<SemanticBenchmarkPredicateReason, "observed">,
): SemanticBenchmarkPredicateResult {
  if (!expected) {
    return {
      name,
      status: "not_applicable",
      reason: "source_section_not_expected",
    };
  }
  return {
    name,
    status: passes ? "PASS" : "FAIL",
    reason: passes ? "observed" : failureReason,
  };
}

function failureForPredicate(
  name: SemanticBenchmarkPredicateName,
): SemanticBenchmarkGateFailure {
  switch (name) {
    case "response_completed":
      return "response_not_completed";
    case "v2_envelope_accepted":
      return "semantic_v2_envelope_not_accepted";
    case "no_fallback":
      return "deterministic_fallback_used";
    case "canonical_draft_produced":
      return "canonical_draft_not_produced";
    case "summary_fidelity":
      return "summary_fidelity_not_intact";
    case "education_fidelity":
      return "education_fidelity_not_intact";
    case "work_fidelity":
      return "work_fidelity_not_substantially_present";
    case "no_material_invention":
      return "material_invention_detected";
    case "no_material_truncation":
      return "material_truncation_detected";
  }
}
