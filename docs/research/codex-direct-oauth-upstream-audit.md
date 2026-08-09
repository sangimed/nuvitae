# Codex Direct OAuth Upstream Audit

Observation date: 2026-07-31, Europe/Paris workspace context.

Scope: T196 only. This is a source audit of upstream architecture. No OAuth login,
device-code approval, credential access, credential storage, Codex backend request,
code adaptation, commit, or push was performed.

## 1. Exact Pinned Sources

| Source | Pinned revision | License | Evidence |
| --- | --- | --- | --- |
| OpenClaw | `4c331166c40cccb6e4d2da1136c921faed1cc8c1` | MIT | `github.com/openclaw/openclaw` at pinned commit; local audit copy `/private/tmp/nuvitae-t196-openclaw` |
| Hermes Agent | `5d6aae02bffa7714c4a94f3a0900b37774442dea` | MIT | `github.com/NousResearch/hermes-agent` at pinned commit; local audit copy `/private/tmp/nuvitae-t196-hermes-agent` |
| Official OpenAI Codex source | `3016671bb077c43448b8fa88f3edfa9772e17058` | Apache-2.0 | `github.com/openai/codex` at pinned commit; local audit copy `/private/tmp/nuvitae-t196-openai-codex` |
| Official OpenAI Codex docs | Crawled 2026-07-31, no immutable page revision exposed | OpenAI docs terms, not reusable source license | `https://developers.openai.com/codex/auth` redirected to `https://learn.chatgpt.com/docs/auth`; `https://developers.openai.com/codex/cli` redirected to `https://learn.chatgpt.com/docs/codex/cli` |

Pinned-source method: upstream repository HEADs were resolved with `git ls-remote`
and shallow read-only copies were cloned at the recorded commits. Official docs were
read from OpenAI-controlled domains and recorded by crawl/observation date because
the docs pages did not expose immutable content revisions.

## 2. OpenClaw Flow

OpenClaw implements a browser Authorization Code with PKCE flow against OpenAI's
ChatGPT OAuth host.

OAuth inventory:

| Element | OpenClaw behavior | Evidence classification |
| --- | --- | --- |
| Client identifier | `app_EMoamEEZ73f0CkXaXp7hrann` | Open-source compatibility behavior; also verified in official Codex source as the Codex CLI client id |
| Authorization endpoint | `https://auth.openai.com/oauth/authorize` | Open-source compatibility behavior; equivalent host/path verified in official Codex source |
| Token endpoint | `https://auth.openai.com/oauth/token` | Open-source compatibility behavior; verified in official Codex source |
| Callback | `http://localhost:1455/auth/callback`; configurable host default `localhost`; only loopback hosts accepted (`localhost`, `127.0.0.1`, `::1`) | Open-source compatibility behavior |
| PKCE | 32 random bytes, base64url verifier, SHA-256 S256 challenge | Open-source compatibility behavior; same class of control verified in official source |
| State | OpenClaw OAuth authorization uses 16 random hex bytes; shared SDK helper also exposes 32 random bytes base64url state. Browser and manual callbacks compare supplied state to expected state. | Open-source compatibility behavior |
| Scopes | `openid profile email offline_access` | Open-source compatibility behavior; narrower than current official Codex source |
| Extra authorization params | `id_token_add_organizations=true`, `codex_cli_simplified_flow=true`, `originator=openclaw` by default | Open-source compatibility behavior; params are verified in official source but third-party `originator=openclaw` support is undocumented |
| Browser callback | Local HTTP listener accepts only `/auth/callback`, checks state, requires code, serves success/error HTML, and closes the listener | Open-source compatibility behavior |
| Manual fallback | CLI/manual paste path parses callback URL/query/code input and validates state if present | Open-source compatibility behavior |
| Code exchange | Form POST with `grant_type=authorization_code`, client id, code, redirect URI, code verifier; requires access token, refresh token, and `expires_in` | Open-source compatibility behavior |
| Refresh | Form POST with `grant_type=refresh_token`, refresh token, client id; requires access token, refresh token, and `expires_in` | Open-source compatibility behavior |
| Expiry | Credentials contain `expires`; OAuth manager reuses unexpired credentials and refreshes under locks | Open-source compatibility behavior |
| Account identity | Extracts ChatGPT account id and profile claims from JWT claims including `https://api.openai.com/auth.chatgpt_account_id` and profile email/name claims; transport also derives account id from access token | Open-source compatibility behavior; JWT claim names are undocumented |
| Storage | Per-agent SQLite DB at `~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite`; `auth_profile_store` and `auth_profile_state` JSON rows store OAuth credentials/state | Open-source compatibility behavior |
| Logout/deletion | Provider-wide and selected-profile removal delete store/state rows and invalidate auth status cache | Open-source compatibility behavior |

OpenClaw's direct Codex transport:

| Element | OpenClaw behavior | Evidence classification |
| --- | --- | --- |
| Backend URL | Default base `https://chatgpt.com/backend-api`; responses path resolves to `/codex/responses`; native allowlist accepts `chatgpt.com` paths under `/backend-api`, `/backend-api/v1`, `/backend-api/codex`, `/backend-api/codex/v1` | Verified in official source for base URL; OpenClaw allowlist is open-source compatibility behavior |
| Transport type | Server-sent events for streaming; WebSocket beta path also implemented | Open-source compatibility behavior |
| SSE headers | `Authorization: Bearer <token>`, `chatgpt-account-id`, `originator: openclaw`, `User-Agent: openclaw (...)`, `OpenAI-Beta: responses=experimental`, `Accept: text/event-stream`, `Content-Type: application/json`, optional `session_id` and `x-client-request-id` | Open-source compatibility behavior; core auth and account headers are verified in official source; beta header value differs from current official source observations |
| WebSocket headers | Same base auth/account/originator headers plus `OpenAI-Beta: responses_websockets=2026-02-06`, `x-client-request-id`, `session_id` | Open-source compatibility behavior; WebSocket beta value verified in official source |
| Request shape | Responses-style JSON with `model`, `store:false`, `stream:true`, `instructions`, `input`, optional `previous_response_id`, tools/tool choice, parallel tool calls, temperature, reasoning, service tier, text verbosity, include `reasoning.encrypted_content`, prompt cache key, passthrough | Open-source compatibility behavior; broadly compatible with official Codex source request construction |
| Response shape | SSE events mapped into provider events; error bodies parsed from JSON/text; WebSocket `response.create` path available | Open-source compatibility behavior |
| Error/rate-limit behavior | Retryable statuses `429`, `500`, `502`, `503`, `504`; text matching for rate/overload/service unavailable/upstream connection errors; friendly messages for `usage_limit_reached`, `usage_not_included`, `rate_limit_exceeded` and status `429`; bounded error and success body sizes | Open-source compatibility behavior |
| SSRF protection | Token endpoint helper allowlists exact host `auth.openai.com`, rejects unexpected auth hosts, uses timeout and body caps | Open-source compatibility behavior |

OpenClaw evidence files include:

- `docs/concepts/oauth.md`
- `extensions/openai/openai-chatgpt-oauth-authorization.runtime.ts`
- `extensions/openai/openai-chatgpt-oauth-flow.runtime.ts`
- `extensions/openai/openai-chatgpt-oauth-token.runtime.ts`
- `extensions/openai/openai-chatgpt-auth-identity.ts`
- `src/plugin-sdk/provider-oauth-runtime.ts`
- `src/agents/auth-profiles/sqlite.ts`
- `src/agents/auth-profiles/oauth-manager.ts`
- `src/agents/auth-profiles/path-resolve.ts`
- `packages/ai/src/providers/openai-chatgpt-responses.ts`
- `packages/ai/src/transports/openai-transport-params.ts`

## 3. Hermes Flow

Hermes implements an OpenAI Codex provider named `openai-codex`, but its primary
login path is device-code OAuth rather than a local browser callback.

Hermes inventory:

| Element | Hermes behavior | Evidence classification |
| --- | --- | --- |
| Login mode | `oauth_external` provider overlay; interactive helper uses OpenAI device-code flow and saves Hermes-owned tokens | Open-source compatibility behavior |
| Client identifier | `app_EMoamEEZ73f0CkXaXp7hrann` | Open-source compatibility behavior; verified in official Codex source |
| Device-code endpoints | `https://auth.openai.com/api/accounts/deviceauth/usercode`, `https://auth.openai.com/api/accounts/deviceauth/token`, verification URL `https://auth.openai.com/codex/device` | Verified in official source for official Codex device-code implementation; Hermes behavior is open-source compatibility behavior |
| Token endpoint | `https://auth.openai.com/oauth/token` | Open-source compatibility behavior; verified in official source |
| Device-code exchange | Requests user code with JSON `{client_id}`; polls JSON `{device_auth_id,user_code}`; exchanges `authorization_code` with redirect URI `https://auth.openai.com/deviceauth/callback`, client id, and code verifier | Open-source compatibility behavior; verified in official source |
| Browser callback | Not used for Codex in Hermes's audited login helper | Open-source compatibility behavior |
| Credential store | `~/.hermes/auth.json` under `providers.openai-codex.tokens`, mirrored into `credential_pool.openai-codex`; distinct from `~/.codex/auth.json` | Open-source compatibility behavior |
| Storage protection | Auth file writes use cross-process advisory locking, owner-only parent directory hardening where possible, atomic temp writes, and `0o600` file permissions | Open-source compatibility behavior |
| Refresh | Form POST to token endpoint with `grant_type=refresh_token`, refresh token, client id, `Accept: application/json`, and Hermes user agent; preserves old refresh token if upstream omits a replacement | Open-source compatibility behavior |
| Expiry | JWT expiry check with 120 second skew; re-reads auth store under lock before refresh | Open-source compatibility behavior |
| Account identity | Transport extracts account id from access-token JWT claim `https://api.openai.com/auth.chatgpt_account_id`; malformed tokens omit account header rather than crashing | Open-source compatibility behavior; claim is undocumented |
| Backend URL | `https://chatgpt.com/backend-api/codex`; `HERMES_CODEX_BASE_URL` can override | Verified in official source for default base; env override is Hermes behavior |
| Transport | `codex_responses` transport over Responses-style endpoint; auxiliary client sends OpenAI-compatible requests to Codex backend | Open-source compatibility behavior |
| Headers | `Authorization` is supplied by the OpenAI-compatible client path; auxiliary headers include `User-Agent: codex_cli_rs/0.0.0 (Hermes Agent)`, `originator: codex_cli_rs`, and optional `ChatGPT-Account-ID` | Open-source compatibility behavior; official source verifies `originator` and `ChatGPT-Account-ID` as first-party headers, but Hermes's impersonation-shaped originator is undocumented |
| Credential import | Can import valid Codex CLI tokens from `~/.codex/auth.json` on login, and can self-heal by importing fresh Codex CLI tokens after relogin-required refresh failures | Open-source compatibility behavior; high risk for token ownership if Nuvitae copied it |
| Rate/error behavior | Device-code request retries 429 with backoff; token refresh treats 429 as quota/rate limited and credentials still valid; `invalid_grant`, `invalid_token`, `invalid_request`, 401/403, and `refresh_token_reused` require relogin | Open-source compatibility behavior |

Hermes evidence files include:

- `hermes_cli/auth.py`
- `hermes_cli/providers.py`
- `agent/auxiliary_client.py`
- `agent/transports/codex.py`
- `agent/codex_responses_adapter.py`

## 4. Comparison Matrix

| Area | OpenClaw | Hermes | T197 relevance |
| --- | --- | --- | --- |
| OAuth login shape | Browser authorization-code with loopback callback and manual fallback | Device-code flow; no Codex loopback callback in audited helper | Nuvitae must choose broker topology before any login proof |
| Callback exposure | Loopback HTTP listener on port 1455, path `/auth/callback`; host restricted to loopback | No local callback for Codex login | Browser callback protections apply only if Nuvitae follows OpenClaw/official browser flow |
| Scopes | `openid profile email offline_access` | Device-code helper does not request scopes explicitly | Official source browser flow requests additional connector scopes; exact minimum is unresolved |
| Originator | `openclaw` | `codex_cli_rs` | Third-party originator support is undocumented; impersonating first-party originator is a compatibility and policy risk |
| Credential ownership | OpenClaw per-agent SQLite profile store | Hermes `~/.hermes/auth.json`, credential pool, optional Codex CLI import | Nuvitae must require sole broker ownership and forbid shared CLI import |
| Refresh race handling | Per-provider/profile lock path and compare-and-save behavior to avoid single-use refresh-token reuse | Auth-store lock, re-read before refresh, but can import shared Codex CLI tokens | Nuvitae must design cross-process and cross-worker refresh serialization |
| Backend transport | SSE plus WebSocket beta support | Responses transport; primarily HTTP client path | T200 must validate one bounded HTTP/SSE path before WebSocket is considered |
| Header posture | Distinct `originator: openclaw` | First-party-shaped `originator: codex_cli_rs` | Official supportability differs materially |
| Official alignment | Browser flow resembles official Codex browser flow but scopes and originator differ | Device-code flow closely mirrors official device-code source but direct third-party use remains undocumented | Neither proves third-party support |

## 5. Official Support Classification

| Element | Classification | Basis |
| --- | --- | --- |
| Codex supports ChatGPT sign-in and API-key sign-in | Officially documented | OpenAI auth docs state ChatGPT desktop app, Codex CLI, and IDE extension support ChatGPT and API-key sign-in; Codex cloud requires ChatGPT |
| Codex CLI browser login opens a browser and returns credentials to Codex | Officially documented | OpenAI auth docs for Codex CLI |
| Login cache at `~/.codex/auth.json` or OS credential store | Officially documented | OpenAI auth docs login caching section |
| Official Codex CLI browser OAuth issuer, ports 1455/1457, callback path `/auth/callback`, state validation, code exchange, and authorization params | Verified in official source code | `codex-rs/login/src/server.rs` at pinned official commit |
| Official Codex CLI device-code endpoints and token exchange redirect URI | Verified in official source code | `codex-rs/login/src/device_code_auth.rs` |
| Codex OAuth client id `app_EMoamEEZ73f0CkXaXp7hrann` | Verified in official source code | `codex-rs/login/src/auth/manager.rs` |
| ChatGPT Codex backend base `https://chatgpt.com/backend-api/codex` for ChatGPT auth modes | Verified in official source code | `codex-rs/model-provider-info/src/lib.rs` |
| `Authorization: Bearer` and `ChatGPT-Account-ID` request headers | Verified in official source code | `codex-rs/model-provider/src/bearer_auth_provider.rs` and `auth.rs` |
| `originator` request/header parameter | Verified in official source code | Official source adds originator headers and auth params |
| Third-party reuse of the official Codex OAuth client id | Undocumented | Public availability in source does not mean OpenAI guarantees third-party usage |
| Third-party direct calls to `chatgpt.com/backend-api/codex` | Undocumented | Official docs document Codex products and API-key usage, not direct third-party ChatGPT backend integration |
| OpenClaw `originator=openclaw` acceptance | Open-source compatibility behavior; unresolved supportability | Observed in OpenClaw source only |
| Hermes `originator=codex_cli_rs` compatibility | Open-source compatibility behavior; policy risk | Observed in Hermes source only |
| JWT account claim names | Undocumented | Used by upstream implementations and official source, but not located in public docs |
| Codex backend rate-limit/error JSON codes | Open-source compatibility behavior/inferred | OpenClaw and Hermes parse known shapes; official contract not located |

## 6. Endpoint And Transport Inventory

| Endpoint or host | Used by | Purpose | Classification |
| --- | --- | --- | --- |
| `https://auth.openai.com/oauth/authorize` | OpenClaw, official browser flow | Authorization-code login | Verified official source; OpenClaw compatibility |
| `http://localhost:1455/auth/callback` | OpenClaw, official browser flow | Loopback browser callback | Verified official source; OpenClaw compatibility |
| `http://localhost:1457/auth/callback` | Official source fallback | Fallback loopback browser callback | Verified official source |
| `https://auth.openai.com/oauth/token` | OpenClaw, Hermes, official source | Code exchange and refresh | Verified official source; compatibility behavior |
| `https://auth.openai.com/api/accounts/deviceauth/usercode` | Hermes, official source | Device-code initiation | Verified official source; Hermes compatibility |
| `https://auth.openai.com/api/accounts/deviceauth/token` | Hermes, official source | Device-code polling | Verified official source; Hermes compatibility |
| `https://auth.openai.com/codex/device` | Hermes, official source | User verification page | Verified official source |
| `https://auth.openai.com/deviceauth/callback` | Hermes, official source | Device-code token exchange redirect URI | Verified official source |
| `https://chatgpt.com/backend-api/codex/responses` | OpenClaw, Hermes, official source | Direct Codex Responses invocation | Verified official source for base/path behavior; third-party use undocumented |
| `wss://chatgpt.com/backend-api/codex/...` | OpenClaw, official source | Responses WebSocket beta transport | Verified official source for beta header; third-party use undocumented |

## 7. Credential Ownership

OpenClaw components possessing tokens:

- The browser receives only the authorization redirect, not access or refresh tokens.
- The local callback listener sees the authorization code and state.
- The OpenClaw OAuth runtime exchanges the code and receives access and refresh tokens.
- OpenClaw's auth-profile store persists access token, refresh token, expiry, and account identity in per-agent SQLite JSON state.
- The OpenClaw direct transport receives the access token and account id to make backend requests.

Hermes components possessing tokens:

- The device-code helper receives only user/device codes until OpenAI returns an authorization code and PKCE verifier.
- Hermes token exchange receives access and refresh tokens.
- `~/.hermes/auth.json` stores access and refresh tokens under provider state and credential pool entries.
- Runtime credential resolution and the Codex transport possess access tokens.
- Hermes can read `~/.codex/auth.json` for import/self-heal; this is a material difference and should not be copied into Nuvitae.

T197 broker implication: Nuvitae should require a broker-owned credential lifecycle where only the broker has refresh tokens, API/worker queues never carry raw tokens, browser/callback surfaces never persist authorization codes, and shared Codex CLI or Hermes stores are not imported.

## 8. Security Controls

Observed controls:

| Control | OpenClaw | Hermes | T197 note |
| --- | --- | --- | --- |
| Storage protection | Per-agent SQLite file; no OS keychain or encryption observed in audited path | Atomic `0o600` JSON writes, parent dir hardening, cross-process locks | Nuvitae likely needs encrypted broker storage, owner scoping, backup rules, and key management beyond both projects |
| Callback protection | Loopback-only host validation, fixed callback path, state validation, manual state validation | No Codex callback listener | Nuvitae browser flow must bind loopback only, validate state, and avoid logging query strings |
| SSRF protection | Token helper exact-host allowlist for `auth.openai.com`, timeout, body cap | No comparable explicit allowlist observed in the audited Codex helper; constants are fixed | Nuvitae should fail closed on host/path allowlists for auth and backend |
| PKCE | Random verifier and S256 challenge | Device-code flow receives verifier/challenge from device-auth response | Nuvitae browser flow must generate broker-owned verifier and never expose verifier outside broker |
| State | Random state and equality check | Device-code flow does not use browser callback state | Required if browser flow is selected |
| Refresh race | Per-profile lock, re-read/adopt fresh credential, compare-and-save | Auth-store lock, re-read before refresh, credential-pool sync; Codex CLI import self-heal | Nuvitae should avoid shared external stores and serialize refresh per user/provider/account |
| Logging protection | Callback/server code logs booleans and sanitized errors; token endpoint has body caps | Auth store comments emphasize credential safety; errors can include status and parsed messages | Nuvitae must define token/code redaction tests |
| Multi-user isolation | Per-agent path; profile selection; not a full multi-tenant server design | Per-Hermes home/profile state and credential pool semantics | Nuvitae needs explicit tenant isolation independent of workstation profiles |
| Known risks | Undocumented direct backend, third-party originator, plaintext SQLite credential JSON, callback service exposure, JWT claim coupling | Undocumented backend, first-party-shaped originator, plaintext JSON credential store, optional shared Codex CLI import, status paths may carry access token internally | Must be resolved before T203 can unblock production |

## 9. Licensing

OpenClaw is MIT licensed at the pinned commit. The license permits use,
copying, modification, distribution, sublicensing, and sale, provided copyright
and permission notices are included in substantial copies. OpenClaw also records
third-party notices in `THIRD_PARTY_NOTICES.md`.

Hermes Agent is MIT licensed at the pinned commit. Its `pyproject.toml` declares
`license = "MIT"` and `license-files = ["LICENSE"]`.

Official OpenAI Codex source is Apache-2.0 at the pinned commit. The Rust
workspace declares `license = "Apache-2.0"`.

Relevant file licensing follows each repository's top-level license unless a
file-specific notice states otherwise; no conflicting file-level license notice
was observed in the audited files.

Adaptation result: MIT and Apache-2.0 are generally permissive, but T196 did not
copy implementation code. A clean-room reimplementation is preferable for T197+
because the target needs different trust boundaries, token ownership, encryption,
multi-user isolation, and official-support risk posture. Architecture facts may
inform design; implementation should be independently written with attribution
where upstream-derived details are documented.

## 10. Compatibility Risks

- Official docs support Codex product sign-in, not third-party direct OAuth use
  of the Codex CLI public client id.
- Official source verifies the client id and backend mechanics, but source
  visibility is not a support guarantee.
- `chatgpt.com/backend-api/codex` is an internal/product backend from the public
  evidence, not a documented public API surface for third-party server products.
- Header requirements and `originator` behavior may change without API
  deprecation guarantees.
- Hermes relies on first-party-shaped `originator: codex_cli_rs`; this is a
  compatibility workaround and should be treated as a policy and stability risk.
- OpenClaw's distinct `originator=openclaw` may be safer from an impersonation
  standpoint, but supportability remains undocumented.
- Refresh tokens appear single-use/rotation-sensitive in upstream handling;
  shared clients or duplicated stores can invalidate each other.
- JWT claim names and error bodies are not documented contracts.
- OpenAI may enforce client, originator, Cloudflare, account, workspace, or
  subscription policy changes that break third-party direct integrations.
- Neither audited implementation proves semantic parsing quality for resumes.

## 11. Unresolved Questions For T197

1. Should Nuvitae use browser Authorization Code with PKCE, device-code flow, or
   reject direct OAuth before login because third-party supportability is
   undocumented?
2. What official-support threshold is mandatory: documented public API, verified
   official source only, or open-source compatibility behavior?
3. Can Nuvitae accept an undocumented ChatGPT backend in a self-hosted product?
4. Must the broker use encrypted storage, OS keychain, application-managed
   envelope encryption, or database-backed secret storage?
5. How will refresh be serialized across workers, processes, hosts, and retries?
6. Should Nuvitae categorically forbid importing `~/.codex/auth.json` or any
   external token cache? This audit recommends forbidding it.
7. What exact callback binding model is acceptable for self-hosted deployments
   that may run on remote servers?
8. What telemetry and logging assertions are required to prove no token,
   authorization code, full callback URL, account email, or raw provider payload
   leaves the broker?
9. Does product/legal accept use of a public first-party client id without an
   explicit OpenAI third-party grant? This audit does not establish such a grant.
10. What fallback provider path is required if T203 is NO-GO?

## 12. Evidence Classification

Definitions used in this report:

- Officially documented: stated in OpenAI-controlled public docs observed on
  2026-07-31.
- Verified in official source code: present in the pinned official `openai/codex`
  source commit.
- Open-source compatibility behavior: implemented by pinned OpenClaw or Hermes
  source, but not documented by OpenAI as a third-party contract.
- Undocumented: not found in official docs as a supported public integration
  contract.
- Inferred: reasoned from source behavior or comments rather than documented
  contract language.
- Unresolved: insufficient evidence for a production claim.

Key evidence map:

| Claim | Classification |
| --- | --- |
| Codex CLI supports ChatGPT sign-in and API-key sign-in | Officially documented |
| Codex CLI caches login locally in `~/.codex/auth.json` or OS credential store | Officially documented |
| Official browser flow uses OpenAI auth host, PKCE, state, loopback callback, token exchange | Verified in official source code |
| Official device-code flow uses `/api/accounts/deviceauth/*` endpoints | Verified in official source code |
| Direct Codex backend base is `https://chatgpt.com/backend-api/codex` for ChatGPT auth modes | Verified in official source code |
| Public client id value | Verified in official source code |
| OpenClaw direct OAuth with `originator=openclaw` | Open-source compatibility behavior |
| Hermes direct device-code OAuth and `originator=codex_cli_rs` | Open-source compatibility behavior |
| Third-party right to use the public client id | Undocumented/unresolved |
| Third-party direct backend support guarantee | Undocumented/unresolved |
| Stable request/response/error contract for direct Codex backend | Undocumented/unresolved |

## T196 Completion Statement

T196 is complete as an audit only. The report is grounded in exact pinned source
files and commits above. T197-T203 remain incomplete and must continue strictly
in sequence. T164-T165 remain incomplete and blocked unless a later qualifying
T203 decision satisfies every required condition.
