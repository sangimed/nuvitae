# Semantic-import recall follow-up: anonymous selectable resume

**Status**: Offline correction complete; one separately authorized live smoke
revalidation remains required.

## Fixture and observed product defect

The manual production smoke used
`tests/fixtures/resumes/anonymous-selectable-resume.pdf`. The user-reported
production path reached a persisted Codex connection, PDF upload, extraction,
worker processing, semantic invocation, and review-draft persistence. The
review result preserved contact fields and the professional link, but did not
normally map the explicit title, education, four skills, or two language names.
The UI showed approximately five draft fields and nine items needing attention.

This fixture is outside the historical T246 corpus. T246 was not reopened or
rerun, and no raw provider response was persisted or recovered for this
follow-up.

The repository was clean at the start of the follow-up on
`9b397b79ea32d08afb2ef85ea8a4a2797dc23c33` (`align production Codex OAuth
callback flow`). The committed production-proof artifact
`codex-direct-oauth-t213-t216-real-production-proof-2026-08-08-attempt-2.json`
is pinned to `87eddef`; that artifact records an earlier OAuth-initiation
failure before upload and is not semantic-smoke evidence. The successful
semantic smoke result is therefore retained as operator-reported evidence,
not overwritten or relabelled as a committed proof artifact.

## Offline stage attribution

The exact production extraction and normalization path produced one PDF page,
English classification, a 15-line normalized transcript, and source fragments
containing the title, education block/year, comma-separated skills, language
names, contact fields, and link. No disputed fact was lost in extraction or
normalization. The request schema accepted the resulting request.

The existing response schema already permits nullable education start/end
dates, nullable education location/details, nullable language proficiency, and
individual skill entries. A deterministic, fully grounded response containing
the fixture's explicit facts passed schema, evidence, grounding, no-invention,
and conflict validation.

Primary attribution for the live omission/low-confidence behavior:

| Fact/category                     | Primary stage              | Evidence                                                                                                                                                                                                                |
| --------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Backend Engineer` title/headline | semantic-provider response | The normalized request contains both the title line and its labelled form; the provider request did not explicitly state the complete-recall/title rule, while a grounded response maps it successfully.                |
| education degree and institution  | semantic-provider response | The complete labelled education line is present in the request and valid response contract; the live review did not produce normal education fields.                                                                    |
| `2022` education year             | canonical mapping          | The response contract permits an education end date, but the existing mapper discarded `education.*.end_date` as `unsupported_field`; confirmation also had no education-date mapping.                                  |
| four explicit skills              | semantic-provider response | The comma-separated skills fragment is present in the request and each individual skill maps when returned as grounded candidates; the provider instructions did not explicitly require individual listed-skill recall. |
| French and English language names | semantic-provider response | The language fragment is present in the request and nullable proficiency is schema-valid; the provider instructions did not explicitly require retaining names without proficiency.                                     |

No fact was primarily lost in response schema validation, evidence/grounding
validation, confidence policy, deduplication, persistence, or review
projection in the deterministic reproduction. The deterministic complete
response produced zero diagnostics and zero review warnings. The live raw
response is intentionally unavailable, so its individual provider omissions
are not reconstructed beyond the sanitized product observation above.

## Sanitized offline structure

The exact PDF extraction path produced 15 normalized lines. Relevant structure
only (no raw provider payload) was:

| Stage                           | Sanitized result                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction/normalization        | `headline` at lines 2 and 7; `education` at lines 8-9; `skills` at lines 10-11; `languages` at lines 12-13; contact at lines 3-6; link at line 15                             |
| Semantic request                | English document; normalized transcript and source fragments for all 15 lines; flattened evidence bounds and hashes present                                                   |
| Deterministic semantic response | contact 4 values; headline 1; education 1 candidate with degree, institution, end year, null start/location; skills 4; languages 2 with null proficiency; professional link 1 |
| Response validation             | accepted; zero diagnostics; grounding valid; no-invention valid                                                                                                               |
| Candidate mapping               | 15 structured fields; zero rejected candidates; zero review-required candidates                                                                                               |
| Review projection               | complete draft category; zero draft warnings; no unsupported/partial/low-confidence diagnostic                                                                                |

The deterministic response used only evidence pointing to the extracted source
fragments. It is a test fixture response, not the raw real-provider response.

## Correction

The provider-neutral semantic instructions now require complete explicit-value
recall, preserve explicit titles, preserve each listed skill, preserve language
names without proficiency, and preserve education degree/institution/year with
missing optional details left null. The Codex adapter uses those fixed
instructions while retaining the existing untrusted-document, grounding,
no-invention, and strict-output requirements.

Canonical semantic mapping now accepts parseable explicit education start/end
years as canonical date values and education location, while still rejecting
unsupported education details. Confirmation groups fields for one education
candidate and carries institution, credential, location, and date fields into
one canonical education item. A year-only education item has no invented start
date. Language proficiency remains absent when the source does not provide it.

## Deterministic regression

The dedicated integration regression runs the exact fixture through:

`PDF extraction → language detection → normalized request construction →
grounded deterministic semantic response → schema/evidence/grounding/
no-invention validation → semantic candidate mapping → draft/review
projection`.

It asserts the title, degree, institution, year, four skills, two language
names, contact fields, and link; zero validation diagnostics; zero rejected
candidates; zero review warnings; actual source-fragment evidence; and no
invented proficiency or date. Additional mapper cases cover a language without
proficiency, education with only a graduation year, an explicit professional
title, and comma-separated skills using values different from this fixture.

## Revalidation boundary

No live OAuth or provider activity was performed for this correction. One new,
separately authorized production smoke revalidation is warranted after the
offline fix. It must use the approved production path and record only sanitized
structure and review outcome; it must not alter T246 evidence, reopen T246, or
be treated as T246 qualification evidence. T203 remains NO-GO and moderated
usability validation remains incomplete.

## Post-fix real-smoke revalidation

The first post-fix real production smoke was performed separately by the
operator with `tests/fixtures/resumes/anonymous-selectable-resume.pdf`. This
record captures only the existing privacy-safe worker events and persisted
review projections. No upload or semantic invocation was performed during this
diagnostic follow-up, and no retry was performed.

The offline recall regression passed. The real smoke still produced the prior
fallback-shaped review result: contact fields were present; headline and
education were absent; skills and languages were review-required low-confidence
fallback warnings rather than normally structured fields.

Runtime evidence classifies this result more precisely than a provider recall
failure:

1. The active `nuvitae-local-play` worker emitted
   `semantic.provider_invocation_started` for the smoke import under contract
   version `nuvitae.resume-semantic-parser.v1`.
2. It then emitted `semantic.outcome` with `outcome: timeout`, followed by
   `partial_deterministic_fallback` and `review.draft_created`.
3. No provider response reached schema validation, canonical semantic mapping,
   or provider-response diagnostics. The persisted semantic-attempt,
   extraction-response, validation-status, and evidence-record tables contain
   no rows for this smoke; the review projection contains only the five
   deterministic contact fields and the fallback warning categories.

Therefore the per-category loss-stage classification is:

| Category  | Classification            | Sanitized evidence                                                                             |
| --------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| Headline  | `PROVIDER_DID_NOT_RETURN` | Provider call timed out; fallback marks headline as unsupported/missing.                       |
| Education | `PROVIDER_DID_NOT_RETURN` | Provider call timed out; fallback marks education as unsupported/missing.                      |
| Skills    | `PROVIDER_DID_NOT_RETURN` | Fallback rejects grouped skills as low-confidence; no provider response exists to classify.    |
| Languages | `PROVIDER_DID_NOT_RETURN` | Fallback rejects grouped languages as low-confidence; no provider response exists to classify. |

This does not prove real-provider omission or incomplete recall. It proves that
the corrected semantic contract was loaded and the single provider attempt
timed out before a semantic response was available. The downstream mapper is
confirmed correct by the deterministic regression and by the runtime compiled
mapper containing headline handling, grouped education mapping, education
`end_date`, and nullable language proficiency handling.

The source and runtime base instruction template fingerprint is:

```text
SOURCE_INSTRUCTION_HASH=e41edf69b14d55a98a77336f4a9a97637c432341bcf4343bf25268a510eabc3d
RUNTIME_INSTRUCTION_HASH=e41edf69b14d55a98a77336f4a9a97637c432341bcf4343bf25268a510eabc3d
MATCH=true
```

The running worker image was `nuvitae-worker:0.1.0`, digest
`sha256:6034e639ef6cf4633d57c21985df0df6b41d5590e46da0bcd5c331a96ccc10f3`,
created at `2026-08-08T23:18:31Z`. It contained the corrected instruction,
adapter request construction, schema, and mapper. The worker had no source or
node-modules bind mount; only private storage was mounted, so named volumes
could not replace application code.

The response schema still permits omission at the schema level: headline is
nullable, education is an optional array whose members have nullable fields,
skills/languages are arrays, and no expected-section inventory is supplied to
the provider or enforced by downstream validation. The prompt now states the
completeness invariant, but omission can still satisfy the response schema.
That is a contract gap for future recall work, not the cause of this smoke's
timeout.

The deterministic regression supplies a synthetic provider response containing
the expected headline, education, skills, and languages. It validates
downstream grounding, validation, mapping, and review projection; it does not
validate real-provider recall or timeout behavior.

Status: offline correction passed; first post-fix real smoke failed by provider
timeout and bounded fallback; root cause is provider/transport timeout with no
semantic response, not runtime/build mismatch and not proven provider omission.
T203 remains NO-GO. T246 remains finalized FAILED and untouched. This follow-up
does not modify historical T246 evidence, creates no new live activity, and
does not authorize another smoke.

## Timeout-path diagnosis and offline hardening

The timeout path was reconstructed from the running source, the worker wiring,
the existing sanitized smoke events, and the T200/T201/T246 transport records.
The owner-bound path is:

```text
semantic worker job
  -> CodexDirectProviderAdapter.parse(ownerUserId)
  -> owner/provider connection lookup
  -> encrypted owner-bound session read
  -> CodexDirectTransport.invoke
  -> fetch(POST /backend-api/codex/responses)
  -> bounded response read and SSE parse
  -> adapter failure mapping
  -> T217 single bounded deterministic fallback
```

Before this hardening, the production adapter supplied `maxTimeoutMs = 30,000`
and the transport started one `AbortController` timer immediately before
`fetch()`. That timer covered connection setup, response headers, first byte,
the complete streamed response body, and parsing. It was cleared only in the
finalizer. It was not reset after headers or after any stream progress. The
worker semantic path has no second semantic deadline; its separate foreground
deadline is owned by validation/extraction jobs. T217 remains the only
application-owned provider-call budget.

The existing smoke evidence did not contain an HTTP status, connection/open
time, response-header time, first-byte time, SSE-event time, or abort source.
It therefore proves only the sanitized event order:
`provider_invocation_started -> timeout -> partial_deterministic_fallback ->
review.draft_created`. No provider response, HTTP status, or SSE bytes can be
recovered from that run without violating the evidence boundary.

The code-level timeout defect is proven: the production timer was scoped to the
whole streamed response rather than request/header completion plus inactivity.
The exact phase of the historical timeout (before headers versus after partial
stream progress) remains unproven because the old transport did not record it.
It was not possible to conclude that 30 seconds was too low from one smoke, and
no timeout value was increased.

Known-good transport comparison:

| Property              | T200/T201/T246 evidence                                                       | Production before hardening                                   | Production after hardening                     |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Endpoint              | `chatgpt.com/backend-api/codex/responses`                                     | same                                                          | same                                           |
| Request shape         | standard Responses SSE; top-level instructions; one user input item; no tools | same semantic shape                                           | same                                           |
| Model/reasoning       | audited `gpt-5.6-sol`, low effort; semantic spike uses no summary/include     | same model and low effort                                     | same                                           |
| Request timeout       | 30 s request/header deadline                                                  | 30 s whole-operation deadline                                 | 30 s request/header deadline                   |
| Stream inactivity     | 15 s, reset on received chunks                                                | absent                                                        | 15 s, reset on every received chunk            |
| SSE completion        | `response.completed`, then EOF accepted; `[DONE]` is tolerated                | terminal event required, parser ran only after full body read | same completion contract, parsed incrementally |
| Status/chunk evidence | sanitized status category and stream diagnostics                              | not recorded                                                  | phase timing records only; no body/payload     |

The known-good semantic records show bounded request bodies of 16,964 bytes
(C05), 18,983 bytes (C01), and 19,287 bytes (C04), compared with the 813-byte
synthetic T200 request. They use the same endpoint, model, low reasoning effort,
standard SSE shape, and no tools. This establishes that the semantic workload is
materially heavier than the synthetic probe but still within the 65,536-byte
request limit. No semantic prompt, schema, mapping, model, or request contract
was changed here.

The transport now emits only safe phase timing metadata through the worker event
vocabulary: phase, elapsed milliseconds, HTTP status category, first-byte
boolean, SSE-started boolean, and completion-event boolean. It never emits
tokens, authorization material, URL/query values, request text, response text,
SSE payloads, or resume content. A future smoke can therefore establish the
missing timing boundaries without expanding the privacy surface.

Deterministic coverage now proves fast completion, slow first byte within the
request/header and stream-idle limits, keepalive and split/multi-line SSE
handling, progress resetting inactivity timing, stalled-stream timeout,
terminal completion, EOF behavior, prompt cancellation, safe timing metadata,
existing failure mapping, and the unchanged one-call T217 fallback budget.

Offline readiness conclusion: the production transport is now behaviorally
aligned with the known-good timeout/SSE semantics. The historical timeout's
precise network phase is not proven, but the whole-stream timer defect is
proven and fixed. One new authorized live semantic smoke is warranted only as a
future revalidation of real-provider response and recall; it was not executed
in this task. Real-provider recall remains **UNVERIFIED**. T203 remains
**NO-GO**. T246 remains finalized **FAILED**, immutable, and untouched.

## Production response-framing diagnosis and offline protocol-shape coverage

This follow-up used the latest already-observed production run only. It made
no provider, OAuth, credential, or network call.

### Current parser assumption and trace

The production transport selects the response parser from the response
`Content-Type`, after observing response headers:

1. `application/json` (including parameters) is read as one bounded body and
   accepted only when it is an object with a string `id`, `status: "completed"`,
   and an `output` array. Assistant `output_text` parts are concatenated.
2. `text/event-stream` (including parameters) is parsed incrementally as SSE.
   Lines are split on LF, with one trailing CR removed, and a blank line
   dispatches the accumulated `data:` fields joined with LF.
3. SSE comments and unknown non-data fields are ignored. `event:` lines are
   therefore tolerated but are not used as the semantic discriminator; each
   dispatched data payload must still be a JSON object with a string `type`.
4. Recognized output events assemble text, `response.completed` requires a
   response id and is the only successful terminal event, and `[DONE]` is
   tolerated as a sentinel. EOF without a completed response, an unfinished
   line/frame, no data event, malformed JSON, or an unknown event fails closed
   as `protocol_invalid`. Provider failure/incomplete events map to a safe
   provider failure.

The transport emits timing at request start, response headers, first byte, SSE
start, completion event, EOF, timeout/cancellation/error, and successful
completion. The new protocol-shape record is emitted once and contains only
the exact normalized safe Content-Type, event-line presence, bounded safe
event names/types, SSE frame/data-field counts, multiline-data presence,
`[DONE]` presence, EOF, JSON-object/top-level-key shape, and final recognized
event type.

### Qualified-versus-production structural diff

| Structural property     | Qualified T200/T201/T246 evidence                                                                                                       | Latest production evidence                       | Conclusion                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| HTTP status             | 2xx / exact 200 in qualified records                                                                                                    | 2xx                                              | Transport connectivity succeeded                                                                        |
| Content-Type            | The T200 harness exercises event-stream; persisted semantic aggregates do not retain exact header                                       | Not recorded by the prior timing instrumentation | Unknown; new instrumentation will record it safely                                                      |
| SSE `event:` line       | T200 offline qualified fixture emits `event: <type>` before `data:`; persisted live counts cannot prove whether live bytes contained it | `sseStarted=false`; no event-line count          | Current parser tolerates event lines; actual production presence is unknown                             |
| `data:` fields          | Qualified live parser counts one data dispatch per typed JSON event; T201 records 1,782–1,823 data dispatches in representative cases   | No data count                                    | Unknown                                                                                                 |
| JSON type discriminator | Qualified events contain `type` in the JSON data object                                                                                 | No JSON shape recorded                           | Unknown                                                                                                 |
| Line endings            | Qualified parser accepts LF and CRLF, but evidence does not preserve which was live                                                     | Unknown                                          | No proven mismatch                                                                                      |
| Comments/keepalives     | Qualified live records report zero comments; parser supports comments                                                                   | Unknown                                          | No proven mismatch                                                                                      |
| Blank-line framing      | Qualified parser counts one blank-line dispatch per event                                                                               | `sseStarted=false` despite first byte            | Suggests either a non-SSE JSON path or no terminated SSE line was observed; insufficient to distinguish |
| `[DONE]`                | Qualified records prove `response.completed`; they do not prove `[DONE]` was present                                                    | Unknown                                          | No proven mismatch; sentinel remains optional after completion                                          |
| Completion              | Qualified records prove `response.completed` and terminal success                                                                       | `completionEventReceived=false`                  | No evidence of a recognized SSE completion event                                                        |
| EOF                     | Qualified semantic calls completed after valid protocol parsing                                                                         | EOF at about 40.5 s                              | Transport body completed, but safe framing shape was not recorded                                       |

The latest run's safe timing sequence is compatible with at least two shapes: a
JSON response path (which never starts SSE instrumentation), or an
event-stream response whose body did not produce a complete line/frame for the
current parser. The prior instrumentation cannot select between them. The run
is consequently classified as **indeterminate because safe historical
protocol-shape instrumentation is insufficient**. It is not evidence that the
provider returned a malformed body, nor evidence that arbitrary EOF should be
accepted.

### Offline correction and validation

No parser relaxation was justified by the available evidence. The parser was
left fail-closed and its known-good behavior is now covered by representative
offline fixtures for data-only SSE, event-plus-data SSE, CRLF, multiline data,
comments/keepalives, `[DONE]`, completed-then-EOF, provider terminal output
without `response.completed`, completed JSON Content-Type, and malformed SSE.
The provider-terminal case remains a provider failure rather than semantic
success; arbitrary EOF remains invalid.

Timeout hardening worked: the latest provider call returned HTTP 2xx, emitted
its first byte at about 1.1 s, and reached transport EOF at about 40.5 s rather
than taking the former whole-stream timeout path. The current reported outcome
is now narrowed to protocol/schema handling before trustworthy semantic
response validation; the run's `schema_violation` projection must not be
interpreted as successful semantic recall. Recall remains **UNVERIFIED**.

T203 remains **NO-GO** for qualified live production use. T246 remains
finalized **FAILED**, immutable, and untouched. T217 retry/fallback budgets,
semantic schema/mapping/recall behavior, and provider qualification evidence
were not changed. A future single live smoke is warranted only after an
operator authorizes it to collect this new shape record; no such smoke was
performed here.
