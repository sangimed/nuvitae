import type { NuvitaeSemanticExtractionResponse } from "@nuvitae/contracts";

import {
  diagnostic,
  type SemanticValidationDiagnostic,
} from "./validation-types.js";

const allowedInferredRelationships = new Set([
  "role_belongs_to_employer",
  "achievement_belongs_to_role",
  "skill_belongs_to_category",
  "link_belongs_to_project",
]);

export function validateInferenceReview(
  response: NuvitaeSemanticExtractionResponse,
): {
  valid: boolean;
  requiresReview: boolean;
  diagnostics: readonly SemanticValidationDiagnostic[];
} {
  const diagnostics: SemanticValidationDiagnostic[] = [];
  for (const [index, relationship] of response.relationships.entries()) {
    if (!allowedInferredRelationships.has(relationship.relationshipType)) {
      diagnostics.push(
        diagnostic(
          "review",
          "forbidden_factual_inference",
          ["relationships", index],
          undefined,
          true,
        ),
      );
    }
  }
  const ambiguous = response.ambiguityDiagnostics.map((item, index) =>
    diagnostic(
      "ambiguity",
      item.code,
      ["ambiguityDiagnostics", index],
      item.evidence[0],
      true,
    ),
  );
  const conflicts = response.conflictDiagnostics.map((item, index) =>
    diagnostic(
      "conflict",
      item.code,
      ["conflictDiagnostics", index],
      item.evidence[0],
      true,
    ),
  );
  diagnostics.push(...ambiguous, ...conflicts);
  return {
    valid: diagnostics.every((item) => item.category !== "conflict"),
    requiresReview: diagnostics.some((item) => item.requiresReview),
    diagnostics,
  };
}
