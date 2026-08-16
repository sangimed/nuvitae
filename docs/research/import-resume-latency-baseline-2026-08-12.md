# Resume import latency baseline

Status: baseline instrumentation only. No live provider call was made and no optimization was implemented.

## A. Current end-to-end timing architecture

The import path is now correlated by `importId` and the existing `correlationId` field, with `importId` used as the default correlation value. The canonical event is `import.timing`. Each record contains only a bounded phase, source (`api`, `worker`, or `web`), import/correlation identifiers, an absolute timestamp in milliseconds, and optional bounded stage/elapsed durations.

The path is currently split across these boundaries:

1. API start accepts the upload, persists private storage and the import aggregate, then publishes validation and timeout jobs.
2. The worker records job start, validates the document, publishes deterministic extraction, normalizes fragments, invokes the provider boundary, canonicalizes V2 output, and persists the review draft.
3. The API review read records when a review response is available.
4. The web client records the first review poll, availability in a terminal status response, and the first rendered review. Browser-only durations use `performance.now()` and are sent as bounded values; the server assigns the privacy-safe event timestamp.

The canonical phase vocabulary is:

`upload_received`, `upload_persisted`, `queue_enqueued`, `worker_started`, `validation_completed`, `extraction_completed`, `normalization_completed`, `provider_started`, `provider_headers`, `provider_first_output`, `provider_completed`, `semantic_parsing_completed`, `canonicalization_completed`, `draft_persisted`, `review_api_available`, `review_first_poll`, `review_available_to_client`, `review_rendered`.

## B. Missing timing gaps discovered

Before this work, API upload/persistence/queue timing, worker start/queue wait, extraction and normalization durations, provider headers/first useful output, canonicalization, draft persistence, review API availability, and browser review timing could not be reconstructed as one trace.

Existing measurements also mixed injected `Date` clocks with process-relative `Date.now()` elapsed values. Provider transport timings had no absolute timestamp, and first semantic output was not emitted even though the transport already recognized it. Existing validation timing was bucketed and had no shared correlation.

The remaining deliberate gaps are failure-path specific: a validation attempt that cannot load its aggregate or persist its terminal state has no `validation_completed` record, and a provider failure/timeout has transport terminal diagnostics but no successful `provider_completed` phase. DOCX rendered-page counting remains a worker/parser-container concern and is not faked in the workspace benchmark.

## C. Instrumentation added or changed

- Added the shared privacy-safe `import.timing` schema and canonical emitter.
- Added API upload, persistence, and queue-enqueue points.
- Added worker start/queue-wait timing and propagated correlation through validation.
- Added extraction, normalization, provider start, semantic parsing, draft persistence, and canonicalization points.
- Added absolute timestamps to provider transport timing events and mapped headers, first semantic output, and successful provider completion into the canonical model.
- Added the authenticated API timing endpoint for the three web-only phases.
- Added web timing callbacks for first poll, client availability, and rendered review.
- Added fake-clock/privacy tests and a Docker-run offline benchmark test.

No event accepts resume text, transcript fragments, quotes, prompts, provider payloads, tokens, URLs, credentials, or personal data.

## D. Offline stage-by-stage baseline

Command: `docker compose -f compose.yml run --rm workspace pnpm vitest run tests/integration/import-resume/import-latency-baseline.integration.test.ts --reporter=verbose`

Three sequential samples per fixture were measured on 2026-08-12. Values below are milliseconds; p95 is the maximum of the three samples. The deterministic provider is a local test double and made no network calls.

| Fixture                                | Validation p50/p95 | Extraction p50/p95 | Normalization p50/p95 | Request setup p50/p95 | Local provider p50/p95 |
| -------------------------------------- | -----------------: | -----------------: | --------------------: | --------------------: | ---------------------: |
| simple 1-page PDF                      |     12.13 / 168.72 |       9.15 / 10.65 |         0.017 / 0.206 |         0.155 / 0.678 |          0.554 / 4.811 |
| realistic synthetic 2-page PDF         |      11.25 / 15.54 |        7.93 / 8.90 |         0.014 / 0.057 |         0.295 / 0.308 |          0.451 / 0.659 |
| DOCX                                   |       3.05 / 14.67 |        2.75 / 4.26 |         0.011 / 0.100 |         0.159 / 0.215 |          0.397 / 0.503 |
| supported bilingual complex-layout PDF |       8.78 / 12.52 |        5.59 / 6.17 |         0.018 / 0.054 |         0.210 / 0.219 |          0.383 / 0.671 |

The workspace DOCX benchmark measures OOXML extraction, normalization, and request setup. It intentionally does not invent a LibreOffice rendered-page value; that parser-only stage is covered by the worker container boundary and remains a separate validation measurement.

## E. Stages that dominate locally

Validation dominates the warm local path, with PDF page counting, selectable-text extraction, and language detection combined. The first PDF sample also shows a cold-start outlier. PDF extraction is the next largest deterministic stage.

## F. Negligible stages locally

Fragment normalization and semantic request construction are consistently sub-millisecond in this corpus. The deterministic local provider double is also sub-millisecond to approximately 1 ms after warm-up; it is not evidence about a real provider.

## G. Suspected provider-bound portion

No provider latency was measured. The provider-bound portion is expected to begin at `provider_started`, include connection/session resolution and transport setup through headers, first semantic output, and generation completion, then return to local semantic parsing/canonicalization and persistence. The new transport timestamps will allow one bounded real-provider run to separate those portions without logging provider material.

## H. Candidate optimizations ranked by likely impact

1. Measure and, if confirmed, reduce duplicated PDF validation/extraction work; the benchmark intentionally exposes that validation reads selectable text and the later worker stage reads it again.
2. Measure worker/parser startup and DOCX LibreOffice page counting in the worker container; optimize only if it dominates real end-to-end traces.
3. Reduce avoidable serialization/deserialization or registry construction only after event evidence identifies a repeated operation.
4. Consider safe overlap of independent persistence/telemetry work only after confirming transaction and review-order constraints.
5. Investigate provider request/session setup and time-to-first-output after the single bounded provider run; no provider optimization is justified by offline data.

## I. Optimizations not implemented

No parser, extraction, normalization, queue, provider, semantic V2, grounding, fallback, persistence, timeout, or UI behavior was optimized. No provider retry/fallback budget was changed. No serialization or concurrency change was made.

## J. Validation results

- Docker workspace typecheck: passed after instrumentation fixes.
- Offline four-fixture benchmark: passed, three samples per fixture, no provider activity.
- Changed worker/API/web/import tests: passed, including existing semantic V2 and transport coverage.
- Fake-clock timing and privacy tests: passed.
- Remaining required checks are run by the handoff validation command and must remain Docker-only: full typecheck, changed-file ESLint, Prettier, `git diff --check`, and secret scan.

## K. Files changed

See the final handoff for the exact changed-file list. The principal files are the shared event vocabulary, API/worker/web timing points, provider transport/adapter timing bridge, the offline fixture generator and benchmark, and their tests.

## L. One bounded real-provider baseline plan

This is preparation only; it was not run here.

1. Build and start the Docker API, worker, queue, database, and web services with an already-authorized test account and the normal provider-neutral production boundary.
2. Use one anonymous deterministic fixture, one fresh import ID, one upload, and one provider invocation. Set the existing one-primary-call/no-automatic-retry budget and stop after the review is available.
3. Capture only structured `import.timing` and existing privacy-safe categorical events for that import ID. Record queue wait, validation, extraction, normalization, provider headers, first semantic output, provider completion, canonicalization, draft persistence, API availability, first poll, client availability, and render.
4. Export a table of absolute phase timestamps and derived deltas. Separately record outcome/error categories and whether any fallback path occurred; never export request bodies, prompts, responses, tokens, URLs, credentials, or resume content.
5. Run this once only. Do not compare it with offline measurements as if they were the same population; use the offline corpus for deterministic local stages and the single real-provider trace only for provider-bound latency.

## M. Commit/push

No commit or push was performed.
