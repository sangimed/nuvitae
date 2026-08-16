import { describe, expect, it } from "vitest";

import { evaluateSemanticBenchmarkGate } from "./semantic-benchmark-gate.js";

const successfulArm = {
  responseCompletedReceived: true,
  semanticV2EnvelopeAccepted: true,
  deterministicFallbackUsed: false,
  canonicalDraftProduced: true,
  summaryFidelity: "intact" as const,
  expectedWorkEducationStructure: "substantially_present" as const,
};

describe("semantic benchmark success gate", () => {
  it("accepts only a completed, canonical, non-fallback, faithful arm", () => {
    expect(evaluateSemanticBenchmarkGate(successfulArm)).toEqual({
      valid: true,
      failures: [],
    });
  });

  it("records an invalid envelope/fallback as a quality failure", () => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      semanticV2EnvelopeAccepted: false,
      deterministicFallbackUsed: true,
      canonicalDraftProduced: false,
      summaryFidelity: "not_observed",
      expectedWorkEducationStructure: "not_present",
    });

    expect(result).toEqual({
      valid: false,
      failures: [
        "semantic_v2_envelope_not_accepted",
        "deterministic_fallback_used",
        "canonical_draft_not_produced",
        "summary_fidelity_not_intact",
        "expected_work_education_structure_not_present",
      ],
    });
  });
});
