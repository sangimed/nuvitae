import { serializeSemanticValidationDiagnostic } from "@nuvitae/import-application";
import type { SemanticValidationDiagnostic } from "@nuvitae/import-application";
import type { ImportEventMetadataFor } from "@nuvitae/import-application";

export interface ProviderImportEvent {
  readonly event:
    "provider.request" | "provider.response" | "provider.validation";
  readonly importId?: string;
  readonly correlationId?: string;
  readonly category: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly requiresReview: boolean;
  readonly path: readonly (string | number)[];
}

export function serializeProviderImportDiagnostic(
  event: ProviderImportEvent["event"],
  diagnostic: SemanticValidationDiagnostic,
  identifiers: {
    readonly importId?: string | null;
    readonly correlationId?: string | null;
  } = {},
): ProviderImportEvent {
  const shared: ImportEventMetadataFor<"semantic.validation_diagnostics"> =
    serializeSemanticValidationDiagnostic(diagnostic, identifiers);
  return {
    event,
    ...(shared.importId === undefined ? {} : { importId: shared.importId }),
    ...(shared.correlationId === undefined
      ? {}
      : { correlationId: shared.correlationId }),
    category: shared.category,
    code: shared.code,
    retryable: shared.retryable,
    requiresReview: shared.requiresReview,
    path: shared.path,
  };
}
