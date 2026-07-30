# Codex App-Server Authentication Lifecycle

Task: T191  
Date: 2026-07-30  
Status: incomplete. Device-code remains experimentally blocked for this
tested account/runtime combination, and the final bounded browser-login
callback-relay candidate did not reach the mandatory authenticated lifecycle
gates.

Scope: bounded authentication and session-lifecycle spike only. This did not
implement a production Codex adapter, did not integrate Codex into the worker,
API, web application, or resume-import pipeline, did not add product-facing
authentication UI, and did not use real resumes.

## 1. Pinned Runtime Basis

- Package: `@openai/codex`
- Version: `0.146.0`
- Runtime topology: managed app-server child process over JSON-RPC stdio,
  continuing the T190-selected topology.
- Spike directory: `spikes/codex-app-server-runtime/`
- Protocol basis: T189 generated protocol artifacts for Codex `0.146.0`.
- Generated artifacts remain the source of truth for method names and payloads.

## 2. Selected Topology

T191 kept the T190 managed-child-process-over-stdio topology. The auth harness
runs a minimal supervisor that starts Codex as UID/GID `10001:10001` and runs
Nuvitae probe checks as UID/GID `10002:10002`. The private Codex state directory
is `/codex-state`.

The auth profile has outbound network access for official Codex authentication,
publishes no inbound host ports, does not mount the Docker socket, does not
mount host `~/.codex`, does not mount the host home directory, and does not
connect to PostgreSQL or Valkey services.

## 3. Browser-Flow Attempt

Preserved historical result from the first T191 attempt:

- Login request path: `account/login/start`
- Returned flow: `chatgpt`
- Safe response shape: `type`, `loginId`, `authUrl`
- Result: experimentally unsuccessful in the selected Docker topology
- Post-login `account/read`: unauthenticated
- Restart after attempted login: unauthenticated
- Final state from that attempt: unauthenticated
- Raw credential exposure by exercised RPCs: no

The browser auth URL and callback URL were not persisted in evidence.

## 4. Browser-Flow Root-Cause Assessment

The browser flow is classified as most likely incompatible with the
container-local callback boundary in the selected Docker topology unless extra
callback forwarding or bridging is added. The browser flow is not treated as a
general failure of official Codex authentication and is not selected for the
self-hosted Docker candidate.

No additional callback proxy, port-forwarding, host networking, or custom OAuth
callback implementation is in T191 scope. The remainder of T191 therefore moved
to the generated official `chatgptDeviceCode` operation.

## 5. Generated Device-Code Protocol Evidence

Verified from generated Codex `0.146.0` protocol artifacts:

- Request method: `account/login/start`
- Exact request payload: `{ "type": "chatgptDeviceCode" }`
- Expected response shape: `type`, `loginId`, `verificationUrl`, `userCode`
- Login completion notification: `account/login/completed`
- Account update notification: `account/updated`
- Account read operation: `account/read`
- Login cancellation operation: `account/login/cancel`
- Logout operation: `account/logout`

This operation is present in stable generated artifacts. No undocumented method
was attempted.

## 6. Attempts Before Device-Code Authorization Was Enabled

The browser-flow attempt and the first app-server `chatgptDeviceCode` attempt
were performed before the user enabled official Codex device-code
authentication in the ChatGPT account or workspace settings. They remain
experimentally verified historical evidence, but they are not interpreted as a
general Codex authentication NO-GO.

Pre-enablement app-server device-code result:

- Request: `account/login/start`
- Params: `{ "type": "chatgptDeviceCode" }`
- Verification URL issued: no
- One-time user code issued: no
- Safe failure category: `device_code_login_request_rejected`
- JSON-RPC error code: `-32603`
- Normalized category: `device_code_login_internal_error`
- Preserved evidence:
  `spikes/codex-app-server-runtime/evidence/auth-device-code-rejected-before-enable.json`

## 7. Successful Isolated Host Control After Enablement

After the account/workspace setting was enabled, the user reported a successful
manual isolated host control using:

```bash
codex login --device-auth
```

Safe classification of the user-reported control:

- Codex version: `codex-cli 0.146.0`
- `CODEX_HOME`: temporary isolated host directory
- Normal host `~/.codex`: not used
- Host credential state copied into Docker: no
- Credential contents inspected: no
- Verification URL and one-time code: issued live only
- Login result: succeeded

No account email, account name, account identifier, user code, token, or
credential-file contents were added to repository evidence.

This result means the account/workspace setting is no longer the sole
explanation for the Docker app-server rejection.

## 8. Docker App-Server Retry After Enablement

Experimentally attempted from a fresh dedicated Docker volume:

- Initialized app-server over stdio with explicit Nuvitae client metadata.
- Verified pre-login `account/read` was unauthenticated.
- Sent exactly `account/login/start` with `{ "type": "chatgptDeviceCode" }`.
- The app-server rejected the request before returning a `verificationUrl` or
  `userCode`.

Safe device-code failure category:

- `safeErrorCategory`: `device_code_login_request_rejected`
- JSON-RPC error code: `-32603`
- Normalized error-message category: `device_code_login_internal_error`
- Response shape persisted: `code`, `message`

No verification URL or one-time user code was issued, displayed, or persisted in
the post-enablement Docker app-server retry.

## 9. App-Server Safe Underlying Error Detail

Diagnostic A repeated the app-server device-code request before enablement with
narrowly scoped runtime logging and safe stderr classification. It is preserved
as historical diagnostic evidence.

Safe result:

- Request: `account/login/start`
- Params: `{ "type": "chatgptDeviceCode" }`
- JSON-RPC error code: `-32603`
- Safe app-server response category: `endpoint_mentioned`
- Safe stderr categories: `endpoint_mentioned`, `dns_resolution_failure`
- Raw credential exposure by RPC: no

The stderr endpoint list was sanitized to host and pathname only. It contained
ChatGPT plugin/config endpoints and OpenAI documentation URLs, not credential
material. A same-container HTTPS probe to
`https://auth.openai.com/api/accounts/deviceauth/usercode` reached the endpoint
and returned an HTTP `4xx` category in 195 ms. That probe indicates the Docker
runtime had working DNS, TCP, TLS, CA trust, and outbound HTTPS to the
device-auth host/path at the time of the diagnostic. The app-server diagnostic
therefore did not reduce the failure only to JSON-RPC `-32603`; the safe
underlying evidence points away from a basic Docker DNS/TLS/CA outage for that
pre-enablement run. The post-enablement Docker app-server retry was not reduced
to a new lower-level transport category; it still returned only the safe
JSON-RPC rejection category before issuing a code.

## 10. Pinned Docker CLI Control Before Enablement

Diagnostic B ran the official pinned CLI in the same Docker runtime, same
`@openai/codex@0.146.0`, same `node:24.15.0-bookworm-slim` base, same network
boundary, same CA store, same environment style, same Codex runtime identity,
and the same fresh private state volume:

```bash
codex login --device-auth
```

Safe result:

- Verification URL issued: no
- One-time user code issued: no
- Login completed: no
- Exit code: `1`
- Safe output categories: `endpoint_mentioned`
- Safe endpoint path: `https://auth.openai.com/api/accounts/deviceauth/usercode`

The CLI failed before producing a user code, so no human browser interaction was
possible. This result is now classified as pre-enablement evidence; it should be
rechecked only in a targeted follow-up diagnostic if the planning decision needs
to distinguish a Docker CLI success from a Docker app-server RPC failure.

## 11. Same-Volume App-Server Account/Read Verification

Skipped. The pinned Docker CLI device-auth command did not complete and did not
create an authenticated profile in the shared private state volume.

This means the diagnostic could not determine whether app-server can consume
official CLI-managed authenticated state from the same volume.

## 12. Isolated Host Control Before Enablement

Diagnostic C was required because the official pinned Docker CLI failed before
issuing a code.

Host control prerequisites:

- Host Codex binary: available
- Host Codex version: `codex-cli 0.146.0`
- Isolated temporary `CODEX_HOME`: used
- Normal host `~/.codex`: not used
- Temporary auth state copied into Docker: no
- Credential contents inspected: no
- Temporary directory removed after test: yes

Safe host-control result:

- Verification URL issued: no
- One-time user code issued: no
- Login completed: no
- Exit code: `1`
- Safe output categories: `endpoint_mentioned`, `request_send_failure`

The host control failed before code issuance with the same official CLI
device-auth start path. This argues against the Docker network boundary being
the sole cause for the pre-enablement result.

This pre-enablement host-control result is superseded for account/workspace
authorization analysis by the successful user-reported isolated host control
after enablement in Section 7.

## 13. Current-Version Control

Diagnostic D was required because the pinned app-server and pinned CLI paths
failed before issuing a code.

A separate one-shot Docker container queried the current official npm package
version without modifying repository lockfiles or normal Docker images. The
current official `@openai/codex` version was `0.146.0`, the same as the pinned
version. No newer official version was available for a version-differential
login-start comparison.

Result: current-version differential unavailable; this pass cannot classify the
failure as fixed by a newer official version.

## 14. Diagnostic Matrix Outcome

Outcome after enablement: T191 remains blocked outside the original matrix
cases because the account/workspace restriction changed between diagnostic
passes.

Pre-enablement evidence matched Case 4: pinned app-server, pinned Docker CLI,
and exact-version host CLI all failed before issuing a code, while the current
official npm version was still `0.146.0`.

Post-enablement evidence changed the classification:

- Exact-version isolated host CLI control succeeded, per user report.
- Docker app-server `account/login/start` with `{ "type":
  "chatgptDeviceCode" }` still failed before issuing a code.
- The account/workspace setting is therefore not the sole remaining blocker.
- The failure is now classified as specific to the bounded Docker app-server
  path or its environment, not as a general Codex authentication NO-GO.
- The current evidence does not yet distinguish a Docker app-server RPC defect
  from a Docker-only CLI/app-server environment difference after enablement,
  because the pinned Docker CLI control was not rerun after the setting changed.

Recommended next planning action: targeted T191 diagnostic before another full
lifecycle retry. The next diagnostic should rerun the pinned Docker CLI
`codex login --device-auth` after enablement and compare it with the Docker
app-server RPC under the same private volume and safe logging rules. If Docker
CLI succeeds while Docker app-server RPC fails, the official CLI bootstrap can
be considered only as an explicit planning decision; auth-cache copying remains
excluded because it violates the selected token-blind boundary.

## 15. Login Completion Notifications

Not reached for the post-enablement Docker app-server retry. Because
`account/login/start` was rejected before returning `verificationUrl`,
`userCode`, or `loginId`, no `account/login/completed` or `account/updated`
notification could be observed for a device-code login.

## 16. Safe Authenticated Account State

Not reached.

Pre-login safe state was verified:

- `account/read`: unauthenticated
- `requiresOpenaiAuth`: true
- `getAuthStatus` with `includeToken:false`: no auth method and no token
- Raw credential exposure by exercised RPCs: no

## 17. Restart Persistence

Authentication persistence across restart remains unverified because
device-code login did not start successfully and no authenticated state was
created.

## 18. Cancellation

Device-code cancellation remains unverified in the retry because no
device-code `loginId` was returned.

Historical browser-flow cancellation evidence remains preserved separately:
browser-flow `account/login/cancel` returned `canceled` for one active
unauthenticated login attempt. This does not satisfy the authenticated T191
cancellation gate.

## 19. Logout

Authenticated logout remains unverified because no authenticated device-code
session was created.

Historical browser-flow run verified only unauthenticated logout behavior.

## 20. Final Reauthentication

Not reached. The dedicated volume was not left authenticated for T192.

## 21. Token-Blindness

Experimentally verified for exercised safe RPCs:

- The client used `getAuthStatus` only with `includeToken:false`.
- `account/read` and `getAuthStatus` did not expose access tokens, refresh
  tokens, ID tokens, JWTs, or authorization headers.
- The device-code login attempt did not return raw credential fields.
- Evidence stores only operation names, response shapes, booleans, safe
  categories, hashed login ids where available, and error codes.
- The evidence does not store auth URLs, verification URLs, user codes,
  authorization codes, account email, account name, account identifier, tokens,
  or Codex auth files.

Raw credential exposure by RPC: no.

## 22. Credential Filesystem Boundary

Dedicated Docker named volume:

- Volume identifier: `nuvitae_codex_app_server_auth_state_t191`
- Mounted in container at `/codex-state`
- Codex runtime identity: UID/GID `10001:10001`
- Nuvitae probe identity: UID/GID `10002:10002`
- Permission model: `/codex-state` set to `0700`

Probe identity UID/GID `10002:10002` was experimentally denied:

- listing `/codex-state`
- statting a known synthetic sentinel file
- reading the known synthetic sentinel file
- copying the known synthetic sentinel file
- modifying the known synthetic sentinel file

No real credential contents were read or displayed.

## 23. Logging And Redaction Evidence

Sanitized evidence files:

- `spikes/codex-app-server-runtime/evidence/auth-browser-flow-failed.json`
- `spikes/codex-app-server-runtime/evidence/auth-device-code-rejected-before-enable.json`
- `spikes/codex-app-server-runtime/evidence/auth-lifecycle.json`
- `spikes/codex-app-server-runtime/evidence/auth-diagnostic.json`
- `spikes/codex-app-server-runtime/evidence/auth-host-control.json`
- `spikes/codex-app-server-runtime/evidence/auth-current-version-control.json`

The device-code evidence does not contain a verification URL, one-time user
code, authorization code, callback URL, token, account email, account name, or
account identifier.

The spike secret scanner passes:

```bash
node spikes/codex-app-server-runtime/scan-spike-secrets.mjs
```

## 24. Named-Volume Lifecycle

The lifecycle run uses a dedicated Docker volume and does not mount host
`~/.codex`, a host home directory, host credentials, the Nuvitae repository, or
private resume storage into the Codex runtime.

Cleanup command:

```bash
docker volume rm nuvitae_codex_app_server_auth_state_t191
```

Because final authentication failed, this volume is not useful as an
authenticated T192 carry-forward volume.

## 25. Remaining T191 Completion Gates

T191 completion gates still open:

- official device-code login succeeds
- `account/read` reports authenticated ChatGPT state
- authentication survives container recreation with the same volume
- login cancellation is verified for device-code flow
- authenticated logout is verified
- unauthenticated state survives restart after logout
- final reauthentication succeeds
- final dedicated volume is authenticated for T192
- a planning decision accepts any alternative official bootstrap, if one is
  proposed later

T191 remains incomplete during this diagnostic pass.

## 26. Remaining Unverified Scenarios

Unverified because Docker app-server device-code login was rejected before
authorization even after account/workspace device-code enablement:

- successful ChatGPT subscription authentication
- authenticated `account/read`
- authentication persistence across runtime restart
- device-code login cancellation
- authenticated logout
- unauthenticated state after authenticated logout and restart
- final reauthentication for T192
- Codex credential persistence and refresh
- token refresh after natural expiry
- expired authentication
- revoked authentication
- runtime crash during login
- provider network failure after login start
- rate limiting during authentication

No intentional revocation of a real ChatGPT account was performed.

## 27. Evidence Classification

Experimentally verified:

- browser-flow attempt was unsuccessful in the selected Docker topology.
- pre-enablement strict device-code request was sent using the generated
  protocol payload.
- pre-enablement strict device-code request was rejected with JSON-RPC code
  `-32603`.
- post-enablement Docker app-server strict device-code request was sent using
  the same generated protocol payload.
- post-enablement Docker app-server strict device-code request was rejected
  before issuing a verification URL, user code, or login id.
- pre-login account state was unauthenticated.
- exercised safe RPCs did not expose raw credentials.
- probe identity could not inspect the private Codex state directory.
- no inbound host ports are published by the auth lifecycle profile.
- same-container HTTPS reached the device-auth endpoint host/path and returned
  an HTTP `4xx` category.
- official pinned Docker CLI device-auth failed before issuing a code.
- isolated host Codex `0.146.0` CLI device-auth failed before issuing a code.
- current official npm package version equals the pinned version.

User-reported manual control:

- After account/workspace device-code enablement, isolated host
  `codex-cli 0.146.0` with temporary `CODEX_HOME` succeeded and issued an
  official verification URL and one-time code. This repository does not contain
  the user code, the resulting credential state, account identifiers, or copied
  auth files.

Verified from generated protocol artifacts:

- `chatgptDeviceCode` login discriminant exists.
- expected response shape includes `loginId`, `verificationUrl`, and
  `userCode`.
- login completion notification is `account/login/completed`.
- account update notification is `account/updated`.
- cancellation and logout operations exist.

Inference:

- Browser flow likely needs callback forwarding or bridging in Docker and is
  not suitable for this candidate topology as-is.
- Post-enablement failure is specific to the bounded Docker app-server path or
  its environment. It is not explained solely by account/workspace device-code
  authorization, because the isolated host CLI succeeded after enablement.
- A basic Docker TLS/CA/DNS outage remains less likely than an app-server RPC or
  Docker-runtime-specific difference because the endpoint host/path was
  reachable from the same container in the prior diagnostic.

Unverified:

- all authenticated lifecycle gates listed above.
- pinned Docker CLI behavior after account/workspace device-code enablement.

## 28. Completion Decision

T191 remains incomplete. Mandatory completion gates that failed or remain
unverified:

- official device-code login succeeds
- `account/read` reports authenticated ChatGPT state
- authentication survives container recreation with the same volume
- login cancellation is verified for device-code flow
- authenticated logout is verified
- unauthenticated state survives restart after logout
- final reauthentication succeeds
- final dedicated volume is authenticated for T192

T192-T195 remain incomplete. Production Codex adapter tasks T164-T165 remain
incomplete.

## 29. Final Device-Code Classification

Final device-code classification is preserved as historical evidence, not
retried:

- Generated Codex `0.146.0` protocol artifacts expose
  `chatgptDeviceCode`.
- Docker app-server device-code initiation was rejected before verification
  URL or user-code issuance.
- The official controlled CLI device-auth diagnostic failed in the same
  general stage.
- Enabling device-code authorization did not change the Docker app-server
  result.
- Basic Docker DNS, TCP, TLS, and CA reachability did not explain the
  device-code failure.

Repeated device-code retries are no longer required for T191.

## 30. Callback-Relay Architecture

The final bounded candidate used the official generated-protocol browser login:

- Request method: `account/login/start`
- Params: `{ "type": "chatgpt" }`
- Expected response shape: `type`, `loginId`, `authUrl`
- Runtime: `@openai/codex@0.146.0`
- Base image: `node:24.15.0-bookworm-slim`
- Topology: managed child process over JSON-RPC stdio
- State: fresh dedicated Docker named volume
  `nuvitae_codex_app_server_auth_state_t191`

The spike added a minimal raw TCP relay inside
`spikes/codex-app-server-runtime/auth-lifecycle-runner.mjs`. The relay maps
the selected host loopback callback port to the Codex callback listener inside
the same trusted runtime boundary:

- Host `127.0.0.1:1455` to container relay port `2455` to Codex listener
  `127.0.0.1:1455`
- Host `127.0.0.1:1457` to container relay port `2457` to Codex listener
  `127.0.0.1:1457`

The official authorization URL selected callback port `1455` for this run.

## 31. Callback-Relay Trust Boundary

The relay is spike-only and runs in the trusted auth lifecycle container. It is
not run as the Nuvitae probe identity. It performs raw bidirectional TCP
forwarding only and does not parse HTTP, inspect query parameters, log callback
payloads, persist requests, persist authorization codes, or handle access,
refresh, or ID tokens.

The relay uses a bounded connection count of 4 and a 120-second idle timeout
for relayed sockets. It starts only during pending browser login and stops
after completion, failure, cancellation, or timeout. No Docker socket, host
home directory, host `~/.codex`, PostgreSQL, Valkey, private resume storage, or
production application mount is present.

Explicitly rejected for T191: Docker socket mounting, `docker exec` or
`docker attach` as the callback mechanism, Docker Engine API access from the
runtime, host networking as the default solution, LAN/public exposure,
HTTP-aware OAuth proxying, callback payload inspection, direct OAuth
implementation, copied auth caches, and API-key authentication as a substitute
for ChatGPT subscription authentication.

## 32. Loopback-Only Port Publication

The spike-only Compose service publishes callback candidates only on host
loopback:

- `127.0.0.1:1455 -> 2455/tcp`
- `127.0.0.1:1457 -> 2457/tcp`

Host-side validation during the pending login showed listeners on
`127.0.0.1:1455` and `127.0.0.1:1457`, and Docker metadata reported only
loopback host publications. No `0.0.0.0` callback publication was observed.

Because Docker port publication is static for this one-container spike, both
candidate host ports are published during the pending login window. The relay
itself is started only for the selected Codex callback port when the official
authorization URL has been validated.

## 33. Authorization URL Validation

The official browser login returned a response with shape:

- `type`
- `loginId`
- `authUrl`

The complete authorization URL was displayed only in the live terminal and was
not written to repository evidence. The in-memory validation passed:

- Authorization URL scheme: `https`
- Authorization host: `auth.openai.com`
- Redirect scheme: `http`
- Redirect host: `localhost`
- Redirect path: `/auth/callback`
- Callback port: `1455`

The validation fails closed for unexpected authorization scheme, authorization
host, redirect scheme, redirect host, redirect path, or redirect port.

## 34. Callback Reachability

Before asking for browser completion, the runner verified:

- Codex listener reachability category: `tcp_connect_succeeded`
- Relay reachability category: `tcp_connect_succeeded`
- Selected callback port: `1455`
- Selected container relay port: `2455`

No fake OAuth callback request with query parameters was generated.

## 35. Browser-Login Completion

The browser-login start operation succeeded and the relay was reachable, but
the authenticated lifecycle did not pass. The app-server did not produce a
usable authenticated state before the lifecycle runner failed the mandatory
gate.

Safe classification:

- Browser login request supported: yes
- Authorization URL validation passed: yes
- Callback listener reachable through the relay: yes
- `account/login/completed` success: not observed
- `account/updated` authenticated state: not observed
- Post-login `account/read` authenticated state: no

Because reachability was demonstrated but the official login still failed to
produce authenticated app-server state, T191 remains incomplete and no
alternative authentication workaround was added.

## 36. Account/Login/Completed

Mandatory notification gate result:

- `account/login/completed`: not observed for the initial browser-login run
- Success flag: not observed

The runner did not infer success from any browser page.

## 37. Account/Updated

Mandatory notification gate result:

- `account/updated`: not observed with authenticated ChatGPT state

No account email, account name, complete account identifier, organization name,
or personal account data was persisted.

## 38. Authenticated Account/Read

Pre-login `account/read` result:

- Authenticated: no
- `requiresOpenaiAuth`: true

Post-login `account/read` result:

- Authenticated: no
- `requiresOpenaiAuth`: true

## 39. Restart Persistence

Authenticated restart persistence was not reached because the first browser
login did not produce authenticated app-server state.

## 40. Cancellation

Authenticated-session-safe pending-login cancellation was not reached because
the first authenticated session was not established.

## 41. Authenticated Logout

Authenticated logout was not reached because the first authenticated session
was not established.

## 42. Unauthenticated Restart State

Unauthenticated restart-after-logout validation was not reached because
authenticated logout was not reached.

## 43. Final Reauthentication

Final browser reauthentication was not reached. The dedicated private volume
was not left in an authenticated state for T192.

## 44. Token-Blindness

Token-blindness remained intact for consumed RPCs and evidence:

- No access token reached the probe or evidence.
- No refresh token reached the probe or evidence.
- No ID token reached the probe or evidence.
- No authorization code reached the probe or evidence.
- No callback query string was logged or persisted.
- No cookies were requested, logged, or persisted.
- The complete authorization URL was not written to evidence files or docs.

The runner redacts URL-like strings before evidence writes and stores only safe
metadata such as response shapes, selected callback port, lifecycle categories,
and booleans.

## 45. Filesystem Credential Isolation

The private Codex state volume used separate operating-system identities:

- Trusted Codex runtime: UID/GID `10001:10001`
- Nuvitae probe identity: UID/GID `10002:10002`
- State directory: `/codex-state`, mode `0700`

The Nuvitae probe identity was denied:

- listing `/codex-state`
- statting a known synthetic sentinel file
- reading the known synthetic sentinel file
- copying the known synthetic sentinel file
- modifying the known synthetic sentinel file
- deleting the known synthetic sentinel file

No real credential contents were printed or inspected.

## 46. Relay Teardown

After the failed lifecycle attempt, the auth container exited and host checks
showed no listener on:

- `127.0.0.1:1455`
- `127.0.0.1:1457`

Docker metadata showed no remaining auth lifecycle container and no remaining
callback-port publication.

## 47. Remaining Limitations And Risks

Remaining unverified scenarios:

- successful ChatGPT subscription authentication through app-server browser
  login in this Docker topology
- `account/login/completed` success
- authenticated `account/updated`
- authenticated `account/read`
- authenticated restart persistence
- pending-login cancellation while preserving an authenticated profile
- authenticated logout
- unauthenticated restart after logout
- final reauthentication for T192 volume carry-forward
- token refresh after natural expiry
- expired or revoked authentication
- runtime crash during login
- provider network failure after login start
- rate limiting during authentication

T191 remains incomplete. T192-T195 remain incomplete. Production Codex adapter
tasks T164-T165 remain incomplete. No credentials or personal account data were
committed.
