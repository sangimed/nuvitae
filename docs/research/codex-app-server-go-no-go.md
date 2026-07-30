# Codex App-Server GO/NO-GO Decision

Task: T195  
Date: 2026-07-30  
Observation date: 2026-07-30  
Decision type: current official Codex app-server subscription-path production decision for self-hosted Nuvitae.

## 1. Decision Statement

The current tested Codex app-server candidate must not proceed to production implementation for the present self-hosted Nuvitae MVP. Authentication is a mandatory failed gate, no authenticated Codex runtime was produced, and authenticated semantic invocation and quality evaluation could not occur.

This is a scoped decision about the exact tested app-server ChatGPT-subscription path. It is not a permanent decision about every future Codex version, every ChatGPT account/workspace, every OpenAI product path, or every possible AI provider.

## 2. Decision Scope

Applies to:

- official `@openai/codex` version `0.146.0`;
- generated protocol artifacts from that exact version;
- JSON-RPC over newline-delimited stdio;
- managed Codex app-server child process topology;
- dedicated bounded Linux Docker runtime;
- private Codex state volume;
- token-blind Nuvitae probe/client;
- ChatGPT-subscription authentication managed by Codex;
- the tested account/workspace and observed environment;
- observation date 2026-07-30;
- the present self-hosted Nuvitae MVP.

Does not apply beyond that scope without new evidence.

## 2a. Scope Clarification For Direct-OAuth Candidate

This T195 decision does not evaluate or reject the distinct direct-OAuth
architecture now planned for separate compatibility validation:

```text
Nuvitae worker
→ provider-independent ResumeSemanticParserProvider
→ CodexDirectProviderAdapter
→ isolated CodexOAuthBroker
→ OpenAI-hosted OAuth
→ direct Codex ChatGPT transport
```

That candidate has a different token-ownership model, transport boundary, and
supportability risk profile than the tested app-server path. It requires a new
upstream and licensing audit, security and token-ownership design, OAuth proof,
credential lifecycle proof, minimal invocation proof, semantic validation, and
explicit GO, CONDITIONAL GO, or NO-GO decision before production Codex work is
authorized. A future direct-OAuth NO-GO remains an acceptable result.

## 3. Executive Rationale

GO is impossible because mandatory production gates remain failed, blocked, or not measured. Official ChatGPT-subscription authentication did not complete in the tested Docker app-server path, so T192 and T193 could not run.

NO-GO is less misleading and more operationally useful than CONDITIONAL GO because it clearly blocks T164-T165 now. A CONDITIONAL GO would need to say that production implementation is not authorized until authentication, semantic invocation, semantic quality, safety, latency, quota, cancellation, restart, and upgrade gates are experimentally satisfied. That reads like a future reevaluation plan, not permission to proceed.

Provider-independent parser architecture, deterministic fallback, manual entry, review, grounding, no-invention, retention, and recovery work remain valid because they do not depend on Codex being the selected provider.

## 4. Evidence Basis

Primary evidence:

- `docs/research/codex-app-server-protocol-and-compatibility.md`
- `docs/research/codex-app-server-runtime-isolation.md`
- `docs/research/codex-app-server-authentication-lifecycle.md`
- `docs/research/codex-app-server-security-and-product-review.md`
- sanitized evidence under `spikes/codex-app-server-runtime/evidence/`
- `specs/001-import-resume/spec.md`
- `specs/001-import-resume/plan.md`
- `specs/001-import-resume/research.md`
- `specs/001-import-resume/data-model.md`
- `specs/001-import-resume/contracts/import-resume.md`
- `specs/001-import-resume/quickstart.md`
- `specs/001-import-resume/tasks.md`

Planning documents define intended behavior and gates. They are not treated as experimental verification.

## 5. Findings From T189

- Experimentally verified: official package/version was `@openai/codex` `0.146.0`.
- Verified from generated protocol artifacts: account, login, thread, turn, interruption, logout, model, and notification operations exist for the pinned version.
- Experimentally verified: app-server initialized over newline-delimited JSON-RPC stdio with explicit Nuvitae client metadata.
- Experimentally verified: `account/read` returned unauthenticated state in an empty private Codex home, and model listing returned a catalog-shaped response without proving invocation.
- Documented official behavior already recorded in research: protocol artifact generation is supported by the official app-server source/docs.
- Experimentally verified: no generated app-server shutdown RPC was found; closing stdin is the observed stdio shutdown behavior.
- Documented official behavior already recorded in research: WebSocket transport is experimental/unsupported for this candidate and was excluded.
- Inference: production compatibility is version-coupled to generated artifacts from the exact Codex version.

## 6. Findings From T190

- Experimentally verified: Codex `0.146.0` ran in the bounded Linux Docker runtime.
- Experimentally verified: managed child process over stdio initialized, correlated responses, collected notifications, shut down on stdin close, force-killed stuck malformed input, and restarted cleanly.
- Experimentally verified: Unix-socket sidecar was advertised and created a socket, but initialization timed out directly and through the official proxy; it is rejected for this candidate.
- Experimentally verified: host Codex credentials/configuration, repository files, private resume storage, PostgreSQL, Valkey, Docker socket, host MCP config, and host plugin config were not inherited in the selected topology.
- Experimentally verified: runtime resource, filesystem, process, environment, temp-storage, and host-leakage isolation checks passed for the bounded unauthenticated spike.
- Unverified: authenticated model-triggered shell, file-editing, web, MCP, plugin, and tool capabilities.
- Not measured: memory exhaustion under authenticated turns, authenticated turn latency, cancellation latency, quota behavior, and authenticated crash/restart recovery.

## 7. Findings From T191

- Verified from generated protocol artifacts: `chatgptDeviceCode`, `chatgpt`, login completion, account update, account read, cancellation, and logout surfaces exist.
- Experimentally verified: device-code initiation failed before verification URL or user-code issuance.
- Experimentally verified: the controlled official CLI device-auth path failed at the same general stage in recorded controls.
- Experimentally verified: enabling device-code authentication did not change the Docker app-server outcome.
- Inference from recorded diagnostics: basic Docker DNS, TCP, TLS, and CA reachability did not explain the device-code failure.
- Experimentally verified: the final browser-login path produced a valid official authorization URL, valid `auth.openai.com` host, valid localhost redirect, callback port `1455`, loopback-only publication, reachable raw TCP callback relay, reachable Codex callback listener, and callback teardown after failure.
- Experimentally verified: no successful `account/login/completed`, authenticated `account/updated`, or authenticated `account/read` was observed.
- Experimentally verified: `account/read` remained unauthenticated.
- Experimentally verified: the Nuvitae probe identity could not list, stat, read, copy, modify, or delete protected Codex state.
- Experimentally verified: no raw provider token, authorization code, complete authorization URL, credential content, or personal account information was persisted.
- Blocked: no authenticated runtime was produced.

## 8. Findings From T194

- Inference from T189-T191: authentication is a failed mandatory production gate for the current candidate.
- Experimentally verified in exercised paths: token-blindness and bounded credential isolation held.
- Experimentally verified in exercised paths: runtime isolation excluded the Nuvitae repository, private storage, databases, queue, host credentials, Docker socket, host MCP config, and host plugins.
- Inference: the current path is unsuitable or blocked for the present self-hosted MVP and unsuitable for non-technical self-hosted users.
- Inference: operational and troubleshooting complexity is high.
- Blocked: T192 and T193 did not execute.
- Not measured: no semantic-quality evidence exists.
- Blocked: T164-T165 remain blocked.

## 9. T192-T193 Blocked Status

T192 semantic invocation was not executed. T193 authenticated semantic quality and failure evaluation was not executed. The cause was the mandatory T191 authentication blocker: no authenticated Codex runtime was produced.

T192-T193 are not successful semantic evaluations and are not failed semantic evaluations. They are blocked and not measured.

The following remain unverified and must not be represented as zero:

- authenticated invocation success rate;
- schema-valid output rate;
- field precision;
- field recall;
- work-experience grouping accuracy;
- valid-evidence rate;
- unsupported-evidence rate;
- invented-field rate;
- multilingual parsing quality;
- multi-column parsing quality;
- turn latency;
- cancellation latency;
- quota and rate-limit behavior;
- authenticated restart recovery;
- session recovery;
- token refresh;
- expired or revoked authentication behavior.

No semantic metric is estimated from general Codex capability.

## 10. Mandatory Production-Gate Matrix

| Gate | Status | Evidence | Mandatory | Passed | Production allowed without it |
|---|---|---|---|---|---|
| 1. Official ChatGPT-subscription authentication succeeds | Failed | T191: no completed login, authenticated update, or authenticated account/read | Yes | No | No |
| 2. Authentication can be completed by intended self-hosted user | Failed | T191 failed in tested topology; T194 unsuitable for non-technical users | Yes | No | No |
| 3. Authentication survives runtime restart | Blocked | No authenticated state was created | Yes | No | No |
| 4. Reconnect and authenticated logout work | Blocked | Generated operations exist; authenticated lifecycle not reached | Yes | No | No |
| 5. Nuvitae remains token-blind | Partially passed | Exercised RPCs/evidence exposed no raw credentials | Yes | Partially | No |
| 6. Codex credential state remains inaccessible to Nuvitae client | Passed for spike | Probe identity denied protected state access | Yes | Yes for exercised spike | No |
| 7. Docker runtime and process isolation are adequate | Partially passed | T190 isolation passed; authenticated tool behavior unverified | Yes | Partially | No |
| 8. Authenticated semantic invocation succeeds | Blocked | T192 not executed due to failed auth | Yes | No | No |
| 9. Structured output reliability is measured and acceptable | Not measured | T193 not executed | Yes | No | No |
| 10. Evidence grounding is measured and acceptable | Not measured | T193 not executed | Yes | No | No |
| 11. No-invention behavior is measured and acceptable | Not measured | T193 not executed | Yes | No | No |
| 12. French, English, bilingual, single-column, and multi-column quality measured and acceptable | Not measured | T192-T193 not executed | Yes | No | No |
| 13. Latency and cancellation behavior measured and acceptable | Not measured | Authenticated turns not run | Yes | No | No |
| 14. Quota and provider failures have safe behavior | Not measured | Authenticated account/turns not available | Yes | No | No |
| 15. Upgrade and protocol compatibility risks operationally manageable | Partially passed | T189 generated artifacts; fail-closed policy still required | Yes | Partially | No |

## 11. Verified Capabilities

- Experimentally verified: Codex `0.146.0` version detection and app-server startup.
- Experimentally verified: generated protocol artifacts from the exact version.
- Experimentally verified: newline-delimited JSON-RPC stdio initialization.
- Experimentally verified: request/response correlation and notification collection in the bounded runtime.
- Experimentally verified: selected managed child-process topology can be supervised and restarted for unauthenticated probes.
- Experimentally verified: sidecar Unix socket was unusable and excluded.
- Experimentally verified: token-blindness held for exercised RPCs and evidence.
- Experimentally verified: protected Codex state was inaccessible to the Nuvitae probe identity.
- Experimentally verified: no repository, private resume storage, PostgreSQL, Valkey, Docker socket, host Codex state, host MCP config, or host plugin config was inherited by the bounded runtime.
- Experimentally verified: browser-login callback relay was loopback-only, reachable, raw TCP only, and torn down after failure.

## 12. Blocked Capabilities

- Blocked: successful official ChatGPT-subscription app-server authentication.
- Blocked: authenticated account/read.
- Blocked: authenticated restart persistence.
- Blocked: authenticated logout and unauthenticated restart after logout.
- Blocked: final reauthentication.
- Blocked: authenticated semantic invocation.
- Blocked: authenticated semantic quality and failure evaluation.
- Blocked: production Codex adapter tasks T164-T165.

## 13. Unverified And Not-Measured Capabilities

Unverified:

- token refresh;
- expired or revoked authentication;
- authenticated reconnect and session recovery;
- authenticated model-triggered shell, file-editing, web, MCP, plugin, and tool behavior;
- authenticated provider diagnostics without secret leakage;
- quota and rate-limit state reporting;
- multi-user provider-state isolation.

Not measured:

- authenticated invocation success rate;
- schema-valid output rate;
- field precision and recall;
- work-experience grouping accuracy;
- valid-evidence and unsupported-evidence rates;
- invented-field rate;
- French, English, bilingual, single-column, and multi-column parsing quality;
- startup-to-ready under production-like auth state;
- turn latency;
- cancellation latency;
- authenticated restart recovery.

## 14. Security And Privacy Implications

Experimentally verified security positives are bounded to the spike: Nuvitae stayed token-blind for exercised RPCs, private Codex state was inaccessible to the probe identity, no raw credentials or authorization codes were persisted, the callback relay avoided payload inspection and logging, and sensitive host/application mounts were absent.

Production risk remains high because credential persistence, refresh, logout, expiry, revocation, provider diagnostics, and authenticated parsing were not exercised. The managed child-process topology also requires strict identity separation, private volume permissions, read-only root filesystem, explicit writable paths, no Docker socket, no private storage mount, no repository mount, safe log redaction, and regression tests.

No real resume content was transmitted through an authenticated Codex turn. Provider-side privacy during real semantic parsing remains unverified.

## 15. Operational And Onboarding Implications

The current authentication path is unsuitable for the present non-technical self-hosted MVP. Device code failed before code issuance in the Docker app-server path. Browser login produced a valid official URL and reachable loopback callback relay but no authenticated account state.

Supporting this path would require robust diagnostics for account/workspace configuration, callback ports, stale relays, private state volumes, version mismatches, unsupported runtime environments, logout/reconnect, and safe state reset. Those operations are not yet validated.

## 16. Semantic-Evidence Limitations

No authenticated semantic invocation occurred. No Codex output was translated into a Nuvitae-owned provider-independent response. No strict schema validation, grounding validation, no-invention validation, multilingual fixture evaluation, multi-column fixture evaluation, latency measurement, cancellation measurement, quota behavior, malformed-output handling, prompt-injection behavior, restart recovery, or session recovery was measured.

Therefore, this decision cannot say Codex semantic parsing is good, bad, reliable, unreliable, fast, slow, grounded, or prone to invention. It can only say the required semantic evidence is absent because the mandatory authentication gate failed.

## 17. Production Acceptance Thresholds

Future reevaluation must define or satisfy these minimum thresholds before production approval.

Authentication:

- official login completion succeeds in the bounded Docker topology;
- authenticated `account/read`;
- authentication persists across restart;
- pending login cancellation;
- authenticated logout;
- unauthenticated state after logout and restart;
- final reauthentication;
- no raw credential exposure;
- protected Codex state inaccessible to Nuvitae.

Invocation:

- authenticated non-interactive app-server invocation;
- no dependency on manual credential copying;
- bounded timeout and cancellation;
- safe runtime restart and recovery.

Structured output:

- 100% schema-valid output after the defined bounded retry policy;
- no unknown output fields accepted;
- invalid output fails safely into review or fallback.

Grounding and invention:

- every explicit extracted value references valid source evidence;
- unsupported evidence rate meets the acceptable threshold selected before reevaluation;
- invented-field rate is zero on the acceptance fixture set;
- inferred values are never represented as explicit.

Quality:

- explicit minimum precision and recall thresholds per core resume section selected before reevaluation;
- explicit work-experience grouping threshold selected before reevaluation;
- French, English, bilingual, single-column, and multi-column fixtures included;
- no production approval based only on aggregate quality when a critical section fails.

Operations:

- measured startup and turn latency;
- measured cancellation behavior;
- safe authentication, quota, network, and process-failure handling;
- supported Codex-version policy;
- fail-closed behavior for unsupported versions.

Exact numeric thresholds not previously selected are required decisions before reevaluation, not met thresholds.

## 18. Reevaluation Triggers And Required Delta Validation

Objective triggers:

- newer official Codex version with an authentication-related change or fix;
- official OpenAI-documented resolution for the observed authentication failure;
- confirmed account or workspace configuration change;
- supported official token-blind authentication mechanism;
- successful reproduction of login in the same bounded Docker topology;
- relevant protocol changes.

Minimum delta validation for any trigger:

- refresh T189 protocol and compatibility evidence from the exact tested version;
- repeat relevant T190 runtime compatibility and isolation checks;
- execute the complete T191 authentication lifecycle;
- execute T192 semantic invocation;
- execute T193 quality and failure evaluation;
- update T194 product and security review;
- issue a new T195 decision.

A trigger alone must not unblock T164-T165.

## 19. Consequences For T164-T165

T164-T165 may not start. T191 completion as a blocked investigation does not unblock them. This T195 decision does not authorize Codex-specific production adapter implementation.

T164-T165 may be reconsidered only after an objective trigger, complete delta validation, successful authentication, successful semantic invocation, accepted quality/failure metrics, and a new explicit production decision.

## 20. Consequences For Provider-Independent Work

The provider-independent semantic parser architecture remains valid. Deterministic validation/source preparation, strict schema validation, grounding validation, no-invention checks, review and confirmation, deterministic fallback, manual entry, retention, deletion, provider-neutral contracts, and product work unrelated to Codex may continue.

Codex is not selected as the first production provider for the present self-hosted MVP. A different provider may be evaluated later without changing the import domain contract. This decision does not select or design a commercial hosted provider.

## 21. Final GO, CONDITIONAL GO, Or NO-GO Classification

Final T195 classification: NO-GO.

The NO-GO is scoped to Codex `0.146.0`, the tested app-server protocol, the tested account/workspace, the tested Docker topology, the current observation date, and the present self-hosted MVP. It blocks current production implementation. It allows future reevaluation only after an objective trigger and complete delta validation.

## 22. Evidence Classification

Experimentally verified:

- Codex `0.146.0` protocol initialization over newline-delimited stdio.
- Generated protocol artifacts from the exact installed version.
- Linux Docker app-server startup for the selected stdio topology.
- Request/response correlation, notification collection, unauthenticated account read, model-list response shape, graceful stdin closure, forced termination, bounded restart, and no remaining child process.
- Host leakage checks for repository, private storage, host Codex state, host MCP/plugin sentinels, Docker socket, PostgreSQL, and Valkey.
- Device-code request rejection before URL/code issuance.
- Browser-login URL validation, callback port `1455`, loopback-only callback publication, relay/listener reachability, and relay teardown.
- Probe denial against protected Codex state.
- No raw credentials, authorization code, complete authorization URL, credential content, or personal account information persisted in evidence.

Verified from generated protocol artifacts:

- Stable account, login, cancellation, logout, thread, turn, model, and notification operation shapes for Codex `0.146.0`.
- `chatgptDeviceCode`, `chatgpt`, logout, and cancel operations exist.
- `turn/interrupt` exists, but authenticated behavior was not measured.
- No generated app-server shutdown RPC was found.

Documented official behavior already recorded in research:

- Official app-server source/docs support protocol artifact generation and app-server subcommands.
- WebSocket transport is experimental/unsupported for this candidate and remains rejected.

Inference:

- Managed stdio is less operationally complex than rejected sidecar for this candidate.
- Browser flow requires reliable Docker callback forwarding and remains unsuitable as currently observed.
- Basic Docker DNS/TCP/TLS/CA failure is not the likely sole cause of device-code failure.
- Current path is unsuitable or blocked for the present self-hosted MVP.

Blocked:

- successful ChatGPT authentication through app-server;
- T192 semantic invocation;
- T193 authenticated quality and failure evaluation;
- T164-T165 production Codex adapter implementation.

Unverified:

- authenticated account state, persistence, logout, reconnect, refresh, expiry, revocation, quota, and rate-limit handling;
- authenticated semantic parsing, structured output, grounding, no-invention behavior, multilingual quality, multi-column quality, cancellation, restart recovery, and session recovery;
- authenticated model-triggered shell, file-editing, web, MCP, plugin, and tool behavior.

Not measured:

- authenticated invocation success rate;
- schema-valid output rate;
- field precision;
- field recall;
- work-experience grouping accuracy;
- valid-evidence rate;
- unsupported-evidence rate;
- invented-field rate;
- turn latency;
- cancellation latency;
- quota and provider-failure behavior;
- authenticated restart and session recovery.
