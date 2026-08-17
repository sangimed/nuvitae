import { describe, expect, it } from "vitest";

import {
  evaluateSemanticBenchmarkGate,
  serializeSemanticBenchmarkGateResult,
  type SemanticBenchmarkGateInput,
} from "./semantic-benchmark-gate.js";

const successfulArm: SemanticBenchmarkGateInput = {
  responseCompletedReceived: true,
  semanticV2EnvelopeAccepted: true,
  deterministicFallbackUsed: false,
  canonicalDraftProduced: true,
  sourceSectionInventory: {
    summary: false,
    education: true,
    workExperience: true,
  },
  summaryFidelity: "not_observed",
  educationFidelity: "intact",
  workFidelity: "substantially_present",
  noMaterialInvention: true,
  noMaterialTruncation: true,
  diagnostics: {
    warningCount: 2,
    rejectedFieldCount: 2,
    rejectionCategories: ["schema_violation", "typed_value_shape"],
  },
};

describe("canonical Semantic V2 benchmark gate", () => {
  it("reports every predicate and accepts source-absent Summary", () => {
    const result = evaluateSemanticBenchmarkGate(successfulArm);

    expect(result.overall).toBe("PASS");
    expect(result.valid).toBe(true);
    expect(result.predicates).toEqual([
      { name: "response_completed", status: "PASS", reason: "observed" },
      { name: "v2_envelope_accepted", status: "PASS", reason: "observed" },
      { name: "no_fallback", status: "PASS", reason: "observed" },
      {
        name: "canonical_draft_produced",
        status: "PASS",
        reason: "observed",
      },
      {
        name: "summary_fidelity",
        status: "not_applicable",
        reason: "source_section_not_expected",
      },
      { name: "education_fidelity", status: "PASS", reason: "observed" },
      { name: "work_fidelity", status: "PASS", reason: "observed" },
      {
        name: "no_material_invention",
        status: "PASS",
        reason: "observed",
      },
      {
        name: "no_material_truncation",
        status: "PASS",
        reason: "observed",
      },
    ]);
    expect(result.diagnostics).toEqual(successfulArm.diagnostics);
    expect(JSON.parse(serializeSemanticBenchmarkGateResult(result))).toEqual(
      result,
    );
  });

  it("fails when an expected Summary is missing", () => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      sourceSectionInventory: {
        ...successfulArm.sourceSectionInventory,
        summary: true,
      },
      summaryFidelity: "not_observed",
    });

    expect(result.overall).toBe("FAIL");
    expect(result.failures).toEqual(["summary_fidelity_not_intact"]);
  });

  it("fails when expected Education is missing", () => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      educationFidelity: "not_intact",
    });

    expect(result.failures).toEqual(["education_fidelity_not_intact"]);
  });

  it("fails when material Work or Education is lost", () => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      educationFidelity: "not_intact",
      workFidelity: "not_present",
    });

    expect(result.failures).toEqual([
      "education_fidelity_not_intact",
      "work_fidelity_not_substantially_present",
    ]);
  });

  it("does not turn bounded field rejection or warnings into an arm failure", () => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      diagnostics: {
        warningCount: 24,
        rejectedFieldCount: 24,
        rejectionCategories: [
          "invalid_candidate_shape",
          "typed_value_shape",
          "source_ref_shape",
          "schema_violation",
          "expected_section_omitted",
        ],
      },
    });

    expect(result.overall).toBe("PASS");
    expect(result.failures).toEqual([]);
  });

  it.each([
    [
      "fallback",
      { deterministicFallbackUsed: true },
      "deterministic_fallback_used",
    ],
    [
      "whole-envelope failure",
      { semanticV2EnvelopeAccepted: false },
      "semantic_v2_envelope_not_accepted",
    ],
  ] as const)("fails for %s", (_label, change, failure) => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      ...change,
    });

    expect(result.failures).toContain(failure);
  });

  it("derives the overall result only from canonical predicate failures", () => {
    const result = evaluateSemanticBenchmarkGate({
      ...successfulArm,
      diagnostics: {
        warningCount: 999,
        rejectedFieldCount: 999,
        rejectionCategories: ["other_review_diagnostic"],
      },
    });

    expect(
      result.predicates.every((predicate) => predicate.status !== "FAIL"),
    ).toBe(true);
    expect(result.overall).toBe("PASS");
  });
});
