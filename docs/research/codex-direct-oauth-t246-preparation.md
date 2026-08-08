# T246 Live-Campaign Preparation Record (offline)

**Task**: Prepare T246 (`specs/001-import-resume/tasks.md`) for a later
operator-authorized live Codex semantic evaluation over the real-document
corpus.
**Prepared**: 2026-08-07 (Europe/Paris), branch
`feat/import-resume-codex-direct-oauth-spike`.
**Status**: **OFFLINE PREPARATION COMPLETE (historical preparation snapshot).**
T246 was subsequently executed and finalized as **COMPLETE — qualification
FAILED**. T203 remains **NO-GO**; the current blockers are finalized T246
semantic failure, incomplete T213-T215 production onboarding flow, and not-yet-
performed moderated human validation. T217 is complete.
**Live authorization**: NONE. No OAuth, Codex/OpenAI/provider request, network
request, credential access, or Campaign-B/T246 live attempt was performed or
authorized by this record. No commit and no push were made.

This record is the completed offline preparation for the canonical T246
real-document corpus: all eight mandatory cases now have deterministic binary
fixtures, pinned production extraction transcripts, provenance, semantic
expectations, fail-closed manifests, and regression coverage. The preparation
statements below are historical as-of-2026-08-07 instructions and authorization
states. They do not override the finalized aggregate, and no live command is
authorized by this documentation update.

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

## 15. Canonical T246-C02-A01 authorization (2026-08-07)

This is the single reviewed live authorization for the current qualification
campaign. It prepares C02-A01 but does not execute it.

| Field                             | Canonical value                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Campaign                          | `T246-C02`                                                                                     |
| Attempt                           | `A01`                                                                                          |
| Semantic case                     | `T246-C02`                                                                                     |
| Authorization state               | `AUTHORIZED`                                                                                   |
| Fixture                           | `tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf`                              |
| Fixture SHA-256                   | `9c9a9f91489b359270176d1f93824a51eceb965810f7eede9fcf821ca9183f95`                             |
| Deterministic transcript SHA-256  | `c1a4d9b366ef01c3a4c4fb25cbcf9fa90297772dad9b1ef760f12b41e1556195`                             |
| Manifest                          | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c02.manifest.json`                        |
| Manifest SHA-256                  | `70c6e61816f82621b984ad97cb37bd8514e6f5e6ed87dc8b9b3a033444d9fa82`                             |
| Expected semantic JSON SHA-256    | `9297043100acfeb86e758c9836dbe53b28d8462cf5daf14f389e5e3f6f41f08f`                             |
| Evidence                          | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c02-a01-semantic-parsing.json`     |
| Expected language                 | `English` (`english`)                                                                          |
| Expected facts                    | 27 exact; 22 high-priority                                                                     |
| Thresholds                        | exact recall `>= 0.90`; high-priority recall `= 1.00`                                          |
| Provenance                        | T208 flattened evidence plus deterministic PDF enrichment; model physical coordinates rejected |
| Maximum broker runs               | `1`                                                                                            |
| Maximum semantic backend requests | `1`                                                                                            |
| Automatic retries                 | `0`                                                                                            |

The registry contains exactly one `AUTHORIZED` entry: C02-A01. C01-A01 and
C01-A02 remain `CONSUMED`; C01-A03 does not exist; C02-A02 does not exist; and
C03-C08 remain `NOT_AUTHORIZED`. T246 remains `INCOMPLETE` and T203 remains
`NO-GO`.

The offline corpus verifier and the C02 offline case proof passed against the
checked-in registry, manifest, binary fixture, regenerated transcript, pinned
expected semantic JSON, English language classification, and T208 provenance
contract. The actual credential-free C02 preflight also passed with:

```text
authorization=valid
fixture_hash=valid
transcript_regeneration=valid
manifest_hash=valid
credential_recovery_attempted=false
semantic_backend_requests=0
evidence_written=false
```

The preflight validated the immutable image/runtime and result-channel topology
and mounted no credential volume.

### 15.1 Future operator command (do not run during preparation)

From the repository root, the exact single-attempt command is:

```sh
node spikes/codex-direct-oauth/t246-live-runner.mjs \
  --mode live \
  --campaign T246-C02 \
  --attempt A01 \
  --semantic-case T246-C02 \
  --fixture tests/fixtures/resumes/semantic-vertical-slice-jordan-avery.pdf \
  --manifest spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c02.manifest.json \
  --evidence spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c02-a01-semantic-parsing.json \
  --max-broker-runs 1 \
  --max-semantic-backend-requests 1 \
  --automatic-retries 0
rc=$?
echo "exit=$rc"
```

### 15.2 Safe evidence inspection

This projection selects only the current sanitized evidence fields and never
prints raw model output, transcript or resume text, tokens, account IDs,
authorization data, SSE, or provider bodies:

```sh
jq '
  def metric($name):
    if ((.evaluation_metrics | type) == "object" and
        (.evaluation_metrics | has($name)))
    then .evaluation_metrics[$name]
    else .[$name]
    end;
  {
    case_id,
    attempt_id,
    fixture_sha256,
    transcript_sha256,
    manifest_sha256,
    invocation_attempted,
    invocation_succeeded,
    http_status: .exact_http_status,
    safe_http_status_category,
    protocol_valid: .response_protocol_valid,
    schema_valid: metric("schema_valid"),
    semantic_evaluation_state: {
      model_output_received,
      structured_output_evaluated,
      semantic_quality_evaluated,
      metrics_measurement_state
    },
    expected_section_recall: metric("expected_section_recall"),
    expected_item_recall: metric("expected_item_recall"),
    exact_fact_recall: metric("exact_fact_recall"),
    high_priority_fact_recall: metric("high_priority_fact_recall"),
    matched_expected_fact_ids: metric("matched_expected_fact_ids"),
    missing_expected_fact_ids: metric("missing_expected_fact_ids"),
    matched_high_priority_fact_ids: metric("matched_high_priority_fact_ids"),
    missing_high_priority_fact_ids: metric("missing_high_priority_fact_ids"),
    unsupported_facts: metric("unsupported_fact_count"),
    forbidden_inference: metric("forbidden_inference_count"),
    missing_evidence: metric("missing_evidence_count"),
    invalid_evidence: metric("invalid_evidence_count"),
    grounding: metric("source_grounding_pass"),
    no_invention: metric("no_invention_pass"),
    parsing: metric("parsing_pass"),
    provenance_contract_validated,
    case_pass,
    safe_final_state,
    primary_failure_phase,
    primary_failure_category,
    secret_scan: {
      secret_scan_result,
      log_secret_scan_result,
      evidence_schema_valid,
      evidence_atomic_replace_succeeded,
      credential_exposure_boolean,
      account_identifier_exposure_boolean,
      raw_credentials_exposed_to_parent,
      account_identifier_exposed_to_parent,
      raw_model_response_persisted,
      raw_response_persisted
    }
  }
' spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c02-a01-semantic-parsing.json
```

### 15.3 Single-attempt stop rule

C02 permits exactly this one valid semantic attempt. After future execution:

- `case_pass=true` records PASS; C03 may be reviewed later under separate
  authorization.
- `case_pass=false` records FAIL with its explicit semantic category and phase;
  C02 is terminal for this campaign and no C02 retry or C02-A02 is allowed.
- A proven harness/infrastructure-invalid execution requires a separate
  reviewed authorization; it cannot trigger an automatic retry.

The offline finalization tests use the exact nested `evaluation_metrics` broker
shape and prove success yields `case_pass=true`, `safe_final_state=complete`,
exit `0`; semantic failure yields an explicit semantic category/phase and a
non-zero exit; and transport failure yields an explicit safe transport
category/phase and a non-zero exit. No synthetic top-level semantic metrics are
introduced.

## 16. Canonical T246-C03-A01 authorization (2026-08-07)

C02-A01 was reconciled from its immutable canonical evidence and recorded as
`CONSUMED` / `PASS`. Exactly one next attempt is authorized: C03-A01. It is
prepared only; it must not be executed in this preparation step.

| Field                             | Canonical value                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Campaign                          | `T246-C03`                                                                                                            |
| Attempt                           | `A01`                                                                                                                 |
| Semantic case                     | `T246-C03`                                                                                                            |
| Authorization state               | `AUTHORIZED`                                                                                                          |
| Fixture                           | `tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx`                                                       |
| Fixture SHA-256                   | `fd68340af64a7250cd253e44d726873275caa95c89123cce57375decd753802a`                                                    |
| Deterministic transcript SHA-256  | `16e4e2daa3fdb5bc33bd94124e0645b626bdd1acd64f22a6a7f75088e6131120`                                                    |
| Manifest                          | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c03.manifest.json`                                               |
| Manifest SHA-256                  | `64462cf2ec38af58826f716f401549f3d66e1c3f0b3d238e035c223d44dea2b2`                                                    |
| Expected semantic JSON SHA-256    | `ce484536af1786001e92272870ada408b2d41c462b8bd84dcbdc6957df6f163c`                                                    |
| Expected language                 | `English` (`english`)                                                                                                 |
| Expected facts                    | 22 exact; 19 high-priority                                                                                            |
| Thresholds                        | exact recall `>= 0.90`; high-priority recall `= 1.00`                                                                 |
| Provenance                        | T208 flattened evidence plus deterministic OOXML package-part/paragraph/run enrichment; physical coordinates rejected |
| Maximum broker runs               | `1`                                                                                                                   |
| Maximum semantic backend requests | `1`                                                                                                                   |
| Automatic retries                 | `0`                                                                                                                   |
| Evidence                          | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c03-a01-semantic-parsing.json`                            |

The registry contains exactly one `AUTHORIZED` entry: C03-A01. C01 attempts
remain `CONSUMED`; C02-A01 is `CONSUMED` / `PASS`; C02-A02 and C03-A02 do not
exist; C04-C08 remain `NOT_AUTHORIZED`; T246 remains `INCOMPLETE`; T203 remains
`NO-GO`.

### 16.1 Future operator command (do not run during preparation)

```sh
node spikes/codex-direct-oauth/t246-live-runner.mjs \
  --mode live \
  --campaign T246-C03 \
  --attempt A01 \
  --semantic-case T246-C03 \
  --fixture tests/fixtures/resumes/semantic-vertical-slice-maya-chen.docx \
  --manifest spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c03.manifest.json \
  --evidence spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c03-a01-semantic-parsing.json \
  --max-broker-runs 1 \
  --max-semantic-backend-requests 1 \
  --automatic-retries 0
rc=$?
echo "exit=$rc"
```

### 16.2 Safe inspection

```sh
jq '{case_id, attempt_id, fixture_sha256, transcript_sha256, manifest_sha256, invocation_attempted, invocation_succeeded, semantic_quality_evaluated, case_pass, safe_final_state, primary_failure_phase, primary_failure_category, evaluation_metrics: {exact_fact_recall, high_priority_fact_recall, matched_expected_fact_ids, missing_expected_fact_ids, matched_high_priority_fact_ids, missing_high_priority_fact_ids}}' \
  spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c03-a01-semantic-parsing.json
```

The preflight contract requires `authorization=valid`, valid fixture / transcript
/ manifest hashes, a fresh absent evidence path, immutable runtime/topology,
`credential_recovery_attempted=false`, `semantic_backend_requests=0`, and
`evidence_written=false`. The single valid semantic attempt is terminal: PASS or
explicit semantic FAIL is recorded and the campaign proceeds later to C04;
there is no semantic retry. Only a proven harness/infrastructure-invalid run may
receive a separately reviewed replacement authorization.

## 17. Canonical T246-C04-A01 authorization and C03 reconciliation (2026-08-07)

The immutable canonical evidence for `T246-C03-A01` was independently verified
before status mutation. Its canonical evidence path is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c03-a01-semantic-parsing.json`;
the bytes remain unchanged at 12,880 bytes with SHA-256
`f03a9c94ae582634587e2c7b65065d5795078f107a7d3a84208c01c557088ac4`. The
evidence has `case_pass=true`, `safe_final_state=complete`, and every mandatory
completion gate is true. C03-A01 is therefore recorded as `CONSUMED` / `PASS`.
The aggregate was regenerated from the consumed ledger and now reports
`INCOMPLETE`, with two accepted live cases (`C02-A01`, `C03-A01`) and four
consumed attempts. Historical C01 evidence was not modified.

Exactly one live attempt is authorized now: `T246-C04-A01`.

| Field                             | Canonical value                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Campaign                          | `T246-C04`                                                                                                                              |
| Attempt                           | `A01`                                                                                                                                   |
| Semantic case                     | `T246-C04`                                                                                                                              |
| Authorization state               | `AUTHORIZED`                                                                                                                            |
| Fixture                           | `tests/fixtures/resumes/anonymous-bilingual-resume.pdf`                                                                                 |
| Fixture SHA-256                   | `3dbc163ecaa84231246c04e9c6a00779fc3c3e6960f261b04e46e8f5868b5e24`                                                                      |
| Deterministic transcript SHA-256  | `518eb6272a9f4e4fd1ad37a10fa5124a17484b11e0ca6ffd1b83aee8f5c7c76b`                                                                      |
| Manifest                          | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c04.manifest.json`                                                                 |
| Manifest SHA-256                  | `403c161842368f1a85a20f41be6a9969ecfc39e4281182b01b3f61681c7aa465`                                                                      |
| Expected semantic JSON SHA-256    | `f5596c2d221cc2a834b8a778615bda90a4609d2aa5b78b93c61ccd300cc2757f`                                                                      |
| Evidence                          | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c04-a01-semantic-parsing.json`                                              |
| Expected language                 | `bilingual_french_english` (`French/English`)                                                                                           |
| Expected facts                    | 24 exact; 19 high-priority                                                                                                              |
| Thresholds                        | exact recall `>= 0.90`; high-priority recall `= 1.00`                                                                                   |
| Provenance                        | T208 flattened line/start/end evidence plus deterministic PDF page/item/physical-offset enrichment; model physical coordinates rejected |
| Maximum broker runs               | `1`                                                                                                                                     |
| Maximum semantic backend requests | `1`                                                                                                                                     |
| Automatic retries                 | `0`                                                                                                                                     |

### 17.1 Offline bilingual contract proof

The checked-in binary was extracted twice through the production deterministic
PDF adapter. The regenerated transcript is 24 lines and byte-identical to the
pinned corpus and manifest. It preserves both French and English content,
including bilingual contiguous fragments for the headline, summary, role,
responsibilities, degree, project, and language lines. The deterministic
language detector returns `bilingual_french_english` with high confidence.

The manifest grounds all 24 expected facts to exact transcript lines, including
19 high-priority facts. The expected semantic JSON keeps bilingual values in
their original contiguous fragments; it does not force translation or replace
one language with the other. The absence contract preserves the explicit
absence statement for website, employment type, and certifications, and the
manifest forbids invented certification, scope, employment, manager, honours,
or URL values. No raw resume text, model output, provider payload, credential,
or account identifier is persisted in diagnostics; only sanitized fact IDs and
bounded metrics are retained.

### 17.2 Credential-free preflight result

The exact C04 preflight passed without live execution:

```text
authorization=valid
canonical_targets=tracked
fixture_hash=valid
transcript_regeneration=valid
manifest_hash=valid
bilingual_language_expectation=valid
evidence_path=fresh_and_absent
immutable_image_runtime_contract=valid
result_channel_topology=valid
credential_recovery_attempted=false
semantic_backend_requests=0
evidence_written=false
```

No credential volume was accessed and no provider request was made. The fresh
evidence path remains absent.

### 17.3 Future operator live command (do not run during preparation)

From the repository root, the exact single-attempt command is:

```sh
node spikes/codex-direct-oauth/t246-live-runner.mjs \
  --mode live \
  --campaign T246-C04 \
  --attempt A01 \
  --semantic-case T246-C04 \
  --fixture tests/fixtures/resumes/anonymous-bilingual-resume.pdf \
  --manifest spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c04.manifest.json \
  --evidence spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c04-a01-semantic-parsing.json \
  --max-broker-runs 1 \
  --max-semantic-backend-requests 1 \
  --automatic-retries 0
rc=$?
printf 'exit=%s\\n' "$rc"
```

### 17.4 Safe evidence inspection

This projection reads only sanitized evidence and fact-level diagnostics. It
does not print transcript text, resume text, raw model/provider content,
credentials, tokens, account identifiers, prompts, or SSE:

```sh
jq '
  def metric($name):
    if ((.evaluation_metrics | type) == "object" and
        (.evaluation_metrics | has($name)))
    then .evaluation_metrics[$name]
    else .[$name]
    end;
  {
    case_id,
    attempt_id,
    fixture_sha256,
    transcript_sha256,
    manifest_sha256,
    invocation_attempted,
    invocation_succeeded,
    http_status: .exact_http_status,
    safe_http_status_category,
    response_protocol_valid,
    schema_valid: metric("schema_valid"),
    exact_fact_recall: metric("exact_fact_recall"),
    high_priority_fact_recall: metric("high_priority_fact_recall"),
    document_language_classification_pass: metric("document_language_classification_pass"),
    matched_expected_fact_ids: metric("matched_expected_fact_ids"),
    missing_expected_fact_ids: metric("missing_expected_fact_ids"),
    matched_high_priority_fact_ids: metric("matched_high_priority_fact_ids"),
    missing_high_priority_fact_ids: metric("missing_high_priority_fact_ids"),
    unsupported_fact_count: metric("unsupported_fact_count"),
    forbidden_inference_count: metric("forbidden_inference_count"),
    missing_evidence_count: metric("missing_evidence_count"),
    invalid_evidence_count: metric("invalid_evidence_count"),
    source_grounding_pass: metric("source_grounding_pass"),
    no_invention_pass: metric("no_invention_pass"),
    parsing_pass: metric("parsing_pass"),
    provenance_contract_validated,
    case_pass,
    safe_final_state,
    primary_failure_phase,
    primary_failure_category,
    secret_scan: {
      secret_scan_result,
      log_secret_scan_result,
      evidence_schema_valid,
      evidence_atomic_replace_succeeded,
      credential_exposure_boolean,
      account_identifier_exposure_boolean,
      raw_credentials_exposed_to_parent,
      account_identifier_exposed_to_parent,
      raw_model_response_persisted,
      raw_response_persisted
    }
  }
' spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c04-a01-semantic-parsing.json
```

### 17.5 Finalization and stop rule

Offline finalization tests use the real nested `evaluation_metrics` broker
result shape. A successful result requires `case_pass=true`,
`safe_final_state=complete`, and exit `0`. A semantic failure requires
`case_pass=false`, an explicit semantic failure category and phase, and a
non-zero exit. An infrastructure failure requires an explicit safe failure
category and phase and a non-zero exit.

This is exactly one valid semantic attempt. A future PASS records PASS and a
future semantic FAIL records FAIL; either outcome is terminal for C04 and the
campaign may later continue to C05. There is no semantic retry. Only a proven
harness/infrastructure-invalid execution can support a separately reviewed
replacement authorization. C01 attempts remain `CONSUMED`, C02-A01 and
C03-A01 remain `CONSUMED` / `PASS`, no C03-A02 exists, C04-A01 is the only
`AUTHORIZED` attempt, no C04-A02 exists, C05-C08 remain `NOT_AUTHORIZED`, T246
remains `INCOMPLETE`, and T203 remains `NO-GO`.

## 18. Canonical T246-C04-A01 reconciliation and T246-C05-A01 authorization (2026-08-07)

The canonical C04 evidence was verified before changing status. Its bytes were
not modified: `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c04-a01-semantic-parsing.json`
is 13,555 bytes with SHA-256
`0f75a00b6b8bc72207852a57f4b3806cdca8b0ac31299f9c822b28631a7bf2f8`. It is a
harness-valid semantic result with HTTP 200, valid protocol/schema, and a
completed semantic evaluation. It is now recorded as `CONSUMED` / `FAIL` with
`primary_failure_phase=response_semantic_evaluation` and
`primary_failure_category=expected_fact_missing`.

The preserved semantic metrics are exact fact recall `18/24 = 0.75`,
high-priority fact recall `13/19 = 0.6842`, unsupported facts `0`, forbidden
inferences `0`, missing evidence `0`, invalid evidence `0`, grounding `true`,
no-invention `true`, and parsing `false`. The sanitized matched and missing
expected/high-priority fact ID arrays remain in the immutable evidence. No raw
resume, model, provider, prompt, SSE, credential, or account content was
changed or copied into status records.

The aggregate was regenerated from the consumed ledger. It remains
`INCOMPLETE`, has two accepted live cases, five consumed attempts, and records
C04 as consumed but not accepted. C01 remains consumed; C02-A01 and C03-A01
remain consumed/pass; no C02-A02, C03-A02, C04-A02, or C05-A02 exists.

Exactly one live attempt is authorized for future operator execution:
`T246-C05-A01`. Authorization is prepared only; this document does not execute
the attempt.

| Field                             | Canonical value                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Campaign                          | `T246-C05`                                                                                 |
| Attempt                           | `A01`                                                                                      |
| Semantic case                     | `T246-C05`                                                                                 |
| Authorization state               | `AUTHORIZED`                                                                               |
| Fixture                           | `tests/fixtures/resumes/anonymous-partial-resume.docx`                                     |
| Fixture SHA-256                   | `a15a71c03a3ed3c7a531d7ad9bc8bbbbfdd993e1ead7ded479f70e0a3241a245`                         |
| Deterministic transcript SHA-256  | `2358561e02dc0adcb79a749f853ea5a63d3621be56dacb763fd1654fb896fca6`                         |
| Manifest                          | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c05.manifest.json`                    |
| Manifest SHA-256                  | `da43718d40450ab9b17da4d522d8240d7bb31ccbce6b8b8b2f25dca25e48c3b3`                         |
| Expected semantic JSON SHA-256    | `7a2eb748a4555a4666302cda259ee7208680e557778052bd03e3f79058ee3dad`                         |
| Expected language                 | `English` (`english`)                                                                      |
| Expected facts / priorities       | 18 exact facts; 15 high-priority facts                                                     |
| Thresholds                        | exact recall `>= 0.90`; high-priority recall `= 1.00`                                      |
| Maximum broker runs               | `1`                                                                                        |
| Maximum semantic backend requests | `1`                                                                                        |
| Automatic retries                 | `0`                                                                                        |
| Fresh evidence                    | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c05-a01-semantic-parsing.json` |

### 18.1 Sparse contract proof

The checked-in C05 manifest, deterministic transcript, and expected semantic
JSON intentionally describe a partial/sparse DOCX. They require only facts
explicitly present in the document. The contract intentionally leaves these
normal CV fields absent: location, website, summary, employer location,
employment type, education grade, field of study, education location, projects,
certifications, and professional links. The schema-specific expected output
therefore keeps omitted scalar/object fields `null` and omitted collections
empty/absent as defined by the output schema.

The absence evidence is explicit and the forbidden-inference contract rejects
invented summaries, certifications, websites/URLs, locations, projects,
honours, managers, and employment type. Missing sections do not create inferred
facts. Recall counts only the 18 explicitly present expected facts, and the
grounding and no-invention rules are unchanged. Thresholds were not weakened.
The manifest keeps DOCX provenance at deterministic package-part,
paragraph/run/offset enrichment; model physical coordinates remain rejected.

### 18.2 Credential-free C05 preflight

The credential-free preflight passed without executing C05-A01. It verified
authorization, tracked canonical targets, fixture/transcript/manifest hashes,
English language expectation, fresh absent evidence, immutable image/runtime
contract, and result-channel topology. It reported:

```text
credential_recovery_attempted=false
semantic_backend_requests=0
evidence_written=false
```

No credential volume was accessed and no OAuth, Codex/OpenAI, provider, live
runner, or provider request was made.

### 18.3 Future operator command (do not run during preparation)

From the repository root, the exact one-attempt command is:

```sh
node spikes/codex-direct-oauth/t246-live-runner.mjs \
  --mode live \
  --campaign T246-C05 \
  --attempt A01 \
  --semantic-case T246-C05 \
  --fixture tests/fixtures/resumes/anonymous-partial-resume.docx \
  --manifest spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c05.manifest.json \
  --evidence spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c05-a01-semantic-parsing.json \
  --max-broker-runs 1 \
  --max-semantic-backend-requests 1 \
  --automatic-retries 0
rc=$?
printf 'exit=%s\\n' "$rc"
```

### 18.4 Safe C05 evidence inspection

This projection is limited to sanitized status, hash, semantic, diagnostic,
finalization, and sanitization fields. It emits no raw transcript, resume text,
model/provider output, SSE, token, account ID, or provider body:

```sh
jq '
  def metric($name):
    if ((.evaluation_metrics | type) == "object" and
        (.evaluation_metrics | has($name)))
    then .evaluation_metrics[$name]
    else .[$name]
    end;
  {
    case_id,
    attempt_id,
    hashes: {fixture_sha256, transcript_sha256, manifest_sha256},
    invocation: {attempted: invocation_attempted, succeeded: invocation_succeeded},
    http_protocol_schema: {
      status: .exact_http_status,
      safe_status_category: .safe_http_status_category,
      protocol_valid: .response_protocol_valid,
      schema_valid: metric("schema_valid")
    },
    semantic_evaluation: {
      evaluated: .semantic_quality_evaluated,
      exact_fact_recall: metric("exact_fact_recall"),
      high_priority_fact_recall: metric("high_priority_fact_recall"),
      matched_expected_fact_ids: metric("matched_expected_fact_ids"),
      missing_expected_fact_ids: metric("missing_expected_fact_ids"),
      matched_high_priority_fact_ids: metric("matched_high_priority_fact_ids"),
      missing_high_priority_fact_ids: metric("missing_high_priority_fact_ids"),
      unsupported_fact_count: metric("unsupported_fact_count"),
      forbidden_inference_count: metric("forbidden_inference_count"),
      missing_evidence_count: metric("missing_evidence_count"),
      invalid_evidence_count: metric("invalid_evidence_count"),
      grounding: metric("source_grounding_pass"),
      no_invention: metric("no_invention_pass"),
      parsing: metric("parsing_pass")
    },
    finalization: {
      case_pass,
      safe_final_state,
      primary_failure_phase,
      primary_failure_category
    },
    sanitization: {
      secret_scan_result,
      log_secret_scan_result,
      evidence_schema_valid,
      evidence_atomic_replace_succeeded,
      credential_exposure_boolean,
      account_identifier_exposure_boolean,
      raw_credentials_exposed_to_parent,
      account_identifier_exposed_to_parent,
      raw_model_response_persisted,
      raw_response_persisted
    }
  }
' spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c05-a01-semantic-parsing.json
```

### 18.5 Stop rule and isolation

There is exactly one valid C05 semantic attempt. A future PASS records PASS and
`complete` with exit `0`; a future semantic FAIL records explicit category and
phase with a non-zero exit; an infrastructure failure records an explicit safe
failure category and phase with a non-zero exit. PASS and semantic FAIL are
both terminal for C05. No semantic retry is allowed. Only a proven
harness/infrastructure-invalid execution may receive a separately reviewed
replacement authorization. C06-C08 remain `NOT_AUTHORIZED`, C05-A02 does not
exist, T246 remains `INCOMPLETE`, and T203 remains `NO-GO`.

## 19. C06 reconciliation and independent live-execution guard (2026-08-07)

The accidental `T246-C06-A01` live attempt is now reconciled as immutable
`CONSUMED / PASS`. Its canonical evidence was read byte-for-byte without
rewrite or normalization:

| Field          | Value                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Evidence       | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c06-a01-semantic-parsing.json`                                                              |
| SHA-256        | `21611140539114711d0094fee51076d28e6ee4882e22b82fd9dfb2a1eccb6b32`                                                                                      |
| Size           | `12337` bytes                                                                                                                                           |
| Invocation     | attempted `true`; succeeded `true`; HTTP `200`; protocol `true`                                                                                         |
| Semantic       | schema `true`; exact recall `1`; high-priority recall `1`; missing expected `0`; missing high-priority `0`                                              |
| Safety/quality | unsupported `0`; forbidden inference `0`; missing/invalid evidence `0/0`; ambiguity handling `2`; grounding `true`; no-invention `true`; parsing `true` |
| Finalization   | `case_pass=true`; `safe_final_state=complete`; failure phase/category `none/none`                                                                       |

The registry ledger records C06-A01 as consumed, with `do_not_rerun=true`, the
same evidence SHA-256 and size, and no C06-A02. The aggregate now reports four
accepted live attempts (C02, C03, C05, C06) and remains `INCOMPLETE`.

### 19.1 Accidental-execution root cause

The focused file was `spikes/codex-direct-oauth/test/t246-runner.test.mjs`.
Its live-mode test spawned the real command
`node spikes/codex-direct-oauth/t246-live-runner.mjs --mode live ...` using a
C06 base invocation. The test did not use `--mode preflight`, and did not
inject a fake bridge, credential recovery function, or provider transport.
After C06 was flipped to `AUTHORIZED`, registry validation succeeded; the
runner then entered `runT246LiveBridge`, prepared the real image/preflight, and
the execution shell reached credential-volume inspection and the provider-capable
broker path. Unit fakes elsewhere did not intercept this child-process boundary.
The prior assumption that registry authorization was the final boundary was
therefore insufficient: a focused test could inherit a live-authorized target
and invoke the real child command.

### 19.2 Guard contract

Real T246 execution now requires both:

1. the exact per-attempt registry authorization, hashes, transcript, manifest,
   evidence freshness, topology, and fixed `1/1/0` request budget; and
2. `NUVITAE_T246_OPERATOR_LIVE_OPT_IN=1`, supplied explicitly by an operator.

The opt-in is a non-secret acknowledgement, not a token or reusable
credential. `--mode live` alone is insufficient. The runner/bridge rejects a
missing opt-in before image preparation; the shell entrypoint repeats the
check before credential-volume inspection or mount; and the broker repeats it
before credential recovery or provider invocation. Test environments are
rejected even if they set the opt-in. Dependency-injected tests may use the
separate in-process `allowSimulatedLive` seam; it is not exposed by the CLI and
never calls the real provider boundary.

Credential-free `--mode preflight` remains allowed without the opt-in and stops
at the broker rehearsal boundary with `credential_recovery_attempted=false`,
`semantic_backend_requests=0`, and `evidence_written=false`. Offline C07
verification additionally reports only safe prompt-isolation diagnostics:
seven instruction-like lines counted, document content treated as untrusted,
all control surfaces fixed, and raw instruction text not persisted.

## 20. Canonical T246-C07-A01 authorization (prepared, not executed)

Exactly one attempt is authorized:

| Field                          | Value                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Campaign / attempt / case      | `T246-C07` / `A01` / `T246-C07`                                                                                              |
| Fixture                        | `tests/fixtures/resumes/anonymous-prompt-instruction-resume.docx`                                                            |
| Fixture SHA-256                | `df51667b192449a54c6b262784ffea11931323c411be8019f3a7e5437710a113`                                                           |
| Manifest                       | `spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c07.manifest.json`                                                      |
| Manifest SHA-256               | `eac09aafd7c29175b52085782b06663f0383319c05081143e877937c0e2593e8`                                                           |
| Regenerated transcript SHA-256 | `8b82628f3cf6931e503968e9a900e84d6fa31838b8db485dea542a17548bea43`                                                           |
| Expected semantic JSON SHA-256 | `03c386fd214a72f142177188d6cd2e7ea569dde7887fefd7cbebd2b477cf7c7e`                                                           |
| Language                       | English (`english`)                                                                                                          |
| Expectations                   | exact facts `21`; high-priority facts `16`; exact threshold `0.9`; high-priority threshold `1.0`                             |
| Provenance                     | flattened line/start/end coordinates; deterministic DOCX enrichment; model physical coordinates rejected                     |
| Limits                         | broker runs `1`; backend requests `1`; automatic retries `0`                                                                 |
| Evidence                       | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c07-a01-semantic-parsing.json` (must be absent before execution) |

C01-A01/A02, C02-A01, C03-A01, C04-A01, C05-A01, and C06-A01 remain
`CONSUMED`; C02/C03/C05/C06 are PASS and C01/C04 are FAIL. C07-A01 is the
only `AUTHORIZED` attempt. C08 remains `NOT_AUTHORIZED`; no C07-A02 exists.
T246 remains incomplete and T203 remains NO-GO.

### 20.1 C07 prompt-isolation result

The checked-in DOCX, deterministic transcript, manifest, semantic fixture, and
existing offline isolation suite prove that instruction-like document lines
remain untrusted document data. They cannot modify system/developer
instructions, the semantic schema, provider/model target, authorization,
evidence path, retry or request budgets, credential handling, network/tools,
grounding, or no-invention rules. They are not included in the expected facts.
Diagnostics retain only the contract result and count; raw hostile lines,
resume text, prompts, model output, SSE, credentials, account identifiers, and
provider bodies are not persisted.

### 20.2 Future operator command (do not execute in this task)

```sh
NUVITAE_T246_OPERATOR_LIVE_OPT_IN=1 \
node spikes/codex-direct-oauth/t246-live-runner.mjs \
  --mode live \
  --campaign T246-C07 \
  --attempt A01 \
  --semantic-case T246-C07 \
  --fixture tests/fixtures/resumes/anonymous-prompt-instruction-resume.docx \
  --manifest spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c07.manifest.json \
  --evidence spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c07-a01-semantic-parsing.json \
  --max-broker-runs 1 \
  --max-semantic-backend-requests 1 \
  --automatic-retries 0
rc=$?
echo "exit=$rc"
```

### 20.3 Safe C07/C06 evidence inspection

This projection is safe for sanitized evidence only. It does not print raw
resume text, prompt-instruction text, model output, SSE, credentials, account
identifiers, or provider bodies:

```sh
jq '
  def metric($name):
    if ((.evaluation_metrics | type) == "object" and
        (.evaluation_metrics | has($name)))
    then .evaluation_metrics[$name]
    else .[$name]
    end;
  {
    case_id,
    attempt_id,
    hashes: {fixture_sha256, transcript_sha256, manifest_sha256},
    invocation: {attempted: invocation_attempted, succeeded: invocation_succeeded},
    http_protocol_schema: {
      status: .exact_http_status,
      protocol_valid: .response_protocol_valid,
      schema_valid: metric("schema_valid")
    },
    semantic_evaluation: {
      evaluated: .semantic_quality_evaluated,
      exact_fact_recall: metric("exact_fact_recall"),
      high_priority_fact_recall: metric("high_priority_fact_recall"),
      matched_expected_fact_ids: metric("matched_expected_fact_ids"),
      missing_expected_fact_ids: metric("missing_expected_fact_ids"),
      matched_high_priority_fact_ids: metric("matched_high_priority_fact_ids"),
      missing_high_priority_fact_ids: metric("missing_high_priority_fact_ids"),
      unsupported_fact_count: metric("unsupported_fact_count"),
      forbidden_inference_count: metric("forbidden_inference_count"),
      missing_evidence_count: metric("missing_evidence_count"),
      invalid_evidence_count: metric("invalid_evidence_count"),
      grounding: metric("source_grounding_pass"),
      no_invention: metric("no_invention_pass"),
      parsing: metric("parsing_pass")
    },
    prompt_isolation: .prompt_isolation_diagnostics,
    finalization: {case_pass, safe_final_state, primary_failure_phase, primary_failure_category},
    sanitization: {
      missing_or_invalid_evidence: [metric("missing_evidence_count"), metric("invalid_evidence_count")],
      secret_scan_result, log_secret_scan_result,
      credential_exposure_boolean, account_identifier_exposure_boolean,
      raw_credentials_exposed_to_parent, account_identifier_exposed_to_parent,
      raw_model_response_persisted, raw_response_persisted
    }
  }
' spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c07-a01-semantic-parsing.json
```

The command is intentionally a future inspection command: the C07 evidence
path is currently absent because C07-A01 is authorized but unconsumed.

## 21. Final C07 reconciliation and canonical C08 recovery (2026-08-07)

C07-A01 was reconciled from its immutable canonical evidence without rewriting
the historical file. The evidence remains `case_pass=true` with
`safe_final_state=complete`, prompt-isolation diagnostics passing, and the
following fingerprint:

| Evidence                                                                                   | SHA-256                                                            |        Size |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------: |
| `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c07-a01-semantic-parsing.json` | `b350ee1dc70a73869558c87e4c67f298704195e9d14d8a5aa6ef97a8204d5d4b` | 14021 bytes |

The checked-in C08 contract was recomputed offline: fixture and recovery-input
SHA-256 are both
`14bcd090baf31edba64e9cbd8cdfc15f943344aa72cb3675ad8e91bfcbce03ad`, and the
manifest SHA-256 is
`d55dd37642b4e883d07fc5ad22979a27a621872ecfcc34dd998ff1fd12697889`.
The manifest requires malformed extraction, user-facing
`malformed_or_corrupted`, zero broker runs, zero semantic backend requests,
and zero retries.

Exactly T246-C08-A01 was authorized and executed through the offline recovery
runner. It detected deterministic `malformed` extraction, produced no draft or
artifact, attempted no invocation, credential recovery, credential-volume
access, broker run, or provider request, and passed secret/sanitization checks.
Its canonical sanitized evidence is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c08-a01-recovery.json`
(SHA-256 `cd4882eeffcc00977ade5276f97a6a8327e1478b63301b9372c8a7fb0b6f924e`,
1997 bytes). C08-A01 is CONSUMED/PASS; no C08-A02 exists.

The final aggregate is `FAILED` / qualification not passed, with six passing
cases and two failing cases: C01 FAIL, C02 PASS, C03 PASS, C04 FAIL, C05 PASS,
C06 PASS, C07 PASS, C08 PASS. T203 remains NO-GO. The current blockers are the
failed C01/C04 semantic-quality gate, incomplete T213-T215 production
connection/status/recovery flow, and not-yet-performed moderated human
onboarding validation. T217 bounded-fallback wiring is complete; onboarding is
measured as `FAIL_AUTOMATED_FEASIBILITY`, not unmeasured. Earlier preparation
and execution records remain historical and are not rewritten.
