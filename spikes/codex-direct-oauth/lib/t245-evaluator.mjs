// Deterministic offline T245 lifecycle evaluator.
//
// T245 (specs/001-import-resume/tasks.md) requires a fresh browser OAuth
// login, callback completion, connection-status-after-callback, encrypted
// persistence, application/container restart, successful invocation after
// restart, token refresh, expired/invalid-credential recovery, explicit
// reconnect, and disconnect/credential-removal proof in the supported local
// same-host Docker deployment shape, recorded as sanitized evidence with no
// raw token leakage.
//
// This evaluator consumes only the accepted sanitized T199 and T200 evidence
// files. It never touches credentials, Docker volumes, OAuth, or live
// transport. It fails closed on missing, malformed, or contradictory evidence,
// distinguishes `not_exercised`, `deterministic_only`, and `live_observed`
// observations, and writes a sanitized T245 aggregate only after an accepted
// live run. It does not fabricate a passing aggregate from current incomplete
// evidence.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsSecretLikeValue } from "./sanitize.mjs";
import { writeEvidenceAtomic } from "./t201-live-runner-evidence.mjs";
import {
  CONNECTION_STATUS_CONNECTED,
  OBSERVATION_KIND_DETERMINISTIC_ONLY,
  OBSERVATION_KIND_LIVE,
  OBSERVATION_KIND_NOT_EXERCISED,
  RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
  RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
  RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
  RECOVERY_CATEGORY_NOT_EXERCISED,
} from "./t199-lifecycle-evidence.mjs";

const SPIKE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const T245_T199_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json";
export const T245_T200_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json";
export const T245_AGGREGATE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json";

const ALLOWED_CONNECTION_STATUSES = Object.freeze(
  new Set([
    "connected",
    "not_connected",
    "login_pending",
    "login_cancelled",
    "auth_expired",
    "auth_revoked",
    "unavailable",
    "disconnected",
  ]),
);

const ALLOWED_RECOVERY_CATEGORIES = Object.freeze(
  new Set([
    RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH,
    RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT,
    RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT,
    RECOVERY_CATEGORY_NOT_EXERCISED,
  ]),
);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(reason) {
  throw new Error(`t245_evaluator_fail_closed:${reason}`);
}

async function loadJson(repoRoot, relativePath, label) {
  const resolved = path.resolve(repoRoot, relativePath);
  let text;
  try {
    text = await fs.readFile(resolved, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") fail(`missing_${label}:${relativePath}`);
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`malformed_${label}:${relativePath}`);
  }
  if (!isPlainObject(parsed)) fail(`malformed_${label}:${relativePath}`);
  return parsed;
}

function parseTimestamp(value) {
  if (typeof value !== "string" || value.length === 0) return NaN;
  return Date.parse(value);
}

function requireStringField(evidence, field, label, failures) {
  if (typeof evidence[field] !== "string" || evidence[field].length === 0) {
    failures.push(`missing_or_malformed_${label}_field:${field}`);
    return null;
  }
  return evidence[field];
}

function requireBooleanField(evidence, field, label, failures) {
  if (typeof evidence[field] !== "boolean") {
    failures.push(`missing_or_malformed_${label}_field:${field}`);
    return false;
  }
  return evidence[field];
}

function requireIntegerField(evidence, field, label, failures) {
  if (!Number.isInteger(evidence[field])) {
    failures.push(`missing_or_malformed_${label}_field:${field}`);
    return 0;
  }
  return evidence[field];
}

function criterion({
  key,
  label,
  required,
  pass,
  observationKind,
  evidence,
  note = null,
}) {
  return {
    key,
    label,
    required,
    pass,
    observation_kind: observationKind,
    evidence: [...evidence].sort(),
    ...(note === null ? {} : { note }),
  };
}

function recoveryObservationKind(category) {
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

export async function assessT245({
  repoRoot = path.resolve(SPIKE_ROOT, "../.."),
  t199Path = T245_T199_EVIDENCE_REL_PATH,
  t200Path = T245_T200_EVIDENCE_REL_PATH,
  requireLiveInvalidCredentialRecovery = false,
} = {}) {
  const failures = [];
  const criteria = [];

  const t199 = await loadJson(repoRoot, t199Path, "t199_evidence");
  const t200 = await loadJson(repoRoot, t200Path, "t200_evidence");

  if (containsSecretLikeValue(JSON.stringify(t199))) {
    failures.push("secret_like_value_in_t199_evidence");
  }
  if (containsSecretLikeValue(JSON.stringify(t200))) {
    failures.push("secret_like_value_in_t200_evidence");
  }

  if (t199.secret_scan_result !== "passed") {
    failures.push("t199_secret_scan_not_passed");
  }
  if (t200.secret_scan_result !== "passed") {
    failures.push("t200_secret_scan_not_passed");
  }
  if (t199.raw_credentials_exposed_to_host === true) {
    failures.push("t199_credential_exposure");
  }
  if (
    t200.raw_credentials_exposed_to_parent === true ||
    t200.account_identifier_exposed_to_parent === true ||
    t200.raw_response_persisted === true
  ) {
    failures.push("t200_credential_or_raw_response_exposure");
  }

  const t199TimestampMs = parseTimestamp(t199.observation_timestamp);
  const t200TimestampMs = parseTimestamp(t200.observation_timestamp);
  if (!Number.isFinite(t199TimestampMs)) {
    failures.push("t199_observation_timestamp_missing_or_invalid");
  }
  if (!Number.isFinite(t200TimestampMs)) {
    failures.push("t200_observation_timestamp_missing_or_invalid");
  }
  if (
    Number.isFinite(t199TimestampMs) &&
    Number.isFinite(t200TimestampMs) &&
    t200TimestampMs < t199TimestampMs
  ) {
    failures.push("contradictory_t200_observation_before_t199");
  }

  // Fresh browser OAuth login (live).
  const initialLoginOk = requireBooleanField(
    t199,
    "initial_live_oauth_succeeded",
    "t199",
    failures,
  );
  criteria.push(
    criterion({
      key: "fresh_browser_oauth_login",
      label:
        "Fresh browser OAuth login in the supported local same-host Docker deployment shape",
      required: true,
      pass: initialLoginOk,
      observationKind: initialLoginOk
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
    }),
  );

  // Callback completion and post-callback connection status.
  const callbackCompletion = requireStringField(
    t199,
    "callback_completion",
    "t199",
    failures,
  );
  const connectionStatus = requireStringField(
    t199,
    "connection_status_after_callback",
    "t199",
    failures,
  );
  if (
    connectionStatus !== null &&
    !ALLOWED_CONNECTION_STATUSES.has(connectionStatus)
  ) {
    failures.push(
      `invalid_connection_status_after_callback:${connectionStatus}`,
    );
  }
  const callbackStateValidated = requireBooleanField(
    t199,
    "callback_state_validated",
    "t199",
    failures,
  );
  const tokenExchangeSucceeded = requireBooleanField(
    t199,
    "token_exchange_succeeded",
    "t199",
    failures,
  );
  const callbackPass =
    initialLoginOk &&
    callbackCompletion === "completed" &&
    callbackStateValidated &&
    tokenExchangeSucceeded &&
    connectionStatus === CONNECTION_STATUS_CONNECTED;
  criteria.push(
    criterion({
      key: "callback_completion_and_connection_status_after_callback",
      label: "Callback completion and verified post-callback connected state",
      required: true,
      pass: callbackPass,
      observationKind: initialLoginOk
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
    }),
  );
  if (initialLoginOk && connectionStatus !== CONNECTION_STATUS_CONNECTED) {
    failures.push("contradictory_connection_status_after_successful_callback");
  }
  if (
    connectionStatus === CONNECTION_STATUS_CONNECTED &&
    callbackCompletion !== "completed"
  ) {
    failures.push("contradictory_connected_status_without_callback_completion");
  }

  // Encrypted credential persistence.
  const encryptedRecordCreated = requireBooleanField(
    t199,
    "real_encrypted_record_created",
    "t199",
    failures,
  );
  const persistencePass =
    encryptedRecordCreated && t199.encrypted_record_contains_plaintext !== true;
  criteria.push(
    criterion({
      key: "encrypted_credential_persistence",
      label: "Encrypted credential persistence without plaintext",
      required: true,
      pass: persistencePass,
      observationKind: persistencePass
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
    }),
  );

  // Application/container restart recovery.
  const restartRecoveryOk = requireBooleanField(
    t199,
    "real_restart_recovery_succeeded",
    "t199",
    failures,
  );
  criteria.push(
    criterion({
      key: "restart_recovery",
      label:
        "Encrypted credential recovery after application/container restart",
      required: true,
      pass: restartRecoveryOk,
      observationKind: restartRecoveryOk
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
    }),
  );

  // Token refresh with rotation.
  const refreshAttempted = requireBooleanField(
    t199,
    "real_refresh_attempted",
    "t199",
    failures,
  );
  const refreshSucceeded = requireBooleanField(
    t199,
    "real_refresh_succeeded",
    "t199",
    failures,
  );
  const refreshRotated = requireBooleanField(
    t199,
    "real_refresh_token_rotated",
    "t199",
    failures,
  );
  const networkRefreshCount = requireIntegerField(
    t199,
    "live_network_refresh_count",
    "t199",
    failures,
  );
  const refreshPass =
    refreshAttempted &&
    refreshSucceeded &&
    refreshRotated &&
    networkRefreshCount >= 1;
  if (refreshSucceeded && networkRefreshCount < 1) {
    failures.push("contradictory_refresh_succeeded_without_network_refresh");
  }
  criteria.push(
    criterion({
      key: "token_refresh_with_rotation",
      label: "Live token refresh with rotation",
      required: true,
      pass: refreshPass,
      observationKind: refreshPass
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
      note: `live_network_refresh_count=${networkRefreshCount}`,
    }),
  );

  // Expired/invalid-credential recovery.
  const recoveryCategory = requireStringField(
    t199,
    "expired_invalid_credential_recovery_category",
    "t199",
    failures,
  );
  if (
    recoveryCategory !== null &&
    !ALLOWED_RECOVERY_CATEGORIES.has(recoveryCategory)
  ) {
    failures.push(
      `invalid_expired_invalid_credential_recovery_category:${recoveryCategory}`,
    );
  }
  const invalidGrantObservedLive = requireBooleanField(
    t199,
    "invalid_grant_observed_live",
    "t199",
    failures,
  );
  const deterministicInvalidGrantDetected = requireBooleanField(
    t199,
    "deterministic_invalid_grant_detected",
    "t199",
    failures,
  );
  const recoveryObservation = recoveryObservationKind(recoveryCategory);
  const recoveryCategoryAllowed =
    recoveryCategory !== null &&
    ALLOWED_RECOVERY_CATEGORIES.has(recoveryCategory) &&
    recoveryCategory !== RECOVERY_CATEGORY_NOT_EXERCISED;
  let recoveryPass = recoveryCategoryAllowed;
  if (
    requireLiveInvalidCredentialRecovery &&
    recoveryObservation !== OBSERVATION_KIND_LIVE
  ) {
    failures.push("invalid_credential_recovery_not_live_observed");
    recoveryPass = false;
  }
  criteria.push(
    criterion({
      key: "expired_invalid_credential_recovery",
      label: "Expired/invalid-credential recovery category observed",
      required: true,
      pass: recoveryPass,
      observationKind: recoveryObservation,
      evidence: [t199Path],
      note: `recovery_category=${recoveryCategory}; live invalid_grant=${invalidGrantObservedLive}; deterministic invalid_grant=${deterministicInvalidGrantDetected}`,
    }),
  );
  if (
    recoveryCategory === RECOVERY_CATEGORY_LIVE_INVALID_GRANT_RECONNECT &&
    invalidGrantObservedLive !== true
  ) {
    failures.push(
      "contradictory_live_invalid_grant_recovery_without_live_invalid_grant",
    );
  }
  if (
    recoveryCategory === RECOVERY_CATEGORY_LIVE_EXPIRED_ACCESS_REFRESH &&
    t199.refresh_trigger_category !== "expiry_detected"
  ) {
    failures.push("contradictory_live_expired_recovery_without_expiry_trigger");
  }
  if (
    recoveryCategory === RECOVERY_CATEGORY_DETERMINISTIC_INVALID_GRANT &&
    deterministicInvalidGrantDetected !== true
  ) {
    failures.push(
      "contradictory_deterministic_recovery_without_deterministic_classification",
    );
  }

  // Explicit reconnect (live).
  const reconnectAttempted = requireBooleanField(
    t199,
    "explicit_reconnect_attempted",
    "t199",
    failures,
  );
  const reconnectSucceeded = requireBooleanField(
    t199,
    "explicit_reconnect_succeeded",
    "t199",
    failures,
  );
  const finalConnectionStatus = requireStringField(
    t199,
    "final_connection_status_after_callback",
    "t199",
    failures,
  );
  const finalRecoveryOk = requireBooleanField(
    t199,
    "final_real_encrypted_recovery_succeeded",
    "t199",
    failures,
  );
  const reconnectPass =
    reconnectAttempted &&
    reconnectSucceeded &&
    finalConnectionStatus === CONNECTION_STATUS_CONNECTED &&
    finalRecoveryOk;
  criteria.push(
    criterion({
      key: "explicit_reconnect",
      label:
        "Explicit reconnect to connected state with recovered encrypted credentials",
      required: true,
      pass: reconnectPass,
      observationKind: reconnectPass
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
    }),
  );
  if (
    reconnectSucceeded &&
    finalConnectionStatus !== CONNECTION_STATUS_CONNECTED
  ) {
    failures.push("contradictory_reconnect_succeeded_without_connected_state");
  }
  if (reconnectSucceeded && !finalRecoveryOk) {
    failures.push("contradictory_reconnect_succeeded_without_recovered_state");
  }

  // Disconnect and credential removal.
  const localLogoutOk = requireBooleanField(
    t199,
    "real_local_logout_succeeded",
    "t199",
    failures,
  );
  const recordDeletionOk = requireBooleanField(
    t199,
    "real_record_deletion_succeeded",
    "t199",
    failures,
  );
  const disconnectedRestartOk = requireBooleanField(
    t199,
    "real_disconnected_restart_succeeded",
    "t199",
    failures,
  );
  const disconnectPass =
    localLogoutOk && recordDeletionOk && disconnectedRestartOk;
  criteria.push(
    criterion({
      key: "disconnect_and_credential_removal",
      label: "Disconnect, local credential removal, and disconnected restart",
      required: true,
      pass: disconnectPass,
      observationKind: disconnectPass
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
    }),
  );

  // Successful invocation after restart (T200).
  const encryptedStateRecovered = requireBooleanField(
    t200,
    "encrypted_state_recovered",
    "t200",
    failures,
  );
  const invocationAttempted = requireBooleanField(
    t200,
    "invocation_attempted",
    "t200",
    failures,
  );
  const invocationSucceeded = requireBooleanField(
    t200,
    "invocation_succeeded",
    "t200",
    failures,
  );
  const exactHttpStatus = requireIntegerField(
    t200,
    "exact_http_status",
    "t200",
    failures,
  );
  const protocolValid = requireBooleanField(
    t200,
    "response_protocol_valid",
    "t200",
    failures,
  );
  const invocationPass =
    encryptedStateRecovered &&
    invocationAttempted &&
    invocationSucceeded &&
    exactHttpStatus === 200 &&
    protocolValid;
  criteria.push(
    criterion({
      key: "successful_invocation_after_restart",
      label:
        "Successful minimal invocation after restart using recovered encrypted state",
      required: true,
      pass: invocationPass,
      observationKind: invocationPass
        ? OBSERVATION_KIND_LIVE
        : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t200Path],
      note: `exact_http_status=${exactHttpStatus}`,
    }),
  );
  if (invocationSucceeded && !encryptedStateRecovered) {
    failures.push("contradictory_invocation_without_recovered_encrypted_state");
  }

  // Provider-side remote revocation is intentionally NOT a mandatory T245
  // criterion: the canonical task text requires expired/invalid-credential
  // recovery, and the repository's accepted T199 interpretation treats
  // deterministic invalid-grant classification as the safe reconnect
  // classification for expired or revoked credentials. Remote token
  // revocation is only claimable after audited evidence verifies a supported
  // revocation endpoint or operation (docs/research/codex-direct-oauth-security-design.md).
  const providerSideRevocationBehavior = requireStringField(
    t199,
    "provider_side_revocation_behavior",
    "t199",
    failures,
  );
  criteria.push(
    criterion({
      key: "provider_side_remote_revocation",
      label:
        "Provider-side remote token revocation (not required by canonical T245)",
      required: false,
      pass: true,
      observationKind:
        providerSideRevocationBehavior === "live_observed"
          ? OBSERVATION_KIND_LIVE
          : OBSERVATION_KIND_NOT_EXERCISED,
      evidence: [t199Path],
      note:
        providerSideRevocationBehavior ??
        "not_exercised_without_supported_revocation_mechanism",
    }),
  );

  const mandatoryCriteria = criteria.filter((item) => item.required);
  const pass =
    failures.length === 0 && mandatoryCriteria.every((item) => item.pass);

  const report = {
    evidence_classification: "sanitized_t245_lifecycle_proof",
    evaluator: "spikes/codex-direct-oauth/lib/t245-evaluator.mjs",
    inputs: {
      t199_evidence: t199Path,
      t200_evidence: t200Path,
    },
    provider_side_revocation_required: false,
    criteria,
    recovery_observations: {
      expired_invalid_credential_recovery_category: recoveryCategory,
      expired_invalid_credential_recovery_observation: recoveryObservation,
      invalid_grant_observed_live: invalidGrantObservedLive,
      deterministic_invalid_grant_detected: deterministicInvalidGrantDetected,
      provider_side_revocation_behavior: providerSideRevocationBehavior,
    },
    summary: {
      t245_live_proof_complete: pass,
      mandatory_criteria_count: mandatoryCriteria.length,
      passing_mandatory_criteria_count: mandatoryCriteria.filter(
        (item) => item.pass,
      ).length,
      live_observed_count: criteria.filter(
        (item) => item.observation_kind === OBSERVATION_KIND_LIVE,
      ).length,
      deterministic_only_count: criteria.filter(
        (item) => item.observation_kind === OBSERVATION_KIND_DETERMINISTIC_ONLY,
      ).length,
      not_exercised_count: criteria.filter(
        (item) => item.observation_kind === OBSERVATION_KIND_NOT_EXERCISED,
      ).length,
      failures,
    },
    residual_risks: [
      {
        key: "provider_side_remote_revocation_not_exercised",
        detail:
          "A live provider-side revocation was not exercised and is not claimed. Canonical T245 requires expired/invalid-credential recovery and explicit reconnect; the repository's accepted T199 interpretation treats deterministic invalid-grant classification as the safe reconnect classification for expired or revoked credentials, and no supported remote revocation endpoint is established in the upstream audit.",
      },
    ],
  };
  return Object.freeze(report);
}

export async function evaluateT245(options) {
  const report = await assessT245(options);
  if (!report.summary.t245_live_proof_complete) {
    fail(report.summary.failures.join(";"));
  }
  return report;
}

export async function writeT245Aggregate({
  repoRoot = path.resolve(SPIKE_ROOT, "../.."),
  aggregatePath = T245_AGGREGATE_REL_PATH,
  ...evaluatorOptions
} = {}) {
  const report = await evaluateT245({ repoRoot, ...evaluatorOptions });
  return writeEvidenceAtomic(path.resolve(repoRoot, aggregatePath), report);
}
