# Codex Direct OAuth Credential Lifecycle

Task: T199 (credential lifecycle) with the accepted T245 lifecycle aggregate
Date: 2026-08-07 (accepted local run); original bounded live validation 2026-07-31
Status: **Complete for the bounded local Docker live validation.**

This report is sanitized. It contains no authorization URL, OAuth state, PKCE
verifier, authorization code, credential value, account identifier, master-key
material, or encrypted envelope contents.

## Scope and separation

T199 validates only the isolated credential broker and its encrypted lifecycle.
It does not modify production application code and does not invoke the Codex or
Responses inference backend. Deterministic synthetic validation and real live
OAuth validation are reported separately.

## Accepted 2026-08-07 live run (T199/T245)

The accepted T199/T245 live run completed in the supported local same-host
Docker deployment shape:

- Accepted local run date: 2026-08-07 (Europe/Paris).
- Underlying UTC observation timestamp from evidence:
  `2026-08-06T22:35:28.029Z`
  (`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json`).
- Fresh browser OAuth login: `initial_live_oauth_succeeded: true`; final
  reauthentication `final_live_reauthentication_succeeded: true`.
- Callback completion: `callback_completion: completed`,
  `callback_state_validated: true`, `token_exchange_succeeded: true`.
- Connection status after callback: `connection_status_after_callback:
  connected` (final: `final_connection_status_after_callback: connected`).
- Encrypted persistence: `real_encrypted_record_created: true` and
  `encrypted_record_contains_plaintext: false`; serialized contents contained
  no plaintext credentials.
- Restart recovery: `real_restart_recovery_succeeded: true`.
- Live refresh with token rotation: `real_refresh_attempted: true`,
  `real_refresh_succeeded: true`, `real_refresh_token_rotated: true`; two
  concurrent requests produced one network refresh
  (`live_network_refresh_count: 1`, single-flight).
- Explicit reconnect after disconnect: `explicit_reconnect_attempted: true`,
  `explicit_reconnect_succeeded: true`
  (`reconnect_trigger_category: after_disconnect`).
- Disconnect and credential deletion: `real_local_logout_succeeded: true`,
  `real_record_deletion_succeeded: true`,
  `real_disconnected_restart_succeeded: true` (a disconnected restart reported
  `disconnected` without recreating the record).
- Expired/invalid-credential recovery: classified deterministically
  (`expired_invalid_credential_recovery_category:
  deterministic_invalid_grant_classification`,
  `deterministic_invalid_grant_detected: true`,
  `invalid_grant_observed_live: false`). The deterministic invalid-grant
  category is the safe reconnect classification for expired or revoked
  credentials.
- Provider-side remote revocation: not exercised and not claimed
  (`provider_side_revocation_behavior:
  not_exercised_without_supported_revocation_mechanism`); canonical T245 does
  not require provider-side remote revocation.
- Successful invocation after restart: T200 minimal invocation succeeded with
  exact HTTP 200 and valid SSE framing
  (`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`).
- Secret scan: `secret_scan_result: passed`; no raw credential, account
  identifier, authorization code, or provider response is included in the
  evidence.
- T245 aggregate:
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`
  (9/9 mandatory criteria passing; 8 live-observed; 1 deterministic-only
  invalid-grant classification; provider-side revocation not exercised and not
  required).

## Deterministic synthetic validation

The deterministic suite passed:

- AES-256-GCM envelope encryption, random nonce behavior, and authenticated
  owner, connection, and provider AAD binding;
- wrong-key, tampering, unsupported-version, malformed-envelope, and stale
  generation rejection;
- atomic persistence, generation compare-and-swap, cleanup of abandoned files,
  and credential generation through 3;
- refresh classification for invalid-grant, authentication-required,
  quota/rate-limit, timeout, server, and malformed-response categories;
- single-flight refresh: three concurrent requests produced one network refresh;
- restrictive permissions: key and credential directories 0700, key and record
  0600, read-only key write rejected with EROFS, foreign UID 2000 denied, and
  broker UID 1000 allowed to read the key;
- fresh-container encrypted recovery and secret-scan self-checks.

The deterministic invalid-grant category is the safe reconnect classification
for expired or revoked credentials. A separate remote provider revocation was
not exercised and is not claimed as a live result.

## Confirmed refresh implementation bug (historical)

The first real refresh failure had safe category `invalid_master_key`. It was a
confirmed implementation argument bug: the original code supplied
`current.generation` as the encryption key instead of supplying `current.key`
as the encryption key and `current.generation` as the previous generation.

This was not an OAuth or provider rejection. After correcting those arguments,
the real refresh succeeded, the refresh credential rotated, and the encrypted
replacement was persisted at the next generation. This historical failure and
its interpretation remain preserved for T200.

## Security and teardown controls

The final live state passed the additional controls: no wildcard callback
binding; secret scanner passed; key and credential named volumes were preserved;
the `t199-live-broker` container was inactive; and host port 1455 was not
listening. The callback broker was stopped and no callback port remains
published.

The preserved handoff volumes are exactly:

- `nuvitae-codex-direct-oauth-t199-key-live`
- `nuvitae-codex-direct-oauth-t199-credentials-live`

The safe final state is equivalent to: connected, final credentials encrypted
at rest, final encrypted recovery succeeded, volumes preserved, broker stopped,
and callback ports absent. The preserved T199 state was subsequently used by
the T200 live direct invocation proof.

## Validation record

The companion sanitized machine-readable record is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json`.
It contains the deterministic/live distinction, live refresh counts, corrected
bug history, final handoff state, and explicit non-replay/non-invocation
controls without secret material. The accepted T245 aggregate is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`.

## Historical record (2026-07-31)

The 2026-07-31 bounded live run is preserved as historical context, not current
status:

1. Initial browser OAuth succeeded; callback state validation and token exchange
   succeeded; an encrypted record was created and its serialized contents did
   not contain plaintext credentials.
2. Broker restart recovered the encrypted record.
3. Two concurrent refresh requests resulted in one network refresh. Refresh
   succeeded and the provider rotated the refresh credential.
4. Local logout deleted the encrypted record. A disconnected restart reported
   `disconnected` without recreating it.
5. Final browser reauthentication created the final encrypted record, and a
   subsequent restart recovered it successfully.

That run's T199 proof was complete for the bounded local Docker live
validation. Its status statements from that date (including then-pending
T200-T203/T164-T165 work) are historical; current status is governed by the
accepted 2026-08-07 run and the accepted T245 aggregate above, under which the
T200 live invocation has since been completed and the T245 lifecycle proof is
accepted.
