/**
 * A latency sample is meaningful only when the provider completed a usable
 * semantic import. This gate is deliberately independent of model names and
 * raw content so benchmark harnesses can record only bounded booleans and
 * failure categories.
 */
export interface SemanticBenchmarkGateInput {
  readonly responseCompletedReceived: boolean;
  readonly semanticV2EnvelopeAccepted: boolean;
  readonly deterministicFallbackUsed: boolean;
  readonly canonicalDraftProduced: boolean;
  readonly sourceSectionInventory: {
    readonly summary: boolean;
    readonly education: boolean;
  };
  readonly summaryFidelity: "intact" | "not_intact" | "not_observed";
  readonly educationFidelity: "intact" | "not_intact" | "not_observed";
  readonly expectedWorkEducationStructure:
    "substantially_present" | "not_present" | "not_observed";
}

export type SemanticBenchmarkGateFailure =
  | "response_not_completed"
  | "semantic_v2_envelope_not_accepted"
  | "deterministic_fallback_used"
  | "canonical_draft_not_produced"
  | "summary_fidelity_not_intact"
  | "education_fidelity_not_intact"
  | "expected_work_education_structure_not_present";

export interface SemanticBenchmarkGateResult {
  readonly valid: boolean;
  readonly failures: readonly SemanticBenchmarkGateFailure[];
}

export function evaluateSemanticBenchmarkGate(
  input: SemanticBenchmarkGateInput,
): SemanticBenchmarkGateResult {
  const failures: SemanticBenchmarkGateFailure[] = [];
  if (!input.responseCompletedReceived) failures.push("response_not_completed");
  if (!input.semanticV2EnvelopeAccepted)
    failures.push("semantic_v2_envelope_not_accepted");
  if (input.deterministicFallbackUsed)
    failures.push("deterministic_fallback_used");
  if (!input.canonicalDraftProduced)
    failures.push("canonical_draft_not_produced");
  if (
    input.sourceSectionInventory.summary &&
    input.summaryFidelity !== "intact"
  )
    failures.push("summary_fidelity_not_intact");
  if (
    input.sourceSectionInventory.education &&
    input.educationFidelity !== "intact"
  )
    failures.push("education_fidelity_not_intact");
  if (input.expectedWorkEducationStructure !== "substantially_present")
    failures.push("expected_work_education_structure_not_present");
  return { valid: failures.length === 0, failures };
}
