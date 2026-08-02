import { createHash } from "node:crypto";
import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
  SemanticEvidence,
} from "@nuvitae/contracts";

import {
  diagnostic,
  type EvidenceValidationResult,
  type SemanticValidationDiagnostic,
} from "./validation-types.js";

export function normalizeGroundedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function normalizedFragmentHash(value: string): string {
  return createHash("sha256")
    .update(normalizeGroundedText(value))
    .digest("hex");
}

export function validateEvidence(
  request: ResumeSemanticParseRequest,
  evidence: SemanticEvidence,
  path: readonly (string | number)[],
): SemanticValidationDiagnostic[] {
  const candidates = request.sourceFragments.filter(
    (fragment) =>
      fragment.hash === evidence.fragmentHash &&
      fragment.line === evidence.line &&
      (evidence.fragmentId === null ||
        evidence.fragmentId === `fragment-${fragment.order + 1}`),
  );
  if (candidates.length !== 1) {
    return [
      diagnostic(
        "evidence",
        candidates.length === 0
          ? "foreign_fragment"
          : "duplicate_evidence_target",
        path,
        evidence,
      ),
    ];
  }
  const fragment = candidates[0];
  if (!fragment)
    return [diagnostic("evidence", "foreign_fragment", path, evidence)];
  if (normalizedFragmentHash(fragment.text) !== evidence.fragmentHash) {
    return [diagnostic("grounding", "fragment_hash_mismatch", path, evidence)];
  }
  if (
    evidence.start < fragment.bounds.start ||
    evidence.end > fragment.bounds.end ||
    evidence.start < 0 ||
    evidence.end <= evidence.start ||
    evidence.end > fragment.text.length
  ) {
    return [diagnostic("evidence", "invalid_bounds", path, evidence)];
  }
  const source = fragment.text.slice(evidence.start, evidence.end);
  if (!normalizeGroundedText(source)) {
    return [
      diagnostic("grounding", "empty_grounded_substring", path, evidence),
    ];
  }
  return [];
}

function isValue(
  value: unknown,
): value is { value: string; evidence: SemanticEvidence[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string" &&
    "evidence" in value &&
    Array.isArray(value.evidence)
  );
}

function walk(
  value: unknown,
  request: ResumeSemanticParseRequest,
  path: readonly (string | number)[],
  diagnostics: SemanticValidationDiagnostic[],
): void {
  if (isValue(value)) {
    if (value.evidence.length === 0) {
      diagnostics.push(diagnostic("evidence", "missing_value_evidence", path));
    }
    const seenEvidence = new Set<string>();
    for (const [index, evidence] of value.evidence.entries()) {
      const evidenceKey = `${evidence.fragmentHash}:${evidence.line}:${evidence.start}:${evidence.end}`;
      if (seenEvidence.has(evidenceKey)) {
        diagnostics.push(
          diagnostic(
            "evidence",
            "duplicate_evidence",
            [...path, "evidence", index],
            evidence,
          ),
        );
      }
      seenEvidence.add(evidenceKey);
      diagnostics.push(
        ...validateEvidence(request, evidence, [...path, "evidence", index]),
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walk(item, request, [...path, index], diagnostics),
    );
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, item]) =>
      walk(item, request, [...path, key], diagnostics),
    );
  }
}

export function validateEvidenceGrounding(
  request: ResumeSemanticParseRequest,
  response: NuvitaeSemanticExtractionResponse,
): EvidenceValidationResult {
  const diagnostics: SemanticValidationDiagnostic[] = [];
  walk(response.sections, request, ["sections"], diagnostics);
  for (const [index, relationship] of response.relationships.entries()) {
    relationship.evidence.forEach((evidence, evidenceIndex) => {
      diagnostics.push(
        ...validateEvidence(request, evidence, [
          "relationships",
          index,
          "evidence",
          evidenceIndex,
        ]),
      );
    });
  }
  response.documentLanguage.evidence.forEach((evidence, evidenceIndex) => {
    diagnostics.push(
      ...validateEvidence(request, evidence, [
        "documentLanguage",
        "evidence",
        evidenceIndex,
      ]),
    );
  });
  for (const [
    index,
    diagnosticValue,
  ] of response.ambiguityDiagnostics.entries()) {
    if (diagnosticValue.evidence.length === 0) {
      diagnostics.push(
        diagnostic("ambiguity", "missing_ambiguity_evidence", [
          "ambiguityDiagnostics",
          index,
        ]),
      );
    }
    diagnosticValue.evidence.forEach((evidence, evidenceIndex) => {
      diagnostics.push(
        ...validateEvidence(request, evidence, [
          "ambiguityDiagnostics",
          index,
          "evidence",
          evidenceIndex,
        ]),
      );
    });
  }
  for (const [
    index,
    diagnosticValue,
  ] of response.conflictDiagnostics.entries()) {
    if (diagnosticValue.evidence.length === 0) {
      diagnostics.push(
        diagnostic("conflict", "missing_conflict_evidence", [
          "conflictDiagnostics",
          index,
        ]),
      );
    }
    diagnosticValue.evidence.forEach((evidence, evidenceIndex) => {
      diagnostics.push(
        ...validateEvidence(request, evidence, [
          "conflictDiagnostics",
          index,
          "evidence",
          evidenceIndex,
        ]),
      );
    });
  }
  return { valid: diagnostics.length === 0, diagnostics };
}
