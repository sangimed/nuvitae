import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CALLBACK_COMPLETION_COMPLETED,
  CONNECTION_STATUS_CONNECTED,
  OBSERVATION_KIND_DETERMINISTIC_ONLY,
  OBSERVATION_KIND_LIVE,
  OBSERVATION_KIND_NOT_EXERCISED,
  RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
  RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
  RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
  RECOVERY_CATEGORY_NOT_EXERCISED,
  buildT199LiveEvidence,
} from "../lib/t199-lifecycle-evidence.mjs";
import { containsSecretLikeValue } from "../lib/sanitize.mjs";

function loginPhase(overrides = {}) {
  return {
    initial_live_oauth_succeeded: true,
    callback_completion: CALLBACK_COMPLETION_COMPLETED,
    connection_status_after_callback: CONNECTION_STATUS_CONNECTED,
    callback_state_validated: true,
    token_exchange_succeeded: true,
    real_encrypted_record_created: true,
    encrypted_record_contains_plaintext: false,
    ...overrides,
  };
}

function reconnectPhase(overrides = {}) {
  return {
    initial_live_oauth_succeeded: true,
    explicit_reconnect_attempted: true,
    explicit_reconnect_succeeded: true,
    reconnect_trigger_category: "after_disconnect",
    connection_status_after_callback: CONNECTION_STATUS_CONNECTED,
    callback_completion: CALLBACK_COMPLETION_COMPLETED,
    callback_state_validated: true,
    token_exchange_succeeded: true,
    real_encrypted_record_created: true,
    encrypted_record_contains_plaintext: false,
    ...overrides,
  };
}

function refreshPhase(overrides = {}) {
  return {
    real_refresh_attempted: true,
    real_refresh_succeeded: true,
    real_refresh_token_rotated: true,
    live_concurrent_refresh_requests: 2,
    live_network_refresh_count: 1,
    refresh_trigger_category: "scheduled",
    invalid_grant_observed_live: false,
    ...overrides,
  };
}

test("builder records an ISO-8601 observation timestamp at evidence assembly", () => {
  const generatedAt = new Date("2026-08-07T10:00:00.000Z");
  const result = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    reconnect: reconnectPhase(),
    refresh: refreshPhase(),
    deterministicInvalidGrantDetected: true,
    generatedAt,
  });
  assert.equal(result.observation_timestamp, generatedAt.toISOString());
});

test("builder passes through the broker-observed post-callback connection status", () => {
  const connected = buildT199LiveEvidence({
    initialLogin: loginPhase({ connection_status_after_callback: "connected" }),
    reconnect: reconnectPhase(),
    refresh: refreshPhase(),
  });
  assert.equal(connected.connection_status_after_callback, "connected");
  assert.equal(connected.callback_completion, "completed");
  assert.equal(connected.callback_state_validated, true);
  assert.equal(connected.token_exchange_succeeded, true);

  const notConnected = buildT199LiveEvidence({
    initialLogin: loginPhase({
      initial_live_oauth_succeeded: false,
      connection_status_after_callback: "not_connected",
      callback_completion: "not_completed",
      callback_state_validated: false,
      token_exchange_succeeded: false,
    }),
    reconnect: reconnectPhase(),
    refresh: refreshPhase(),
  });
  assert.equal(notConnected.connection_status_after_callback, "not_connected");
  assert.equal(notConnected.callback_completion, "not_completed");
});

test("builder records deterministic invalid-grant classification with live reconnect", () => {
  const result = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    reconnect: reconnectPhase(),
    refresh: refreshPhase(),
    deterministicInvalidGrantDetected: true,
  });
  assert.equal(
    result.expired_invalid_credential_recovery_category,
    RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
  );
  assert.equal(
    result.expired_invalid_credential_recovery_observation,
    OBSERVATION_KIND_DETERMINISTIC_ONLY,
  );
  assert.equal(result.explicit_reconnect_succeeded, true);
});

test("builder records live invalid-grant reconnect recovery only when reconnect succeeds", () => {
  const recoveryRefresh = refreshPhase({
    real_refresh_succeeded: false,
    invalid_grant_observed_live: true,
    credential_recovery_category:
      RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
    safe_error_category: "invalid_grant",
  });
  const recovered = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    reconnect: reconnectPhase(),
    refresh: recoveryRefresh,
  });
  assert.equal(
    recovered.expired_invalid_credential_recovery_category,
    RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
  );
  assert.equal(
    recovered.expired_invalid_credential_recovery_observation,
    OBSERVATION_KIND_LIVE,
  );
  assert.equal(recovered.invalid_grant_observed_live, true);

  const notRecovered = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    reconnect: reconnectPhase({ explicit_reconnect_succeeded: false }),
    refresh: recoveryRefresh,
  });
  assert.equal(
    notRecovered.expired_invalid_credential_recovery_category,
    RECOVERY_CATEGORY_NOT_EXERCISED,
  );
  assert.equal(
    notRecovered.expired_invalid_credential_recovery_observation,
    OBSERVATION_KIND_NOT_EXERCISED,
  );
});

test("builder records live expired-access refresh recovery when expiry trigger is observed", () => {
  const result = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    reconnect: reconnectPhase(),
    refresh: refreshPhase({
      refresh_trigger_category: "expiry_detected",
      credential_recovery_category:
        RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
    }),
  });
  assert.equal(
    result.expired_invalid_credential_recovery_category,
    RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
  );
  assert.equal(
    result.expired_invalid_credential_recovery_observation,
    OBSERVATION_KIND_LIVE,
  );
});

test("builder preserves fields consumed by the existing T202 evaluator", () => {
  const result = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    recovery: { real_restart_recovery_succeeded: true },
    refresh: refreshPhase(),
    logout: {
      real_local_logout_succeeded: true,
      real_record_deletion_succeeded: true,
    },
    status: { real_disconnected_restart_succeeded: true },
    reconnect: reconnectPhase(),
    finalRecovery: { real_restart_recovery_succeeded: true },
    secretScanResult: "passed",
    keyVolumeName: "nuvitae-codex-direct-oauth-t199-key-live",
    credentialVolumeName: "nuvitae-codex-direct-oauth-t199-credentials-live",
  });
  assert.equal(result.initial_live_oauth_succeeded, true);
  assert.equal(result.real_encrypted_record_created, true);
  assert.equal(result.real_restart_recovery_succeeded, true);
  assert.equal(result.real_refresh_attempted, true);
  assert.equal(result.real_refresh_succeeded, true);
  assert.equal(result.real_refresh_token_rotated, true);
  assert.equal(result.live_concurrent_refresh_requests, 2);
  assert.equal(result.live_network_refresh_count, 1);
  assert.equal(result.real_local_logout_succeeded, true);
  assert.equal(result.real_record_deletion_succeeded, true);
  assert.equal(result.real_disconnected_restart_succeeded, true);
  assert.equal(result.final_live_reauthentication_succeeded, true);
  assert.equal(result.final_real_encrypted_recovery_succeeded, true);
  assert.equal(result.final_state_available_for_t200, true);
  assert.equal(result.secret_scan_result, "passed");
  assert.equal(result.raw_credentials_exposed_to_host, false);
});

test("builder emits no token, account, code, or raw-response material", () => {
  const result = buildT199LiveEvidence({
    initialLogin: loginPhase(),
    reconnect: reconnectPhase(),
    refresh: refreshPhase(),
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    "access_token",
    "refresh_token",
    "account_identifier",
    "authorization_code",
    "provider_response",
    "code_verifier",
  ]) {
    assert.ok(!(forbidden in result), `forbidden field present: ${forbidden}`);
  }
  assert.equal(containsSecretLikeValue(serialized), false);
});
