# Direct semantic parsing matrix (T201)

This is the canonical T201 document. It records deterministic fixture and
evaluator coverage only; it does not authorize production Codex integration,
OAuth login, credential refresh, T202, T203, or T164-T165.

## Coverage matrix

| Case     | Language       | Source format               | Layout                   | Status                                                                                                                                                                                        |
| -------- | -------------- | --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T201-C01 | English        | plain text                  | single-column            | Passed canonical live validation; preserved unchanged                                                                                                                                         |
| T201-C02 | French         | plain text                  | single-column            | Passed canonical live validation in Campaign B13 with sanitized evidence                                                                                                                      |
| T201-C03 | French/English | bilingual plain text        | single-column            | B01 failed semantic recall; B02 failed under the former `document_language` contract; offline correction completed; fresh canonical live validation remains pending and B03 is not authorized |
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
or B02 into a live pass. C03 therefore still requires a fresh canonical live
validation. `T201-C03-B03` is not authorized in
`spikes/codex-direct-oauth/campaign-b-authorizations.json`.

C01 and C02 have passed canonical live validation. C04-C06 remain unexecuted.
T201 remains incomplete; T202, T203, T164, and T165 remain blocked. Any future
Campaign B attempt remains separately authorized and limited to one broker run,
one maximum semantic backend request, and zero automatic retries.

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
