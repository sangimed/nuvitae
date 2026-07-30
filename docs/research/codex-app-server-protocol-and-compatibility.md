# Codex App-Server Protocol And Compatibility

Task: T189  
Date: 2026-07-30  
Scope: bounded protocol investigation only. This did not implement a production Codex adapter, did not perform a real ChatGPT login, did not read existing Codex credentials, did not use real resumes, and did not mount Nuvitae private storage.

## 1. Environment And Exact Version

- Installed package: `@openai/codex`
- Installed package version: `0.146.0`
- Runtime-reported version: `codex-cli 0.146.0`
- Binary path: `/opt/homebrew/bin/codex`
- Binary link target: `../lib/node_modules/@openai/codex/bin/codex.js`
- Package metadata path inspected: `/opt/homebrew/lib/node_modules/@openai/codex/package.json`
- Package metadata repository: `git+https://github.com/openai/codex.git`, directory `codex-cli`
- Package metadata license: `Apache-2.0`
- Installation method observed: Homebrew-linked global npm package under `/opt/homebrew/lib/node_modules/@openai/codex`; `brew info codex` identified cask `codex (Codex): 0.146.0` and artifact `codex-aarch64-apple-darwin -> codex`, but its online metadata refresh failed because DNS was unavailable.
- Runtime platform observed by host: `Darwin ... RELEASE_ARM64_T6000 arm64`
- Runtime platform observed by app-server initialize response: `platformFamily: "unix"`, `platformOs: "macos"`
- Temporary spike Codex home used for protocol probes: `/private/tmp/nuvitae-codex-t189-home`

Official source evidence:

- Official Codex app-server README in `openai/codex`: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- Official CLI source confirms app-server subcommands including `generate-ts` and `generate-json-schema`: https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs

## 2. Installation And Startup Commands

Version and package inspection commands:

```bash
which codex
codex --version
ls -l /opt/homebrew/bin/codex
sed -n '1,180p' /opt/homebrew/lib/node_modules/@openai/codex/package.json
brew info codex
uname -a
```

App-server command selected for T189 stdio validation:

```bash
HOME=/private/tmp/nuvitae-codex-t189-home \
CODEX_HOME=/private/tmp/nuvitae-codex-t189-home \
codex app-server --stdio --strict-config
```

The app-server help states that `--listen stdio://` is the default and `--stdio` is equivalent. It also lists WebSocket options, but WebSocket transport is rejected for this spike per task scope and because the official README labels WebSocket transport experimental / unsupported.

## 3. Generated Artifact Commands And Locations

The installed version supports protocol schema generation.

Generated artifact locations:

- Bounded temporary artifact root: `/private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0/`
- Stable TypeScript protocol artifacts: `/private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0/stable-ts/`
- Stable JSON Schema artifacts: `/private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0/stable-json-schema/`
- Experimental-inclusive TypeScript protocol artifacts: `/private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0/ts/`
- Experimental-inclusive JSON Schema artifacts: `/private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0/json-schema/`

Exact generation commands:

```bash
codex app-server generate-ts --out docs/research/artifacts/codex-app-server-0.146.0/stable-ts
codex app-server generate-json-schema --out docs/research/artifacts/codex-app-server-0.146.0/stable-json-schema
codex app-server generate-ts --experimental --out docs/research/artifacts/codex-app-server-0.146.0/ts
codex app-server generate-json-schema --experimental --out docs/research/artifacts/codex-app-server-0.146.0/json-schema
mv docs/research/artifacts/codex-app-server-0.146.0 /private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0
```

The exact generation commands were run first against a repo-local bounded research directory, then the generated bundle was moved to `/private/tmp` to avoid leaving 1,947 generated spike files in the repository. The temporary artifact bundle remains the generated source of truth for T190-T195 until regenerated from the same pinned Codex version.

Generated evidence used most directly:

- `ClientRequest.ts`
- `ClientNotification.ts`
- `ServerNotification.ts`
- `InitializeParams.ts`
- `InitializeResponse.ts`
- `v2/LoginAccountParams.ts`
- `v2/LoginAccountResponse.ts`
- `v2/CancelLoginAccountParams.ts`
- `v2/CancelLoginAccountResponse.ts`
- `v2/LogoutAccountResponse.ts`
- `v2/Account.ts`
- `v2/GetAccountResponse.ts`
- `v2/ThreadStartParams.ts`
- `v2/ThreadStartResponse.ts`
- `v2/TurnStartParams.ts`
- `v2/TurnSteerParams.ts`
- `v2/TurnInterruptParams.ts`
- `v2/ModelListResponse.ts`

The generated files state that they are generated code and must not be edited by hand. Treat these artifacts, tied to Codex `0.146.0`, as the source of truth for T190-T195.

## 4. Supported Operation Inventory

Default stable generation produced 93 client request methods. Experimental-inclusive generation produced 130 client request methods. The 37 methods present only with `--experimental` include realtime, process, remote-control, environment, memory, background terminal, thread item listing/search, and fuzzy-file-search session methods.

### Initialization

- Request: `initialize`
- Params: `InitializeParams`
- Required client metadata: `clientInfo`
- Optional capabilities: `capabilities`
- Response: `InitializeResponse`
- Client notification after initialize: `initialized`
- Observed response: `userAgent`, `codexHome`, `platformFamily`, and `platformOs`

### Client Metadata

Generated `InitializeParams` requires `clientInfo`. T189 used:

```json
{
  "name": "nuvitae",
  "title": "Nuvitae",
  "version": "0.1.0-t189-spike"
}
```

The initialize response included this metadata in `userAgent`: `nuvitae/0.146.0 ... (nuvitae; 0.1.0-t189-spike)`. This confirms the client did not impersonate an official OpenAI client.

### Account And Authentication Status

Stable methods found:

- `account/read`
- `getAuthStatus`
- `account/login/start`
- `account/login/cancel`
- `account/logout`
- `account/rateLimits/read`
- `account/usage/read`
- `account/workspaceMessages/read`
- `account/rateLimitResetCredit/consume`
- `account/sendAddCreditsNudgeEmail`

Generated account/login request variants:

- `apiKey`
- `chatgpt`
- `chatgptDeviceCode`
- `chatgptAuthTokens`
- `amazonBedrock`

T189-compatible ChatGPT login paths are `chatgpt` and `chatgptDeviceCode`. The generated `chatgptAuthTokens` variant requires an access token supplied by the client and is not compatible with Nuvitae's token-blind boundary for production.

Generated login progress/completion evidence:

- `account/login/start` response returns `loginId` plus either `authUrl` for `chatgpt` or `verificationUrl` and `userCode` for `chatgptDeviceCode`.
- `account/login/completed` server notification carries `loginId`, `success`, and `error`.
- `account/login/cancel` takes `loginId` and returns `status`.

Experimental observation without real login:

- `account/read` with empty temporary Codex home returned `account: null` and `requiresOpenaiAuth: true`.
- `getAuthStatus` returned `authMethod: null`, `authToken: null`, and `requiresOpenaiAuth: true`.

### Threads

Stable methods found:

- `thread/start`
- `thread/resume`
- `thread/fork`
- `thread/archive`
- `thread/delete`
- `thread/unsubscribe`
- `thread/name/set`
- `thread/goal/set`
- `thread/goal/get`
- `thread/goal/clear`
- `thread/metadata/update`
- `thread/unarchive`
- `thread/compact/start`
- `thread/shellCommand`
- `thread/approveGuardianDeniedAction`
- `thread/rollback`
- `thread/list`
- `thread/read`
- `thread/inject_items`

Experimental-only thread methods include `thread/items/list`, `thread/turns/list`, `thread/search`, `thread/searchOccurrences`, `thread/settings/update`, `thread/memoryMode/set`, elicitation counters, realtime methods, and background-terminal methods.

Ephemeral thread support exists in generated `ThreadStartParams` as optional `ephemeral?: boolean | null`.

### Turns

Stable methods found:

- `turn/start`
- `turn/steer`
- `turn/interrupt`

Generated `TurnStartParams` requires `threadId` and `input`. It supports `responsesapiClientMetadata`, `additionalContext`, `outputSchema`, sandbox/permission overrides, model/service-tier overrides, and `environments`.

Generated `TurnSteerParams` requires `threadId`, `input`, and `expectedTurnId`.

Generated `TurnInterruptParams` requires `threadId` and `turnId`.

Streamed turn/server notifications found:

- `turn/started`
- `turn/completed`
- `turn/diff/updated`
- `turn/plan/updated`
- `item/started`
- `item/completed`
- `item/agentMessage/delta`
- `rawResponseItem/completed`
- `rawResponse/completed`
- `item/reasoning/summaryTextDelta`
- `item/reasoning/summaryPartAdded`
- `item/reasoning/textDelta`
- `warning`
- `deprecationNotice`
- `error`

### Cancellation

Stable operation:

- `turn/interrupt`

Generated params require `threadId` and `turnId`. Actual cancellation latency and behavior are deferred to T193 because T189 did not start an authenticated turn.

### Logout

Stable operation:

- `account/logout`

Generated response is an empty object. Runtime behavior after login is deferred to T191 because T189 did not perform real ChatGPT login.

### Shutdown Or Process Termination

No generated `shutdown`, `exit`, or `close` JSON-RPC client method was found. For stdio mode, closing stdin caused the app-server process to exit with code `0` in T189 probes. Graceful process lifecycle should be treated as transport/process behavior, not a protocol method, unless later generated versions add a method.

### Model Discovery

Stable methods found:

- `model/list`
- `modelProvider/capabilities/read`

Experimental observation:

- `model/list` returned a model catalog without authentication from the temporary empty Codex home. T192/T193 must verify whether the listed models are actually invocable after login and whether model availability changes by account, workspace, subscription, quota, or provider config.

## 5. Stability Classification

Classification basis:

- Stable: present in stable generated artifacts and not marked deprecated in the inspected generated type.
- Experimental: present only with `--experimental`, or explicitly labelled experimental by app-server help / official README.
- Deprecated: generated type comment marks the field deprecated.
- Absent: not found in generated artifacts.
- Unclear: present but not enough documentation or experiment to determine product suitability.

| Operation or Surface | Classification | Evidence |
| --- | --- | --- |
| `initialize` | stable | Stable generated `ClientRequest.ts`; experimentally succeeded |
| `initialized` notification | stable | Stable generated `ClientNotification.ts`; experimentally accepted |
| Client metadata via `clientInfo` | stable | Stable generated `InitializeParams.ts`; reflected in observed `userAgent` |
| JSON-RPC over stdio | stable transport for this spike | Official README and experimentally verified JSONL framing |
| WebSocket transport | experimental / unsupported | Official README and app-server help; rejected for T189 |
| `account/read` | stable | Stable generated artifacts; experimentally returned unauthenticated status |
| `getAuthStatus` | stable but legacy-shaped / unclear for production | Stable generated artifacts; experimentally returned `authToken: null`; production should prefer token-blind `account/read` unless T191 proves otherwise |
| `account/login/start` with `chatgpt` | stable protocol surface, behavior unverified | Stable generated artifacts; no real login in T189 |
| `account/login/start` with `chatgptDeviceCode` | stable protocol surface, behavior unverified | Stable generated artifacts; no real login in T189 |
| `account/login/start` with `chatgptAuthTokens` | stable protocol surface but unsuitable for Nuvitae token-blind boundary | Generated params require access token supplied by client |
| `account/login/cancel` | stable protocol surface, behavior unverified | Stable generated artifacts |
| `account/login/completed` notification | stable protocol surface, behavior unverified | Stable generated `ServerNotification.ts` |
| `account/logout` | stable protocol surface, behavior unverified | Stable generated artifacts |
| `account/rateLimits/read` and `account/usage/read` | stable protocol surface, behavior unverified | Stable generated artifacts |
| `thread/start` | stable | Stable generated artifacts |
| `ThreadStartParams.ephemeral` | stable field | Present in stable generated artifacts |
| `thread/resume`, `thread/fork`, `thread/archive`, `thread/delete`, `thread/unsubscribe`, `thread/read`, `thread/list` | stable | Stable generated artifacts |
| `turn/start`, `turn/steer`, `turn/interrupt` | stable | Stable generated artifacts |
| `TurnStartParams.outputSchema` | stable field, behavior unverified | Stable generated artifacts; semantic parsing behavior deferred to T192 |
| `TurnStartParams.responsesapiClientMetadata` | stable field | Stable generated artifacts |
| Streamed turn/item notifications | stable protocol surface | Stable generated `ServerNotification.ts` |
| Realtime thread methods | experimental | Present only in `--experimental` artifacts |
| Process methods (`process/spawn`, `process/writeStdin`, `process/kill`, `process/resizePty`) | experimental | Present only in `--experimental` artifacts |
| Remote control methods | experimental | Present only in `--experimental` artifacts |
| Background terminal methods | experimental | Present only in `--experimental` artifacts |
| `command/exec` and filesystem methods | stable but security-risk surface for T190 | Stable generated artifacts; T190 must verify disable/restrict/neutralize |
| MCP and plugin methods | stable but security-risk surface for T190 | Stable generated artifacts; T190 must verify host inheritance and disable/restrict/neutralize |
| JSON-RPC shutdown method | absent | No generated method found |
| `multiAgentMode` fields in thread/turn params/responses | deprecated | Generated comments mark deprecated and point to reasoning effort |

No beta classification was found in generated artifacts or help text for T189-relevant operations. If official documentation later adds beta labels, T190-T195 should update classification.

## 6. JSON-RPC Stdio Observations

Transport used:

```bash
HOME=/private/tmp/nuvitae-codex-t189-home \
CODEX_HOME=/private/tmp/nuvitae-codex-t189-home \
codex app-server --stdio --strict-config
```

Framing:

- Content-Length-style framing was not accepted. The app-server logged JSON deserialization errors to stderr and emitted no stdout responses for that malformed framing.
- Newline-delimited JSON objects were accepted.
- The official README matches this observation: stdio transport uses newline-delimited JSON.
- The official README states that JSON-RPC 2.0 messages omit the `"jsonrpc":"2.0"` header on the wire. Experimentally, including `"jsonrpc":"2.0"` was tolerated by this version.

Initialize request sent:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"nuvitae","title":"Nuvitae","version":"0.1.0-t189-spike"},"capabilities":null}}
```

Initialize response observed:

```json
{"id":1,"result":{"userAgent":"nuvitae/0.146.0 (Mac OS 26.5.2; arm64) iTerm.app/3.6.11 (nuvitae; 0.1.0-t189-spike)","codexHome":"/private/tmp/nuvitae-codex-t189-home","platformFamily":"unix","platformOs":"macos"}}
```

Initialized notification sent:

```json
{"jsonrpc":"2.0","method":"initialized"}
```

Request IDs and response correlation:

- Initialize response correlated to id `1`.
- Unsupported request response correlated to id `2`.
- Server notifications did not include request ids.

Notification correlation:

- After initialization, the server emitted `remoteControl/status/changed` with `emittedAtMs` but no `id`.
- Generated turn, item, thread, account, process, MCP, and tool notifications include operation-specific correlation fields such as `threadId`, `turnId`, `loginId`, or process ids depending on notification type.

Malformed and unsupported request behavior:

- Header-framed input produced stderr-only deserialization errors and no stdout JSON-RPC response.
- Unknown newline-delimited method returned JSON-RPC error code `-32600`, message listing expected method names, and preserved request id `2`.

Stderr separation:

- `codex --version` and generators emitted a sandbox warning to stderr about PATH aliases.
- Valid newline-delimited app-server probes produced stdout JSON-RPC lines and no stderr.
- Malformed framing produced stderr logs and no stdout response.

Graceful shutdown:

- Closing stdin after probes produced process exit code `0`.
- No generated JSON-RPC shutdown method was found.

## 7. Client Identification Behavior

T189 used explicit Nuvitae metadata:

- `name`: `nuvitae`
- `title`: `Nuvitae`
- `version`: `0.1.0-t189-spike`

The initialize response `userAgent` contained both the Codex version and Nuvitae client identity. Later production clients should use the actual Nuvitae application version and must not use OpenAI, Codex, ChatGPT, VS Code, Desktop, or other first-party client names.

Turn metadata:

- Generated `TurnStartParams` and `TurnSteerParams` expose `responsesapiClientMetadata`.
- Generated comments state that reserved keys such as `session_id`, `thread_id`, `turn_id`, and `window_id` cannot be overridden.
- T192 should use explicit Nuvitae metadata here for semantic parsing turns.

## 8. Compatibility And Upgrade Risks

- Protocol artifacts are tied to installed Codex `0.146.0`. A different Codex version may add, remove, rename, stabilize, experimental-gate, or deprecate methods and fields.
- The official README says generated artifacts are specific to the Codex version used to run generation. This makes runtime version detection and artifact regeneration mandatory for compatibility review.
- `codex app-server generate-ts` and `generate-json-schema` are labelled experimental by help text. The schema generation mechanism itself may change.
- Default stable generation filters experimental surface. Production should avoid `--experimental` unless a later task explicitly accepts the compatibility risk.
- T189 found relevant production-candidate operations in the stable surface, but security-relevant non-parser capabilities are also stable: command execution, filesystem reads/writes, MCP calls, plugin operations, and app operations. T190 must prove they can be disabled, excluded, restricted, or sufficiently neutralized before any production Codex adapter work.
- `thread/start` and `turn/start` accept sandbox, permissions, environments, dynamic tools, workspace roots, and config overrides. These fields are likely to be upgrade-sensitive and security-sensitive.
- `TurnStartParams.outputSchema` exists, but T192 must verify strict structured output behavior experimentally after login.
- Model discovery can be account- and config-sensitive. `model/list` returned data without auth, so production must not treat model listing alone as proof of usable provider capability.
- Runtime version pinning is required for any adapter built from generated artifacts. A production adapter should fail closed when the running `InitializeResponse.userAgent` or `codex --version` does not match a supported version range.
- Generated client code should not be hand-maintained. T195 should decide whether to commit generated client code, generate during build from a pinned Codex package, or generate during compatibility validation. T189's recommendation is to commit a bounded generated artifact snapshot only for research evidence, and to require compatibility validation before production adapter upgrades.
- A production adapter should maintain an explicit supported-version range rather than "latest". At startup it should detect the Codex version, compare against the generated protocol artifact version, and refuse to parse resumes on unsupported versions.
- Unsupported operation handling should fail closed with provider-neutral states such as `unsupported_capability`, `provider_unavailable`, or `manual_entry_available`, never by attempting guessed method names.

T189 does not make the final production decision. T195 owns GO / CONDITIONAL GO / NO-GO.

## 9. Unresolved Questions For T190-T195

T190 blockers and next questions:

- Build and run a dedicated Docker Codex runtime without Nuvitae repository mount, private storage mount, PostgreSQL, Valkey, host Codex home, host credentials, user MCP servers, or user plugins.
- Verify whether stable command, filesystem, MCP, plugin, app, shell, and tool surfaces can be disabled, excluded, restricted, or adequately neutralized.
- Verify empty workspace behavior and permission profile behavior.
- Verify runtime resource limits: CPU, memory, process count, timeout, temp storage, stdout/stderr bounds, crash cleanup, and bounded restart.
- Verify whether host config, MCP, plugins, apps, skills, and environment variables can leak into the app-server runtime.

T191 unresolved:

- Perform official ChatGPT login only in the bounded runtime.
- Verify login progress, completion, cancellation, logout, reconnect, expired/revoked authentication, and persistence across container restart.
- Confirm Nuvitae remains token-blind and Codex owns credential persistence and refresh.

T192 unresolved:

- Verify authenticated non-interactive invocation after login.
- Verify `thread/start` with `ephemeral: true`.
- Verify strict `outputSchema` behavior on synthetic source text only.
- Verify no original PDF/DOCX mounting is needed.

T193 unresolved:

- Measure cancellation, timeout, crash, unsupported model, malformed output, authentication expiry, quota/rate limiting where safely reproducible, prompt-injection behavior, and quality metrics.

T194/T195 unresolved:

- Decide product suitability, operational burden, version-coupling risk, and GO / CONDITIONAL GO / NO-GO.

## 10. Evidence Classification

Generated protocol evidence:

- All generated artifacts under `/private/tmp/nuvitae-codex-app-server-artifacts/codex-app-server-0.146.0/`.
- Method inventory and stable/experimental comparison derived from generated `ClientRequest.ts` files.
- Payload shapes and comments derived from generated TypeScript files listed in section 3.

Official documentation or source evidence:

- Official app-server README in `openai/codex` documents JSON-RPC, JSONL stdio, experimental/unsupported WebSocket, schema generation commands, and experimental API opt-in.
- Installed package metadata for `@openai/codex` documents package name, version, repository, license, bin entry, and platform optional dependencies.
- `codex app-server --help`, `generate-ts --help`, and `generate-json-schema --help` from the installed version document startup and generation commands.

Experimentally verified behavior:

- Installed `codex` reports `codex-cli 0.146.0`.
- Artifact generation succeeded for stable and experimental TypeScript and JSON Schema outputs.
- Stdio initialization succeeded over newline-delimited JSON.
- `initialized` notification was accepted.
- Nuvitae client metadata was reflected in `userAgent`.
- `account/read`, `getAuthStatus`, and `model/list` returned responses from an empty temporary Codex home.
- Unknown method returned `-32600` with response id correlation.
- Content-Length framing caused safe stderr deserialization errors and no stdout response.
- Closing stdin caused exit code `0`.

Inference:

- No generated shutdown method means process/stdin lifecycle is currently the shutdown path.
- `chatgptAuthTokens` is unsuitable for Nuvitae production because generated params require client-supplied access tokens, conflicting with the token-blind boundary.
- Production requires runtime version pinning and fail-closed version checks.

Unverified:

- Real ChatGPT login, device-code flow, login cancellation behavior, logout behavior after login, token refresh, credential persistence, authentication expiry/revocation, quota behavior, and reconnect.
- Authenticated thread/turn execution, structured output enforcement, turn cancellation latency, crash recovery, and app-server behavior inside the dedicated Docker runtime.
- Whether non-parser capabilities can be disabled, excluded, restricted, or neutralized enough for production.
