# T246 Live-Campaign Preparation Record (offline)

**Task**: Prepare T246 (`specs/001-import-resume/tasks.md`) for a later
operator-authorized live Codex semantic evaluation over the real-document
corpus.
**Prepared**: 2026-08-07 (Europe/Paris), branch
`feat/import-resume-codex-direct-oauth-spike`.
**Status**: **OFFLINE PREPARATION COMPLETE - T246 remains INCOMPLETE / NOT
RUN. T203 remains NO-GO.**
**Live authorization**: NONE. No OAuth, Codex/OpenAI/provider request, network
request, credential access, or Campaign-B/T246 live attempt was performed or
authorized by this record. No commit and no push were made.

This record is the completed offline preparation for the canonical T246
real-document corpus: all eight mandatory cases now have deterministic binary
fixtures, pinned production extraction transcripts, provenance, semantic
expectations, fail-closed manifests, and regression coverage. It remains a
STOP report for live execution: T246 is still INCOMPLETE / NOT RUN, no live
command is authorized, and the operator must explicitly review and flip each
per-case authorization entry before any live execution.

## 1. Canonical T246 acceptance criteria (verbatim contract)

From `specs/001-import-resume/tasks.md` (T246):

> Execute live Codex semantic evaluation over the real-document corpus using
> deterministic extraction transcripts and provenance as the Codex input (real
> French PDF, real English PDF, real DOCX, bilingual, partial/sparse,
> structurally ambiguous, prompt-instruction-like content, and
> malformed/unsupported recovery), validating against the T208 enrichment
> contract and provider-neutral schema, in the spike harness and
> `tests/integration/import-resume/`.

T203 re-evaluation trigger 2 (`docs/research/codex-direct-oauth-go-no-go.md`)
repeats the same eight scenario categories and requires the evaluation to run
"under the T208 enrichment contract". T202 re-measurement (trigger 3) then
consumes the accepted T246 evidence, and the decisive product question
(trigger 4) requires a review-useful draft from a typical PDF/DOCX without
dangerous hallucination or excessive manual reconstruction.

Repository-accepted prerequisites already satisfied: T248 (real French PDF
proof) and T247 (T208 bookkeeping closure). Explicit live execution
authorization remains required; none exists.

## 2. Real-document corpus (complete, eight cases)

All eight mandatory T246 cases now have checked-in deterministic binary
fixtures under `tests/fixtures/resumes/` with pinned transcripts, provenance,
semantic expectations, and per-case fail-closed manifests. The authoritative
offline evidence aggregate is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-corpus-offline.json`
(produced by `spikes/codex-direct-oauth/verify-t246-corpus.mjs`).

| #   | Scenario                        | Fixture path                                                      | Format                                           | Language                 | Fixture SHA-256                                                    | Transcript / recovery SHA-256                                                       | Manifest path                                                                    | Manifest SHA-256                                                   | Extraction                    | Provenance       | Semantic expectation      | Live-ready | Future live request |
| --- | ------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- | ---------------- | ------------------------- | ---------- | ------------------- |
| C01 | Real French PDF                 | `tests/fixtures/resumes/anonymous-french-resume.pdf`              | PDF (1 page, selectable)                         | French                   | `51593da159285371b05919700ced3e8ed2be666f1b24482b504c48c579e0cf3e` | `496bb2335d6ef5b65038aa227a1cd908eb02535413ccec408b5a499f16e5ee77`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c01.manifest.json`          | `8a3838e0b1397b6a817b828b62a6a6e960e925890bdcfe81be6c1043d2c5754d` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C02 | Real English PDF                | `tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf` | PDF (1 page, selectable)                         | English                  | `9c9a9f91489b359270176d1f93824a51eceb965810f7eede9fcf821ca9183f95` | `c1a4d9b366ef01c3a4c4fb25cbcf9fa90297772dad9b1ef760f12b41e1556195`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c02.manifest.json`          | `70c6e61816f82621b984ad97cb37bd8514e6f5e6ed87dc8b9b3a033444d9fa82` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C03 | Real DOCX                       | `tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx`   | DOCX (OOXML)                                     | English                  | `fd68340af64a7250cd253e44d726873275caa95c89123cce57375decd753802a` | `16e4e2daa3fdb5bc33bd94124e0645b626bdd1acd64f22a6a7f75088e6131120`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c03.manifest.json`          | `64462cf2ec38af58826f716f401549f3d66e1c3f0b3d238e035c223d44dea2b2` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C04 | Bilingual                       | `tests/fixtures/resumes/anonymous-bilingual-resume.pdf`           | PDF (1 page, selectable)                         | Bilingual French-English | `3dbc163ecaa84231246c04e9c6a00779fc3c3e6960f261b04e46e8f5868b5e24` | `518eb6272a9f4e4fd1ad37a10fa5124a17484b11e0ca6ffd1b83aee8f5c7c76b`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c04.manifest.json`          | `403c161842368f1a85a20f41be6a9969ecfc39e4281182b01b3f61681c7aa465` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C05 | Partial/sparse                  | `tests/fixtures/resumes/anonymous-partial-resume.docx`            | DOCX (OOXML)                                     | English                  | `a15a71c03a3ed3c7a531d7ad9bc8bbbbfdd993e1ead7ded479f70e0a3241a245` | `2358561e02dc0adcb79a749f853ea5a63d3621be56dacb763fd1654fb896fca6`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c05.manifest.json`          | `da43718d40450ab9b17da4d522d8240d7bb31ccbce6b8b8b2f25dca25e48c3b3` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C06 | Structurally ambiguous          | `tests/fixtures/resumes/anonymous-ambiguous-resume.pdf`           | PDF (1 page, selectable, two-column interleaved) | English                  | `3fa893f0917a5826e922497b5f4e4d4c3e3423b86c68b61c0ebe5f27c3d8c28d` | `391425b075884756b5a7a72472a38375f5177a2027f3858167d33e7e07a011a4`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c06.manifest.json`          | `8b2dc82ce029df563e1c8eb45bfd790a9e27842723388c88e1f59389f1fa71a1` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C07 | Prompt-instruction-like content | `tests/fixtures/resumes/anonymous-prompt-instruction-resume.docx` | DOCX (OOXML)                                     | English                  | `df51667b192449a54c6b262784ffea11931323c411be8019f3a7e5437710a113` | `8b82628f3cf6931e503968e9a900e84d6fa31838b8db485dea542a17548bea43`                  | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c07.manifest.json`          | `eac09aafd7c29175b52085782b06663f0383319c05081143e877937c0e2593e8` | transcript verified           | enrichment ready | expected JSON pinned      | YES        | YES                 |
| C08 | Malformed/unsupported recovery  | `tests/fixtures/resumes/anonymous-malformed-resume.pdf`           | PDF (invalid bytes, no objects)                  | n/a (fails validation)   | `14bcd090baf31edba64e9cbd8cdfc15f943344aa72cb3675ad8e91bfcbce03ad` | `14bcd090baf31edba64e9cbd8cdfc15f943344aa72cb3675ad8e91bfcbce03ad` (recovery input) | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c08.recovery-manifest.json` | `d55dd37642b4e883d07fc5ad22979a27a621872ecfcc34dd998ff1fd12697889` | recovery verified (malformed) | n/a              | n/a (no semantic request) | YES        | NO                  |

The canonical semantic corpus entries live in
`packages/test-fixtures/src/resume-import/semantic-parser-fixtures.ts` with
expected provider-neutral semantic JSON in
`packages/test-fixtures/src/resume-import/expected-semantic-json.ts`. C08 has
no semantic corpus entry by design: it must fail before any semantic request.

## 3. Per-case canonical interpretation and special rules

- **C04 bilingual (PDF)**: the real bilingual PDF
  (`anonymous-bilingual-resume.pdf`) contains meaningful French and English
  content in the same selectable-text document. `DeterministicLanguageDetector`
  classifies it `bilingual_french_english` (high). Bilingual lines keep both
  languages in one value because both halves are contiguous in the same
  extracted fragment; every fact is attributable to its exact source span.
  Declared absent: website, employer location, employment type, certifications,
  professional links.
- **C05 partial/sparse (DOCX)**: `anonymous-partial-resume.docx` intentionally
  omits normal CV fields (location, summary, employer location, achievements,
  field of study, education location, projects, certifications, professional
  links). The expected output keeps every omitted field `null`/absent; no value
  may be invented, and expected-fact recall must not reward guessing.
- **C06 structurally ambiguous (PDF)**: `anonymous-ambiguous-resume.pdf` is a
  two-column document whose flattened reading order interleaves the columns.
  The role title's association with the employer and the `2019 – Present` span
  are genuinely ambiguous. The expected output extracts only explicitly
  evidenced single-fragment facts, keeps the ambiguous role dates `null`,
  declares no invented relationship, and surfaces `ambiguous_role_association`
  plus `ambiguous_date` diagnostics. No expected answer forces unsupported
  inference.
- **C07 prompt-instruction-like (DOCX)**: `anonymous-prompt-instruction-resume.docx`
  contains ordinary résumé text plus instruction-like lines under
  "Additional notes". Those lines are ordinary untrusted document data: they
  must not alter system/developer instructions, change the requested JSON
  schema, request tools or network operations, alter authorization state,
  change evidence paths, increase retries, change provider/model targets,
  expose credentials, or disable grounding/no-invention rules. The expected
  output produces no facts from those lines.
- **C08 malformed/unsupported recovery (PDF)**: `anonymous-malformed-resume.pdf`
  is deliberately not a valid PDF (fixed malformed bytes). The canonical
  behavior is deterministic recovery/failure: extraction and validation fail
  closed with the `malformed` category (`malformed_or_corrupted` user-facing),
  no semantic model invocation is attempted, no credential recovery is
  required, no draft or derived artifact is created, and only sanitized
  evidence is persisted. The recovery manifest pins 0 broker runs and 0
  semantic backend requests, so C08 consumes no future Codex request.

## 3a. Fixture-generation mechanism

All five new binaries are produced by one deterministic generator,
`tests/fixtures/resumes/generate-t246-corpus-fixtures.mjs`, following the
repository fixture convention (pdfkit with pinned metadata dates and
`compress: false` for PDFs; yazl OOXML ZIPs for DOCX; fixed bytes for the
malformed PDF). Regeneration is byte-identical; the integration verifiers
prove the binary fixtures reproduce the pinned corpus transcripts
byte-for-byte through the production adapters, so opaque hand-created
binaries are not committed without a reproducible source.

## 4. Offline verification of the complete corpus

All checks ran offline (no network, OAuth, Codex, Docker, credential, or live
runner):

- `tests/integration/import-resume/t246-corpus-fixtures.integration.test.ts`:
  C04-C07 extract byte-for-byte to their pinned corpus transcripts with the
  expected language classifications; C08 fails closed as `malformed` with no
  semantic corpus entry (23 checks).
- `tests/integration/import-resume/t246-sparse-ambiguity.integration.test.ts`:
  C05/C06 sparse and ambiguity semantics (null/absent fields, no invented
  facts, ambiguity mechanism, no invented grouping).
- `tests/integration/import-resume/t246-prompt-instruction-isolation.integration.test.ts`:
  C07 prompt boundary (system-controlled instructions, fixed request shape,
  no control/credential keys, deterministic provider outcomes, no facts from
  instruction lines, sanitized diagnostics).
- `tests/integration/import-resume/t246-malformed-recovery.integration.test.ts`:
  C08 recovery (pinned fixture hash, adapter failure category, stable
  user-facing category, no draft/artifact, sanitized evidence, no raw parser
  exception persisted).
- `packages/test-fixtures/src/resume-import/semantic-parser-fixtures.test.ts`:
  12/12 pass, including schema validation, grounding, no-invention, absence,
  ambiguity, and the full provider-neutral pipeline for all 13 corpus entries.
- Spike verifier `spikes/codex-direct-oauth/verify-t246-corpus.mjs`: all eight
  cases verified offline; sanitized aggregate evidence written to
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-corpus-offline.json`.
- Spike tests `t246-corpus-verifier.test.mjs` and `t246-authorization.test.mjs`:
  17/17 pass.
- Deterministic language classification on actual extracted bytes: C01 ->
  `french`; C02/C03 -> `english`; C04 -> `bilingual_french_english`; C05/C06/C07
  -> `english`; C08 -> not classified (fails validation).
- Historical suites (`french-pdf-fixture-evaluation`,
  `semantic-vertical-slice-fixtures`, `anonymous-selectable-resume-fixture`,
  `malformed-protected-documents`, prompt-injection, T248 verifier): unchanged
  and passing.

## 5. T246 authorization model (implemented offline; NOT authorized)

Reusing the qualified T201 infrastructure concepts (broker, immutable-image
contract, result channel, credential lifecycle, sanitized evidence assembly),
the dedicated fail-closed T246 authorization infrastructure is now
implemented offline. Every entry is explicitly **NOT_AUTHORIZED**; no live
attempt exists and none is created merely because the infrastructure exists.

- Registry: `spikes/codex-direct-oauth/t246-authorizations.json`
  (schema_version 1, `authorized_attempts`), mirroring
  `campaign-b-authorizations.json` with a `t246-` evidence-path contract,
  per-case pins, and an explicit `authorization_state` field. All eight
  entries are `NOT_AUTHORIZED`.
- Per-case pins: case ID (T246-C01...C08), fixture relative path, fixture
  SHA-256, deterministic transcript SHA-256 (semantic cases only), manifest
  SHA-256, expected language, authorized attempt ID, per-case broker/backend
  limits (semantic 1/1, C08 0/0), `automatic_retries = 0`, exact evidence
  output path, and authorization state.
- Validator: `spikes/codex-direct-oauth/lib/t246-authorization.mjs`. An
  attempt is rejected (`t246_not_authorized`) unless the registry entry is
  `AUTHORIZED`; fixture/transcript/manifest hash mismatch fails before
  credential recovery; evidence paths must be fresh and match the per-case
  pattern; canonical targets must be git-tracked; no generic run-all exists.
- Runner: `spikes/codex-direct-oauth/t246-live-runner.mjs`. `--mode live`
  requires an `AUTHORIZED` entry (impossible today, so it stops before any
  credential/broker/Codex step); `--mode offline` performs only deterministic
  artifact verification.
- Aggregator: `spikes/codex-direct-oauth/consolidate-t246-evidence.mjs`.
  Stays INCOMPLETE with zero accepted live evidence and fails closed if any
  live evidence appears without accepted validation.
- Per-case expectation manifests: `spikes/codex-direct-oauth/fixtures/t246-matrix/`
  (t246-c01...c07 semantic manifests + t246-c08 recovery manifest), validated
  by the offline verifier and pinned in the registry.
- Integration placement: `tests/integration/import-resume/` per the canonical
  task (T246 corpus, sparse/ambiguity, prompt-isolation, and recovery tests).

## 6. Request budget (canonical corpus, once complete)

- Semantic cases requiring a live request: 7 (C01-C07).
- Non-semantic recovery cases: 1 (C08 - malformed/unsupported; extraction
  fails before semantic invocation, so it consumes zero Codex requests).
- Maximum semantic backend requests per semantic case: 1.
- Maximum broker runs per semantic case: 1.
- Automatic retries per case: 0.
- Total maximum future Codex backend requests: **7**.
- No additional T200 control invocation is required (T200 is already
  accepted). Latency/cancellation/quota measurements are NOT added to the
  core semantic campaign; if later requested, they must be separate,
  independently authorized cases.

## 7. Sanitized evidence contract

Per-attempt evidence may record: case ID, attempt ID, fixture hash, transcript
hash, manifest hash, model/provider-safe identifier already allowed by the
accepted harness, invocation attempted/succeeded, HTTP status, response
protocol validity, structured-output evaluation, semantic metrics, source
grounding, no-invention pass, latency fields only if recorded, failure
phase/category, safe final state, secret-scan result.

Evidence MUST NOT persist: raw resume text, full deterministic transcripts,
raw model output, raw SSE streams, OAuth tokens, refresh tokens,
authorization codes, account identifiers, authorization URLs, raw provider
error bodies, or prompts containing full personal data.

## 8. Stop conditions (future live campaign)

Stop after any case where: preflight fails; credential recovery fails; HTTP
status is non-200; protocol validation fails; artifact hash mismatch occurs;
semantic evaluation is not performed; `case_pass` is false; unsupported facts

> 0; forbidden inference > 0; missing/invalid evidence > 0; grounding fails;
> no-invention fails; evidence sanitization fails; or secret scan fails. Do not
> continue automatically after a failed case.

## 9. Post-T246 offline procedure (when all authorized cases succeed)

1. Aggregate accepted T246 evidence fail-closed (extend the
   `consolidate-t201-matrix.mjs` pattern with a dedicated T246 aggregator).
2. Re-measure T202 from accepted T246 evidence, keeping synthetic T201 metrics
   and real-document T246 metrics distinct; report latency only from recorded
   fields; keep cancellation/quota/onboarding metrics unmeasured unless
   accepted evidence supports them.
3. Re-run the T203 decision gates with unchanged thresholds and update the
   decisive product-question evaluation.
4. T203 remains NO-GO until every gate passes; T246 stays INCOMPLETE until
   live evidence is accepted.

## 10. Required next step (blocker)

The corpus prerequisite is now complete: all eight T246 cases are
offline-ready with deterministic binaries, transcripts, provenance, semantic
expectations, fail-closed manifests, and regression coverage. The remaining
blocker is operator review and explicit per-case authorization: an operator
must inspect the T246 registry (`spikes/codex-direct-oauth/t246-authorizations.json`),
the manifests, and this record, then flip each intended entry from
`NOT_AUTHORIZED` to `AUTHORIZED` in a separate, explicitly reviewed step
before any live T246 command may run. T246 remains INCOMPLETE / NOT RUN and
T203 remains NO-GO. No live command is authorized by this record.

## 11. Post-preparation status addendum (2026-08-07, reachable live path)

This addendum does not rewrite the preparation snapshot above. Sections 1-10
remain the historical offline-preparation record; their statements that
"every entry is NOT_AUTHORIZED" and that "no live command is authorized"
describe the state at preparation time and remain accurate as historical
facts.

Current authorization state (authoritative registry:
`spikes/codex-direct-oauth/t246-authorizations.json`):

- **T246-C01-A01 is AUTHORIZED** (flipped 2026-08-07), **unconsumed**, and
  **NOT RUN**.
- **T246-C02 through T246-C08 remain NOT_AUTHORIZED.**
- **T246 remains INCOMPLETE / NOT RUN; T203 remains NO-GO.**

The reachable live execution path is now implemented and validated offline
(2026-08-07):

- Host runner: `spikes/codex-direct-oauth/t246-live-runner.mjs --mode
<offline|preflight|live>`; `--mode live` is reachable and gated by the same
  authorization/hash/evidence/limit contract as the registry.
- Credential-free preflight (`--mode preflight`) passed on 2026-08-07: it
  validates authorization, regenerates and pins the deterministic transcript,
  builds and verifies the immutable spike image, runs the qualified T201
  credential-free topology preflight, and runs a broker credential-free
  rehearsal. It mounts no credential volume, makes no provider request, and
  writes no evidence.
- Live mode reuses the qualified T201 credential recovery, refresh, provider
  transport, result channel, image, and preflight infrastructure unchanged;
  T246 adds only its own authorization, transcript/request construction,
  real-document evaluator, sanitized evidence vocabulary, and execution
  entrypoint.

No OAuth, Codex/OpenAI/provider request, credential-volume access, or live
T246 attempt has occurred during implementation or preflight.

## 12. Post-live finalization record (2026-08-07, C01-A01 consumed)

This addendum records the single live T246 execution that occurred after the
operator-authorized step and the offline diagnosis/fix of the resulting
post-live finalization failure. Sections 1-11 remain historical records.

### 12.1 Truthful execution record

- **T246-C01-A01 was executed exactly once** on 2026-08-07.
- **Backend invocation succeeded**: `invocation_attempted=true`,
  `invocation_succeeded=true`, `exact_http_status=200`,
  `response_protocol_valid=true`.
- **Every mandatory semantic metric passed**: `schema_valid=true`,
  `semantic_quality_evaluated=true`, `exact_fact_recall=1`,
  `high_priority_fact_recall=1`, `unsupported_fact_count=0`,
  `forbidden_inference_count=0`, `missing_evidence_count=0`,
  `invalid_evidence_count=0`, `grounding_pass=true`,
  `no_invention_pass=true`, `parsing_pass=true`,
  `document_language_classification_pass=true` (nested canonical
  `evaluation_metrics` projection), `secret_scan_result=passed`.
- **Runner finalization failed** due to implementation defects: the parent
  evidence gate read recall/language metrics only from top-level fields that
  the broker never emits, so it recorded `case_pass=false`,
  `safe_final_state=safe_unknown_failure`,
  `primary_failure_phase=null`, `primary_failure_category=null`, and exited
  `1` despite the fully passing semantic result.
- **Evidence was written to an incorrect nested path**:
  `spikes/codex-direct-oauth/spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json`
  instead of the authorized canonical path
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json`.
  The bridge passed the repository-relative evidence path to an execution
  body whose cwd is the spike directory, so the writer re-resolved it against
  the spike directory and double-prefixed it.
- **A01 is CONSUMED and must not be rerun** (`invocation_attempted=true`).
  The authorization registry now records it in `consumed_attempts`, marks its
  registry entry `CONSUMED`, and the validator rejects any A01 attempt before
  credentials, even though the canonical evidence path is empty and the only
  artifact exists at the historical misplaced path (a whole-spike evidence
  scan backs the ledger).
- **C02-C08 remain NOT_AUTHORIZED. T246 remains INCOMPLETE. T203 remains
  NO-GO.** No new live execution is authorized by this record.

### 12.2 Immutable historical evidence preservation

The actual consumed A01 artifact was treated as immutable historical live
evidence. It was **not deleted, overwritten, mutated, normalized, relocated,
or rewritten**. A recoverable pre-edit snapshot of the repository was created
before any edit:
`/tmp/nuvitae-snapshots/nuvitae-20260807-174952-pre-t246-fix.tar.gz`.

| Field                     | Value                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Actual path               | `spikes/codex-direct-oauth/spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json` |
| Canonical authorized path | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json`                           |
| SHA-256                   | `dc96b2a42936d58e757c37bfb9b83708438dde603a1a8756ce420ca0afb903b9`                                                   |
| File size                 | 10530 bytes                                                                                                          |
| Sanitized classification  | `live_t246_semantic_parsing`                                                                                         |
| `invocation_attempted`    | `true` (consumed)                                                                                                    |
| Runner exit               | 1 (post-finalization failure; not a semantic failure)                                                                |

The preservation metadata is also recorded machine-readably in
`spikes/codex-direct-oauth/t246-authorizations.json` under
`consumed_attempts[0]`, including the evidence SHA-256 and size.

### 12.3 Offline canonical re-evaluation (no provider request)

The retained sanitized A01 evidence contains the canonical evaluator's
`evaluation_metrics` projection, artifact hash pins, transport-manifest match,
secret-scan results, and exposure booleans, but no raw model output or
transcript (by design). The offline verifier
`spikes/codex-direct-oauth/re-evaluate-t246-a01.mjs` recomputes the canonical
T246 complete gate from that retained material and writes a derived acceptance
artifact
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-derived-acceptance.json`
reporting:

- `semantic_result = PASS`;
- `runner_finalization = FAIL`;
- `derived_case_pass = true`;
- `official_status = semantic_pass_runner_finalization_failed_not_accepted`.

The historical A01 evidence and the T246 aggregate are not rewritten. The
aggregate remains INCOMPLETE; T246 stays incomplete and T203 stays NO-GO until
the repository-defined acceptance process says otherwise.

## 13. Replacement authorization record (2026-08-07, A02 prepared offline)

This addendum authorizes exactly one replacement live attempt for the consumed
T246-C01-A01 attempt. It does not execute the attempt and does not authorize
any other case or attempt.

- **T246-C01-A01** remains **CONSUMED**, permanently non-rerunnable, and
  historically immutable.
- **T246-C01-A02** is the only newly **AUTHORIZED** entry. It reuses the
  accepted C01 fixture, transcript, manifest, one-broker/one-request budget,
  and zero-retry contract, with fresh evidence at
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a02-semantic-parsing.json`.
- **T246-C02 through T246-C08** remain **NOT_AUTHORIZED**; no A03 entry exists.
- The fixed path-resolution and nested `evaluation_metrics` finalization gates
  are covered by offline regression tests. T246 remains **INCOMPLETE** and
  T203 remains **NO-GO** until canonical accepted A02 evidence exists.
- No OAuth, Codex/OpenAI/provider request, credential-volume access, live
  runner, commit, or push occurred while preparing this authorization.

## 14. Current T246-C01-A02 consumption and retry-policy determination (2026-08-07)

T246-C01-A02 was executed exactly once and is now **CONSUMED** because
`invocation_attempted=true`. It is the first harness-valid C01 semantic
attempt. Its immutable sanitized evidence remains at
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a02-semantic-parsing.json`
with SHA-256
`1164187ab0bb9a2d333482b54f12333cb7bce1c38e1464e8a9069cda7e21fe6d` and size
10679 bytes. The result is authoritative for this campaign's semantic
evaluation and is a failure: 23/24 exact facts, 17/18 high-priority facts,
`unsupported_fact_count=0`, `forbidden_inference_count=0`,
`missing_evidence_count=0`, `invalid_evidence_count=0`, grounding and
no-invention passed, and `primary_failure_category=expected_fact_missing`.
The missing fact's root cause is **INDETERMINATE**; the historical sanitized
artifact did not preserve fact-level IDs.

The canonical artifacts establish these rules:

- A01's harness/finalization failure was an invalid acceptance attempt. A
  separately reviewed replacement was permissible for that invalid attempt,
  and A02 consumed that replacement slot. A01 cannot be rerun or promoted to
  accepted evidence.
- A provider, quota, transport, or harness failure that prevents a valid
  authoritative semantic result may be replaced only by a separately reviewed
  and explicitly authorized attempt. Automatic retries are always zero. The
  replacement limit and reason must be fixed before authorization; a result
  cannot be selected after observing whether it passes.
- A valid harness-finalized semantic result, including a semantic failure, is
  consumed and authoritative for the campaign. The T246 stop conditions say
  to stop when `case_pass=false` and not continue automatically. Under the
  required clarified policy, a valid semantic failure is terminal for that
  case/campaign; it cannot be replaced or overridden by a green attempt.
- An additional independent sample would be a different qualification
  campaign, not a retry or replacement. It requires an explicit policy
  amendment before authorization that fixes the sample count and acceptance
  rule in advance (for example, all results must pass or a pre-declared
  pass-rate rule). A later green result must never erase or supersede A02.

The existing contract explicitly fixes one request per semantic case and zero
automatic retries, and distinguishes invalid live outcomes from accepted
evidence, but it does **not** explicitly resolve whether a fresh separately
authorized attempt after a valid semantic failure is replacement-only,
additional sampling, or forbidden. Therefore the current classification is
**CONTRACT_AMBIGUOUS_REQUIRES_POLICY_CHANGE**. No A03 authorization is valid
until the clarification above is adopted as the campaign's governing policy;
the registry contains no A03 entry. Allowing A03 now and accepting it if green
would create a retry-until-pass loophole.

The A01/A02 observations show output variability was observed across two live
invocations of the same C01 input/contract: A01's semantic projection passed
but its harness was invalid, while A02 was harness-valid and missed one
expected fact. They do not prove that C01 qualifies, do not prove the root
cause of the missing fact, and do not make A01 accepted qualification
evidence. A01 may be retained as non-authoritative observational evidence of
possible model variability only.

Future sanitized runs now preserve matched expected fact IDs, missing expected
fact IDs, matched high-priority fact IDs, and missing high-priority fact IDs
without retaining raw resume text or raw model output. T246 remains
INCOMPLETE, T203 remains NO-GO, and C02-C08 remain NOT_AUTHORIZED.
