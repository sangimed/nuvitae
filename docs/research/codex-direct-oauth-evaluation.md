# Direct Codex OAuth Evaluation (T202)

**Task**: T202 — measure the direct Codex OAuth semantic path for Nuvitae
Community.
**Date**: 2026-08-06 (T244 offline re-measurement from accepted live evidence)
**Status**: **MEASURED** — every metric supported by accepted, checked-in
evidence has been re-computed; metrics without supporting evidence are
explicitly recorded as unmeasured. The earlier 2026-08-05 BLOCKED record is
preserved below as historical context.

The onboarding row in this 2026-08-06 T202 measurement is a historical
snapshot. The current onboarding result is recorded separately in
`codex-direct-oauth-onboarding-feasibility.md` as
`FAIL_AUTOMATED_FEASIBILITY`; it is measured, not merely unmeasured. Current
T203 status is NO-GO with finalized T246 `FAILED` and complete T217 wiring.

## Scope

The direct Codex OAuth path under evaluation:

`Nuvitae worker -> ResumeSemanticParserProvider -> CodexDirectProviderAdapter ->
isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT
transport`

Supported (and only) deployment shape claimed by this spike: local Docker
Desktop / Docker Compose, browser on the same host, loopback OAuth callback,
single-user. No remote, VPS, or headless claim is made.

## Authoritative evidence inputs

- T201 aggregate matrix (consolidated, accepted):
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json`
  (`matrix_state: all_cases_live_passed`, `matrix_pass: true`).
- Campaign-B authorization registry (authoritative attempt selection):
  `spikes/codex-direct-oauth/campaign-b-authorizations.json`.
- Per-case sanitized live evidence, selected by the same rules as the T201
  consolidator (single passing attempt per case; C01 keeps its legacy canonical
  evidence):
  - C01: `codex-direct-oauth-t201-semantic-parsing.json`
  - C02: `codex-direct-oauth-t201-c02-b13-semantic-parsing.json`
  - C03: `codex-direct-oauth-t201-c03-b03-semantic-parsing.json`
  - C04: `codex-direct-oauth-t201-c04-b03-semantic-parsing.json`
  - C05: `codex-direct-oauth-t201-c05-b01-semantic-parsing.json`
  - C06: `codex-direct-oauth-t201-c06-b01-semantic-parsing.json`
- T199 credential lifecycle: `codex-direct-oauth-t199-live.json`.
- T200 minimal invocation: `codex-direct-oauth-t200-invocation.json`.
- T245 lifecycle aggregate (accepted 2026-08-07):
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`
  (9/9 mandatory criteria passing; 8 live-observed; 1 deterministic-only
  invalid-grant classification; provider-side revocation not exercised and not
  required).

## T245 completion (2026-08-07)

T245 (credential lifecycle proof in the supported local same-host Docker
deployment shape) was completed and accepted on 2026-08-07. The accepted
aggregate `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`
records fresh browser OAuth login, callback completion,
`connection_status_after_callback: connected`, encrypted persistence without
plaintext, restart recovery, successful invocation after restart (T200, exact
HTTP 200), live refresh with rotation, explicit reconnect after disconnect,
disconnect/credential removal, and deterministic invalid-grant recovery:
9/9 mandatory criteria passing, 8 live-observed and 1 deterministic-only
invalid-grant classification. Provider-side remote revocation was not
exercised and is not claimed; canonical T245 does not require it. T245 is
therefore no longer a pending dependency for the remaining unmeasured metrics;
T246 (real-document live semantic evaluation) and T213-T215 (Community
connection-UI qualification) remain the pending dependencies.

## T246 post-consolidation status (2026-08-07)

The canonical offline T246 aggregate is `FAILED` (qualification not passed)
because semantic quality has two terminal failures, while the non-semantic
recovery contract passes: C01 FAIL, C02 PASS, C03 PASS, C04 FAIL, C05 PASS,
C06 PASS, C07 PASS, and C08 PASS. Six cases pass, two fail, and one
harness-invalid attempt is retained (C01-A01). Semantic recall remains
recorded per canonical attempt; C04 is 18/24 exact and 13/19 high-priority,
C01-A02 is 23/24 exact and 17/18 high-priority, and accepted passing semantic
cases are 1.0/1.0. Aggregate unsupported facts and forbidden inferences are
both 0; grounding and no-invention remain passing; C07 prompt isolation
passes.

C08 is a malformed/unsupported recovery case, not a semantic provider sample.
Its sanitized evidence records malformed detection, safe category
`malformed_or_corrupted`, `invocation_attempted=false`, zero semantic backend
requests, zero credential recovery, zero broker runs, no draft/artifact, and a
passing secret scan. The all-case T246 qualification therefore remains failed
because C01/C04 semantic quality is not accepted; T203 remains NO-GO.

## Re-measurement method

T202 is re-measured by the deterministic offline evaluator
`spikes/codex-direct-oauth/lib/t202-evaluator.mjs` (CLI:
`spikes/codex-direct-oauth/re-evaluate-t202.mjs`). It consumes only sanitized
checked-in evidence, selects authoritative attempts per the Campaign-B
registry, fails closed on missing/malformed/conflicting/ambiguous evidence, and
writes the sanitized aggregate
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t202-metrics.json`.
Regression tests live in `spikes/codex-direct-oauth/test/t202-evaluator.test.mjs`.
No OAuth, Codex, Docker, or live request is made by the evaluator.

## Metric table (re-measured 2026-08-06)

All evidence-supported metrics pass. Metrics without accepted evidence are
listed in the next section as unmeasured; none is silently dropped.

| Metric                                                  |                                                            Numerator |                           Denominator | Value | Required threshold                                                                            | Result                         | Evidence source                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------: | ------------------------------------: | ----: | --------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Authentication success (browser OAuth login + callback) |                      2 (initial live OAuth + final reauthentication) |                                     2 |   1.0 | T203 gate: fresh live browser login with callback completion                                  | PASS                           | T199 live evidence                                                                             |
| Encrypted credential persistence                        |                                    1 (live encrypted record created) |                                     1 |   1.0 | T203 gate: live encrypted store, no plaintext                                                 | PASS                           | T199 live evidence + credential-lifecycle report                                               |
| Restart recovery                                        | 3 (restart recovery, disconnected restart, final encrypted recovery) |                                     3 |   1.0 | T203 gate: credential usable after container restart                                          | PASS                           | T199 live evidence                                                                             |
| Token refresh with rotation                             |                                    1 (refresh succeeded and rotated) |                                     1 |   1.0 | T203 gate: live refresh with rotation                                                         | PASS                           | T199 live evidence (`live_network_refresh_count=1` for two concurrent requests; single-flight) |
| Invocation success rate                                 |                                                 7 (T200: 1, T201: 6) |                                     7 |   1.0 | T203 gate: live invocation with HTTP 200 and valid SSE (no numeric rate threshold documented) | PASS                           | T200 + all six T201 per-case evidence                                                          |
| Protocol validity (valid SSE / typed event framing)     |                                                                    7 |                                     7 |   1.0 | T203 gate: valid SSE framing on every live invocation                                         | PASS                           | T200 + all six T201 per-case evidence                                                          |
| Schema-valid response rate                              |                                                                    6 |                                     6 |   1.0 | T201 mandatory: strict schema valid in every case (aggregate 1.0)                             | PASS                           | Matrix + per-case evidence                                                                     |
| Structured-output validity                              |                              6 (model output received and evaluated) |                                     6 |   1.0 | T201 mandatory: structured output evaluated for every case                                    | PASS                           | Per-case evidence                                                                              |
| Semantic parsing pass rate                              |                                                                    6 |                                     6 |   1.0 | T201 mandatory: `parsing_pass` per case; aggregate passes only when all six pass              | PASS                           | Matrix + per-case evidence                                                                     |
| Exact fact recall                                       |     92 (C03-C06, 23 each; C01/C02 recall 1.0 without exposed counts) |                                    92 |   1.0 | T201 mandatory: exact fact recall >= 0.9 per case                                             | PASS                           | Matrix + per-case evidence                                                                     |
| High-priority fact recall                               |     68 (C03-C06, 17 each; C01/C02 recall 1.0 without exposed counts) |                                    68 |   1.0 | T201 mandatory: high-priority fact recall = 1.0 per case                                      | PASS                           | Matrix + per-case evidence                                                                     |
| Work-experience grouping                                |                                 6 (section recall) / 6 (item recall) |                                     6 |   1.0 | T201 mandatory: expected section and item recall = 1.0 per case                               | PASS                           | Matrix + per-case evidence                                                                     |
| Valid-evidence rate                                     |                         6 (cases with zero missing/invalid evidence) |                                     6 |   1.0 | T201 mandatory: missing evidence count = 0 and invalid evidence count = 0 per case            | PASS                           | Matrix + per-case evidence (totals 0 / 0)                                                      |
| Invented-field rate                                     |                                                  0 unsupported facts |     92 countable returned values (v2) |   0.0 | T201 mandatory: unsupported fact count = 0 per case                                           | PASS                           | Matrix + per-case evidence                                                                     |
| Unsupported fact count                                  |                                                                    0 |                               6 cases |     0 | T201 mandatory: unsupported fact count = 0 per case                                           | PASS                           | Matrix + per-case evidence                                                                     |
| Unsupported-evidence count                              |                                                 0 missing references | 92 countable evidence references (v2) |   0.0 | T201 mandatory: zero evidence references missing from the source representation               | PASS                           | Matrix + per-case evidence                                                                     |
| Forbidden inference count                               |                                                                    0 |                               6 cases |     0 | T201 mandatory: forbidden inference count = 0 per case                                        | PASS                           | Matrix + per-case evidence                                                                     |
| Grounding success                                       |                                                                    6 |                                     6 |   1.0 | T201 mandatory: grounding pass per case                                                       | PASS                           | Matrix + per-case evidence                                                                     |
| No-invention success                                    |                                                                    6 |                                     6 |   1.0 | T201 mandatory: no-invention pass per case                                                    | PASS                           | Matrix + per-case evidence                                                                     |
| Provider transport-manifest match vs T200               |                                                                    6 |                                     6 |   1.0 | T201 evidence gate: T201 request shape matches the T200 audited transport                     | PASS (risk remains documented) | Per-case evidence (`t201_transport_mismatches` total 0)                                        |
| Deterministic completeness across the matrix            |                                                                    6 |                                     6 |   1.0 | T201 aggregate passes only when all six mandatory cases are present and pass                  | PASS                           | Matrix                                                                                         |

Supporting lifecycle facts:

- Secret scan passed on T199, T200, and every T201 per-case evidence
  (`secret_scan_result: passed`).
- No raw credentials or account identifiers were exposed to the parent in any
  accepted evidence (`raw_credentials_exposed_to_parent: false`,
  `account_identifier_exposed_to_parent: false`,
  `raw_credentials_exposed_to_host: false`).
- T200 completed with exact HTTP 200, valid SSE framing, 15 processed events,
  and the verified `NUVITAE_T200_OK` marker.
- All six T201 cases completed with exact HTTP 200 and `response_protocol_valid:
true`.

## Unmeasured metrics (recorded, not dropped)

| Metric                               | Why unmeasured                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Turn latency                         | No sanitized timing fields exist in the accepted live evidence; the 1.88 ms deterministic baseline is provider-neutral, not Codex.                                                                                                               |
| Cancellation latency                 | Cancellation was not exercised in any accepted live run.                                                                                                                                                                                         |
| Quota behavior                       | No quota/rate-limit exercise exists in accepted live evidence; only safe failure mapping is proven.                                                                                                                                              |
| Non-technical onboarding feasibility | Historical T202 snapshot: the separate real-flow feasibility record did not yet exist. Superseded by `codex-direct-oauth-onboarding-feasibility.md`, which records `FAIL_AUTOMATED_FEASIBILITY`; moderated human validation remains outstanding. |

## Historical failed attempts (preserved, excluded from authoritative denominators)

Per the repository's authoritative-case selection rules, only the single
passing attempt per matrix case counts in the metric denominators above. All
failed attempts remain immutable checked-in evidence and are reported
deterministically in the T202 aggregate (`historical_failed_attempts`, 21
on-disk failed evidence files). Notable categories:

- C02 attempts 1-6 and B01-B11: pre-live/infrastructure failures
  (`infrastructure_result_channel_failure`, `broker_crash`, `runner_failure`,
  `transport_failure`, `safe_unknown_failure`, and pre-live validation
  failures). The T201 matrix `attempt_history`/`campaigns` records remain the
  canonical historical classification for C02's A/B campaigns where per-attempt
  files were later replaced by runner output.
- C03-B01: semantic recall failure (exact-fact recall 0.875).
- C03-B02: failure under the former `document_language` contract
  (exact-fact recall 0.9583).
- C04-B01: 23/23 `evidence_coordinate_mismatch` failures under the original
  physical-coordinate contract (invalid evidence 23, unsupported facts 23);
  superseded by the corrected T208 deterministic-enrichment contract.
- C04-B02: `transport_failure` during credential recovery (invocation not
  attempted); superseded by C04-B03.

None of these failures is excluded from the metric table silently; they are
excluded from the authoritative numerators/denominators by the registry-based
selection rule, and each remains visible in the aggregate and evidence
directory.

## Historical context — 2026-08-05 BLOCKED record

**Status (2026-08-05)**: BLOCKED — the official T202 evaluation required a
complete T201 matrix (every mandatory live case executed and independently
evaluated). Live C04/C05/C06 execution could not be performed in that
qualification run because no valid ChatGPT/Codex session was available on the
host (Codex CLI not logged in; stored sessions expired or refresh-rejected with
401; no browser session; fresh browser login blocked by missing interactive
credentials and Cloudflare bot verification for headless browsers). The T203
gate decision was recorded as NO-GO (evidence-availability decision) in
`docs/research/codex-direct-oauth-go-no-go.md`, with defined re-evaluation
triggers. T202 was recorded as BLOCKED at that time.

The 2026-08-06 re-measurement supersedes that BLOCKED status because the
registered Campaign-B attempts were subsequently executed (T243), the six-case
T201 matrix was consolidated as all-passing, and T199/T200 live evidence is
accepted. The historical 2026-08-05 record remains valid as a statement of what
was known then and is not rewritten.

## Verdict

T202 is **MEASURED**. Every metric supported by accepted checked-in evidence
passes (see table above); four metrics remain explicitly unmeasured (latency,
cancellation, quota behavior, non-technical onboarding feasibility). T202
records measurements; it does not by itself authorize production adapter
implementation — that is the T203 decision gate, re-evaluated in
`docs/research/codex-direct-oauth-go-no-go.md`.
