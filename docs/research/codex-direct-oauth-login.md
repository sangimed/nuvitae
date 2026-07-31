# Codex Direct OAuth Login

Task: T198
Date: 2026-07-31
Status: Incomplete. Spike implementation and synthetic validation passed, but
the live browser OAuth completion gate did not pass because no browser callback
reached the broker before timeout.

## 1. Scope

This is a disposable local compatibility spike for the direct Codex browser
OAuth Authorization Code with PKCE flow. It proves only local browser login,
broker-only code exchange, required credential-field presence, broker
confinement, and cleanup when the live gate succeeds.

It does not authorize production integration, backend invocation, semantic
parsing, remote/NAS/VPS/headless onboarding, multi-user support, encrypted
production persistence, refresh, logout, deletion proof, or T164-T165.

## 2. Upstream Basis

Pinned upstream basis from T196:

| Source | Pinned revision |
| --- | --- |
| OpenClaw | `4c331166c40cccb6e4d2da1136c921faed1cc8c1` |
| Hermes Agent | `5d6aae02bffa7714c4a94f3a0900b37774442dea` |
| Official OpenAI Codex source | `3016671bb077c43448b8fa88f3edfa9772e17058` |

Compatibility parameters used by the spike are the audited values:

| Parameter | Value |
| --- | --- |
| OAuth client identifier | `app_EMoamEEZ73f0CkXaXp7hrann` |
| Authorization endpoint | `https://auth.openai.com/oauth/authorize` |
| Token endpoint | `https://auth.openai.com/oauth/token` |
| Redirect URI | `http://localhost:1455/auth/callback` |
| Scope set | `openid`, `profile`, `email`, `offline_access` |
| PKCE method | `S256` |
| Required authorization extras | `id_token_add_organizations=true`, `codex_cli_simplified_flow=true`, `originator=openclaw` |

These are compatibility facts, not official third-party support guarantees.

## 3. Supported Deployment Mode

Supported only:

- local Docker Desktop or equivalent;
- macOS host;
- browser and Docker host on the same physical machine;
- callback exposed only through host `127.0.0.1`;
- single-user compatibility test;
- disposable broker memory.

Remote-server, NAS, VPS, and headless assumptions are explicitly unsupported for
T198.

## 4. Docker Callback Topology

Implemented topology:

```text
host 127.0.0.1:1455
-> container relay 0.0.0.0:2455
-> broker callback listener 127.0.0.1:1455
```

The Compose file publishes only `127.0.0.1:1455:2455`. The relay is raw TCP,
does not parse HTTP, does not log payloads, has bounded connections, and is
terminated after success, failure, cancellation, or timeout.

## 5. Broker Boundary

Only `spikes/codex-direct-oauth/broker.mjs` may possess PKCE verifier, OAuth
state, authorization code, access token, refresh token, expiry, and account
identifier material. The parent lifecycle runner receives only safe booleans and
categories. The authorization URL is printed by the broker directly to the live
terminal and is not sent over IPC or persisted.

## 6. PKCE And State Behavior

The broker generates a cryptographically secure verifier, derives an S256
challenge, generates a cryptographically secure state, and validates returned
state with a constant-time comparison helper.

Synthetic status: implemented and covered by deterministic tests.

## 7. Authorization URL Validation

The broker validates HTTPS, exact authorization host/path, expected client id,
expected redirect URI, exact scope set, S256 PKCE, non-empty state, no embedded
URL credentials, exact redirect host/path/port, response type, and audited extra
parameters before displaying the URL.

Live result: passed for generation and strict validation.

## 8. Callback Result

The broker callback listener accepts only `/auth/callback`, rejects wrong state,
missing code, wrong path, duplicate successful callback, and oversized requests,
then shuts down after terminal result.

Live result: no browser callback reached the broker before timeout.

## 9. Token Exchange Result

The token exchange is performed only inside the broker against the exact audited
HTTPS token endpoint. It rejects unexpected token host/path, redirects to another
host, oversized responses, unexpected content type, and malformed JSON. It
projects only safe status and field-presence booleans to the parent.

Live result: not attempted because the callback timed out before an
authorization code was received.

## 10. Credential-Field Presence

Required field checks are access token present, refresh token present, and expiry
present. Values are not printed or persisted.

Live result: not present because token exchange was not attempted.

## 11. Account-Identity Presence

The broker checks for an acceptable account identifier internally and reports
only a presence boolean.

Live result: not present because token exchange was not attempted.

## 12. Token-Blindness Result

Parent IPC is designed to receive only `authorization_url_ready`,
`callback_listener_ready`, `callback_received`, `state_valid`,
`token_exchange_succeeded`, `access_token_present`, `refresh_token_present`,
`expiry_present`, `account_identifier_present`, `cleanup_complete`, and safe
failure categories. Raw credential values are not sent over IPC.

Synthetic status: implemented and tested. Live result: no raw credentials reached
the parent probe; no credentials were obtained.

## 13. Cleanup Result

The broker clears credential references where possible, terminates the listener,
and the lifecycle runner terminates the relay/container and verifies callback
port removal. Perfect memory zeroization is not guaranteed by the Node.js
runtime.

Live result: cleanup completed. Relay was removed, the host callback port was
closed, and no persistent credential artifact was found. Perfect memory
zeroization is not guaranteed by the Node.js runtime.

## 14. Secret-Scan Result

The scanner checks spike files and this evidence document for token-like,
callback-query, authorization-code, account-email, and bearer-token patterns.
Synthetic sentinel detection is covered by tests.

Live result: passed.

Sanitized evidence was written to
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-login.json` with:

| Evidence field | Result |
| --- | --- |
| `host_binding_loopback_only` | `true` |
| `authorization_url_validation` | `true` |
| `callback_listener_ready` | `true` |
| `callback_reachability` | `true` |
| `callback_received` | `false` |
| `state_validation` | `false` |
| `token_exchange_result` | `callback_timeout` |
| `access_token_present` | `false` |
| `refresh_token_present` | `false` |
| `expiry_present` | `false` |
| `account_identifier_present` | `false` |
| `raw_credentials_exposed_to_probe` | `false` |
| `persistent_credential_artifact_found` | `false` |
| `relay_removed` | `true` |
| `host_callback_port_removed` | `true` |
| `secret_scan_result` | `passed` |
| `safe_final_state` | `incomplete_cleaned_up` |

## 15. Limitations

- No official third-party support guarantee is established.
- No Codex backend invocation is performed.
- No semantic parsing is performed.
- No production encrypted persistence is implemented.
- No refresh, restart recovery, logout, revocation, or deletion proof is
  implemented.
- No remote, NAS, VPS, headless, or multi-user onboarding is supported.
- Host administrators remain inside the self-hosting trust boundary.
- Node.js cannot guarantee perfect memory zeroization.

## 16. Supportability Classification

Local OAuth mechanics are compatibility behavior derived from T196's pinned
source audit. Third-party direct OAuth reuse remains undocumented and unresolved.
A successful T198 would be experimental Nuvitae behavior only.

## 17. T199 Entry Implications

T199 remains blocked because the T198 live gate did not succeed. T199 owns
encrypted persistence, restart recovery, refresh, logout, and deletion proofs.

## 18. Evidence Classification

Evidence is sanitized and limited to booleans, safe categories, callback port
numbers, upstream revision identifiers, cleanup status, and secret-scan status.
Raw OAuth material, complete authorization URLs, profile data, account details,
and token responses are prohibited.
