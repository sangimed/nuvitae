# Direct semantic parsing matrix (T201)

This is the canonical T201 document. It records deterministic fixture and
evaluator coverage only; it does not authorize live production qualification,
OAuth login, credential refresh, or a change to the T203 decision. T216
production wiring is tracked separately in
`docs/research/codex-direct-oauth-t216-production-wiring-2026-08-08.json`.

## 2026-08-09 candidate identity correction (offline)

The latest real import evidence is transport-successful but semantically
rejected: import `51364b5a-18ff-4282-9831-7c9b30df3a5` completed HTTP 2xx/SSE,
`response.completed`, EOF, and JSON parsing, then failed schema validation at
`sections.education[0].candidateId`, all four skills, and both languages with
`invalid_type`. No provider or OAuth activity was performed for this correction.

### Ownership decision

`candidateId` is an internal Nuvitae correlation identity, not semantic source
information. The provider supplies facts, evidence, and (where present) legacy
relationship references. Review identity is owned by generated `ExtractedField`
IDs and review operation IDs; persistence is owner/response scoped; confirmation
generates structured-resume child IDs. No candidate ID participates in an
authorization boundary.

Nuvitae now generates the canonical candidate ID in the semantic mapper as:

`candidate-{importId}-{structuralPath}`

where dots in the structural path become hyphens. It is a non-empty safe
identifier string, at most 120 characters, unique across candidate sections
within an import response, and stable for the same import and structural
response throughout the review lifecycle. Provider-supplied IDs are never used
as application identity. Legacy string IDs may only resolve a relationship
reference to the generated ID; ambiguous or unknown references remain invalid.

### Prompt versus validator

Before this correction, the prompt required every candidate object to contain a
provider-produced string `candidateId`, while the strict validator required a
non-null safe string (`1..120`, `[A-Za-z0-9._:-]+`). The model could not infer
that application-level identity or its format from resume text, producing the
observed type rejection. That was an asymmetric contract:

`prompt: candidateId required` → `validator: candidateId required string` →
`mapper/persistence: provider value trusted as correlation identity`

The prompt now explicitly omits `candidateId`. The versioned schema strips the
legacy field before strict semantic validation, so omission, `null`, wrong
types, and arbitrary strings cannot reject or influence otherwise valid facts.
The mapper ignores the field and generates application identity itself.
Semantic evidence and grounding requirements are unchanged.

### Evidence interpretation and status

The live response contained one education candidate, four skills, and two
languages, matching the simple smoke fixture. This is encouraging structural
recall evidence only; because the values and evidence did not pass the full
semantic contract, real-provider semantic recall remains **UNVERIFIED**.

Exactly one future, separately authorized live semantic smoke is warranted after
this offline correction to verify that the provider omits candidate IDs and the
full response is accepted. It must not rerun or reinterpret T246 and must retain
the existing T217 one-call/fallback budgets.

V1 Grounded Text Import remains **active**. V2 Grounded Multimodal Import remains
**PROPOSED / POST-V1 SPIKE / NOT IMPLEMENTED**. T203 remains **NO-GO**; T246 is
untouched.

## Coverage matrix

| Case     | Language       | Source format               | Layout                   | Status                                                                                                                                                                                                          |
| -------- | -------------- | --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T201-C01 | English        | plain text                  | single-column            | Passed canonical live validation; preserved unchanged                                                                                                                                                           |
| T201-C02 | French         | plain text                  | single-column            | Passed canonical live validation in Campaign B13 with sanitized evidence                                                                                                                                        |
| T201-C03 | French/English | bilingual plain text        | single-column            | B01 and B02 remain immutable failed historical attempts; B03 passed canonical live validation with sanitized evidence                                                                                           |
| T201-C04 | English        | PDF-derived extracted text  | single-column            | B01 and B02 remain immutable failed historical attempts (original physical-coordinate contract / credential-recovery transport failure); B03 passed canonical live validation under the corrected T208 contract |
| T201-C05 | English        | PDF-derived extracted text  | multi-column interleaved | Passed canonical live validation (B01) with sanitized evidence                                                                                                                                                  |
| T201-C06 | English        | DOCX-derived extracted text | structural artifacts     | Passed canonical live validation (B01) with sanitized evidence                                                                                                                                                  |

All six cases are fictional, anonymous, and independently manifested. C02-C06
contain absent optional fields, an ambiguity, forbidden-inference rules,
section/item counts, high-priority facts, language metadata, and source-local
evidence coordinates. PDF/DOCX cases contain text already produced by a
deterministic extraction layer and explicitly do not implement binary parsing.

**Matrix status (2026-08-08 current reconciliation)**: T201 remains complete.
All six mandatory cases are present
and pass; the authoritative aggregate is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json`
(`matrix_state: all_cases_live_passed`, `matrix_pass: true`). C01-C06 are
executed and passing. T202 has been re-measured from this matrix
(`docs/research/codex-direct-oauth-evaluation.md`). T203 remains NO-GO after
T246 was finalized as FAILED (C01/C04 FAIL; C02/C03/C05/C06/C07 PASS; C08
PASS) and T216/T217 production wiring was completed offline/local. The separate
onboarding measurement is `PASS_AUTOMATED_FEASIBILITY` for deterministic/local
T213-T216 coverage; live provider/import evidence and moderated human
validation have not occurred.

## Artifacts

- Fixtures and independent manifests: `spikes/codex-direct-oauth/fixtures/t201-matrix/`.
- Strict output schema: `spikes/codex-direct-oauth/schemas/t201-output-schema.json`.
- Provider-independent evaluator and aggregate: `spikes/codex-direct-oauth/lib/t201-matrix-evaluator.mjs`.
- Deterministic tests: `spikes/codex-direct-oauth/test/t201-matrix.test.mjs`.
- Sanitized aggregate evidence: `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json`.

The evaluator reports, independently for every case: `schema_valid`, expected
section and item recall, exact and high-priority fact recall, unsupported facts,
forbidden inferences, missing and invalid evidence, ambiguity handling,
grounding, no-invention, and parsing. The aggregate passes only when all six
mandatory cases are present and pass; an average cannot hide an individual
failure.

Evidence stores only case identity, category metadata, fixture hash, bounded
metrics, state, and privacy/credential-isolation booleans. It never stores raw
fixture text or model output. The existing C01 sanitized live evidence remains
at `evidence/codex-direct-oauth-t201-semantic-parsing.json` and is not rewritten
as multi-case evidence.

## Canonical live-status record

C03 has executed twice. These are immutable historical live outcomes, distinct
from later offline evaluator and contract work:

1. `T201-C03-B01` ran once and failed semantic recall.
2. `T201-C03-B02` ran once and failed under the former
   `document_language` contract.
3. Commit `def8f1d` corrected that contract offline: `document_language` is a
   document-level classification with its own required gate, excluded from
   exact-fact recall, high-priority recall, fact diagnostics, and source-line
   evidence. The grounding and recall thresholds for every real resume fact are
   unchanged.

Neither the offline correction nor a deterministic evaluator pass converts B01
or B02 into a live pass. `T201-C03-B03` then passed its separately authorized
single canonical live validation. Its sanitized evidence is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c03-b03-semantic-parsing.json`.

C01, C02, and C03 have passed canonical live validation. C04, C05, and C06 have
since passed canonical live validation (C04 under the corrected T208
deterministic-enrichment contract) with sanitized evidence; the six-case matrix
is complete and all-passing (see `codex-direct-oauth-t201-matrix.json`).
T201 is therefore complete. T202 has been re-measured from the accepted
evidence and is no longer blocked; the T203 gate was re-evaluated on 2026-08-06
and re-confirmed on 2026-08-07 after the accepted T245 lifecycle proof, and
remains NO-GO for qualified live production use because finalized T246 is
FAILED and live provider/import evidence plus moderated human validation are
pending. T216/T217 are complete offline/local.
T205 completed the current-version offline contract reconciliation; it did not
authorize or execute C04 at that time.
Any future Campaign B attempt remains separately authorized and limited to one
broker run, one maximum semantic backend request, and zero automatic retries.

The 2026-08-09 semantic-import recall correction is offline-validated only:
explicit title/headline, education degree/institution/year, languages without
proficiency, and comma-separated skills are preserved, with 68/68 offline
regressions passing. No post-correction live provider run has occurred; one
new live semantic smoke revalidation remains pending. This follow-up does not
reopen or reinterpret T246.

## 2026-08-05 qualification run (T203 mission)

The T203 mission authorized a bounded qualification attempt on this branch.
Result of that run:

- The T208 deterministic-enrichment contract was implemented in the spike
  (schema/evaluator/prompt alignment plus deterministic post-model provenance
  enrichment). Under the corrected contract, the full six-case fixture matrix
  passes deterministically offline (`parsing_pass: true` for C01-C06;
  enrichment `pdf` for C04/C05, `docx` for C06, `none` for C01-C03;
  `consistency_pass: true`). Historical evidence files remain byte-identical.
- Campaign-B authorization entries were registered for C04-B02 (reproduction
  under the original contract), C04-B03 (corrected contract), C05-B01, and
  C06-B01. **None of these live attempts executed**: no valid ChatGPT/Codex
  session existed on the host (Codex CLI not logged in; stored sessions expired
  or refresh-rejected with 401; no browser session; fresh login blocked by
  missing interactive credentials and Cloudflare bot verification for
  headless browsers).
- The loopback callback topology was verified live on this host
  (`127.0.0.1:1455` and `[::1]:1455`, preflight HTTP 204).
- Credential lifecycle local proofs: encrypted persistence (no plaintext),
  restart recovery, safe failure mapping of an invalid refresh
  (`authentication_required`), logout/deletion, and disconnected restart all
  passed; `secret_scan_result=passed`.
- T202 evaluation recorded as BLOCKED; the T203 gate decision is recorded as
  **NO-GO** for production adapter implementation at this time, with defined
  re-evaluation triggers (see `docs/research/codex-direct-oauth-go-no-go.md`).

The canonical live-status record above is unchanged for that date: C04-C06 were
unexecuted, T201 was incomplete, T202 was blocked, and T164/T165 remained
blocked. T203 had a recorded NO-GO decision artifact at that time.

## 2026-08-06 update (T243 execution and T244 re-measurement)

The registered Campaign-B attempts were subsequently executed with an
authorized live session and the matrix was consolidated offline:

- C04-B02 (reproduction under the original physical-coordinate contract) ran
  and failed immutably at credential recovery
  (`primary_failure_category: transport_failure`, `invocation_attempted:
false`); its evidence file is preserved unchanged.
- C04-B03 (corrected T208 deterministic-enrichment contract) passed canonical
  live validation (HTTP 200, schema valid, 23/23 exact facts, 17/17
  high-priority facts, `parsing_pass: true`).
- C05-B01 (multi-column PDF) passed canonical live validation (HTTP 200,
  schema valid, 23/23 exact facts, 17/17 high-priority facts,
  `parsing_pass: true`).
- C06-B01 (DOCX structural artifacts) passed canonical live validation
  (HTTP 200, schema valid, 23/23 exact facts, 17/17 high-priority facts,
  `parsing_pass: true`).
- The sanitized aggregate matrix
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json` was
  rebuilt offline by `consolidate-t201-matrix.mjs` and records
  `matrix_state: all_cases_live_passed` with `matrix_pass: true`.

T201 is now complete. T244 re-measured T202 offline from the accepted evidence
(all evidence-supported metrics pass; see
`docs/research/codex-direct-oauth-evaluation.md`) and re-evaluated the T203
triggers: the decision remains **NO-GO** for production adapter implementation
because live Codex semantic quality over real PDF/DOCX documents (T246) and
bounded-fallback wiring (T217) are not accepted/unexecuted (T246-C01-A01 was
executed once on 2026-08-07 with all semantic metrics passing but runner
finalization failing; A01 is consumed), and non-technical onboarding
feasibility remains unmeasured. Historical evidence files remain byte-identical.

## 2026-08-07 update (T245 completion)

T245 (credential lifecycle proof in the supported local same-host Docker
deployment shape) was completed and accepted on 2026-08-07. The accepted
aggregate is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`:
9/9 mandatory criteria passing, 8 live-observed and 1 deterministic-only
invalid-grant classification; provider-side remote revocation was not
exercised and is not claimed (canonical T245 does not require it). T245
satisfies T203 re-evaluation trigger 1 and unblocks T213-T215 Community
connection-UI qualification, which remain incomplete. T246 (live Codex
semantic evaluation over the real-document corpus) is now the next live
semantic task; T248 (real French PDF proof), T247 (T208 bookkeeping closure),
and T249 (complete offline corpus) are satisfied. T246-C01-A01 was executed
once on 2026-08-07: the backend invocation succeeded (HTTP 200), every
mandatory semantic metric passed, and the runner failed during finalization
(implementation defects; A01 is CONSUMED and must not be rerun). C02-C08
remain NOT_AUTHORIZED, the real-document corpus is not accepted, and T246
remains INCOMPLETE. The T203 decision remains **NO-GO** after the
2026-08-07 re-confirmation.

## 2026-08-07 update (T248 completion)

T248 (real French PDF fixture and evaluation coverage) was completed on
2026-08-07. The canonical fixture
`tests/fixtures/resumes/anonymous-french-resume.pdf` is proven offline as a
valid one-page PDF with selectable text (41 text items, 21 non-empty
normalized lines) extracted deterministically by `PdfJsPdfAdapter` with no
OCR and no network access; `DeterministicLanguageDetector` classifies it as
French. The extraction transcript is pinned byte-for-byte to the
`pdf-french-canonical-anonymous` entry of the T096 semantic-evaluation corpus
in `packages/test-fixtures/src/resume-import/semantic-parser-fixtures.ts`.
The sanitized proof aggregate is
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t248-french-pdf.json`
(verifier `spikes/codex-direct-oauth/verify-t248-french-pdf.mjs`; regression
coverage in `tests/integration/import-resume/french-pdf-fixture-evaluation.integration.test.ts`
and `spikes/codex-direct-oauth/test/t248-french-pdf-verifier.test.mjs`). The
real-French-PDF prerequisite for T246 is satisfied. The later T246 aggregate
is finalized as FAILED: C01 and C04 fail, C02/C03/C05/C06/C07 pass, and C08
passes recovery; all attempts are consumed. C01-A01 remains an immutable
harness-invalid historical attempt. The T203 decision remains **NO-GO**.

## Execution boundary

The bounded sequence has been executed and the matrix is complete. No further
Campaign-B attempt is required to close T201. The recorded sequence, which was
followed, was:

1. Preserve C01 and C02's independently passing source-local evidence.
2. Do not rerun C03 B01 or B02; only a separately authorized future C03 attempt
   may produce new evidence, which must be inspected independently.
3. Run C04 alone and inspect its sanitized result.
4. Run C05 alone and inspect semantic regrouping and evidence coordinates.
5. Run C06 alone and inspect DOCX structural-artifact handling.
6. Aggregate only the independently inspected results.

No step runs OAuth login or credential refresh implicitly. The next live work
is the separately authorized T246 real-document live Codex evaluation (the
T245 lifecycle proof was completed and accepted on 2026-08-07; aggregate
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`);
no live request is authorized by this document.

## Preserved historical material

The former path `docs/research/codex-direct-oauth-semantic-parsing.md` is a
compatibility redirect/archive pointer. Its useful historical C01 transport,
limit, privacy, failure, and evidence details remain preserved there while
this file is the canonical path for the T201 matrix going forward.

The next paragraph is preserved historical material from the 2026-08-07
reconciliation; the current status is the T246/T217/onboarding summary above.

T201 is complete: every mandatory case has an independently passing bounded
evaluation, and the consolidated matrix records `all_cases_live_passed`. T202 is
measured (see `docs/research/codex-direct-oauth-evaluation.md`). T203 was
re-evaluated on 2026-08-06 and re-confirmed on 2026-08-07 after the accepted
T245 lifecycle proof; it remains **NO-GO** for production adapter
implementation because the live real-document semantic gate (T246) is not
accepted (T246-C01-A01 executed once on 2026-08-07, consumed after runner
finalization failed) and bounded-fallback wiring (T217) remains unexecuted.
T246 is now the next live semantic task; T164/T165 remain blocked.

Current T246 qualification status (2026-08-07): C01-A01 remains a consumed,
harness-invalid observation whose semantic projection passed. C01-A02 is the
first harness-valid C01 semantic attempt and is consumed after a valid
semantic failure (23/24 exact facts, 17/18 high-priority facts;
`expected_fact_missing`; root cause INDETERMINATE). The existing qualification
contract does not resolve whether a fresh attempt after a valid semantic
failure is a replacement or an additional sample, so the required policy
clarification is recorded as
`CONTRACT_AMBIGUOUS_REQUIRES_POLICY_CHANGE`; no A03 or C02-C08 is authorized.

## Final T246 qualification status (2026-08-07)

The final offline aggregate is `FAILED` / qualification not passed. The
canonical matrix is C01 FAIL, C02 PASS, C03 PASS, C04 FAIL, C05 PASS, C06
PASS, C07 PASS, and C08 PASS. Six cases passed, two failed, and one
harness-invalid attempt was retained. C01-A02 measured 23/24 exact facts and
17/18 high-priority facts; C04-A01 measured 18/24 exact facts and 13/19
high-priority facts. C08 passed the offline malformed-recovery contract with
zero provider requests, credential recovery, broker runs, and retries. No
replacement attempt was created, and T203 remains NO-GO.
