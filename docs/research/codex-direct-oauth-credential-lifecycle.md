# Codex Direct OAuth Credential Lifecycle

Task: T199  
Date: 2026-07-31  
Status: **Complete for the bounded local Docker live validation.**

This report is sanitized. It contains no authorization URL, OAuth state, PKCE
verifier, authorization code, credential value, account identifier, master-key
material, or encrypted envelope contents.

## Scope and separation

T199 validates only the isolated credential broker and its encrypted lifecycle.
It does not modify production application code and does not invoke the Codex or
Responses inference backend. Deterministic synthetic validation and real live
OAuth validation are reported separately. T200-T203 and T164-T165 remain
incomplete.

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

## Real live OAuth lifecycle

The bounded live run already completed and is not replayed during this
finalization:

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

Only safe booleans, counts, statuses, and error categories were used in the
recorded result. No raw credential reached the parent process, API, queue,
browser, domain, logs, repository, or evidence.

## Confirmed refresh implementation bug

The first real refresh failure had safe category `invalid_master_key`. It was a
confirmed implementation argument bug: the original code supplied
`current.generation` as the encryption key instead of supplying `current.key`
as the encryption key and `current.generation` as the previous generation.

This was not an OAuth or provider rejection. After correcting those arguments,
the real refresh succeeded, the refresh credential rotated, and the encrypted
replacement was persisted at the next generation. This historical failure and
its interpretation must remain preserved for T200.

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
callback ports absent, and ready for T200. T200 itself was not started.

## Validation record

The companion sanitized machine-readable record is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json`.
It contains the deterministic/live distinction, live refresh counts, corrected
bug history, final handoff state, and explicit non-replay/non-invocation
controls without secret material.
