# Codex Direct OAuth Invocation

Task: T200  
Date: 2026-07-31  
Status: Live attempted; T200 incomplete because the upstream synthetic invocation
gate failed with `unsupported_request_shape`.

## 1. Scope

This is a disposable compatibility spike for one minimal direct Codex invocation
using the encrypted credential state produced by T199. It does not parse a
resume, does not transmit resume content or personal user data, does not modify
production application code, and does not integrate the transport into the API,
web application, worker, domain, queues, PostgreSQL, or browser storage.

## 2. T196-T199 evidence basis

T196 recorded pinned upstream revisions for OpenClaw, Hermes Agent, and official
OpenAI Codex source. T197 selected an isolated broker boundary. T198 proved the
local browser OAuth callback flow. T199 proved encrypted credential persistence,
restart recovery, refresh, single-flight protection, logout/deletion behavior,
secret scanning, and the preserved encrypted handoff volumes.

## 3. Audited transport basis

- Official documentation: Codex supports ChatGPT sign-in for Codex products and
  official credential caching, but does not document direct third-party use of
  `chatgpt.com/backend-api/codex`.
- Official source: `CHATGPT_CODEX_BASE_URL` is
  `https://chatgpt.com/backend-api/codex`; bearer auth adds
  `Authorization: Bearer` and `ChatGPT-Account-ID`; the bundled model catalog
  includes `gpt-5.6-sol`; default client code applies an `originator` header.
- OpenClaw: direct Responses transport uses `/codex/responses`, SSE streaming,
  `originator: openclaw`, `OpenAI-Beta: responses=experimental`,
  `store:false`, `stream:true`, and a Responses-style body.
- Hermes: direct Codex provider uses the Codex backend and account header, but
  its first-party-shaped originator remains a different risk profile.

These are compatibility facts. They are not an official stable public API
contract for third-party applications.

## 4. Supported deployment mode

Only local macOS with local Docker Desktop, broker UID 1000, read-only key named
volume, read/write credential named volume, single-user spike mode, no callback
port, and no browser interaction are supported.

## 5. Broker and credential boundary

Only `t200-invocation-broker.mjs` decrypts the T199 credential envelope, observes
the access credential, observes the refresh credential, derives or reads the
provider account identifier, constructs credential-bearing headers, and parses
the raw upstream response. The parent receives only safe booleans, counts,
categories, and a one-way hash of the normalized synthetic result.

## 6. Request construction

The spike sends one fixed synthetic request with no resume content, no names, no
email addresses, no phone numbers, no employment history, no user files, no
repository content, no secrets, and no system information beyond the audited
protocol fields. The model is instructed to return exactly `NUVITAE_T200_OK`.
No tools are provided.

## 7. Required headers

Credential-bearing headers are constructed only inside the broker:

- `Authorization: Bearer <access credential>`;
- `ChatGPT-Account-ID: <provider account identifier>`;
- `originator: openclaw`;
- `OpenAI-Beta: responses=experimental`;
- `x-openai-internal-codex-responses-lite: true`;
- `session-id`, `thread-id`, `x-client-request-id`, and
  `x-codex-installation-id` generated as opaque request metadata;
- `Accept: text/event-stream`;
- `Content-Type: application/json`;
- a spike-specific user agent.

Evidence records only booleans confirming header application.

## 8. Account identity behavior

The account identifier is broker-only. The broker recovers it from the encrypted
credential payload or the audited JWT claim when present. The parent receives
only `account_header_applied` and `account_identifier_exposed_to_parent:false`.

## 9. Access-token expiry and refresh behavior

The broker decrypts the credential state, inspects expiry with a two-minute
skew, invokes directly if acceptable, or performs at most one refresh through
the T199 token endpoint logic when required. A successful refresh is atomically
encrypted and persisted before invocation. Invalid grant maps to
`invalid_grant`; refresh failure maps to `refresh_failed` without browser OAuth.

## 10. Synthetic request

The fixed marker is `NUVITAE_T200_OK`. The complete request and raw response are
not persisted.

## 11. Live invocation result

Live result is recorded in
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`.
The latest live attempt recovered encrypted state, found the refreshed access
credential still acceptable, applied broker-only authorization/account headers,
applied audited originator, OpenClaw beta, Responses Lite, and session/client
metadata, and attempted exactly one synthetic invocation. The upstream response
was a 4xx with empty content type/body, classified safely as
`unsupported_request_shape`. The synthetic marker was not observed and the
response protocol was not valid, so T200 remains incomplete.

## 12. Response protocol

The primary protocol is SSE. Valid events include `response.created`,
`response.output_text.delta`, `response.output_item.done`, and
`response.completed`. A strict bounded JSON fallback is tested for compatibility
but the live runner expects the audited streaming path.

## 13. Safe response projection

The broker projects only protocol validity, marker presence, event count, length
category, HTTP status category, and an optional SHA-256 hash of the normalized
synthetic result. Raw model output is not persisted unless it is only the fixed
marker; this implementation does not persist it even then.

## 14. Token-blindness

Raw access credential, refresh credential, authorization header, account
identifier, complete request headers, complete request body, and raw upstream
response remain inside broker memory only.

## 15. Secret scanning

The runner scans repository spike files, research evidence, and Docker logs for
token-like, callback-query, authorization-code, account-email, and bearer-token
patterns. Sanitized evidence excludes credential material and encrypted
envelopes.

## 16. Compatibility-sensitive behavior

Direct use of `chatgpt.com/backend-api/codex/responses`, `originator: openclaw`,
`OpenAI-Beta: responses=experimental`, `x-openai-internal-codex-responses-lite`,
the account header, bundled model identifiers, request metadata headers, SSE
event names, and backend error shapes are compatibility-sensitive and may
change without public API versioning.

## 17. Official-supportability limitations

Successful T200 invocation would prove only that the current account, current
credential state, pinned compatibility facts, and local Docker spike can reach
the transport. It would not make the transport an officially supported public
third-party API.

## 18. Failure classification

The spike distinguishes encrypted state, key, decryption, reconnect, refresh,
invalid grant, account identifier, account header, 401, 403, 429, model
availability, request-shape, response-protocol, timeout, DNS, TLS, redirect,
malformed response, response-size, upstream server, upstream protocol, and safe
unknown categories. It does not classify 429 as invalid credentials, generic 403
as invalid refresh token, transport failure as provider rejection, or unsupported
request shape as OAuth failure.

## 19. T201 entry implications

T201 may start only after T200 live evidence passes every mandatory gate and
T200 is marked complete. T200 success still would not authorize production Codex
adapter work or resume parsing.

## 20. Evidence classification

Evidence is live transport compatibility evidence with no personal data, no
resume data, no raw credential, no account identifier, no encrypted envelope, no
complete request payload, no complete response payload, and no production
integration.
