// Sanitized T199/T245 lifecycle evidence builder.
//
// This module assembles the machine-readable lifecycle evidence for a future
// accepted live T245 run. It consumes only safe phase results emitted by the
// isolated broker (booleans, counts, statuses, and safe categories) plus the
// runner's deterministic invalid-grant classification result. It never sees,
// stores, or forwards tokens, account identifiers, authorization codes, raw
// provider responses, or encrypted envelope contents.
//
// Compatibility: every field the existing T202 evaluator reads from the T199
// evidence file is preserved. New T245 fields are additive.

export const T199_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json";

export const CONNECTION_STATUS_CONNECTED = "connected";
export const CONNECTION_STATUS_NOT_CONNECTED = "not_connected";

export const CALLBACK_COMPLETION_COMPLETED = "completed";
export const CALLBACK_COMPLETION_NOT_COMPLETED = "not_completed";
export const CALLBACK_COMPLETION_NOT_RECORDED = "not_recorded";

export const RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH =
  "live_expired_access_refresh_recovery";
export const RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT =
  "live_invalid_grant_reconnect_recovery";
export const RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT =
  "deterministic_invalid_grant_classification";
export const RECOVERY_CATEGORY_NOT_EXERCISED = "not_exercised";

export const OBSERVATION_KIND_LIVE = "live_observed";
export const OBSERVATION_KIND_DETERMINISTIC_ONLY = "deterministic_only";
export const OBSERVATION_KIND_NOT_EXERCISED = "not_exercised";

export const PROVIDER_SIDE_REVOCATION_NOT_EXERCISED =
  "not_exercised_without_supported_revocation_mechanism";

function booleanValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function integerValue(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

function stringValue(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function recoveryObservation(category) {
  if (
    category === RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH ||
    category === RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT
  ) {
    return OBSERVATION_KIND_LIVE;
  }
  if (category === RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT) {
    return OBSERVATION_KIND_DETERMINISTIC_ONLY;
  }
  return OBSERVATION_KIND_NOT_EXERCISED;
}

function selectRecoveryCategory({
  refresh,
  reconnect,
  deterministicInvalidGrantDetected,
}) {
  const refreshCategory = stringValue(refresh.credential_recovery_category, "");
  if (
    refreshCategory === RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT &&
    reconnect.explicit_reconnect_succeeded === true
  ) {
    return refreshCategory;
  }
  if (refreshCategory === RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH) {
    return refreshCategory;
  }
  if (
    deterministicInvalidGrantDetected === true &&
    reconnect.explicit_reconnect_succeeded === true
  ) {
    return RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT;
  }
  if (
    refresh.real_refresh_succeeded === true &&
    refresh.refresh_trigger_category === "expiry_detected"
  ) {
    return RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH;
  }
  return RECOVERY_CATEGORY_NOT_EXERCISED;
}

export function buildT199LiveEvidence({
  initialLogin = {},
  recovery = {},
  refresh = {},
  logout = {},
  status = {},
  reconnect = {},
  finalRecovery = {},
  secretScanResult = "not_run",
  keyVolumeName = "unknown",
  credentialVolumeName = "unknown",
  callbackPublication = [],
  deterministicInvalidGrantDetected = false,
  providerSideRevocationBehavior = PROVIDER_SIDE_REVOCATION_NOT_EXERCISED,
  generatedAt = new Date(),
} = {}) {
  const initialLoginSucceeded = booleanValue(
    initialLogin.initial_live_oauth_succeeded,
  );
  const reconnectSucceeded = booleanValue(
    reconnect.explicit_reconnect_succeeded,
    booleanValue(reconnect.initial_live_oauth_succeeded),
  );
  const recoveryCategory = selectRecoveryCategory({
    refresh,
    reconnect,
    deterministicInvalidGrantDetected,
  });

  return {
    evidence_classification: "live_oauth_validation_only",
    synthetic_validation_reference:
      "t199-lifecycle.mjs is not used as live proof",
    observation_timestamp: generatedAt.toISOString(),
    initial_live_oauth_succeeded: initialLoginSucceeded,
    callback_completion: stringValue(
      initialLogin.callback_completion,
      CALLBACK_COMPLETION_NOT_RECORDED,
    ),
    connection_status_after_callback: stringValue(
      initialLogin.connection_status_after_callback,
      "not_recorded",
    ),
    callback_state_validated: booleanValue(
      initialLogin.callback_state_validated,
    ),
    token_exchange_succeeded: booleanValue(
      initialLogin.token_exchange_succeeded,
    ),
    real_encrypted_record_created:
      booleanValue(initialLogin.real_encrypted_record_created) &&
      booleanValue(initialLogin.encrypted_record_contains_plaintext) === false,
    encrypted_record_contains_plaintext: booleanValue(
      initialLogin.encrypted_record_contains_plaintext,
    ),
    real_restart_recovery_succeeded: booleanValue(
      recovery.real_restart_recovery_succeeded,
    ),
    real_refresh_attempted: booleanValue(refresh.real_refresh_attempted),
    real_refresh_succeeded: booleanValue(refresh.real_refresh_succeeded),
    real_refresh_token_rotated: booleanValue(
      refresh.real_refresh_token_rotated,
    ),
    live_concurrent_refresh_requests: integerValue(
      refresh.live_concurrent_refresh_requests,
    ),
    live_network_refresh_count: integerValue(
      refresh.live_network_refresh_count,
    ),
    refresh_trigger_category: stringValue(
      refresh.refresh_trigger_category,
      "not_recorded",
    ),
    invalid_grant_observed_live: booleanValue(
      refresh.invalid_grant_observed_live,
    ),
    deterministic_invalid_grant_detected:
      deterministicInvalidGrantDetected === true,
    expired_invalid_credential_recovery_category: recoveryCategory,
    expired_invalid_credential_recovery_observation:
      recoveryObservation(recoveryCategory),
    provider_side_revocation_behavior: stringValue(
      providerSideRevocationBehavior,
      PROVIDER_SIDE_REVOCATION_NOT_EXERCISED,
    ),
    real_local_logout_succeeded: booleanValue(
      logout.real_local_logout_succeeded,
    ),
    real_record_deletion_succeeded: booleanValue(
      logout.real_record_deletion_succeeded,
    ),
    real_disconnected_restart_succeeded: booleanValue(
      status.real_disconnected_restart_succeeded,
    ),
    final_live_reauthentication_succeeded: reconnectSucceeded,
    explicit_reconnect_attempted: booleanValue(
      reconnect.explicit_reconnect_attempted,
    ),
    explicit_reconnect_succeeded: reconnectSucceeded,
    reconnect_trigger_category: stringValue(
      reconnect.reconnect_trigger_category,
      "not_recorded",
    ),
    final_connection_status_after_callback: stringValue(
      reconnect.connection_status_after_callback,
      "not_recorded",
    ),
    final_real_encrypted_recovery_succeeded: booleanValue(
      finalRecovery.real_restart_recovery_succeeded,
    ),
    final_state_available_for_t200:
      reconnectSucceeded &&
      booleanValue(finalRecovery.real_restart_recovery_succeeded),
    revoked_behavior: "not_exercised_without_external_provider_revocation",
    secret_scan_result: secretScanResult,
    key_volume_name: keyVolumeName,
    credential_volume_name: credentialVolumeName,
    callback_publication: Array.isArray(callbackPublication)
      ? [...callbackPublication]
      : [],
    raw_credentials_exposed_to_host: false,
  };
}
