# T201-C04 live-validation readiness

**Purpose**: Evidence-backed readiness gate for a separately authorized T201-C04 Campaign-B live validation. This checklist does not authorize or execute a broker run.

**Evaluated**: 2026-08-02
**Fixture SHA-256**: `d195a3f0c2597ba29ae1127a10d049f9a2a557de25e5c9cf5c5d91648c9464e3`
**Manifest SHA-256**: `1c7f21deb799fa278e324142054d882c3f8ff70a2f741e1fa91ba87851f61c43`

## Governance and status

- [passed] CHK001 C01-C03 status is current — canonical matrix records all three as passed canonical live validation.
- [passed] CHK002 T205-T207 are complete — commits `ef34b78`, `f44afdf`, and `e164756` are current history.
- [passed] CHK003 C04 remains unauthorized and unexecuted — canonical matrix says unexecuted; no registry entry exists.
- [passed] CHK004 C04 is absent from Campaign-B authorization registry — registry contains only C02/C03 attempts.
- [passed] CHK005 C04 has no existing evidence file — evidence-directory scan found no C04 entry.
- [passed] CHK006 C05-C06 remain untouched — canonical matrix records both as unexecuted.
- [passed] CHK007 T201 and downstream states are accurate — T201 incomplete; T202, T203, T164, and T165 blocked in canonical record.

## Fixture and manifest integrity

- [passed] CHK008 Fixture exists — `fixtures/t201-matrix/t201-c04.txt` was hashed successfully.
- [passed] CHK009 Manifest exists — `fixtures/t201-matrix/t201-c04.manifest.json` was hashed successfully.
- [passed] CHK010 Semantic-case identifier is T201-C04 — manifest `fixture_id` is exact.
- [passed] CHK011 Fixture and manifest hashes are current — pins above were recomputed from current bytes.
- [passed] CHK012 Manifest validates against current v2 schema — matrix/semantic suite passed.
- [passed] CHK013 Fixture-to-manifest binding is exact — deterministic matrix loader passed.
- [passed] CHK014 Expected fact count is 23 — manifest exact-fact list and C04 golden gate passed.
- [passed] CHK015 High-priority count is 17 — C04 golden gate passed.
- [passed] CHK016 Every expected fact has a valid v2 provenance category — v2 category-consistency test passed.
- [passed] CHK017 Every diagnostic has a valid category — ambiguity and absence schema/evaluator checks passed.
- [passed] CHK018 Category-to-path mappings are semantically valid — fail-closed matrix evaluator gate passed.
- [passed] CHK019 Declared absent paths match contract v2 — all five declared paths are explicit in manifest and validated by matrix tests.

## Output contract

- [passed] CHK020 Schema requires nullable optional fields — required arrays include all applicable nullable fields.
- [passed] CHK021 Omission fails — v2 absence test rejects omitted nullable fields.
- [passed] CHK022 Explicit null passes — v2 absence test accepts declared nulls.
- [passed] CHK023 Invented non-null values fail — phone and employer-location invention tests fail closed.
- [passed] CHK024 Absent collections require `[]` — strict schema/evaluator matrix coverage passed.
- [passed] CHK025 Null values require no value evidence — absent-null no-invention gate passed.
- [passed] CHK026 `document_language` uses its separate required gate — language-classification test passed.
- [passed] CHK027 `document_language` is excluded from real-fact recall — C03 fact-diagnostic projection test passed.
- [passed] CHK028 Output size limit remains enforced — excessive-output and 65,536-byte tests passed.
- [passed] CHK029 JSON schema remains strict — unknown top-level field, duplicate key, nesting, and malformed-output tests passed.

## Evidence and provenance

- [passed] CHK030 Flattened line/start/end validation passes — semantic evidence tests passed.
- [passed] CHK031 PDF physical provenance is preserved — PDF coordinate validation passed.
- [passed] CHK032 Coordinate-mapping version is explicit — C04 extraction metadata declares mapping version 1.
- [passed] CHK033 One-page/multi-item behavior is validated — coordinate-mapping test coverage passed.
- [passed] CHK034 Multi-page mapping is tested — coordinate-mapping test coverage passed.
- [passed] CHK035 Multi-column mapping is tested — coordinate-mapping test coverage passed.
- [passed] CHK036 Invalid physical references fail closed — PDF physical-coordinate rejection test passed.
- [passed] CHK037 Flattened/physical mismatches fail closed — mismatch rejection test passed.
- [passed] CHK038 Fragment hashes and bounds remain validated — source-local evidence validation passed.
- [passed] CHK039 Non-PDF compatibility remains valid — all six deterministic matrix cases passed.

## Semantic expectations

- [passed] CHK040 Deterministic C04 golden output passes — dedicated C04 golden test passed.
- [passed] CHK041 All 23 real facts match — C04 golden gate passed.
- [passed] CHK042 All 17 high-priority facts match — C04 golden gate passed.
- [passed] CHK043 Exact-fact recall meets threshold — manifest threshold 0.90 and golden gate passed.
- [passed] CHK044 High-priority recall meets threshold — manifest threshold 1.00 and golden gate passed.
- [passed] CHK045 Expected section counts pass — deterministic matrix evaluator passed.
- [passed] CHK046 Expected item counts pass — deterministic matrix evaluator passed.
- [passed] CHK047 Both work highlights pass — C04 golden gate passed.
- [passed] CHK048 Operational resilience produces ambiguity diagnostic — C04 golden/ambiguity gate passed.
- [passed] CHK049 Operational resilience is not an achievement — ambiguous-hard-fact rejection test passed.
- [passed] CHK050 Forbidden inferences remain absent — no-invention tests passed.
- [passed] CHK051 Declared absent values remain null — v2 absence test passed for all five paths.
- [passed] CHK052 Grounding passes — deterministic matrix evaluator passed.
- [passed] CHK053 No-invention passes — deterministic matrix evaluator passed.
- [passed] CHK054 Ambiguity handling passes — exact grounded ambiguity tests passed.
- [passed] CHK055 Absent-field handling passes — explicit-null and omission-rejection tests passed.
- [passed] CHK056 Language classification passes as English — language gate passed.

## Campaign-B execution controls

- [passed] CHK057 Dedicated authorization test image runs successfully — Docker image test: 10/10 passed.
- [passed] CHK058 Tracked canonical entrypoints use real `git ls-files --error-unmatch` — dedicated-image test passed.
- [passed] CHK059 Untracked entrypoints fail closed — real-Git rejection test passed.
- [passed] CHK060 Missing entrypoints fail closed — pre-Docker authorization rejection test passed.
- [passed] CHK061 Git absence fails explicitly and closed — unavailable-Git test passed.
- [passed] CHK062 Production/runtime images omit unnecessary Git — authorization-Git isolation and image-contract tests passed.
- [passed] CHK063 Immutable image identity contract passes — image-contract suite passed.
- [passed] CHK064 No runtime build path exists — preflight topology tests reject post-preflight build/pull/implicit build.
- [passed] CHK065 Credential-free preflight remains isolated — preflight/result-channel tests passed.
- [passed] CHK066 Live broker is bounded to one networked request — authorization contract requires maximum backend requests = 1.
- [passed] CHK067 Result reader remains network isolated — image-contract topology tests passed.
- [passed] CHK068 Maximum broker runs can be fixed at 1 — authorization contract tests passed.
- [passed] CHK069 Maximum backend requests can be fixed at 1 — authorization contract tests passed.
- [passed] CHK070 Automatic retries can be fixed at 0 — authorization contract tests passed.
- [passed] CHK071 Evidence-path uniqueness can be enforced — reused-evidence rejection test passed.
- [passed] CHK072 No C04 authorization currently exists — current registry scan passed.

## Credential and privacy controls

- [passed] CHK073 Encrypted credential recovery tests pass — credential-recovery diagnostic suite passed.
- [passed] CHK074 Generation tracking remains valid — credential diagnostic suite passed.
- [passed] CHK075 Refresh behavior remains bounded — credential/lifecycle diagnostic coverage passed.
- [passed] CHK076 Credentials and tokens cannot enter sanitized evidence — result/evidence privacy tests passed.
- [passed] CHK077 Raw provider response is not persisted — raw-response non-persistence test passed.
- [passed] CHK078 Raw model output is not persisted — matrix evidence privacy test passed.
- [passed] CHK079 Raw stderr is not exposed — result-channel framing/diagnostic tests passed.
- [passed] CHK080 Safe diagnostics remain sufficient for failure analysis — broker failure-envelope and result-channel tests passed.
- [passed] CHK081 Secret scan passes — `secret-scan.mjs` reported `secret_scan_result=passed`.

## Success and failure handling

- [passed] CHK082 Successful C04 evidence acceptance rules are defined — runner acceptance gate requires qualifying sanitized evidence.
- [passed] CHK083 Failure evidence policy is defined — atomic sanitized failure-evidence tests passed.
- [passed] CHK084 A failed run cannot trigger automatic retry — authorization contract rejects nonzero retries.
- [passed] CHK085 A failed run cannot automatically authorize a later attempt — registry-backed exact-attempt validation passed.
- [passed] CHK086 C04 cannot be marked passed without canonical live evidence — canonical status record and runner evidence rules require it.
- [passed] CHK087 T201 cannot be completed by C04 alone — canonical matrix requires every mandatory case.
- [passed] CHK088 C05-C06 remain pending after C04 success — canonical execution boundary specifies separate C05 and C06 steps.

## Decision

**A. Ready for separate authorization.** C04 may proceed to a separate registry-backed authorization task. This checklist creates neither authorization nor live evidence and does not execute C04.

## Validation record

- `git diff --check` — passed.
- `node --test` focused output-schema, manifest-schema, C04 semantic/matrix, category, coordinate, historical-evidence, image, credential, result-channel, preflight, and failure-envelope suites — 115 passed, 0 failed, 1 intentionally skipped.
- `docker build --pull=false -f docker/test/t201-authorization.Dockerfile -t nuvitae-t201-authorization-check:local .` — passed.
- Dedicated image `docker run ... nuvitae-t201-authorization-check:local` — 10 passed, 0 failed.
- `node spikes/codex-direct-oauth/secret-scan.mjs` — passed.
- Focused ESLint — passed.
- Focused Prettier — passed.
