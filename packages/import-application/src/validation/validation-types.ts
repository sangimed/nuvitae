import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
  SemanticEvidence,
} from "@nuvitae/contracts";

export type ValidationCategory =
  | "schema"
  | "evidence"
  | "grounding"
  | "absence"
  | "ambiguity"
  | "conflict"
  | "no_invention"
  | "injection"
  | "review";

export interface SemanticValidationDiagnostic {
  readonly code: string;
  readonly category: ValidationCategory;
  readonly path: readonly (string | number)[];
  readonly fragmentId: string | null;
  readonly fragmentHash: string | null;
  readonly line: number | null;
  readonly coordinate: { readonly start: number; readonly end: number } | null;
  readonly retryable: boolean;
  readonly requiresReview: boolean;
}

export interface EvidenceValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly SemanticValidationDiagnostic[];
}

export interface SemanticValidationAggregate {
  readonly schemaValid: boolean;
  readonly evidenceValid: boolean;
  readonly groundingValid: boolean;
  readonly absenceValid: boolean;
  readonly ambiguityValid: boolean;
  readonly conflictValid: boolean;
  readonly noInventionValid: boolean;
  readonly injectionResistant: boolean;
  readonly requiresReview: boolean;
  readonly accepted: boolean;
  readonly diagnostics: readonly SemanticValidationDiagnostic[];
  readonly response: NuvitaeSemanticExtractionResponse | null;
}

export interface SemanticValidationInput {
  readonly request: ResumeSemanticParseRequest;
  readonly response: unknown;
  readonly absentPaths?: readonly string[];
}

export type EvidenceLike = SemanticEvidence;

export function diagnostic(
  category: ValidationCategory,
  code: string,
  path: readonly (string | number)[] = [],
  evidence?: Partial<SemanticEvidence>,
  requiresReview = false,
): SemanticValidationDiagnostic {
  return {
    code,
    category,
    path: [...path],
    fragmentId: evidence?.fragmentId ?? null,
    fragmentHash: evidence?.fragmentHash ?? null,
    line: evidence?.line ?? null,
    coordinate:
      typeof evidence?.start === "number" && typeof evidence.end === "number"
        ? { start: evidence.start, end: evidence.end }
        : null,
    retryable: false,
    requiresReview,
  };
}

export function pathString(path: readonly (string | number)[]): string {
  return path
    .map((part) => (typeof part === "number" ? `[${part}]` : part))
    .join(".")
    .replaceAll(".[", "[");
}
