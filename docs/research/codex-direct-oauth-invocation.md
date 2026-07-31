# Codex Direct OAuth Invocation

Task: T200  
Date: 2026-07-31  
Status: Complete. One corrected direct synthetic Codex invocation succeeded using
the encrypted T199 credential state; no live invocation replay was performed
during finalization.

## 1. Scope

This is a disposable compatibility spike for one minimal direct Codex invocation
using the encrypted credential state produced by T199. It does not parse a
resume, does not transmit resume content or personal user data, does not modify
production application code, and does not integrate the transport into the API,
web application, worker, domain, queues, PostgreSQL, or browser storage.

## 2. T196-T199 evidence basis

T196 recorded pinned official Codex source plus corroborating implementation
revisions. T197 selected an isolated broker boundary. T198 proved the
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
- Corroborating implementations informed a compatibility differential only. The
  current value is described neutrally as a compatibility originator observed in
  the audited implementation; it is not a stable official integration contract.

These are compatibility facts. The direct backend transport works in this
tested local topology, but this is compatibility evidence only, not proof of a
stable or officially supported third-party public API. Future upstream protocol
changes may break compatibility.

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
- the compatibility originator observed in the audited implementation;
- `OpenAI-Beta: responses=experimental`;
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

After the pinned-source differential, the diagnostic request uses the standard
audited no-tools Responses shape: top-level `instructions`, one user
`message` input item with one `input_text` content part, `store:false`,
`stream:true`, `include:["reasoning.encrypted_content"]`, low reasoning,
low verbosity, prompt cache key, and bounded client metadata. It omits
Responses Lite, `additional_tools`, `tools`, `tool_choice`,
`parallel_tool_calls`, and `content-encoding`.

## 11. Live invocation result and diagnosis

The one bounded live result and pre-retry manifests are recorded in
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`.
The corrected request succeeded with exact HTTP status `200` and safe status
category `2xx`. The response had no `Content-Type` value, but body bytes were
present and were detected and parsed as SSE. Fifteen events were processed,
the response protocol was valid, and the assistant output marker
`NUVITAE_T200_OK` was verified. The earlier projection’s missing exact status
and body-read/parser handling were corrected before this successful result.

The request used the encrypted credential state recovered from T199. It sent no
resume or personal data, and no browser OAuth replay, refresh, or credential
renewal was required. No raw credential or account identifier reached the
parent, no raw request or response was persisted, the encrypted state remained
recoverable, and broker teardown succeeded. Callback port `1455` remained
absent because T200 does not publish a callback port.

The live stream included `response.content_part.added` and
`response.content_part.done`. These valid structural events required explicit
parser support and were processed with bounded matching; they are not generic
unknown-event exemptions. The sanitized evidence records no raw response
content, response IDs, item IDs, session IDs, request IDs, headers, or encrypted
envelope contents.

The source differential corrected request construction before this result. No
further live request has been executed. The corrected manifest has no mismatch
against the selected audited no-tools shape; the prior form omitted top-level
`instructions` and used a Lite-style three-item input.

## 12. Response protocol audit

Pinned official Codex revision `3016671bb077c43448b8fa88f3edfa9772e17058`
uses `Accept: text/event-stream` in
`codex-rs/codex-api/src/endpoint/responses.rs`, then sends the byte stream
through the EventSource decoder in `codex-rs/codex-api/src/sse/responses.rs`.
The same file handles `response.created`, `response.in_progress`,
`response.output_text.delta`, `response.output_item.done`,
`response.failed`, `response.incomplete`, and `response.completed`; its caller
rejects a stream that closes before `response.completed` in
`codex-rs/core/src/session/turn.rs`. Encrypted reasoning is requested by
`codex-rs/core/src/client.rs` and must not be output-extracted.

SSE is the official-source expectation. The spike treats JSON as a separate,
strict, bounded compatibility path because a missing or altered content type was
observed live. It ignores SSE comments/keepalives, supports CRLF/LF and multiple
`data:` lines, accepts a `[DONE]` sentinel only as non-success supplementary
termination, and treats a terminal response event as required. The audited
official HTTP code selects request compression but does not supply this spike's
response decompression contract; the spike explicitly supports only gzip,
deflate, and br through Node's audited standard library with decompressed limits.

The live backend also emitted `response.content_part.added` and
`response.content_part.done`, which are official Responses streaming lifecycle
events. The previous parser incorrectly classified those valid structural events
as mandatory unknown events. T200 now allowlists both explicitly with bounded
validation: each event requires non-negative bounded output and content indexes,
and `content_part.done` must match a previously observed compatible
`content_part.added` by those indexes and opaque item identifier. Both events
support only the synthetic text-only `output_text` part category. The done event
is non-terminal for the complete response, contributes no assistant text, and
cannot establish marker success by itself. When final part text is present, it
is compared in memory with already verified output text and is never persisted.
Item identifiers, annotations, text, and raw part payloads are not persisted or
projected. Safe diagnostics contain only observation/match/consistency booleans
and the bounded content index. Generic unknown-event handling remains fail-closed
and is still handled individually rather than by a generic ignore rule.

## 13. Safe response projection

The broker projects exact numeric status, status category, Content-Type category
and parameter presence, Content-Encoding and Transfer-Encoding categories,
Content-Length presence, body presence and byte-stream state, first non-empty
chunk length and bytes categories, request-id and retry-after presence, protocol
validity, marker presence, event count, length category, and an optional hash of
the normalized synthetic result. It never persists header values, cookies,
request IDs, raw response text, raw events, credentials, account metadata, or
model output beyond the fixed marker check.

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

Direct use of `chatgpt.com/backend-api/codex/responses`, the compatibility
originator observed in the audited implementation, `OpenAI-Beta: responses=experimental`,
the account header, bundled model identifiers, request metadata headers, SSE
event names, and backend error shapes are compatibility-sensitive and may
change without public API versioning.

## 17. Official-supportability limitations

The successful T200 invocation proves only that the current account, encrypted
credential state, pinned compatibility facts, and local Docker spike can reach
the transport in this tested local topology. It is compatibility evidence only,
not proof of a stable or officially supported third-party public API. Future
upstream protocol changes may break compatibility.

## 18. Failure classification

The spike distinguishes encrypted state, key, decryption, reconnect, refresh,
invalid grant, account identifier, account header, 401, 403, 429, model
availability, request-shape, response-protocol, timeout, DNS, TLS, redirect,
malformed response, response-size, upstream server, upstream protocol, and safe
unknown categories. It does not classify 429 as invalid credentials, generic 403
as invalid refresh token, transport failure as provider rejection, or unsupported
request shape as OAuth failure.

The corrected classifier separately records `400` as `invalid_request_shape`,
`401` as `unauthorized`, `403` as `forbidden_or_entitlement` unless the account
header is specifically implicated by a safe JSON body, `404` as
`endpoint_or_model_not_found`, `409` as `conflict`, `422` as
`semantic_request_validation`, and `429` as `quota_or_rate_limit`. Other 4xx
responses use `exact_http_4xx_<status>`.

## 18a. Differential artifact

The bounded request-shape differential is recorded in
`docs/research/codex-direct-request-shape-differential.md`. Sanitized manifests
and machine-readable mismatch lists are recorded in
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`.

## 19. T201 entry implications

T201 may start only after T200 live evidence passes every mandatory gate and
T200 is marked complete. T200 success still would not authorize production Codex
adapter work or resume parsing.

## 20. Evidence classification

Evidence is live transport compatibility evidence with no personal data, no
resume data, no raw credential, no account identifier, no encrypted envelope, no
complete request payload, no complete response payload, and no production
integration.
