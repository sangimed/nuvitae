# Direct Codex OAuth Evaluation (T202)

**Task**: T202 — measure the direct Codex OAuth semantic path for Nuvitae
Community.
**Date**: 2026-08-05
**Status**: BLOCKED — the official T202 evaluation requires a complete T201
matrix (every mandatory live case executed and independently evaluated). Live
C04/C05/C06 execution could not be performed in this qualification run because
no valid ChatGPT/Codex session was available on the host. This document records
every metric that was measured, every metric that remains unmeasured, and the
exact blocker, so the evaluation can resume without redoing completed work.

## Scope

The direct Codex OAuth path under evaluation:

`Nuvitae worker -> ResumeSemanticParserProvider -> CodexDirectProviderAdapter ->
isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT
transport`

Supported (and only) deployment shape claimed by this spike: local Docker
Desktop / Docker Compose, browser on the same host, loopback OAuth callback,
single-user. No remote, VPS, or headless claim is made.

## Metric table

| Metric | Status | Value / evidence |
| --- | --- | --- |
| Authentication success (browser OAuth login) | NOT RUN this run; prior live proof exists | Fresh login blocked in this environment: no interactive ChatGPT credentials, no browser session on host, headless browser blocked by Cloudflare (HTTP 403), broker produced a valid authorization URL and verified callback topology (preflight HTTP 204), then timed out (`callback_timeout`). Historical T198 evidence (2026-07-31) recorded a successful live browser OAuth login on the prior spike host. |
| Schema-valid rate | PARTIAL | Deterministic offline: 6/6 T201 golden outputs schema-valid under the corrected v2 contract. Live: measured for C01-C03 (all schema-valid) and C04 B01 (schema-valid) in prior canonical runs. C04-C06 live not re-executed. |
| Precision / exact-fact recall | PARTIAL | Live canonical evidence: C01/C02/C03 exact-fact recall 1.0; C04 B01 exact-fact recall 1.0 (23/23) with 17/17 high-priority. C05/C06 not run live. |
| Work-experience grouping | PARTIAL | Expected section/item recall passed in prior live C01-C03 and C04 B01 (1.0). C05 multi-column regrouping not run live. |
| Evidence validity | PARTIAL | C01-C03 valid evidence; C04 B01 failed 23/23 `evidence_coordinate_mismatch` under the original physical-coordinate contract — corrected by the T208 deterministic-enrichment contract (model output flattened-only; physical provenance derived deterministically). Under the corrected contract the deterministic offline matrix passes 6/6 with enrichment mapped 25/25 evidence entries for C04/C05 and 25/25 for C06. |
| Invention rate | PARTIAL | No-invention passed in all prior live canonical cases and all deterministic matrix cases. C05/C06 live not run. |
| Latency | PARTIAL | Prior live runs recorded bounded event streams; deterministic baseline latency recorded by the provider-neutral evaluation suite (mean 1.88ms for the deterministic test provider — baseline only, not Codex). Codex live latency for C04-C06 not measured this run. |
| Cancellation | NOT RUN | Not exercised this run; harness supports bounded cancellation limits. |
| Quota behavior | NOT RUN | Not exercised (no valid session). |
| Refresh | FAILED (safe) | Live refresh attempted against the stored session: rejected with `authentication_required` (401) — the stored refresh token is invalid/expired. Safe failure mapping proven. Successful refresh rotation not observed this run (prior T199 evidence recorded successful refresh). |
| Restart recovery | PASS (local) | Encrypted credential envelope survives container restart (`real_restart_recovery_succeeded: true`); disconnected restart after logout (`real_disconnected_restart_succeeded: true`). |
| Provider/backend compatibility risk | DOCUMENTED | Transport manifest matched T200 audited shape (host/path/headers) in prior live runs; direct Codex transport remains an undocumented-backend risk (see upstream audit T196 and T203 limitations). |
| Operational burden | PARTIAL | Loopback callback requires a same-host browser and per-user OAuth; this host proved the callback topology works but fresh login requires interactive credentials. |
| Non-technical onboarding feasibility | NOT MEASURED | Requires the browser OAuth flow to complete for a non-technical user; cannot be measured without a valid session. |

## Measured deterministic evidence (this run)

- T201 fixture matrix, corrected v2 contract with deterministic provenance
  enrichment: all six cases pass offline (`parsing_pass: true`); enrichment
  applicable as `pdf` (C04/C05), `docx` (C06), `none` (C01-C03), with
  `consistency_pass: true` for all cases.
- 200/201 spike tests pass (1 intentional skip); 1064 default-suite tests pass;
  47 persistence integration tests pass; typecheck, build, format, changed-file
  lint pass.
- Real-document deterministic extraction proven for a French PDF, English PDF,
  and DOCX through the repository's pdf.js / OOXML adapters.

## Remaining unmeasured metrics (blocked)

All Codex-specific live metrics for C04 (PDF single-column), C05 (PDF
multi-column), and C06 (DOCX structural artifacts): schema-valid rate, precision,
recall, grouping, evidence validity, invention rate, latency, cancellation,
quota behavior, refresh rotation, restart+invocation, and the resulting
product-level usability judgment.

## Blocker

No valid ChatGPT/Codex session existed on this host during the qualification
run:

- Codex CLI (`0.146.0`) not logged in; no `auth.json`.
- Hermes Agent session expired 2026-05-05; refresh rejected (401).
- OpenCode OpenAI session refresh already-consumed (401).
- No OpenAI/ChatGPT cookies in any host browser profile (Edge, Firefox).
- Fresh browser login requires interactive ChatGPT credentials and is blocked
  for headless automation by Cloudflare bot verification.

The bounded path to unblock is: a fresh valid ChatGPT session (interactive
browser login), then run the registered Campaign-B attempts
(C04-B02 reproduction under the original contract, C04-B03 under the corrected
contract, C05-B01, C06-B01), then re-run this evaluation.

## Verdict

**BLOCKED** — T202 cannot pass because its mandatory live semantic measurements
could not be produced. This is a failure of evidence availability in this
environment, not a pass/fail judgment about Codex output quality.
