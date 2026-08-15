# Issue #25 Sol/low vs Terra/low benchmark conclusion

Date: 2026-08-15
Branch: `perf/import-resume-latency`
Status: concluded after Arm B; no further live provider call is authorized

## Decision

The confirmatory benchmark was intentionally stopped after Arm B failed its
predefined quality gate. Sol/low remains the selected default candidate. The
available evidence does not confirm a stable Terra/low performance advantage,
so Terra/low is not selected. This does not establish that Terra is
universally slower or lower quality; it establishes only that the hypothesized
stable advantage was not reproduced by this controlled comparison.

Arm C and Arm D were conditional on the preceding arms remaining valid. They
are therefore not missing benchmark samples: once Arm B failed its gate, the
four-arm sequence ended. No Arm C or Arm D was authorized or executed.

## Canonical evidence

The immutable evidence records are:

- Arm A: `docs/research/import-resume-issue-25-arm-a-sol-low-20260815.json`
- Arm B: `docs/research/import-resume-issue-25-arm-b-terra-low-20260815.json`

Arm A (Sol/low) passed: `response.completed=true`, `v2_success`, provider
total `49,593 ms`, first semantic output `9,510 ms`, generation `40,083 ms`,
64/64 active and grounded fields, zero rejected fields, warnings, or invented
values, and complete Work and Education structure.

Arm B (Terra/low) is an immutable quality-failed sample:
`response.completed=true`, `v2_partial_acceptance`, provider total `50,780 ms`,
first semantic output `15,548 ms`, generation `35,229 ms`, 64/64 active and
grounded fields, two rejected fields, two warnings, zero invented values, and
substantially complete Work and Education structure. The failed gate was
grounding/evidence for two ambiguous language-proficiency fields; no fallback
was used and the final state was `partial_extraction`.

Relative to Arm A, Arm B was +1,187 ms (+2.393%) in provider total,
+6,038 ms (+63.491%) to first semantic output, and -4,854 ms (-12.11%) in
generation. Because Arm B failed the predefined quality gate, it is not a
valid success-quality latency sample and does not support promoting Terra.

The earlier bounded observation of approximately 12.2% lower provider
latency, 36.5% lower first-output latency, and no meaningful fidelity
regression for Terra is therefore not stable enough to use as a selection
basis. The conclusion is comparative and bounded, not a universal Terra
performance claim.

## Scope and follow-up boundaries

- Do not rerun Terra or authorize Arm C or Arm D.
- Do not tune prompts, evidence rules, thresholds, schemas, evaluators, or
  model configuration in response to Arm B and repeat this benchmark.
- The two language-proficiency evidence rejections may be recorded as a
  separate product-quality observation; they do not reopen issue #25.
- The incremental SSE transport correction remains independently valid and
  must not be reverted. It is not evidence for selecting either model.
- No further live provider call is justified for issue #25.

The next product task is the existing offline Semantic V2 quality work tracked
by T254: correct and regression-test the `sections.contact` wrapper contract
and prompt alignment. That work must remain offline and must not become a
reason to reopen this benchmark.
