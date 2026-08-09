import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
} from "@nuvitae/contracts";

import { normalizeGroundedText } from "./evidence-grounding.js";
import {
  diagnostic,
  type SemanticValidationDiagnostic,
} from "./validation-types.js";

const factualInferenceKeys = new Set([
  "employmentType",
  "seniority",
  "managementResponsibility",
  "honors",
  "issuer",
  "countryCode",
  "contractStatus",
]);

function isValue(value: unknown): value is {
  value: string;
  normalizedValue: string | null;
  evidence: {
    line: number;
    start: number;
    end: number;
    fragmentHash: string;
  }[];
  classification: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string" &&
    "evidence" in value &&
    Array.isArray(value.evidence)
  );
}

export function valuesEquivalent(source: string, candidate: string): boolean {
  return (
    normalizeGroundedText(source).toLocaleLowerCase() ===
    normalizeGroundedText(candidate).toLocaleLowerCase()
  );
}

function walk(
  value: unknown,
  request: ResumeSemanticParseRequest,
  path: readonly (string | number)[],
  diagnostics: SemanticValidationDiagnostic[],
): void {
  if (isValue(value)) {
    const grounded = value.evidence.some((evidence) => {
      const fragment = request.sourceFragments.find(
        (item) =>
          item.line === evidence.line && item.hash === evidence.fragmentHash,
      );
      return (
        fragment !== undefined &&
        valuesEquivalent(
          fragment.text.slice(evidence.start, evidence.end),
          value.value,
        )
      );
    });
    if (!grounded)
      diagnostics.push(
        diagnostic("no_invention", "unsupported_semantic_value", path),
      );
    if (value.classification === "inferred") {
      diagnostics.push(
        diagnostic(
          "review",
          "inferred_fact_requires_review",
          path,
          undefined,
          true,
        ),
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
    Object.entries(value).forEach(([key, item]) => {
      if (factualInferenceKeys.has(key) && item !== null)
        diagnostics.push(
          diagnostic(
            "no_invention",
            "forbidden_factual_inference",
            [...path, key],
            undefined,
            true,
          ),
        );
      walk(item, request, [...path, key], diagnostics);
    });
  }
}

export function validateNoInvention(
  request: ResumeSemanticParseRequest,
  response: NuvitaeSemanticExtractionResponse,
): { valid: boolean; diagnostics: readonly SemanticValidationDiagnostic[] } {
  const diagnostics: SemanticValidationDiagnostic[] = [];
  walk(response.sections, request, ["sections"], diagnostics);
  walk(response.relationships, request, ["relationships"], diagnostics);
  return { valid: diagnostics.length === 0, diagnostics };
}
