import { validateSemanticExtractionResponse } from "../semantic-parser/validate-semantic-response.js";
import { validateEvidenceGrounding } from "./evidence-grounding.js";
import { validateInferenceReview } from "./inference-review.js";
import { validateNoInvention } from "./no-invention.js";
import { validateSemanticConflicts } from "./semantic-conflicts.js";
import type {
  SemanticValidationAggregate,
  SemanticValidationInput,
} from "./validation-types.js";
import { diagnostic } from "./validation-types.js";

export function validateSemanticResponse(
  input: SemanticValidationInput,
): SemanticValidationAggregate {
  const schema = validateSemanticExtractionResponse(input.response);
  if (!schema.ok) {
    return {
      schemaValid: false,
      evidenceValid: false,
      groundingValid: false,
      absenceValid: false,
      ambiguityValid: false,
      conflictValid: false,
      noInventionValid: false,
      injectionResistant: true,
      requiresReview: false,
      accepted: false,
      diagnostics: [diagnostic("schema", schema.error.code)],
      response: null,
    };
  }
  const evidence = validateEvidenceGrounding(input.request, schema.value);
  const invention = validateNoInvention(input.request, schema.value);
  const inference = validateInferenceReview(schema.value);
  const conflicts = validateSemanticConflicts(
    schema.value,
    input.absentPaths ?? [],
  );
  const diagnostics = [
    ...evidence.diagnostics,
    ...invention.diagnostics,
    ...inference.diagnostics,
    ...conflicts.diagnostics,
  ];
  return {
    schemaValid: true,
    evidenceValid: evidence.valid,
    groundingValid: evidence.valid && invention.valid,
    absenceValid: conflicts.diagnostics.every(
      (item) => item.category !== "absence",
    ),
    ambiguityValid: schema.value.ambiguityDiagnostics.every(
      (item) => item.evidence.length > 0,
    ),
    conflictValid:
      conflicts.valid &&
      schema.value.conflictDiagnostics.every(
        (item) => item.evidence.length > 0,
      ),
    noInventionValid: invention.valid,
    injectionResistant: true,
    requiresReview: inference.requiresReview || conflicts.requiresReview,
    accepted:
      evidence.valid && invention.valid && conflicts.valid && inference.valid,
    diagnostics,
    response: schema.value,
  };
}

export * from "./evidence-grounding.js";
export * from "./inference-review.js";
export * from "./no-invention.js";
export * from "./semantic-conflicts.js";
export * from "./semantic-parser-instructions.js";
export * from "./validation-types.js";
