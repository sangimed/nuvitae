# Direct Codex OAuth GO / CONDITIONAL GO / NO-GO Decision (T203)

**Task**: T203 — record the explicit direct-OAuth decision for the Codex
production adapter path.
**Latest re-evaluation**: 2026-08-07 (after the accepted T245 lifecycle proof) — decision remains **NO-GO** for
production adapter implementation at this time.
**Original decision**: 2026-08-05 — **NO-GO** (evidence-availability; preserved
as a historical record below).

## 0. Current decision (2026-08-07 re-evaluation)

The direct Codex OAuth and invocation path is **not cleared** as the production
primary AI path for Nuvitae Community on the currently accepted evidence. The
2026-08-07 re-evaluation applies the same documented decision rules to the now
accepted live evidence (T199 credential lifecycle, T200 minimal invocation, the
completed T201 six-case matrix with `matrix_state: all_cases_live_passed`, and
the accepted T245 lifecycle aggregate).

This NO-GO is **not** an evidence-availability decision about the T201 matrix:
C01-C06 are executed and passing, and every T202 metric supported by the
accepted evidence passes. The decision remains NO-GO because two mandatory
gates are still not satisfied and the decisive product question is still
unanswered:

1. **Semantic quality over real PDF/DOCX through live Codex** — NOT ACCEPTED.
   All six T201 cases used synthetic fixtures (`fixture_classified_as_synthetic:
   true`). T246-C01-A01 was executed once on 2026-08-07: the backend invocation
   succeeded (HTTP 200) and every mandatory semantic metric passed, but the
   runner failed during post-processing/finalization (implementation defects),
   so T246 remains INCOMPLETE and no T246 evidence is accepted.
2. **Bounded fallback** — PARTIAL. The fallback contract passes deterministic
   tests, but the production worker/UI wiring (T217) is still pending.
3. **Non-technical onboarding feasibility** — unmeasured (requires the real
   import flow in the supported deployment shape; T213-T215 are unblocked by
   the accepted T245 proof but remain incomplete, and onboarding validation is
   still pending).

GO requires every mandatory gate to pass. The framework permits GO or
CONDITIONAL GO only when all of the re-evaluation conditions below are true;
the decisive product question (real-document live Codex semantic quality) is
not satisfied. The decision therefore follows the repository thresholds and
remains **NO-GO**, not a judgment about Codex output quality.

### Criteria table (re-evaluated 2026-08-07 after T245)

| Mandatory gate | Required evidence | Current state | Result |
| --- | --- | --- | --- |
| Direct OAuth login (fresh) | Live browser login + callback completion | T199 live proof: initial live OAuth succeeded and final reauthentication succeeded; T245 accepted 2026-08-07 (`callback_completion: completed`, `connection_status_after_callback: connected`) | PASS |
| Encrypted credential persistence | Live encrypted store, no plaintext | T199: `real_encrypted_record_created: true`; lifecycle report: serialized contents contain no plaintext; confirmed by the accepted T245 aggregate | PASS |
| Restart recovery | Credential usable after container restart | T199: `real_restart_recovery_succeeded`, `real_disconnected_restart_succeeded`, `final_real_encrypted_recovery_succeeded`; confirmed by the accepted T245 aggregate | PASS |
| Token refresh | Live refresh with rotation | T199: refresh succeeded, token rotated, `live_network_refresh_count=1` for two concurrent requests (single-flight); confirmed by the accepted T245 aggregate | PASS |
| Live invocation after restart | HTTP 200 + valid SSE with authenticated session | T200: HTTP 200, valid SSE, `NUVITAE_T200_OK` verified; all six T201 cases HTTP 200 + valid protocol | PASS |
| T245 lifecycle proof | Live lifecycle aggregate in the supported deployment shape | Accepted 2026-08-07: `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`; 9/9 mandatory criteria passing (8 live-observed, 1 deterministic-only invalid-grant classification); provider-side revocation not exercised and not required | PASS |
| T201 mandatory live cases | C01-C06 all executed and independently passing | Matrix `all_cases_live_passed`; C01-C06 pass | PASS |
| Semantic quality (real PDF/DOCX) | Real documents through live Codex | T246-C01-A01 executed once (2026-08-07): invocation HTTP 200, semantic metrics all passed, runner finalization failed; T246 incomplete/not accepted; C02-C08 NOT_AUTHORIZED | NOT ACCEPTED |
| Prompt-injection resistance | Deterministic security tests | 92 security/evaluation tests pass | PASS (deterministic) |
| Bounded fallback | No-provider/failure → bounded outcome | Fallback contract tests pass; production wiring (T217) still pending | PASS (contract) / PARTIAL (wiring) |
| Credential security / no token leakage | Secret scan, token-blind evidence | `secret_scan_result=passed` on T199/T200/all T201 evidence; no raw credential or account identifier exposure | PASS |
| Provider-neutral architecture | Import domain depends only on `ResumeSemanticParserProvider` | 1064 default-suite tests pass incl. worker orchestration through the provider boundary | PASS |
| Factual preservation / no-invention | Evidence rules enforced | All six live cases: `no_invention_pass: true`, unsupported facts 0, forbidden inferences 0 | PASS |

### Evidence for the re-evaluation

- T201 aggregate: `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json`
  (`matrix_state: all_cases_live_passed`).
- T202 re-measured metrics:
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t202-metrics.json` and
  `docs/research/codex-direct-oauth-evaluation.md`.
- T245 lifecycle aggregate (accepted 2026-08-07):
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`.
- Per-case sanitized evidence (C01 legacy, C02-B13, C03-B03, C04-B03, C05-B01,
  C06-B01) under `spikes/codex-direct-oauth/evidence/`; T199 `codex-direct-oauth-t199-live.json`;
  T200 `codex-direct-oauth-t200-invocation.json`.
- Deterministic suites: 200 spike tests, 1064 default tests, 47 persistence
  tests, 157 focused fallback/recovery/privacy tests, 92 semantic/security
  tests, 4 real-document extraction checks — all passing (unchanged).

### Downstream consequences (current)

- **T164, T165** (production Codex adapter + response converter): remain
  **blocked**. They must NOT be implemented on the basis of this NO-GO.
- **T201**: complete (six-case matrix all passing).
- **T202**: measured (all evidence-supported metrics pass; four metrics
  unmeasured).
- **T243**: executed the registered Campaign-B attempts; C04-B02 failed
  immutably at credential recovery, C04-B03/C05-B01/C06-B01 passed.
- **T216** (production Codex wiring): must not start; its dependency on a
  qualifying T203 outcome is unsatisfied.
- **T217** (bounded fallback wiring): independent of the Codex decision and
  remains pending.
- **T212-T215** (Community setup/connection UI): remain incomplete; T213-T215
  are now unblocked by the accepted T245 lifecycle proof (2026-08-07).
- **T245**: complete (accepted 2026-08-07; aggregate
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`).
  **T246**: the next remaining live gate (live Codex semantic evaluation over
  the real-document corpus). T246-C01-A01 was executed once (2026-08-07): the
  backend invocation and every semantic metric passed, but the runner failed
  during finalization (implementation defect) and A01 is CONSUMED; T246 stays
  INCOMPLETE and C02-C08 remain NOT_AUTHORIZED. **T248**: complete (2026-08-07; deterministic
  offline proof and sanitized aggregate
  `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t248-french-pdf.json`
  for the canonical French PDF fixture); the real-French-PDF prerequisite for
  T246 is satisfied.

### Remaining re-evaluation triggers (current)

T203 may be revisited as GO or CONDITIONAL GO only when **all** of the
following are true:

1. **SATISFIED (2026-08-07)** — T245 completed the fresh browser OAuth login,
   callback completion, connection status, encrypted persistence, restart,
   post-restart invocation, refresh rotation, expired/revoked recovery,
   reconnect, and disconnect/credential-removal proof in the supported local
   same-host Docker deployment shape; the accepted aggregate is
   `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`
   (9/9 mandatory criteria passing). Caveat: invalid-grant recovery is
   deterministic-only (1 of 9 criteria), provider-side remote revocation was
   not exercised, and provider-side revocation is not required by canonical
   T245; it is not claimed as a live result. And
2. T246 executes live Codex semantic evaluation over the real-document corpus
   (real French PDF, English PDF, DOCX, bilingual, partial/sparse, structurally
   ambiguous, prompt-instruction-like, and malformed/unsupported recovery)
   under the T208 enrichment contract; T246 is the next remaining live gate,
   whose prerequisites T248 (real French PDF proof) and T247 (T208 bookkeeping
   closure) are satisfied. T246-C01-A01 was executed once on 2026-08-07 and is
   CONSUMED (invocation and semantic metrics passed; runner finalization
   failed), C02-C08 remain NOT_AUTHORIZED, and the corpus remains not accepted;
   and
3. T202 metrics are re-measured from those live runs, including schema-valid
   rate, precision, recall, grouping, evidence validity, invention rate,
   latency, cancellation, quota behavior, refresh rotation, restart recovery,
   and non-technical onboarding feasibility; and
4. The decisive product question is answered positively: a non-technical user
   can import a typical PDF/DOCX and receive a review-useful draft without
   dangerous hallucinations or excessive manual reconstruction; and
5. Bounded-fallback production wiring (T217) is complete.

Until those conditions produce qualifying evidence, the Community MVP must not
treat the direct Codex path as production-qualified.

---

## Historical record (2026-08-05)

The sections below record the original 2026-08-05 decision and remain valid as
a statement of what was known on that date. They are preserved unchanged;
current status is governed by section 0 above.

## 1. Decision summary

The direct Codex OAuth and invocation path is **not cleared** as the production
primary AI path for Nuvitae Community on the evidence available from this
qualification run. The mandatory live semantic qualification cases required by
T201 (C04 PDF, C05 multi-column PDF, C06 DOCX) could not be executed because no
valid ChatGPT/Codex session was available on the test host, and a fresh browser
OAuth login could not be completed in this environment.

This NO-GO is an evidence-availability decision, not a blanket rejection of
Codex. It is explicitly scoped to the state of this qualification run and the
currently supported local same-host deployment shape. Re-evaluation triggers
are defined below; the path is not permanently closed.

## 2. Scope of this decision

- Tested deployment shape: local Docker Desktop / Docker Compose on a WSL2
  host, browser on the same host, loopback OAuth callback (`localhost:1455`),
  single-user, disposable spike broker.
- NOT covered by this decision: hosted/managed AI, remote servers, VPS,
  headless deployments, multi-user, production adapter code (T164/T165), the
  provider-neutral import pipeline (which remains valid and tested), or the
  historical app-server candidate (T189-T195, already NO-GO for that candidate).
- The Community product decision (direct Codex OAuth as MVP primary path)
  remains the approved direction; this engineering gate does not authorize the
  production adapter until re-evaluation produces qualifying live evidence.

## 3. Criteria table

| Mandatory gate | Required evidence | State | Result |
| --- | --- | --- | --- |
| Direct OAuth login (fresh) | Live browser login + callback completion | Attempted; blocked (no interactive credentials; Cloudflare 403 for headless; `callback_timeout`) | FAIL / NOT RUN |
| Encrypted credential persistence | Live encrypted store, no plaintext | Proven (bootstrap envelope, `encrypted_record_contains_plaintext: false`) | PASS |
| Restart recovery | Credential usable after container restart | Proven (`real_restart_recovery_succeeded: true`) | PASS |
| Token refresh | Live refresh with rotation | Attempted; stored session rejected (`authentication_required`, 401). Successful rotation not observed this run | FAIL (session) / NOT RUN (rotation) |
| Live invocation after restart | HTTP 200 + valid SSE with authenticated session | Prior T200 live proof exists (2026-07-31); not reproducible this run (no valid session) | NOT RUN this run |
| T201 mandatory live cases | C01-C06 all executed and independently passing | C01-C03 passed prior canonical live runs; C04 B01 failed (immutable, original contract); C04 B02/B03, C05, C06 NOT RUN | FAIL (incomplete) |
| Semantic quality (real PDF/DOCX) | Real documents through live Codex | Not executed; deterministic extraction proven, corrected contract passes offline | NOT RUN |
| Prompt-injection resistance | Deterministic security tests | 92 security/evaluation tests pass (prompt injection, privacy, worker, fixtures) | PASS (deterministic) |
| Bounded fallback | No-provider/failure → bounded outcome | 157 fallback/recovery/privacy tests pass; worker wiring (T217) still pending | PASS (contract) / PARTIAL (wiring) |
| Credential security / no token leakage | Secret scan, token-blind evidence | `secret_scan_result=passed`; no raw token in evidence; broker token-blind | PASS |
| Provider-neutral architecture | Import domain depends only on `ResumeSemanticParserProvider` | 1064 default-suite tests pass incl. worker orchestration through the provider boundary | PASS |
| Factual preservation / no-invention | Evidence rules enforced | Prior live C01-C03 and C04 B01 no-invention passed; corrected contract preserves evidence rules | PASS (measured subset) |

## 4. Evidence

- This run: `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t203-qualification-run-2026-08-05.json`
  (sanitized), `spikes/codex-direct-oauth/evidence/codex-direct-oauth-preflight.json`
  (loopback topology success), `spikes/codex-direct-oauth/evidence/` historical
  C01-C04 files (immutable), `docs/research/codex-direct-oauth-evaluation.md`
  (T202), `docs/research/codex-direct-semantic-parsing.md` (canonical status).
- Deterministic suites: 200 spike tests, 1064 default tests, 47 persistence
  tests, 157 focused fallback/recovery/privacy tests, 92 semantic/security
  tests, 4 real-document extraction checks — all passing.
- Versions: Codex CLI 0.146.0, Docker 29.6.2 (Docker Desktop), Node 24.x;
  upstream pinned revisions per T196 (OpenClaw/Hermes/official Codex).

## 5. Limitations and residual risks

- **No live semantic evidence for PDF/DOCX (C04-C06)** in this run: the
  decisive product question — can a non-technical user import a typical PDF or
  DOCX and receive a useful, hallucination-safe draft — remains unanswered.
- **Fresh OAuth lifecycle unproven in this environment**: login, callback
  completion, connection status, and post-restart invocation were not
  demonstrated with a live session here.
- **Undocumented backend risk**: the direct Codex ChatGPT transport
  (`chatgpt.com/backend-api/codex/responses`) is not an officially documented,
  stable third-party API (T196 upstream audit; corroborated only by OpenClaw /
  Hermes implementations).
- **Credential lifecycle state dependency**: the only stored session on the
  host was dead (expired access, rejected refresh), which is itself a real
  recovery-state observation: the bounded broker maps it to a safe
  `authentication_required` category and the UI path must route to reconnect.
- **Operational burden**: same-host browser login and loopback callback remain
  required; remote/VPS/headless is out of scope for the declared Community
  deployment shape.
- **T208 task box untouched**: the deterministic-enrichment contract was
  implemented as the T201 blocker resolution; T208's own task checkbox is left
  unchanged per mission scope rules.

## 6. Exact downstream task consequences

- **T164, T165** (production Codex adapter + response converter): remain
  **blocked**. They must NOT be implemented on the basis of this NO-GO.
- **T201**: remains **incomplete** (C04-C06 not executed).
- **T202**: remains **blocked** (evaluation cannot pass without T201).
- **T171, T174**: remain blocked pending production semantic integration.
- **T216** (production Codex wiring): must not start; its dependency on
  qualifying T203 conditions is unsatisfied.
- **T217** (bounded fallback wiring): independent of the Codex decision and
  remains pending as documented; fallback contract is complete and tested.
- **T212-T215, T218**: Community setup/connection UI tasks remain pending but
  are not blocked by this decision except where they depend on a live provider
  connection (T213-T215 require the OAuth path to be qualified).
- No completed task box is reopened or rewritten; C04 B01 and all historical
  evidence remain immutable.

## 7. Re-evaluation triggers

This NO-GO may be re-evaluated when **all** of the following are true:

1. A fresh, valid ChatGPT/Codex session is available (interactive browser
   login completed on the same host, or an equivalent valid session), and
2. The registered Campaign-B attempts are executed and independently
   evaluated: C04-B02 (reproduction under the original contract), C04-B03
   (corrected deterministic-enrichment contract), C05-B01, C06-B01; and
3. T202 metrics are re-measured from those live runs, including schema-valid
   rate, precision, recall, grouping, evidence validity, invention rate,
   latency, cancellation, quota behavior, refresh rotation, and restart
   recovery; and
4. The decisive product question is answered positively: a non-technical user
   can import a typical PDF/DOCX and receive a review-useful draft without
   dangerous hallucinations or excessive manual reconstruction.

If those conditions produce qualifying evidence, T203 may be revisited as GO or
CONDITIONAL GO with an explicit supported deployment scope. Until then, the
Community MVP must not treat the direct Codex path as production-qualified.
