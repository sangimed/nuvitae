# Codex Direct OAuth Login

Task: T198
Date: 2026-07-31
Status: Complete for the supported local deployment mode. Spike implementation,
synthetic validation, and the successful bounded live browser OAuth proof
passed. Earlier failed and timed-out attempts remain recorded below as
historical evidence.

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
- callback exposed only through explicit host loopback publication:
  `127.0.0.1:1455` and, where Docker Desktop accepts it, `[::1]:1455`;
- single-user compatibility test;
- disposable broker memory.

Remote-server, NAS, VPS, and headless assumptions are explicitly unsupported for
T198.

## 4. Docker Callback Topology

First-attempt implemented topology:

```text
host 127.0.0.1:1455
-> container relay 0.0.0.0:2455
-> broker callback listener 127.0.0.1:1455
```

Second-attempt implemented topology when Docker Desktop accepted IPv6 loopback:

```text
host 127.0.0.1:1455 and host [::1]:1455
-> container relay 0.0.0.0:2455
-> broker callback listener 127.0.0.1:1455
```

The Compose file publishes only explicit loopback bindings. It must not bind
`0.0.0.0:1455`, `[::]:1455`, a LAN address, or a public address. The relay is
raw TCP, does not parse HTTP, does not log payloads, has bounded connections,
and is terminated after success, failure, cancellation, or timeout.

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

First live result: no browser callback reached the broker before timeout.

Second live result: no browser callback reached the broker because the browser
authentication was not completed within the bounded live window. This second
result is classified as `browser_auth_not_completed`, not OAuth rejection, not
token-exchange failure, and not proof of callback delivery failure.

## 9. Token Exchange Result

The token exchange is performed only inside the broker against the exact audited
HTTPS token endpoint. It rejects unexpected token host/path, redirects to another
host, oversized responses, unexpected content type, and malformed JSON. It
projects only safe status and field-presence booleans to the parent.

First live result: not attempted because the callback timed out before an
authorization code was received.

Second live result: not attempted because browser authentication was not
completed and no authorization code reached the broker.

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

First-attempt sanitized evidence is preserved at
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-login-first-attempt.json`
with:

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

## 14a. Second Attempt: Automatic Callback Correction

The second attempt added a non-OAuth loopback preflight before starting the real
OAuth broker. The preflight used a separate synthetic listener with no OAuth
state, no authorization code, no fake callback query, and no token material. It
validated publication and teardown before the real broker started.

Safe redirect metadata:

| Field | Result |
| --- | --- |
| Redirect scheme | `http` |
| Redirect hostname | `localhost` |
| Redirect port | `1455` |
| Redirect path | `/auth/callback` |
| Redirect hostname classification | `localhost` |

Second-attempt evidence:

| Evidence field | Result |
| --- | --- |
| `localhost_address_families` | `both` |
| `ipv4_preflight_result` | `success` |
| `ipv6_preflight_result` | `success` |
| `docker_ipv6_loopback_publication` | `accepted` |
| `selected_redirect_hostname` | `localhost` |
| `selected_host_bindings` | `127.0.0.1:1455`, `[::1]:1455` |
| `ipv4_host_loopback_published` | `true` |
| `ipv6_host_loopback_published` | `true` |
| `no_wildcard_host_binding` | `true` |
| `relay_listener_ready` | `true` |
| `broker_callback_listener_ready` | `true` |
| `authorization_url_validation` | `true` |
| `callback_received` | `false` |
| `browser_callback_result` | `browser_auth_not_completed` |
| `callback_address_family` | `unknown` |
| `state_validation` | `false` |
| `token_exchange_result` | `not_attempted` |
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

Second-attempt sanitized evidence was written to
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-login.json` with:

| Evidence field | Result |
| --- | --- |
| `host_binding_loopback_only` | `true` |
| `authorization_url_validation` | `true` |
| `callback_listener_ready` | `true` |
| `callback_reachability` | `true` |
| `callback_received` | `false` |
| `state_validation` | `false` |
| `token_exchange_result` | `not_attempted` |
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

## 15. Successful Live Attempt

The sanitized evidence at
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-login.json` records a
successful live attempt for `local-docker-desktop_same_host_browser`. It is
limited to safe booleans, categories, and loopback topology metadata; no OAuth
material or personal account information is reproduced here.

The successful attempt experimentally verified:

- browser Authorization Code with PKCE using the audited parameters;
- Docker loopback callback delivery through explicit `127.0.0.1:1455` and
  `[::1]:1455` publication, with no wildcard host binding;
- authorization URL validation, callback reachability, callback receipt, and
  state validation;
- authorization-code exchange succeeded inside the broker;
- required credential fields were present: access token, refresh token, and
  expiry, reported only as presence booleans;
- account identity was present, reported only as a presence boolean;
- broker-only credential ownership and no raw credential exposure to the probe;
- no persistent credential artifact;
- relay and host callback-port teardown; and
- successful secret scanning.

The callback address family is recorded as `unknown`, which is not a blocker:
IPv4 and IPv6 preflight succeeded, Docker accepted explicit IPv6 loopback
publication, both loopback addresses were published, no wildcard binding
existed, and the real callback reached the broker.

The successful final state was `success_credentials_destroyed`. This is an
experimental Nuvitae result for the supported local deployment mode only, not
a production credential-lifecycle proof.

## 16. Limitations

- No official third-party support guarantee is established.
- T198 does not verify encrypted credential persistence, restart recovery,
  token refresh, concurrent refresh handling, or logout/deletion lifecycle.
- T198 does not invoke the Codex inference backend or verify semantic parsing.
- T198 does not verify remote, NAS, VPS, or headless onboarding, or multi-user
  isolation.
- T198 does not establish official third-party supportability.
- Host administrators remain inside the self-hosting trust boundary.
- Node.js cannot guarantee perfect memory zeroization.

## 17. Supportability Classification

Local OAuth mechanics are compatibility behavior derived from T196's pinned
source audit. Third-party direct OAuth reuse remains undocumented and unresolved.
A successful T198 remains experimental Nuvitae behavior only.

## 18. T199 Entry Implications

T199 remains incomplete and is not implemented by this task. T199 owns encrypted
persistence, restart recovery, refresh, logout, and deletion proofs.

## 19. Evidence Classification

Evidence is sanitized and limited to booleans, safe categories, callback port
numbers, upstream revision identifiers, cleanup status, and secret-scan status.
Raw OAuth material, complete authorization URLs, profile data, account details,
and token responses are prohibited.
