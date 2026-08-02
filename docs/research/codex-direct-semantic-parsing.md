# Direct semantic parsing matrix (T201)

This is the canonical T201 document. It records deterministic fixture and
evaluator coverage only; it does not authorize production Codex integration,
OAuth login, credential refresh, T202, T203, or T164-T165.

## Coverage matrix

| Case | Language | Source format | Layout | Status |
|---|---|---|---|---|
| T201-C01 | English | plain text | single-column | Existing successful live baseline; preserved unchanged |
| T201-C02 | French | plain text | single-column | B13 independently passed with sanitized evidence |
| T201-C03 | French/English | bilingual plain text | single-column | Fixture and manifest prepared; no live invocation |
| T201-C04 | English | PDF-derived extracted text | single-column | Fixture and manifest prepared; no binary extraction |
| T201-C05 | English | PDF-derived extracted text | multi-column interleaved | Fixture and manifest prepared; regrouping test only |
| T201-C06 | English | DOCX-derived extracted text | structural artifacts | Fixture and manifest prepared; no binary extraction |

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

## Execution boundary

The remaining bounded sequence, only after an explicitly authorized live run, is:

1. C02 passed independently in authorized Campaign B13; its evidence remains source-local.
2. Run C03 alone and inspect its sanitized result.
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
bounded evaluation. T202, T203, T164, and T165 remain incomplete.
