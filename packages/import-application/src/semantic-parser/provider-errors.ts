export const semanticProviderErrorCodes = [
  "not_configured",
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
  "provider_unavailable",
  "rate_limited",
  "quota_exceeded",
  "unsupported_capability",
  "timeout",
  "cancelled",
  "invalid_provider_response",
  "schema_violation",
  "unsupported_contract_version",
  "malformed_flattened_evidence",
  "request_too_large",
  "response_too_large",
  "invalid_grounding",
  "ambiguous_output",
  "conflicting_output",
  "explicit_absence_mismatch",
  "invented_fact",
  "unknown_provider_failure",
] as const;

export type SemanticProviderErrorCode =
  (typeof semanticProviderErrorCodes)[number];

export const semanticProviderRecoveryActions = [
  "retry",
  "reconnect_provider",
  "choose_another_provider",
  "limited_deterministic_partial_extraction",
  "manual_entry",
  "replace_upload",
  "cancel",
] as const;

export type SemanticProviderRecoveryAction =
  (typeof semanticProviderRecoveryActions)[number];

export interface PrivacySafeSemanticProviderError {
  readonly code: SemanticProviderErrorCode;
  readonly retryable: boolean;
  readonly recoveryActions: readonly SemanticProviderRecoveryAction[];
  readonly diagnostic: string;
  readonly validationIssues: readonly PrivacySafeValidationIssue[];
}

export interface PrivacySafeValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
}

const defaultRecoveryByCode: Record<
  SemanticProviderErrorCode,
  readonly SemanticProviderRecoveryAction[]
> = {
  not_configured: ["choose_another_provider", "manual_entry"],
  disconnected: [
    "reconnect_provider",
    "choose_another_provider",
    "manual_entry",
  ],
  authentication_expired: [
    "reconnect_provider",
    "choose_another_provider",
    "manual_entry",
  ],
  authentication_revoked: [
    "reconnect_provider",
    "choose_another_provider",
    "manual_entry",
  ],
  provider_unavailable: [
    "retry",
    "choose_another_provider",
    "limited_deterministic_partial_extraction",
    "manual_entry",
  ],
  rate_limited: [
    "retry",
    "choose_another_provider",
    "limited_deterministic_partial_extraction",
    "manual_entry",
  ],
  quota_exceeded: [
    "choose_another_provider",
    "limited_deterministic_partial_extraction",
    "manual_entry",
  ],
  unsupported_capability: ["choose_another_provider", "manual_entry"],
  timeout: ["retry", "choose_another_provider", "manual_entry"],
  cancelled: ["retry", "replace_upload", "manual_entry"],
  invalid_provider_response: [
    "retry",
    "choose_another_provider",
    "manual_entry",
  ],
  schema_violation: ["retry", "choose_another_provider", "manual_entry"],
  unsupported_contract_version: ["retry", "manual_entry"],
  malformed_flattened_evidence: ["retry", "replace_upload", "manual_entry"],
  request_too_large: ["replace_upload", "manual_entry"],
  response_too_large: ["retry", "choose_another_provider", "manual_entry"],
  invalid_grounding: ["retry", "choose_another_provider", "manual_entry"],
  ambiguous_output: ["manual_entry"],
  conflicting_output: ["manual_entry"],
  explicit_absence_mismatch: ["manual_entry"],
  invented_fact: ["manual_entry"],
  unknown_provider_failure: [
    "retry",
    "choose_another_provider",
    "manual_entry",
  ],
};

const retryableCodes = new Set<SemanticProviderErrorCode>([
  "provider_unavailable",
  "rate_limited",
  "timeout",
  "cancelled",
  "invalid_provider_response",
  "schema_violation",
  "unsupported_contract_version",
  "malformed_flattened_evidence",
  "response_too_large",
  "unknown_provider_failure",
]);

export function createPrivacySafeSemanticProviderError(
  code: SemanticProviderErrorCode,
  issues: readonly PrivacySafeValidationIssue[] = [],
): PrivacySafeSemanticProviderError {
  return {
    code,
    retryable: retryableCodes.has(code),
    recoveryActions: defaultRecoveryByCode[code],
    diagnostic: code,
    validationIssues: issues.map((issue) => ({
      path: [...issue.path],
      code: issue.code,
    })),
  };
}

export function serializeSemanticProviderError(
  error: PrivacySafeSemanticProviderError,
): PrivacySafeSemanticProviderError {
  return {
    code: error.code,
    retryable: error.retryable,
    recoveryActions: [...error.recoveryActions],
    diagnostic: error.diagnostic,
    validationIssues: error.validationIssues.map((issue) => ({
      path: [...issue.path],
      code: issue.code,
    })),
  };
}
