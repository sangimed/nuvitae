# Codex App-Server Security And Product Review

Task: T194  
Date: 2026-07-30  
Scope: self-hosted security and product-suitability review only. This report does not implement production Codex adapter work, does not retry authentication, does not run semantic parsing, does not integrate Codex into the worker/API/web application/persistence layer/resume-import pipeline, and does not make the formal T195 GO, CONDITIONAL GO, or NO-GO decision.

## 1. Executive Summary

The current official Codex app-server candidate is blocked for production use by authentication operability. The bounded T191 investigation produced no authenticated Codex runtime: device-code initiation failed before verification URL or user-code issuance, and the final browser-login flow produced a valid official authorization URL plus reachable loopback callback relay, but did not produce successful `account/login/completed`, authenticated `account/updated`, or authenticated `account/read`.

The security boundary demonstrated by T190-T191 is useful but incomplete. In the bounded spike, Nuvitae stayed token-blind, app-server RPCs exercised by the probe did not expose raw credentials, the probe identity could not access the private Codex state directory, the runtime did not inherit host Codex credentials, repository files, private import storage, PostgreSQL, Valkey, Docker socket, host MCP configuration, or host plugin configuration, and callback publication was loopback-only and temporary. Those results support the feasibility of a contained spike boundary, not production readiness.

No semantic parsing evidence exists. T192 was not executed because authentication never passed. T193 was not executed because T192 did not produce an authenticated semantic invocation. Therefore no production-quality extraction claim can be made, and all semantic quality, latency, quota, cancellation, and authenticated recovery metrics remain unverified rather than zero.

Product suitability is poor for the present self-hosted MVP. Technical early adopters may be able to reproduce and diagnose the spike, but non-technical self-hosted users cannot be expected to complete an authentication journey that failed under multiple official mechanisms in the tested topology. Production Codex-specific implementation tasks T164-T165 remain blocked. T195 must choose between NO-GO and a narrowly scoped CONDITIONAL GO; a normal GO is not supported by the current evidence.

## 2. Scope And Evidence Basis

Primary evidence:

- `docs/research/codex-app-server-protocol-and-compatibility.md`
- `docs/research/codex-app-server-runtime-isolation.md`
- `docs/research/codex-app-server-authentication-lifecycle.md`
- Sanitized evidence under `spikes/codex-app-server-runtime/evidence/`
- Bounded spike assets under `spikes/codex-app-server-runtime/`
- `specs/001-import-resume/spec.md`
- `specs/001-import-resume/plan.md`
- `specs/001-import-resume/research.md`
- `specs/001-import-resume/data-model.md`
- `specs/001-import-resume/contracts/import-resume.md`
- `specs/001-import-resume/quickstart.md`
- `specs/001-import-resume/tasks.md`

Unsupported claims in planning documents are not treated as verified. Planning documents are used for product requirements, intended boundaries, and task status. Experimental claims are taken only from the completed T189-T191 reports and sanitized spike evidence.

This review explicitly preserves that T189 and T190 are complete, T191 is complete only as a research task with terminal result `BLOCKED`, T192 and T193 remain incomplete, blocked, and not executed, T194 is the current review task, and T195 remains incomplete.

## 3. Experimentally Verified Findings

T189 verified the official `@openai/codex` version as `0.146.0`, generated protocol artifacts from that exact installed version, and proved app-server JSON-RPC initialization over newline-delimited stdio with explicit Nuvitae client metadata. It identified stable account, login, thread, turn, cancellation, logout, and model operations, and recorded version coupling plus protocol compatibility risks.

T190 verified Linux Docker execution using `@openai/codex` `0.146.0`. Managed child process over stdio was the selected runtime topology. Unix-socket sidecar topology was advertised and created a socket, but it was unusable for initialization in the bounded test. Selected runtime isolation checks passed: no host Codex credentials, repository, private import storage, PostgreSQL, Valkey, Docker socket, host MCP configuration, or host plugin configuration were exposed. Process startup, request correlation, notification collection, graceful stdin closure, forced termination of a stuck malformed-input process, bounded restart, and no remaining Codex child process after the stdio run were observed.

T191 verified that generated protocol artifacts include `chatgptDeviceCode`. Device-code initiation failed before URL/code issuance. Official controlled CLI device authentication failed at the same general stage in the recorded controls. Isolated Docker and host controls did not establish authentication in the recorded artifact set, and enabling device-code authorization did not change the Docker app-server result. Basic Docker DNS, TCP, TLS, and CA reachability did not explain the failure. The final browser-login authorization URL and redirect URI were valid; the callback host was `auth.openai.com`; callback port `1455` was selected; host callback publication was loopback-only; the callback relay and Codex callback listener were reachable; authentication still did not complete. No successful `account/login/completed`, authenticated `account/updated`, or authenticated `account/read` was observed. `account/read` remained unauthenticated.

The Nuvitae probe could not access protected Codex state. No raw token, authorization code, complete authorization URL, credential content, or personal account information was persisted. Callback relay ports were removed after failure. The terminal result is `BLOCKED`.

## 4. Blocked And Unverified Findings

No authenticated Codex runtime was produced. T192 semantic invocation was not executed. T193 authenticated quality and failure evaluation was not executed. No real semantic parsing result was obtained. No production-quality extraction claim can be made.

The following metrics remain unverified, not zero, and are not estimated:

- invocation success rate
- schema-valid response rate
- field precision
- field recall
- work-experience grouping accuracy
- valid-evidence rate
- unsupported-evidence rate
- invented-field rate
- authenticated turn latency
- cancellation latency
- quota or rate-limit behavior
- authenticated restart recovery
- authenticated session recovery
- token refresh behavior
- expired or revoked authentication behavior

Unverified model-triggered behavior includes authenticated shell, file-editing, web/network, MCP, plugin, and tool capabilities. T190 neutralized host inheritance and private mounts for the bounded runtime, but did not run an authenticated model turn.

## 5. Authentication Operability Review

Device-code behavior is blocked in the bounded app-server path. Generated Codex `0.146.0` artifacts expose `chatgptDeviceCode`, but app-server login start was rejected before verification URL or user-code issuance. The official controlled CLI path also failed in the same general stage in recorded controls, and enabling device-code authorization did not change the observed Docker app-server outcome.

Browser-flow behavior is also blocked for production purposes. The final candidate used official `account/login/start` with `type: chatgpt`; Codex produced an authorization URL; validation confirmed HTTPS `auth.openai.com`, localhost redirect, `/auth/callback`, and callback port `1455`; the raw TCP callback relay and Codex callback listener were reachable. Despite that, no completed login notification or authenticated account state was observed.

The callback relay requirement adds operational complexity. It must remain loopback-only, raw TCP only, temporary, inside the trusted Codex runtime boundary, and must never parse OAuth payloads or expose callback query strings. The spike validated this shape in a bounded run, but relying on it for non-technical self-hosted users would require robust diagnostics, teardown guarantees, port-conflict handling, and clear recovery states.

Failure diagnostics are insufficient for production support. The recorded safe categories identify where the lifecycle failed without leaking secrets, but they do not distinguish all account, workspace, subscription, browser, callback, Codex runtime, or environment causes. Account/workspace dependency remains material because a user-reported isolated host control succeeded after device-code enablement, while Docker app-server still failed.

Lifecycle operations not validated because no authenticated session was established: authenticated `account/read`, login completion, authenticated account update, authenticated restart persistence, pending-login cancellation while preserving an authenticated profile, authenticated logout, unauthenticated restart after logout, final reauthentication, token refresh, refresh-token rotation, expired authentication handling, revoked authentication handling, quota/rate-limit state, authenticated reconnect, and authenticated session recovery.

Logout and reconnect are feasible only as generated protocol operations and product requirements at this point. They are not validated as working lifecycle behavior for an authenticated Codex session.

## 6. Token-Blindness And Credential-Boundary Review

The proposed architecture keeps Nuvitae token-blind by design if the official Codex runtime owns login, credential persistence, refresh, rotation, expiry, session recovery, and logout, while Nuvitae records only provider-neutral connection state. This aligns with the spec and data model.

Bounded spike evidence supports token-blindness for exercised RPCs and evidence writes. `account/read`, `getAuthStatus` with token exclusion, login-start responses, and safe evidence did not expose raw access tokens, refresh tokens, ID tokens, authorization codes, cookies, complete authorization URLs, credential-file contents, account emails, account names, or organization names.

Filesystem ownership and permissions were tested with separate identities. The trusted Codex runtime used UID/GID `10001:10001`; the Nuvitae probe used UID/GID `10002:10002`; `/codex-state` was mode `0700`; the probe was denied listing, statting, reading, copying, modifying, and deleting a known sentinel under protected state. This demonstrates the bounded credential boundary for the spike identity model.

Risk remains because the selected managed-child-process topology puts the Nuvitae probe/client process and Codex process in one container boundary. Operating-system identity separation helps, but production hardening would still need process supervision, least-privilege execution, read-only root filesystem, explicit writable paths, no accidental same-UID fallback, volume lifecycle controls, and regression tests proving the application identity cannot read provider state.

Token refresh and rotation were not verified. Credential persistence was not verified because authentication did not complete. The demonstrated boundary is sufficient for a bounded unauthenticated/auth-failed spike, not for production approval.

## 7. Runtime And Process-Isolation Review

Managed child-process lifecycle ownership is the selected topology. T190 verified Docker startup, newline-delimited stdio JSON-RPC initialization, request/response correlation, notification collection, graceful process exit on stdin close, forced termination of a stuck malformed-input child, and bounded restart after shutdown.

Runtime resource controls were configured and partially exercised: non-root user, read-only root filesystem for candidate A, private Codex state, empty tmpfs workspace, bounded tmpfs temp paths, dropped Linux capabilities, `no-new-privileges`, CPU/memory/process bounds, explicit timeouts, controlled stdout/stderr, and deterministic cleanup of spike volumes. Memory exhaustion and authenticated turn behavior were not measured.

Filesystem isolation was tested for the bounded spike. No Nuvitae repository mount, no private resume storage mount, no host home, no host Codex config, no host MCP config, no host plugin config, no Docker socket, no PostgreSQL, and no Valkey connectivity were observed in the selected topology. Environment allowlisting passed the host-leakage goal, with only configured variables and base-image variables visible.

Temporary workspace behavior was appropriate for the spike: the workspace was empty tmpfs and writes succeeded only in intended tmpfs/state paths. Logging boundaries were privacy-safe for synthetic evidence: bounded stderr, safe response shapes, request ids, booleans, and categories were persisted.

Model-triggered capabilities remain unverified. Generated protocol surfaces include operations that could be relevant to shell, file, plugin, MCP, and web behavior, but no authenticated turn was run. Therefore this review cannot claim these capabilities are disabled. It can only state that the bounded runtime excluded sensitive mounts and network access where configured.

## 8. Network And Callback Review

Provider use requires outbound network access to official Codex/OpenAI/ChatGPT endpoints for authentication and invocation. T191 diagnostics indicate a basic Docker DNS/TCP/TLS/CA outage did not explain the device-code failure, but authenticated provider invocation was never reached.

The selected runtime does not require a normal long-running inbound service for semantic parsing. Browser login may require a temporary loopback callback path. The spike published callback candidates only on host loopback and used a raw TCP relay inside the trusted Codex runtime boundary. The complete authorization URL and callback query string were not persisted. After failure, host checks showed no listener remaining on callback ports and no remaining callback-port publication.

The callback relay is a trust boundary. It must remain raw TCP forwarding only and must not parse HTTP, inspect OAuth data, log callback payloads, persist callback requests, handle authorization codes, expose tokens, mount the Docker socket, or use public/LAN binding. Public callback exposure is not recommended.

Risks remain for callback-port conflicts, stale relay listeners, stale Docker publications, remote servers where a browser is not local to the Docker host, headless installations, and multi-user self-hosted behavior. A non-technical self-hosted user may not understand why a local callback fails on a remote machine, SSH tunnel, NAS, or managed Docker host.

## 9. Privacy And Document-Data Review

The intended semantic parsing input is deterministically extracted text with stable page, block, line, or fragment identifiers and compact layout hints, not original PDF or DOCX files. This minimizes provider disclosure and supports grounding. T192 would have used only synthetic anonymous fixtures with no original document mounts into Codex.

The spike used no real resumes and did not transmit actual document content through an authenticated Codex turn. Therefore provider-side document processing behavior was not experimentally validated. Missing evidence includes actual authenticated document transmission behavior, provider retention or processing semantics as observed through app-server, and whether diagnostics during real parsing remain privacy-safe.

The planned product boundary requires user disclosure that resume content is sent to the configured AI provider when provider-backed semantic parsing is used. Logs must exclude full resumes, raw extracted text, source snippets, uploaded files, prompts, provider payloads, credentials, session material, tokens, and unnecessary personal data. T190-T191 evidence handling followed safe redaction for spike metadata, but this does not validate production document-data logging.

Temporary execution state and cleanup were validated only for spike containers, tmpfs paths, callback relay teardown, and absence of sensitive committed evidence. Deletion and cleanup for real imported source artifacts remain provider-independent product work, not Codex-specific validated behavior.

## 10. Self-Hosted Installation And Onboarding Review

The expected self-hosted journey is materially heavier than the base Nuvitae Docker start:

- start the Docker stack
- connect a ChatGPT subscription through official Codex app-server authentication
- receive clear login-pending and failed-login feedback
- diagnose failed device-code or browser login
- reconnect after expired or revoked authentication
- disconnect/logout safely
- upgrade Codex when supported
- recover from corrupted private Codex state
- delete provider state without deleting uploaded resumes or structured resumes

The current tested authentication journey did not succeed despite multiple official mechanisms. Device code failed before URL/code issuance in the Docker app-server path. Browser login produced a valid URL and reachable callback relay but no authenticated state. This is not suitable for non-technical self-hosted users.

Technical early adopters may be able to run the spike and inspect safe evidence, but the support burden is high. Product onboarding would need a precise failure taxonomy, safe diagnostics, callback-port checks, account/workspace checks, state-volume inspection without secrets, logout/reconnect guidance, and a documented state reset path. Those lifecycle operations were not validated successfully.

## 11. Operational-Complexity Review

Codex version pinning is mandatory. T189 generated protocol artifacts from exact version `0.146.0`, and T190/T191 evidence is scoped to that version and tested topology. Generated protocol compatibility must be checked on every upgrade because request/response shapes and operation availability are version-coupled.

Docker image maintenance is non-trivial. The spike image installed `@openai/codex@0.146.0`, ran non-root, configured bounded resources, used private volumes and tmpfs, and surfaced a `bubblewrap` runtime warning. Production would require deciding whether to install system sandbox prerequisites, maintaining the image, and validating platform differences.

Process supervision, private state volume lifecycle, authentication troubleshooting, callback relay lifecycle, upgrade validation, regression testing, support documentation, and observability without secret leakage are all required production work. This complexity must be compared with the product value expected from using a user's existing ChatGPT subscription. Current evidence does not show that value because login and semantic parsing did not complete.

The hosted commercial provider remains out of scope for this review.

## 12. Version And Protocol-Coupling Review

The candidate depends exactly on Codex `0.146.0`. Stable protocol artifacts produced request methods for initialization, account/login/logout, account state, threads, turns, cancellation, and model listing. Experimental-inclusive artifacts added more methods, but experimental operations should not be used for the initial production candidate.

There is no generated app-server shutdown RPC. Runtime shutdown is currently process/transport behavior: closing stdin caused the stdio app-server to exit with code `0` in T189/T190 probes. Production lifecycle must therefore supervise the child process directly and fail closed when it cannot guarantee clean shutdown.

Upgrade risks include protocol incompatibility, changed login behavior, changed callback behavior, changed account state shapes, altered notification names, model availability differences, and new or removed capability surfaces. Compatibility must fail closed: if generated artifacts or runtime probes do not match the supported version policy, Codex-backed parsing must remain unavailable.

No claim is made that future versions will fix authentication. A newer version is only a reevaluation trigger if it contains a relevant official authentication change or if bounded delta validation succeeds.

## 13. Product-Suitability Review

Present self-hosted MVP: unsuitable or blocked based on current evidence. Authentication is a mandatory failed production gate, and no semantic extraction was executed.

Technical early adopters: possibly suitable only for bounded spike reproduction and diagnostics, not for unattended resume import. The path requires comfort with Docker, safe evidence review, callback troubleshooting, and version pinning.

Non-technical self-hosted users: unsuitable. The authentication journey failed under the tested official mechanisms and would create a high support burden.

Unattended semantic resume imports: unsuitable. No authenticated session, no non-interactive turn, no structured output, no grounding, no no-invention behavior, no cancellation, and no recovery behavior were validated.

Repeatable local development: partially suitable for unauthenticated protocol and isolation research. T189/T190 are repeatable enough for protocol/runtime checks; T191 authentication is blocked and account/workspace dependent.

Production Codex-specific implementation: blocked. Do not mark T164-T165 ready.

This report does not make the T195 formal decision.

## 14. Missing Semantic Evidence

Because T192 and T193 did not execute, the project lacks evidence that Codex can reliably parse resumes through app-server. Missing evidence includes strict structured-output reliability, grounding rate, no-invention behavior, multilingual quality, multi-column quality, latency, quota behavior, authenticated cancellation, restart recovery, session recovery, token refresh, expired-auth handling, and revoked-auth handling.

Product decisions that cannot be made without this evidence:

- whether Codex app-server can satisfy the provider-independent semantic parser contract
- whether Codex output can pass strict Nuvitae schema validation reliably
- whether AI-produced fields can be grounded to source identifiers
- whether invented fields can be detected or prevented at an acceptable level
- whether French, English, bilingual, single-column, and multi-column resumes are handled well enough
- whether latency fits the foreground timeout and worker model
- whether cancellation and restart recovery are reliable enough for unattended imports
- whether quota, rate-limit, expired-auth, and revoked-auth states can be mapped to user-safe recovery
- whether production Codex-specific tasks T164-T165 should begin

## 15. Risk Register

| Risk ID | Risk Description | Evidence | Likelihood | Impact | Current Mitigation | Residual Risk | Production Disposition | Reevaluation Trigger |
|---|---|---|---|---|---|---|---|---|
| R-CODEX-AUTH-UNAVAILABLE | Official Codex app-server authentication is unavailable in the tested self-hosted Docker topology. | T191: device-code rejected before code issuance; browser login did not produce completed/authenticated state. | high | critical | Do not execute T192/T193; keep T164-T165 blocked. | Critical blocker remains. | Failed mandatory production gate. | Relevant Codex auth fix, official resolution, account/workspace change, supported auth mechanism, or successful bounded Docker reproduction. |
| R-CODEX-VERSION-COUPLING | Runtime behavior and protocol shapes are tightly coupled to Codex `0.146.0`. | T189 generated artifacts from exact version; T190/T191 scoped to same version. | high | high | Pin version; derive operations from generated artifacts. | Upgrade can silently break login, protocol, or lifecycle. | Require fail-closed supported-version policy. | New Codex version or protocol delta. |
| R-CODEX-DIAGNOSTICS-INCOMPLETE | Failure diagnostics do not identify all account/workspace/environment causes. | T191 safe categories and account/workspace dependency remained inconclusive. | high | high | Persist only safe categories; avoid secret capture. | Support may be unable to resolve user login failures. | Block non-technical onboarding until diagnostics improve. | Official documented resolution or confirmed account/workspace change. |
| R-CODEX-CALLBACK-RELAY | Browser login requires temporary callback relay complexity. | T191 loopback relay reachable, but login still failed. | medium | high | Loopback-only binding, raw TCP, teardown after failure, no payload logging. | Port conflicts, stale listeners, remote-host setups, and support burden remain. | Do not expose publicly; require hardened relay tests before production. | Successful bounded browser auth reproduction. |
| R-CODEX-SHARED-CONTAINER-BOUNDARY | Nuvitae client and Codex process share one container boundary. | T191 separate UIDs and `0700` state denied probe access; same container still contains both processes. | medium | high | Separate OS identities, read-only rootfs, private state, no sensitive mounts. | Misconfiguration could collapse identity separation or expose state. | Require production hardening and regression tests. | Successful authenticated lifecycle plus credential isolation tests. |
| R-CODEX-UPGRADE-INCOMPAT | Protocol incompatibility after upgrade can break login or invocation. | T189 stable versus experimental inventory; no shutdown RPC; generated artifacts are version-specific. | high | high | Generate artifacts per version and fail closed. | Every upgrade needs bounded validation. | No auto-upgrade without delta validation. | New generated protocol artifacts. |
| R-CODEX-TOOLS-UNVERIFIED | Model-triggered tool capabilities may exceed semantic parsing needs. | T190 host inheritance neutralized; authenticated turns not run. | unverified | high | Empty workspace, no repo/private storage, no Docker socket, no DB/queue. | Authenticated shell/file/web/MCP/plugin behavior unknown. | Block production until T192/T193 or equivalent verifies restrictions. | Successful authenticated semantic invocation and tool-capability evaluation. |
| R-CODEX-SEMANTIC-MISSING | Semantic parsing quality is unknown. | T192 and T193 not executed. | unverified | critical | Do not claim parsing quality; keep T164-T165 blocked. | Product value unproven. | Failed semantic-evidence gate for normal GO. | Successful T192 and T193. |
| R-CODEX-LOG-SECRET-LEAKAGE | Logs or evidence may leak secrets in production flows. | T190/T191 secret-safe evidence passed for spike; real authenticated parsing not executed. | medium | high | Redaction, safe categories, no complete URLs, no tokens, secret scanner. | Authenticated parse logs and provider errors unverified. | Require logging tests before production. | Authenticated lifecycle and semantic parse diagnostics. |
| R-CODEX-MULTIUSER-STATE | Multi-user provider state isolation may fail in self-hosted deployments. | T191 used one private state volume and separate probe identity; no multi-user authenticated sessions. | unverified | high | Intended owner-scoped provider connection model. | Cross-user session isolation unproven. | Require multi-user credential isolation tests. | Successful authentication plus multi-user test design. |
| R-CODEX-SUPPORT-BURDEN | Non-technical users may be unable to connect or recover Codex. | T191 failed despite official mechanisms; callback relay and account/workspace dependency remain. | high | high | Keep feature blocked; document failure categories. | High support load and poor onboarding. | Unsuitable for non-technical MVP unless resolved. | Official simplified auth flow or successful reproducible onboarding. |

## 16. Capability Matrix

| Capability | Required For MVP | Current Status | Evidence | Blocker | Production Requirement |
|---|---|---|---|---|---|
| Protocol initialization | yes | verified | T189/T190 stdio `initialize` succeeded. | none for pinned version | Generate artifacts and initialize in supported Docker runtime. |
| Docker execution | yes | verified for spike | T190 Linux Docker app-server startup with `@openai/codex@0.146.0`. | none for unauthenticated spike | Maintain hardened image and supported platform policy. |
| Runtime isolation | yes | partially verified | T190 isolation matrix passed selected checks. | Authenticated model-triggered capabilities unverified. | Validate authenticated tool/network/file behavior and hardening. |
| Token blindness | yes | partially verified | T191 exercised RPCs and evidence exposed no raw credentials; probe denied state access. | No authenticated credential persistence or refresh. | Verify authenticated lifecycle without token exposure. |
| ChatGPT login | yes | blocked | T191 device-code and browser-flow failed to authenticate. | No completed login or authenticated account state. | Successful official login in bounded Docker topology. |
| Session persistence | yes | unverified | T191 did not create authenticated state. | No authenticated runtime. | Authentication survives container recreation. |
| Logout | yes | unverified | Generated operation exists; authenticated logout not reached. | No authenticated session. | Authenticated logout succeeds and clears state. |
| Reconnect | yes | unverified | Product requirement and protocol basis only. | No authenticated lifecycle. | Expired/revoked/reconnect flows validated. |
| Semantic invocation | yes | blocked | T192 not executed. | Authentication gate failed. | Authenticated non-interactive invocation succeeds. |
| Structured output | yes | unverified | Generated turn supports output schema; T192 not run. | No semantic invocation. | Strict schema-valid provider-neutral response. |
| Grounding | yes | unverified | Product contract requires evidence; no Codex parse result. | T192/T193 blocked. | Evidence references validated against source representation. |
| No-invention behavior | yes | unverified | Product contract requires no-invention checks; no evaluation. | T193 blocked. | Invented values rejected or marked unusable. |
| Multilingual parsing | yes | unverified | Required by spec for French/English/bilingual; no Codex parse. | T192/T193 blocked. | Fixture evaluation across supported languages. |
| Multi-column parsing | yes | unverified | Required by T192/T193; no Codex parse. | T192/T193 blocked. | Fixture evaluation for multi-column layouts. |
| Latency | yes | unverified | Authenticated turn latency not measured. | No authenticated turn. | Meets product foreground/recovery expectations. |
| Cancellation | yes | unverified | `turn/interrupt` exists; authenticated cancellation not measured. | No authenticated turn. | Cancellation latency and cleanup validated. |
| Failure recovery | yes | unverified for authenticated Codex | T190 restart checks unauthenticated; T193 not run. | No T192/T193 execution. | Crash, restart, network, malformed output, auth recovery tested. |
| Quota handling | yes | unverified | Account usage/rate operations exist; behavior not measured. | No authenticated account. | Quota/rate-limit states mapped to recovery. |
| Upgrade compatibility | yes | partially verified | T189 generated artifacts and classified operations for `0.146.0`. | Future deltas unknown. | Bounded delta validation and fail-closed policy. |

## 17. Objective Reevaluation Triggers

A future bounded reevaluation is justified only by objective triggers:

- Newer official Codex version with relevant authentication change or fix. Minimum delta validation: regenerate T189 protocol artifacts, compare login/session/turn operation deltas, rerun T190 Linux Docker initialization/isolation checks, rerun full T191 authentication lifecycle, then execute T192 and T193 if authentication succeeds.
- Official OpenAI-documented resolution for the observed behavior. Minimum delta validation: reproduce the documented fix in the same managed child-process Docker topology, verify token-blindness, complete T191 lifecycle, then run T192/T193.
- Confirmed account or workspace configuration change. Minimum delta validation: rerun only the affected T191 login paths first, then perform restart persistence, logout, reauthentication, and credential-boundary checks before T192/T193.
- Supported official authentication mechanism preserving token-blindness. Minimum delta validation: derive operation shapes from generated artifacts or official docs, prove Nuvitae never handles tokens/auth files, complete login/reconnect/logout/restart lifecycle, then run semantic invocation/evaluation.
- Successful reproduction of authentication in the same bounded Docker topology. Minimum delta validation: preserve safe evidence for successful `account/login/completed`, authenticated `account/updated`, authenticated `account/read`, restart persistence, logout, unauthenticated restart, and reauthentication; then run T192/T193.
- Protocol changes relevant to login or session lifecycle. Minimum delta validation: regenerate artifacts, classify stable versus experimental operations, prove fail-closed compatibility behavior, rerun affected T190/T191 checks, then run T192/T193 if authenticated.

Every reevaluation must cover, at minimum, affected T189 protocol findings, T190 compatibility and isolation delta, complete T191 authentication lifecycle, T192 semantic invocation, and T193 quality and failure evaluation. A reevaluation must not silently unblock T164-T165; T195 or a new explicit decision gate must record the production disposition.

## 18. Implications For T195

Factual handoff to T195:

- authentication is a mandatory failed production gate
- T192-T193 were blocked and not executed
- semantic quality remains unknown
- provider-independent Nuvitae work remains valid
- T164-T165 remain blocked
- T195 must choose between NO-GO and a narrowly scoped CONDITIONAL GO
- a normal GO is not supported by current evidence
- a CONDITIONAL GO must not authorize production implementation until all mandatory conditions are experimentally satisfied

This report does not choose the formal T195 decision.

## 19. Evidence Classification

Experimentally verified evidence:

- Codex `0.146.0` protocol initialization over newline-delimited stdio.
- Generated protocol artifacts from exact installed version.
- Linux Docker app-server startup for the selected stdio topology.
- Request/response correlation, notifications, account read unauthenticated state, model-list response shape, graceful stdin closure, forced termination, bounded restart, and no remaining child process.
- Host leakage checks for repository, private storage, host Codex state, host MCP/plugin sentinels, Docker socket, PostgreSQL, and Valkey in the bounded topology.
- Device-code request rejection before URL/code issuance.
- Browser login URL validation, callback port `1455`, loopback-only callback publication, relay/listener reachability, and relay teardown.
- Probe denial against protected Codex state.
- No raw credentials or complete authorization URL persisted in evidence.

Generated protocol evidence:

- Stable account, login, cancellation, logout, thread, turn, model, and notification operation shapes for Codex `0.146.0`.
- `chatgptDeviceCode`, `chatgpt`, and logout/cancel operations exist in generated artifacts.
- `turn/interrupt` exists for cancellation, but authenticated behavior was not measured.
- No generated app-server shutdown RPC was found.

Official behavior already recorded in research artifacts:

- Official app-server source/docs support protocol artifact generation and app-server subcommands.
- WebSocket transport is experimental/unsupported for this candidate and remains rejected.
- Runtime help advertises stdio and Unix-socket options; Unix-socket failed in the bounded topology.

Inference:

- Managed stdio is less operationally complex than the rejected sidecar for this candidate.
- Browser flow needs reliable callback forwarding in Docker and remains unsuitable as currently observed.
- Basic Docker DNS/TCP/TLS/CA failure is not the likely sole cause of device-code failure.
- The current path is unsuitable or blocked for the present self-hosted MVP, subject to T195 decision.

Unverified behavior:

- Successful ChatGPT authentication through app-server.
- Authenticated account state, session persistence, logout, reconnect, refresh, expiry, revocation, quota, and rate-limit handling.
- Authenticated semantic parsing, structured output, grounding, no-invention behavior, multilingual quality, multi-column quality, latency, cancellation, restart recovery, and session recovery.
- Authenticated model-triggered shell, file-editing, web, MCP, plugin, and tool behavior.

Blocked behavior:

- T192 semantic invocation.
- T193 authenticated quality and failure evaluation.
- Production Codex adapter tasks T164-T165.

Not measured behavior:

- All listed semantic, latency, quota, cancellation, and authenticated recovery metrics. They are unverified, not zero.
