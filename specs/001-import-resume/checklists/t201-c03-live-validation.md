# C03 Live-Validation Readiness Checklist: Import Existing Resume

**Purpose**: Requirement-quality gate for a separately authorized T201-C03 Campaign B live validation. This document does not authorize or execute a broker run.
**Created**: 2026-08-02
**Feature**: [Import Existing Resume](../spec.md)

## Identity and Authorization Requirements

- [x] CHK001 Are the C03 fixture and manifest paths, SHA-256 pins, and case identifier specified exactly and consistently with the Campaign B authorization registry? [Completeness, T201] — Current C03 hashes are `50f370ecfc601a22fe7f2668ad5c4ce7fe845aea74394c1ed6b62e126ec81d51` (fixture) and `a980bca7ab382b2565d0e4cc44df2b18ce811f135f0292608842122bac0f730e` (manifest); B01/B02 preserve their historical manifest pin, and the authorization validator requires a fresh attempt to pin the current artifacts.
- [x] CHK002 Is the semantic-case binding explicitly limited to `T201-C03`, with no fallback or dynamic selection of another fixture? [Clarity, T201] — Registry validation binds `manifest.fixture_id` to the explicit semantic case; focused contract test passed.
- [x] CHK003 Is the immutable image identity specified as a resolved local ID for both broker and reader, rather than a mutable tag? [Completeness, T201] — Focused image-contract tests passed: the prepared `sha256:` ID is re-inspected and both services use it with `pull_policy: never`.
- [x] CHK004 Are credential-free preflight requirements explicit that they precede credential access and cannot build, pull, or mount credentials? [Ordering, Security] — Focused image/preflight tests passed; preflight uses the prepared ID and rejects build, pull, and credential mounts.
- [x] CHK005 Are the one broker run, one maximum semantic-backend request, and zero automatic-retry limits separately quantified and mandatory? [Measurability, T201] — Contract validator requires `1`, `1`, and `0`; focused authorization tests passed.
- [x] CHK006 Is a distinct C03 B03 authorization-record requirement defined before a live invocation, rather than inferred from B01/B02? [Dependency, Gap] — B03 is absent from the registry and the runner rejects unregistered attempts; a separate future record is required.

## Isolation and Credential Requirements

- [x] CHK007 Is semantic-broker network access defined as the sole allowed outbound network capability for the live request? [Completeness, Security] — Focused topology tests passed; the reader is isolated and the broker is the semantic-request boundary.
- [x] CHK008 Is reader network isolation explicitly required, including no network access during result validation? [Completeness, Security] — `t201-result-reader` has `network_mode: none`; focused topology tests passed.
- [x] CHK009 Are credential recovery requirements defined as broker-only, token-blind outside the broker, and recoverable without implicit OAuth login or refresh? [Completeness, Spec §FR-021] — Focused credential-recovery diagnostic tests passed, including safe recovery classifications and non-root isolation.
- [x] CHK010 Is the requirement to avoid OAuth or transport changes during C03 stated unambiguously? [Scope, Consistency] — Canonical matrix record states no implicit OAuth login or refresh; focused broker/transport-boundary tests passed.
- [x] CHK011 Are raw model output, raw credentials, account identifiers, prompts, and source text explicitly prohibited from persisted evidence and diagnostics? [Completeness, Spec §FR-019] — Focused evaluator and runner-evidence tests passed for safe bounded projections and non-persistence.

## Semantic Acceptance Requirements

- [x] CHK012 Is `document_language` specified as a derived document-level classification with its own required pass gate? [Clarity, Schema] — `def8f1d` contract is present and focused matrix classification tests passed.
- [x] CHK013 Is `document_language` explicitly excluded from exact-fact recall, high-priority recall, fact diagnostics, and source-line grounding? [Consistency, Schema] — Focused C03 fact-diagnostic test passed; classification remains a separate required metric.
- [x] CHK014 Are all 23 real expected facts enumerated or manifest-derived, with no omission permitted by the completeness contract? [Completeness, T201] — Current C03 manifest enumerates 23 exact facts; focused completeness and C03 diagnostic tests passed.
- [x] CHK015 Are exact-recall and high-priority-recall thresholds stated without lowering the existing real-resume-fact requirements? [Measurability, T201] — Manifest requires exact recall `>= 0.9` and high-priority recall `= 1`; omission-threshold tests passed.
- [x] CHK016 Are grounding requirements defined for every real extracted fact, including exact source coordinate and fragment validation? [Completeness, T201] — Focused grounded-output, missing-evidence, invalid-coordinate, and wrong-line tests passed.
- [x] CHK017 Are no-invention requirements defined for unsupported values, forbidden inferences, and incorrect duplicates or paths? [Completeness, T201] — Focused invented-value, forbidden-inference, wrong-path, and duplicate tests passed.
- [x] CHK018 Is the ambiguity contract explicit about the required grounded diagnostic projection and prohibition on converting the ambiguity into a hard fact? [Clarity, T201] — Focused ambiguity pass/fail tests passed.
- [x] CHK019 Are absent optional fields required to remain absent or `null`, rather than being treated as missing recall facts or inferred values? [Consistency, T201] — Focused absent-field and completeness tests passed.

## Evidence and Outcome Requirements

- [x] CHK020 Are evidence-validity requirements explicit about current-run identity, schema validity, fixture/manifest hashes, sanitized bounded metrics, and secret-free content? [Completeness, T201] — Focused integrity validation now pins the T204-reconciled decision record at SHA-256 `11d88c1eff4aff9f3950d35e3238ff85b7f861adf59beba537d1a4fd41a375ed`; exact fail-closed integrity checks remain in place.
- [x] CHK021 Is canonical evidence acceptance defined as a separate required outcome from a broker process exit or local evaluator result? [Clarity, T201] — Runner/evaluator focused tests passed and canonical record requires independently inspected sanitized evidence.
- [x] CHK022 Is it explicit that C03 B01 and B02 remain immutable failed historical evidence and cannot be rewritten, deleted, or relabelled as a pass? [Consistency, Evidence] — Focused historical B01/B02 byte-identity tests passed.
- [x] CHK023 Is it explicit that C02 has passed canonical live validation while C03 remains pending live validation and C04-C06 remain pending? [Completeness, T201] — Canonical T201 matrix document and T204 task record state this explicitly.
- [x] CHK024 Are success rules defined to permit a C03 status advance only after every mandatory gate and canonical evidence acceptance pass? [Measurability, T201] — Canonical record and runner tests require all mandatory gates plus sanitized evidence acceptance.
- [x] CHK025 Are failure rules defined to preserve the failed evidence, leave C03 and T201 incomplete, prohibit automatic retries, and keep T202, T203, T164, and T165 blocked? [Completeness, Dependency] — Canonical record and bounded authorization contract state these rules.

## Scope and Review Requirements

- [x] CHK026 Is the live-validation scope explicitly limited to the separately authorized C03 B03 attempt, excluding C04-C06 and any aggregation? [Scope] — Canonical record limits any future C03 action to a separately authorized attempt and keeps C04-C06 unexecuted.
- [x] CHK027 Are Campaign B one-run/one-request/zero-retry limits consistently required in the registry, runner contract, canonical evidence, and task-state record? [Consistency] — Focused authorization and image/preflight contract tests passed; all require `1/1/0`.
- [x] CHK028 Is the current offline correction (`def8f1d`) documented as separating language classification without weakening any real-fact threshold? [Traceability] — Canonical T201 matrix record documents the correction and unchanged thresholds.
- [x] CHK029 Are the authorized success and failure commit rules defined so no task, evidence, or production-adapter status is prematurely marked complete? [Acceptance Criteria] — Canonical T201 record keeps C03/T201 incomplete and T202, T203, T164, and T165 blocked pending independently accepted evidence.

## Notes

- This is a requirements-readiness checklist, not execution authorization.
- A separate explicit authorization is required before C03 B03 may be run.
- 2026-08-02 integrity reconciliation: CHK020 passed after the focused guard was updated to the committed T204 canonical-state reconciliation digest. All 29 readiness items pass; this does not authorize B03.
