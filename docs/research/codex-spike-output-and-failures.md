# Codex Subscription Spike: Structured Output And Failures

Date: 2026-07-30

Scope: T142 only. This artifact defines the temporary spike-only schema and records strict-output, timeout, malformed-output, unavailability, auth, quota, and diagnostic behavior.

## Decision

No-go for production structured-output reliability until authenticated provider runs validate schema-valid response rate, evidence validity, malformed output, timeout, quota, and expired-auth behavior. The local CLI supports `--output-schema`, but that is not enough to accept unmeasured resume extraction quality.

## Verified Official Behavior

- `codex exec` supports `--output-schema <FILE>`: <https://developers.openai.com/codex/cli/reference/>
- `codex exec` supports JSONL event output with `--json`: <https://developers.openai.com/codex/cli/reference/>
- `codex exec` supports writing the final response to a file with `--output-last-message`: <https://developers.openai.com/codex/cli/reference/>

## Temporary Spike Schema

The spike-only schema is stored in [`codex-spike-structured-output.schema.json`](./codex-spike-structured-output.schema.json). It is intentionally exploratory and must not replace the provider-independent Nuvitae contract planned in T146-T152.

The schema tests personal information, work experience grouping, education, skills, languages, source evidence, explicit versus inferred values, confidence categories, and diagnostics.

Strict validation rules for the spike:

- Reject unknown top-level fields.
- Reject unsupported confidence categories.
- Reject missing evidence for extracted values and relationships.
- Reject values whose evidence fragment is not present in the prepared input.
- Treat inferred values as review-required and never enough by themselves to create a draft.
- Treat malformed JSON, schema errors, missing evidence, invented values, provider-native leakage, and timeout as failed attempts.

## Experimentally Observed Behavior

Observed local provider-unavailability behavior with empty isolated `CODEX_HOME`, read-only sandbox, JSONL mode, and output schema:

```text
failed to connect to websocket ... wss://api.openai.com/v1/responses
Falling back from WebSockets to HTTPS transport
stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)
turn.failed
```

Observed missing-auth behavior:

```text
codex login status
Not logged in
```

Observed malformed CLI invocation behavior:

```text
error: unexpected argument '--ask-for-approval' found
```

This is relevant because automation must pin and test the actual CLI version rather than assuming every documented or previous-version flag is available.

## Failure Matrix

| Failure | Safe spike result |
| --- | --- |
| Missing authentication | `auth_expired` or `disconnected`; reconnect required |
| Provider unavailable/network blocked | `provider_unavailable`; retry or alternative provider |
| Quota/subscription exhausted | Unverified; must be measured without forcing account abuse |
| Timeout | Unverified; external process timeout required |
| Malformed output | Unverified; strict validator must reject |
| Missing evidence | Unverified; strict validator must reject candidate |
| Invented field | Unverified; no-invention validator must reject candidate |
| Provider-native JSON leakage | Unverified; schema must reject unknown fields |

## Inference

`--output-schema` can be used as part of a strict-output strategy, but Nuvitae must still independently parse and validate the captured final message. Provider events and intermediate logs are diagnostics, not trusted extraction output.

## Unresolved Questions

- Whether Codex final responses conform to JSON Schema reliably across French, English, bilingual, single-column, multi-column, PDF-derived, and DOCX-derived fixtures.
- Whether malformed output can be reproduced safely without prompt injection against real resume content.
- Whether quota errors are distinguishable from rate limits and provider unavailability in CLI exit codes or JSONL events.

## Blockers

- Authentication no-go from T139.
- No real provider responses were available in this environment.

## Security Concerns

- JSONL diagnostics may include enough provider metadata to leak account or source details unless explicitly redacted.
- Prompts and raw provider payloads must not be logged.

## Product Implications

Production implementation must define provider-neutral failure states before adapter code. Users should see plain-language recovery states, not raw Codex messages, model names, prompts, JSON, or CLI diagnostics.
