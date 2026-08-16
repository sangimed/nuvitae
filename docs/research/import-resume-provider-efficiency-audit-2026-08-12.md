# Provider-bound resume import efficiency audit

Date: 2026-08-12

Scope: offline audit and one bounded low-risk V2 wire reduction after the first
real-provider latency baseline. No live provider call was made in this work.

## A. Provider request size breakdown

The anonymous realistic two-page PDF was extracted offline through the active
PDF.js path. The privacy-safe audit records counts and byte sizes only:

| Measure                               |       Result |
| ------------------------------------- | -----------: |
| Normalized transcript characters      |        2,711 |
| Provider source fragments             |           39 |
| Instruction bytes                     |        4,968 |
| Document payload bytes                |        4,655 |
| Semantic input bytes                  |        4,712 |
| Complete provider request JSON        | 10,671 bytes |
| Transport/request structural envelope |    530 bytes |

The request contains the normalized fragment identifiers, ordering, and text;
the full provider-neutral request object is not logged. The instruction and
document portions account for almost all request bytes. Local request setup is
sub-millisecond in the same offline fixture.

A larger deterministic structural fixture (181 grounded atoms) measured 19,447
request bytes: 4,968 instruction bytes, 12,011 document payload bytes, and
12,068 semantic-input bytes. These are shape measurements only; no source
content is emitted by the audit.

Current provider settings audited without changing them during the initial
inspection: `reasoning.effort=low`, `text.verbosity=low`, `stream=true`,
`store=false`, no provider `response_format`/strict JSON-schema parameter, and
minified JSON requested through instructions.

## B. Provider response/output shape breakdown

The deterministic V2 structural fixture measured:

| Measure                                           |                  Result |
| ------------------------------------------------- | ----------------------: |
| Response JSON                                     |            19,593 bytes |
| Semantic atoms/candidates                         |                     181 |
| Source references                                 |                     181 |
| Candidate value bytes                             |                   2,766 |
| Source-reference quote bytes                      |                   2,766 |
| Structural/protocol bytes after values and quotes |                  14,061 |
| Empty arrays                                      |                       3 |
| Explicit null values                              |                       1 |
| Repeated fragment IDs                             | 0 in this dense fixture |
| Provider-generated IDs                            |                       0 |
| Provider metadata fields                          |                       0 |

The anonymous realistic golden review fixture covers 70 mapped draft fields,
four employers, five roles, three education entries, eight skills, three
languages, two certifications, three professional links, and zero projects.
The compact and full forms produce identical canonical candidates and mapped
draft fields.

The current V2 output already excludes provider IDs, hashes, offsets, line
numbers, confidence, classifications, normalized values, physical coordinates,
review metadata, persistence metadata, and diagnostic prose. Source references
remain the dominant correctness-bearing repeated structure.

## C. Semantic V2 responsibility classification

| V2 property/group                                                  | Class                   | Decision                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                                                    | D                       | Protocol versioning, not semantic content. Required at the adapter boundary.                                                                                                                                            |
| `sections`, `contact`, section arrays, group wrappers, field names | D                       | Routing/protocol structure. Work/employer/role nesting also carries semantic grouping and therefore cannot be flattened casually.                                                                                       |
| Atom `value`                                                       | A                       | The provider selects the semantic span/value; local code must not infer it from unrelated text.                                                                                                                         |
| Atom `sourceRefs.fragmentId` and `sourceRefs.quote`                | B                       | Required source evidence and grounding anchor. No global or fuzzy source matching is allowed.                                                                                                                           |
| Work employer/role grouping                                        | A + D                   | The association is semantic information; the wrapper is protocol structure. Preserve separate roles and employer groups.                                                                                                |
| Dates, headline, summary, skills, languages, certifications, links | A                       | Provider must identify and group explicit source facts. Local code only normalizes bounded typed values after grounding.                                                                                                |
| `ambiguities[].kind`, `conflicts[].kind`                           | A                       | Semantic interpretation/uncertainty that requires provider understanding.                                                                                                                                               |
| Ambiguity/conflict `sourceRefs`                                    | B                       | Evidence for the provider's semantic signal.                                                                                                                                                                            |
| `relationships`                                                    | D/E for current Phase 1 | The only reserved relationship is rejected by the current canonicalizer and has no supported destination. Empty relationship output is safely omitted and restored as `[]`; non-empty relationships remain fail-closed. |
| Explicit `null` optional scalars                                   | E                       | Absence is deterministic and can be reconstructed as `null`. Required semantic anchors are not synthesized.                                                                                                             |
| Empty optional collections                                         | E                       | Absence is deterministic and can be reconstructed as `[]`.                                                                                                                                                              |
| Provider candidate IDs                                             | C                       | Already removed; Nuvitae owns deterministic import-scoped identity.                                                                                                                                                     |
| Confidence/classification/inference/review metadata                | C                       | Already reconstructed by Nuvitae policy after grounding.                                                                                                                                                                |
| Physical PDF/DOCX coordinates, hashes, offsets, line metadata      | C                       | Deterministic extraction/enrichment owns these; the provider does not predict them.                                                                                                                                     |
| Repeated quote/value metadata                                      | D/C boundary            | Quotes and fragment IDs are required evidence. Value cannot generally be removed because a quote may include disambiguating context; local reconstruction must not become fuzzy/global matching.                        |

## D. Redundant output identified

The clearly safe redundancy is deterministic absence metadata: empty arrays and
nullable optional fields. The provider was instructed to omit those markers on
the wire. The V2 canonicalizer restores only the known paths before applying
the unchanged strict V2 envelope and downstream grounding/canonicalization.

No required evidence, long-form value, work/education grouping, semantic field,
or source anchor was removed. Required anchors such as employer name, usable
role title, institution, skill name, certification name, project name, and URL
remain mandatory.

## E. First-output latency hypothesis

The real trace had response headers at about 1.7 seconds but first semantic
output at about 15 seconds. The transport marks first semantic output only when
it sees a non-empty output-text event; it ignores reasoning-summary and other
non-semantic events. Therefore the gap is provider-side generation/planning
after headers, not local parsing.

The most likely hypothesis is substantial hidden reasoning or response planning
before the first JSON output token. This is not proven from the privacy-safe
timing record alone. The current request uses low reasoning effort and low text
verbosity, but no strict provider response-format parameter is configured; the
instruction-only JSON contract may still allow a long pre-output phase. The
next bounded run should compare categorical SSE event types and timing phases,
without recording event payloads.

## F. Current value of SSE streaming

Streaming is currently transport-level. The parser observes frames and records
first-output timing, but buffers the complete response before V2 canonicalization,
draft creation, and review availability. There is no current user-visible
progressive semantic content.

Incremental validated section processing is technically possible with an
incremental JSON parser, but it would need new rules for incomplete groups,
long-form evidence, cross-field relationships, warnings, cancellation, and
draft state. Exposing incomplete or not-yet-grounded values would violate the
review and fail-closed boundary. Progressive review is therefore not included
in this pass.

## G. Ranked optimization candidates

| Rank | Candidate                                                                                                  | First output   | Generation/output | Complexity | Grounding risk                                                     | Compatibility risk                        |
| ---: | ---------------------------------------------------------------------------------------------------------- | -------------- | ----------------- | ---------- | ------------------------------------------------------------------ | ----------------------------------------- |
|    1 | Compact deterministic `null`/`[]` absence markers (implemented)                                            | Low            | Low/low-medium    | Medium     | Low                                                                | Low                                       |
|    2 | A/B provider setting experiment for minimal/no reasoning and strict response formatting, only if supported | Medium/high    | Medium/high       | Medium     | Medium                                                             | Medium/high                               |
|    3 | Remove deterministic fragment `order` from the provider-only input and reconstruct it from array order     | Low            | Low               | Low        | Low                                                                | Low/medium                                |
|    4 | Stop asking the provider to emit unsupported non-empty Phase 1 relationships                               | Low            | Low               | Low        | Low                                                                | Medium because it changes prompt behavior |
|    5 | Incremental validated streaming and progressive review                                                     | High potential | High potential    | High       | Medium/high                                                        | High                                      |
|    6 | Remove atom `value` or source quotes                                                                       | Unclear        | Potentially high  | High       | High; quotes may contain context and values may select a substring | High                                      |

The local ~600 ms path remains out of scope as directed. No T217 call budget,
fallback behavior, long-form fidelity, evidence requirements, or source matching
rules were changed.

## H. Optimization implemented

Implemented exactly one optimization: compact absence-only V2 provider output.

- The prompt directs the provider to omit empty collections and absent optional
  nullable fields.
- The canonicalizer expands only allowlisted absence paths to the existing
  `[]`/`null` representation.
- Required semantic anchors are never synthesized.
- The strict public V2 schema remains unchanged for the expanded response.

## I. Offline semantic equivalence

Passed. The anonymous realistic golden fixture produces the same canonical
candidates, evidence, warnings, and mapped review-draft fields in full and
compact forms. It retains zero invented projects and the existing warning
behavior. The complete review/confirmation regression remains green.

Focused V2/provider tests: 35 passed. Broader offline semantic/provider suite:
281 passed, with the persistence integration suite separately passing 16/16
once its required test database environment was supplied. No provider, OAuth,
or network activity occurred.

## J. Estimated impact

On the dense 181-atom fixture, the response fell from 19,593 to 19,527 bytes,
66 bytes or about 0.34%. A sparse resume with more absent scalar fields and
empty collections will save more. This is not expected to materially change a
15-second first-output or 53-second generation trace; it is a low-risk first
step that removes redundant generation requirements without touching semantic
content. The exact live effect remains unmeasured.

## K. Risks

- A provider may continue emitting the full form; the expanded boundary accepts
  both forms.
- An omitted required anchor is not defaulted and remains rejected or unusable.
- Compact expansion must stay allowlisted; broad recursive defaulting would
  weaken fail-closed behavior.
- Prompt/request byte reduction is not guaranteed to reduce model latency; the
  dominant cost is provider generation/reasoning.
- The first-output hypothesis remains unproven until a later bounded A/B run.

## L. Validation

- Docker package typecheck passed.
- Scoped ESLint passed.
- Scoped Prettier check passed.
- `git diff --check` passed.
- V2 canonicalizer, schema, adapter, transport, worker, prompt-injection,
  sparse/ambiguous, and golden-fidelity tests passed.
- Offline realistic PDF request audit passed with no provider activity.

## M. Exact bounded A/B live-test plan

Do this later, only after operator authorization and a valid connected provider:

1. Prepare two local treatment variants without changing domain contracts: A is
   the pre-compaction prompt with the current canonicalizer accepting both
   forms; B is the compact-absence prompt and canonicalizer from this audit.
2. Use the same anonymous realistic two-page PDF, same provider account,
   isolated container deployment, and two fresh import IDs.
3. Run exactly one primary provider request for A and exactly one for B: two
   total provider requests, zero automatic retries, zero fallback calls, one
   upload/import per arm. Stop immediately if either arm falls into fallback,
   malformed output, grounding failure, or a non-reviewable terminal state.
4. Capture only privacy-safe categories and timings: request byte bucket,
   response byte bucket, SSE frame count, event-type categories, headers,
   first semantic output, provider completion, canonicalization, draft
   persistence, review availability, outcome, warning count, and fallback
   state. Never capture prompt text, transcript text, quotes, URLs, values,
   response payloads, credentials, or tokens.
5. Require both arms to produce the same canonical draft, warning behavior,
   source-fidelity result, and no-invention result before treating latency
   differences as interpretable. Compare first-output and provider-complete
   deltas separately; do not optimize based on the ~600 ms local path.

No live run is part of this task.

## N. Commit/push

No commit or push was performed.
