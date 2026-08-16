export const CODEX_DEFAULT_MODEL = "gpt-5.6-sol" as const;

export const CODEX_BENCHMARK_MODELS = ["gpt-5.6-sol", "gpt-5.6-terra"] as const;

export type CodexModelIdentifier = (typeof CODEX_BENCHMARK_MODELS)[number];

export type CodexModelSelectionErrorCode =
  | "missing_model_identifier"
  | "empty_model_identifier"
  | "unsupported_model_identifier"
  | "conflicting_model_identifiers";

export class CodexModelSelectionError extends Error {
  readonly code: CodexModelSelectionErrorCode;

  constructor(code: CodexModelSelectionErrorCode) {
    super(code);
    this.name = "CodexModelSelectionError";
    this.code = code;
  }
}

export interface CodexModelSelectionSources {
  readonly configuredModel?: unknown;
  readonly benchmarkModel?: unknown;
  readonly authorizationModel?: unknown;
  readonly transportModel?: unknown;
  readonly requireExplicit?: boolean;
}

/**
 * Resolves the one immutable model value owned by a transport/provider
 * instance. Production composition has a stable Sol default; benchmark
 * composition passes an explicit value and can bind it to authorization.
 */
export function resolveCodexModelSelection(
  sources: CodexModelSelectionSources = {},
): CodexModelIdentifier {
  const provided = [
    ["configuredModel", sources.configuredModel],
    ["benchmarkModel", sources.benchmarkModel],
    ["authorizationModel", sources.authorizationModel],
    ["transportModel", sources.transportModel],
  ].filter(([, value]) => value !== undefined);

  if (provided.length === 0) {
    if (sources.requireExplicit === true)
      throw new CodexModelSelectionError("missing_model_identifier");
    return CODEX_DEFAULT_MODEL;
  }

  const values = provided.map(
    ([source, value]) => [source, validateCodexModelIdentifier(value)] as const,
  );
  const selected = values[0]?.[1];
  if (selected === undefined)
    throw new CodexModelSelectionError("missing_model_identifier");
  if (values.some(([, value]) => value !== selected))
    throw new CodexModelSelectionError("conflicting_model_identifiers");
  return selected;
}

export function validateCodexModelIdentifier(
  value: unknown,
): CodexModelIdentifier {
  if (typeof value === "string" && value.trim() === "")
    throw new CodexModelSelectionError("empty_model_identifier");
  if (typeof value !== "string")
    throw new CodexModelSelectionError("unsupported_model_identifier");
  if (
    !CODEX_BENCHMARK_MODELS.includes(
      value as (typeof CODEX_BENCHMARK_MODELS)[number],
    )
  )
    throw new CodexModelSelectionError("unsupported_model_identifier");
  return value as CodexModelIdentifier;
}
