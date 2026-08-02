import type { SemanticValidationDiagnostic } from "@nuvitae/import-application";

export interface ProviderImportEvent {
  readonly event:
    "provider.request" | "provider.response" | "provider.validation";
  readonly importId: string | null;
  readonly correlationId: string | null;
  readonly category: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly requiresReview: boolean;
  readonly path: readonly (string | number)[];
  readonly fragmentId: string | null;
  readonly line: number | null;
}

export function serializeProviderImportDiagnostic(
  event: ProviderImportEvent["event"],
  diagnostic: SemanticValidationDiagnostic,
  identifiers: {
    readonly importId?: string | null;
    readonly correlationId?: string | null;
  } = {},
): ProviderImportEvent {
  return {
    event,
    importId: identifiers.importId ?? null,
    correlationId: identifiers.correlationId ?? null,
    category: diagnostic.category,
    code: diagnostic.code,
    retryable: diagnostic.retryable,
    requiresReview: diagnostic.requiresReview,
    path: [...diagnostic.path],
    fragmentId: diagnostic.fragmentId,
    line: diagnostic.line,
  };
}
