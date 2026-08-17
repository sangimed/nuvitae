# Issue #25 final campaign reconciliation

Date: 2026-08-17  
Mode: offline evaluation of the five existing imports only  
Provider calls, uploads, retries, and benchmark executions: none

## A. Actual previous evaluation path

`packages/import-application/src/semantic-parser/semantic-benchmark-gate.ts`
was not invoked by a checked-in campaign runner. Its only repository reference
was its unit test and package export. The final campaign verdict was assembled
outside executable repository code from privacy-safe worker/API observations,
persisted draft fields, warnings, and operator/Codex interpretation. That
operator path duplicated the gate and unconditionally treated Summary as
required. No separate checked-in final-campaign evaluator or persisted
predicate report existed.

## B–C. Canonical gate and predicate schema

The gate in `semantic-benchmark-gate.ts` is now the single canonical
implementation. It reports these independent predicates:

1. response completed
2. V2 envelope accepted
3. no fallback
4. canonical draft produced
5. Summary fidelity, conditional on source expectation
6. Education fidelity, conditional on source expectation
7. Work fidelity, conditional on source expectation
8. no material invention
9. no material truncation

Each result is `PASS`, `FAIL`, or `not_applicable`, with a bounded categorical
reason. Warning count, rejected-field count, and privacy-safe rejection
categories are diagnostics only. The overall result is derived solely from
predicate failures.

## D. Offline re-evaluation

The complete privacy-safe report is persisted in
`import-resume-issue-25-final-campaign-evaluation-20260817.json`. The shared
source inventory is Summary absent, Work expected, and Education expected.

| Arm         | Active fields | Warnings | Summary | Education | Work | Overall |
| ----------- | ------------: | -------: | ------- | --------- | ---- | ------- |
| Control Sol |            75 |        3 | N/A     | PASS      | PASS | PASS    |
| Sol 1       |            72 |        4 | N/A     | PASS      | PASS | PASS    |
| Terra 1     |            16 |       24 | N/A     | FAIL      | FAIL | FAIL    |
| Terra 2     |            16 |       24 | N/A     | FAIL      | FAIL | FAIL    |
| Sol 2       |            69 |        7 | N/A     | PASS      | PASS | PASS    |

All five arms also passed response completion, V2 envelope acceptance, no
fallback, canonical draft production, no material invention, and no material
truncation. Terra's bounded field diagnostics remain visible; they are not
themselves the whole-arm failure.

## E–F. Quality classification

Sol is acceptable as a quality/model sample: Control Sol, Sol 1, and Sol 2
pass. Terra is disqualified as a quality/model sample: both Terra arms fail
the explicit material Work and Education fidelity predicates. Terra is not
promoted merely because it may be faster.

## G. Latency conclusion

Latency is inconclusive for the comparative benchmark. Provider latency was
not persisted with the five predicate reports, and Terra has zero valid
quality samples. No latency aggregate is recomputed from upload or review API
timestamps because those are not the provider latency metric.

## H–K. Issue conclusion and follow-up

Issue #25 can be concluded without another live run: Sol remains acceptable;
Terra is disqualified for this campaign's quality gate; the comparative
latency conclusion remains inconclusive. No additional provider run is
genuinely needed to reach that bounded decision.

Issue #29 is not implemented and is not made the next logical task by this
reconciliation; it remains a separate follow-up.

## L–M. Activity and repository confirmation

No provider call, upload, retry, or benchmark was performed. No persisted
resume data was altered. No commit or push was performed.
