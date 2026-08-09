# Compatibility archive for canonical T201 document

Canonical path: [`docs/research/codex-direct-semantic-parsing.md`](codex-direct-semantic-parsing.md).

This archive preserves the useful historical C01 transport, limit, privacy,
failure, and sanitized live-evidence detail from the original T201 document.
It is not a second acceptance target and must not be extended with new matrix
results. The existing C01 evidence remains unchanged.

# Codex Direct-OAuth Semantic Parsing Spike (T201 historical C01)

Observation date: 2026-07-31, Europe/Paris workspace context.

## 1. Scope

T201 is a disposable local compatibility spike only. It does not implement the
production semantic parser, does not integrate Codex into the web app, API,
worker, queues, database, or normal import pipeline, and does not modify
production application code.

The objective was to determine whether the T200 direct Codex transport can parse
one entirely synthetic resume into a strict, source-grounded Nuvitae-shaped
resume structure with deterministic validation for schema correctness,
evidence, grounding, no invention, and privacy boundaries.

T201 depends on completed T200. T202 and T203 remain out of scope and were not
started.

## 2. Synthetic fixture design

Fixture:

- `spikes/codex-direct-oauth/fixtures/t201-synthetic-resume.txt`

The fixture is bounded plain text and deliberately synthetic. It includes:

- identity block;
- professional summary;
- two work experiences;
- one education entry;
- technical skills;
- languages;
- one certification;
- dates in multiple textual forms (`March 2022 – Present`, `2019 to Feb. 2022`,
  and `2015-2019`);
- measurable achievements;
- one ambiguous platform-reliability statement;
- explicit absent fields for phone, degree grade, employment type, employer
  locations, management responsibility, and certification issuer;
- one client-visit/location statement that must not become employer location.

No real resume, real person, real email domain, real phone number, real employer,
real school, real address, uploaded file, production data, repository secret,
LinkedIn data, or job-offer data was used.

## 3. Expected-facts manifest

Independent manifest:

- `spikes/codex-direct-oauth/fixtures/t201-expected-facts.json`

The manifest is maintained independently of model output and records:

- 34 exact source facts;
- high-priority mandatory facts;
- expected section counts;
- expected item counts;
- intentionally absent fields;
- ambiguous facts;
- forbidden inferences;
- pass thresholds.

The live output did not pass far enough to compare semantic content.

## 4. Output schema

Schema:

- `spikes/codex-direct-oauth/schemas/t201-output-schema.json`

The schema is strict and bounded. Top-level fields are limited to:

- `schema_version`;
- `document_language`;
- `basics`;
- `work_experiences`;
- `education`;
- `skills`;
- `languages`;
- `certifications`;
- `ambiguities`;
- `warnings`.

Every non-null extracted value must be represented as `{ "value": string,
"evidence": [...] }`. Optional unsupported or absent values such as phone,
work-location, education grade, and certification issuer must be `null`.

## 5. Structured-output mechanism

Local official-source review from T196/T200 found the direct Codex backend
request shape verified for Responses-style text generation over the audited
transport, but did not verify a strict JSON-schema structured-output field for
this direct backend.

T201 therefore used the required fallback:

- prompt requests JSON only;
- prompt requests one compact/minified JSON object only;
- prompt requests no Markdown, explanations, source excerpts, repeated fixture
  text, reasoning summary, or optional fields outside the strict schema;
- evidence references are constrained to line/start/end/hash/category;
- strict local parser rejects Markdown fences, prefix/suffix text, duplicate
  keys, excessive output size, excessive nesting, excessive arrays, excessive
  strings, and malformed JSON;
- local schema validation rejects unknown top-level fields and invalid nested
  structure.

Structured-output mechanism category:

- `json_only_local_strict_parser`

## 6. Prompt boundary

The broker prompt included only:

- the synthetic fixture;
- the strict schema;
- parsing instructions;
- evidence requirements;
- source-local line/hash reference data derived from the fixture;
- fixed task metadata required by the audited transport.

The prompt boundary test verifies the prompt excludes host paths, account
identifiers, access-token strings, and refresh-token strings.

The prompt did not include repository content, credentials, account identifier,
system information unrelated to T201, previous real user conversations, uploaded
files, or real resume data.

The refreshed prompt keeps the same semantic, evidence, grounding, and
no-invention requirements while reducing unnecessary output by requiring compact
JSON, forbidding explanations and source excerpts, and forbidding fields outside
the strict schema.

## 7. Evidence format

Evidence uses source-local references:

```json
{
  "line": 14,
  "start": 0,
  "end": 20,
  "fragment_hash": "lowercase-sha256-of-normalized-fragment",
  "category": "work"
}
```

The evaluator independently verifies:

- line exists in the fixture;
- start/end offsets are in bounds;
- end is greater than start;
- the normalized fragment hash matches the referenced source region;
- the extracted value is supported by the referenced region;
- fabricated locations are rejected.

Large source excerpts are not persisted in evidence.

## 8. Deterministic evaluator

Evaluator:

- `spikes/codex-direct-oauth/lib/t201-semantic-evaluator.mjs`

The evaluator calculates:

- `schema_valid`;
- `JSON_only_valid`;
- `expected_section_recall`;
- `expected_item_recall`;
- `exact_fact_recall`;
- `high_priority_fact_recall`;
- `unsupported_fact_count`;
- `missing_evidence_count`;
- `invalid_evidence_count`;
- `ambiguous_fact_handling_count`;
- `forbidden_inference_count`;
- `null_for_absent_fields_count`;
- `source_grounding_pass`;
- `no_invention_pass`;
- `parsing_pass`.

Mandatory T201 pass thresholds:

- strict schema valid;
- JSON-only output valid;
- expected section recall = 1.0;
- expected item recall = 1.0;
- exact fact recall >= 0.9;
- high-priority fact recall = 1.0;
- unsupported fact count = 0;
- forbidden inference count = 0;
- missing evidence count = 0;
- invalid evidence count = 0;
- absent optional fields remain null;
- ambiguous platform-reliability line is handled as ambiguity/warning.

## 9. Limit audit and refresh

Previous shared transport limits used by T200 and inherited by the first T201
attempt:

| Limit | Previous value |
|---|---:|
| Total compressed response bytes | 262,144 |
| Total decompressed response bytes | 262,144 |
| Maximum individual SSE event bytes | 262,144 |
| Maximum SSE event count | 80 |
| Maximum assembled assistant-output bytes | 8,192 |
| Maximum T201 structured JSON bytes | 32,768 |

The verified T201 evidence recorded `response_event_count: 81`,
`safe_transport_classification: response_too_large`, and no terminal response
protocol. The exact limit that triggered the live abort was therefore the
previous maximum SSE event count of 80, not the request path, credential
recovery, HTTP status, schema gate, grounding gate, or no-invention gate.

The prior refreshed T201 limits were incompatible with a later fresh diagnostic:
the backend emitted 1,018 `response.output_text.delta` events for only 2,877
assembled assistant-output bytes. No reasoning events were observed. The parser
therefore reached its 1,024 typed-protocol-event ceiling before a terminal event,
despite the expected deterministic structured result being only 7,370 bytes.

Current explicit T201 limits:

| Limit | T201-only value |
|---|---:|
| Total compressed response bytes | 1,048,576 |
| Total decompressed response bytes | 1,048,576 |
| Maximum individual SSE event bytes | 262,144 |
| Maximum typed JSON protocol event count | 4,096 |
| Maximum assembled assistant-output bytes | 65,536 |
| Maximum structured JSON bytes | 65,536 |

The 4,096-event budget is T201-specific bounded compatibility headroom for the
observed small-delta fragmentation, not a stable public-protocol guarantee. It
remains bounded by the 1 MiB response ceilings and the 64 KiB assistant/JSON
ceilings. The 64 KiB assistant and JSON limits are substantially stricter than
the prior 229,376-byte limits while remaining comfortably above the 7,370-byte
deterministic golden result. This changes no semantic schema, evidence,
grounding, or no-invention acceptance requirement.

Absolute hard ceilings enforced before any network request:

| Limit | Hard ceiling |
|---|---:|
| Total compressed response bytes | 1,048,576 |
| Total decompressed response bytes | 1,048,576 |
| Maximum individual SSE event bytes | 262,144 |
| Maximum typed JSON protocol event count | 4,096 |
| Maximum assembled assistant-output bytes | 65,536 |
| Maximum structured JSON bytes | 65,536 |

Invalid, missing, non-integer, unlimited, zero, or above-ceiling response limit
values fail during local limit validation before any network request.

Future T201 evidence now carries only bounded integers/categories for:

- `response_byte_limit`;
- `response_bytes_observed_before_abort`;
- `response_bytes_category`;
- `response_compressed_byte_limit`;
- `response_compressed_bytes_observed_before_abort`;
- `response_decompressed_byte_limit`;
- `response_decompressed_bytes_observed_before_abort`;
- `response_event_byte_limit`;
- `largest_sse_event_bytes_observed`;
- `triggering_sse_event_bytes`;
- `average_sse_event_bytes_category`;
- `response_event_limit`;
- `response_events_observed_before_abort`;
- `assistant_output_byte_limit`;
- `structured_json_byte_limit`;
- `limit_that_triggered`;
- `response_truncated_by_safety_limit`.

Response text and SSE event payloads remain unpersisted.

## 10. No-invention policy

The evaluator rejects or fails output that invents:

- phone number;
- employer location;
- skill not present in the source;
- skill proficiency not present in the source;
- management responsibility;
- employment type;
- degree grade;
- certification issuer;
- normalized dates more precise than the source;
- technologies absent from the source;
- hard platform-reliability achievement derived from the ambiguous statement.

## 11. Live result

One live T201 semantic parsing request was attempted after deterministic fixture,
manifest, schema, evaluator, mocked-response tests, existing spike tests, secret
scan, and disposable image build.

Sanitized evidence:

- `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-semantic-parsing.json`

Observed safe result:

- encrypted T199 state recovered: yes;
- refresh required: no;
- invocation attempted: yes;
- invocation succeeded: no;
- exact safe HTTP status: `200`;
- safe HTTP status category: `2xx`;
- safe transport classification: `response_too_large`;
- response protocol valid: no;
- schema valid: not evaluated;
- grounding pass: not evaluated;
- no-invention pass: not evaluated;
- parsing pass: no;
- T201 transport manifest matched T200: yes;
- T201 transport mismatches: none;
- raw model response persisted: no;
- credential/account exposure: no;
- encrypted state preserved: yes;
- broker removed: yes;
- callback port absent: yes;
- secret scan: passed.

Primary failed gate after the refresh classification: `output_too_large`.
Failure phase: `response_body_read`.

The broker did not persist raw model response text. No full parsed synthetic
resume was returned to the parent.

## 12. Quality metrics

Because the HTTP response exceeded a bounded output limit before a terminal SSE
event, structured output and semantic quality were not evaluated:

| Metric | Value |
|---|---:|
| `schema_valid` | null |
| `JSON_only_valid` | null |
| `expected_section_recall` | null |
| `expected_item_recall` | null |
| `exact_fact_recall` | null |
| `high_priority_fact_recall` | null |
| `unsupported_fact_count` | null |
| `forbidden_inference_count` | null |
| `missing_evidence_count` | null |
| `invalid_evidence_count` | null |
| `source_grounding_pass` | null |
| `no_invention_pass` | null |
| `parsing_pass` | false |

The null counts mean no structured candidate values were evaluated, not that
semantic parsing quality passed.

## 13. Failures and ambiguities

Failure classification:

- primary failure category: `output_too_large`;
- primary failure phase: `response_body_read`;
- safe transport classification: `response_too_large`;
- structured output: not evaluated;
- semantic quality: not evaluated.

The live attempt did not reach semantic evaluation of ambiguities. Mocked tests
prove the local evaluator accepts the ambiguous statement only when represented
as warning/ambiguity and fails if converted into a hard platform-reliability
achievement.

No automatic retry was performed and validation was not weakened.

## 14. Privacy boundary

Only the broker accessed:

- decrypted access token;
- refresh token;
- account identifier;
- credential-bearing headers;
- raw model text if present.

The parent received only:

- safe success/failure booleans;
- exact safe HTTP status category/status;
- evaluation metrics;
- fixture identifier and hash;
- counts;
- sanitized error categories;
- privacy/teardown booleans.

The parent did not receive raw credentials, account identifiers, raw model
response, complete prompt, response IDs, item IDs, session IDs, or full parsed
synthetic resume.

## 15. Encrypted-state preservation

The live attempt recovered the encrypted T199 state and did not require refresh.
Credential generation remained unchanged at `6`. The encrypted credential state
was preserved and no plaintext credential/account identifier appeared in the
sanitized evidence.

## 16. Bounded retry command

One later bounded T201 retry, after explicit authorization, is:

```bash
sh spikes/codex-direct-oauth/run-t201-live.sh
```

Do not run that command as part of this refresh unless a live invocation is
explicitly authorized. The later retry remains bounded by the explicit T201
limits above, including the 4,096-event ceiling.

## 17. T202 entry implications

T202 must not start from this result. T201 did not pass mandatory gates:

- invocation did not succeed;
- response protocol was not valid;
- strict schema validation did not succeed;
- evidence validation did not run on accepted values;
- no-invention did not pass;
- mandatory facts and sections were not recovered.

The correct next action is to diagnose the transport failure or rerun a bounded
T201 attempt only after explicit authorization and without weakening schema,
prompt, evidence, or no-invention validation.

## 18. Compatibility and supportability limitations

This result does not prove Codex cannot semantically parse synthetic resumes. It
proves only that the first T201 live semantic parsing attempt through the
currently audited direct transport did not produce a valid response.

The direct backend remains compatibility-sensitive and undocumented for
third-party production use unless official sources document it. Production Codex
adapter tasks T164-T165 remain blocked. T202-T203 remain incomplete.

## 19. SSE diagnostic counting contract

This follow-up changes diagnostics only; it made no network request, OAuth login,
credential refresh, prompt change, or reasoning change. The pinned official Codex
source revision recorded by T196 represents streamed Responses output as typed
protocol events rather than transport chunks. The spike parser therefore defines
`response_event_count` as `typed_json_protocol_events`: non-empty SSE `data`
dispatches that parse to a JSON object with a valid string `type` discriminator.

Raw byte chunks, decoded fragments, SSE lines, blank dispatches, comments,
keepalives, empty dispatches, and `[DONE]` are observed separately and never
consume the event-count budget. A multi-line SSE data payload yields one JSON
object and one count. Parsed but untyped JSON, malformed JSON, and empty
dispatches do not count as protocol events.

The earlier 1,024-event ceiling was incompatible with the observed backend
fragmentation and is replaced only for T201 by a 4,096-event ceiling. When
event 4,097 is seen, the parser throws the existing bounded `sse_event_count`
failure while attaching a
count-only snapshot: framing counts, parsed/typed/recognized/unknown counts,
event-type histogram, assistant-output byte count, terminal flag, and an
average whose explicit denominator is `typed_protocol_event_count`. No data
payload, output text, reasoning, identifiers, sequence numbers, or raw error
messages enter that snapshot. The transport, broker, and runner project the same
sanitized snapshot so a later authorized retry can explain its abort truthfully.
