import type { NuvitaeSemanticExtractionResponse } from "@nuvitae/contracts";

import {
  diagnostic,
  type SemanticValidationDiagnostic,
} from "./validation-types.js";

export function validateSemanticConflicts(
  response: NuvitaeSemanticExtractionResponse,
  absentPaths: readonly string[] = [],
): {
  valid: boolean;
  requiresReview: boolean;
  diagnostics: readonly SemanticValidationDiagnostic[];
} {
  const diagnostics: SemanticValidationDiagnostic[] = [];
  const seen = new Set<string>();
  const duplicate = (path: string, code: string) => {
    if (seen.has(`${code}:${path}`))
      diagnostics.push(diagnostic("conflict", "duplicate_diagnostic", [path]));
    seen.add(`${code}:${path}`);
  };
  response.ambiguityDiagnostics.forEach((item) =>
    duplicate(item.code + item.message, item.code),
  );
  response.conflictDiagnostics.forEach((item) =>
    duplicate(item.code + item.message, item.code),
  );
  for (const path of absentPaths) {
    const parts = path.split(".");
    let value: unknown = response;
    for (const part of parts)
      value =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[part]
          : undefined;
    if (
      value === undefined ||
      (Array.isArray(value) && value.length > 0) ||
      (value !== null && !Array.isArray(value))
    ) {
      diagnostics.push(
        diagnostic(
          "absence",
          "explicit_absence_conflict",
          parts,
          undefined,
          false,
        ),
      );
    }
  }
  return {
    valid: diagnostics.length === 0,
    requiresReview: diagnostics.length > 0,
    diagnostics,
  };
}
