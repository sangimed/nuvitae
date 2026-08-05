# Direct semantic parsing matrix (T201)

This is the canonical T201 document. It records deterministic fixture and
evaluator coverage only; it does not authorize production Codex integration,
OAuth login, credential refresh, T202, T203, or T164-T165.

## Coverage matrix

| Case     | Language       | Source format               | Layout                   | Status                                                                                                                                                                                        |
| -------- | -------------- | --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T201-C01 | English        | plain text                  | single-column            | Passed canonical live validation; preserved unchanged                                                                                                                                         |
| T201-C02 | French         | plain text                  | single-column            | Passed canonical live validation in Campaign B13 with sanitized evidence                                                                                                                      |
| T201-C03 | French/English | bilingual plain text        | single-column            | B01 and B02 remain immutable failed historical attempts; B03 passed canonical live validation with sanitized evidence |
| T201-C04 | English        | PDF-derived extracted text  | single-column            | Unexecuted; fixture and manifest prepared; no binary extraction                                                                                                                               |
| T201-C05 | English        | PDF-derived extracted text  | multi-column interleaved | Unexecuted; fixture and manifest prepared; regrouping test only                                                                                                                               |
| T201-C06 | English        | DOCX-derived extracted text | structural artifacts     | Unexecuted; fixture and manifest prepared; no binary extraction                                                                                                                               |

All six cases are fictional, anonymous, and independently manifested. C02-C06
contain absent optional fields, an ambiguity, forbidden-inference rules,
section/item counts, high-priority facts, language metadata, and source-local
evidence coordinates. PDF/DOCX cases contain text already produced by a
deterministic extraction layer and explicitly do not implement binary parsing.

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

C01, C02, and C03 have passed canonical live validation. C04-C06 remain
unexecuted. T201 remains incomplete; T202, T203, T164, and T165 remain blocked.
T205 completed the current-version offline contract reconciliation; it does not
authorize or execute C04.
Any future Campaign B attempt remains separately authorized and limited to one
broker run, one maximum semantic backend request, and zero automatic retries.

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

The canonical live-status record above is unchanged: C04-C06 remain unexecuted,
T201 remains incomplete, T202 remains blocked, and T164/T165 remain blocked.
T203 now has a recorded NO-GO decision artifact; it is not re-run or
re-interpreted as a pass.

## Execution boundary

The remaining bounded sequence, only after an explicitly authorized live run, is:

1. Preserve C01 and C02's independently passing source-local evidence.
2. Do not rerun C03 B01 or B02; only a separately authorized future C03 attempt
   may produce new evidence, which must be inspected independently.
3. Run C04 alone and inspect its sanitized result.
4. Run C05 alone and inspect semantic regrouping and evidence coordinates.
5. Run C06 alone and inspect DOCX structural-artifact handling.
6. Aggregate only the independently inspected results.

No step runs OAuth login or credential refresh implicitly. No step runs a live
request in the current fixture-preparation work.

## Preserved historical material

The former path `docs/research/codex-direct-oauth-semantic-parsing.md` is a
compatibility redirect/archive pointer. Its useful historical C01 transport,
limit, privacy, failure, and evidence details remain preserved there while
this file is the canonical path for the T201 matrix going forward.

T201 remains incomplete until every mandatory case has an independently passing
bounded evaluation. T202, T203, T164, and T165 remain blocked.
