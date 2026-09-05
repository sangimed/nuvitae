# Community alpha release-readiness gate

This is the execution record and reproducible checklist for issue #61. It is a
final integration gate, not a substitute for completing its dependencies. A
passing subset must never be reported as **READY**.

## Final execution record — 5 September 2026

**Verdict: NOT READY.** The integrated implementation is materially more
complete, but the required Docker-first and bounded real-provider evidence was
not demonstrated. This decision is based on executed evidence, not on whether
the implementation appears likely to work.

The validated integration candidate was
`0f4b302c4ce7014edab6c70f5df9da2256cb02f0`; the following documentation-only
issue #61 result commit records the outcome.

### Integrated commits

| Scope | Parent/source equivalent | Local integrated commit |
| --- | --- | --- |
| Issue #61 prep | `add1cec` | `97979cdc0f7ae378cd2b55854a187fc40cee2c72` |
| Issue #40 implementation | `1b08741` | `7ccba103de94858582153f480673c6c6cb30c18a` |
| Issue #40 security decision | `dd042f1` | `94080241d7eb5fabca384d24a20d6f8c0b24608f` |
| Issue #76 | `1cb932a` | `f594845de508d96102ff64272d082ca26b0d7a6c` |
| Issue #75 | `7ca8c45` | `fc756469885425f1d5f9578434eb6186463445e9` |
| Issue #58 | `0ff7b33` | `03893921d363074abe1a104f2804df8219c83c21` |
| Issue #60 | `1434c09` | `6db6168400d309f33c0d791d9c2787ede8e61f7c` |
| Issue #61 combined runner | issue-owned | `0f4b302c4ce7014edab6c70f5df9da2256cb02f0` |

The #76 security-document conflict retained #40's upload status as satisfied
for Community and partial for hosted deployment, then added #76's browser
policy, API/page no-store, narrowly scoped logout cache clearing, HSTS ownership,
and production OpenAPI suppression. The #75 conflict retained that #76 V14.3
statement, added #75's V15 automation, and records production Swagger as
disabled. Issue #60 was applied after and against #58 as required.

### Evidence

| Gate | Result | Exact evidence |
| --- | --- | --- |
| Patch integration | PASS | Five supplied patch files applied in the required order; only the documented #76/#75 security-document overlaps needed semantic resolution. |
| Combined source hygiene | PASS | `git diff --check 4e258cb727fd71caa2dd54141c6f082163deadee` exited 0. |
| Shell syntax | PASS | `bash -n`/`sh -n` passed for all 7 repository shell scripts. |
| Documentation links | PASS | All relative Markdown links resolved across README and 59 files under `docs/`. |
| Security-baseline merge | PASS | Static assertions found #40's two Community/hosted rows, #76's satisfied V14.3 row, and #75's Trivy/V15 row with production Swagger disabled; stale contradictory phrases were absent. |
| #40 source-orb checks | PASS (limited) | Static/diff checks passed; Docker-backed hostile parser/upload checks were not executed because Compose was unavailable. |
| #76 source-orb checks | BLOCKED | Static checks passed, but required built-container/browser checks and the report-only CSP trial did not execute. |
| #75 source-orb checks | PASS (limited) | Actionlint, Gitleaks history/control-marker, Trivy config scan of 5 Dockerfiles, and diff/patch scans passed. Image build/scan and hosted workflows did not execute. |
| #58 source-orb checks | PASS (limited) | Web typecheck, targeted ESLint, and 22 focused Vitest tests passed. Desktop/mobile rendered verification did not execute because the Docker daemon failed. |
| #60 source-orb checks | PASS (limited) | Link, anchor, label-source, and diff checks passed; runtime Docker verification did not execute. |
| Combined Docker gate | BLOCKED | The single attempt of `scripts/community-alpha-deterministic-gate.sh` exited 1 immediately with `Docker Compose is required.` The Compose plugin is unavailable and daemon access is denied in this orb. No phase was retried. |
| Clean Community installation | NOT RUN | No Docker runtime was available, so first boot, migrations, service health, network exposure, and restart persistence were not demonstrated. |
| Normal owner access/session | NOT RUN | Signed-out behavior, sign-in, refresh persistence, cookie policy, logout revocation, and no-store behavior were not exercised against a running Community stack. |
| Codex connection/recovery | NOT RUN | No device authorization occurred and no real connection survived refresh/restart in this candidate. |
| Bounded real install-to-PDF journey | NOT RUN | No real resume/provider invocation occurred. Review, editor/live preview, one contextual proposal, PDF, save/reopen, and source deletion were therefore not demonstrated end to end. |
| Current-candidate deterministic journey | BLOCKED | The runner includes deterministic PDF/DOCX import-to-PDF/reopen, mocked Codex recovery UI, enforced/report-only response policy, parser isolation, persistence and security suites, but Docker prevented their execution on the combined candidate. |
| Privacy budget | PASS | No resume content, token, device code, prompt, provider response, or provider secret was used or recorded; real-provider invocation count was zero. |

PyYAML was unavailable, so an extra host YAML parse was `NOT RUN`. Actionlint,
Gitleaks, and Trivy were also unavailable in this orb; only the explicitly
reported source-orb results above are carried forward. Host pnpm commands were
not substituted for the repository-required Docker workflow.

### Release blockers

1. **Combined runtime evidence is absent.** A Docker-capable environment must run
   the complete deterministic gate successfully, including persistence,
   hostile-upload/parser, authorization/privacy, #58 browser journeys, #76 CSP
   report-only and enforcement modes, PDF fidelity, and image/dependency checks.
2. **The required clean Community journey is absent.** A fresh isolated Compose
   project must prove normal first access/session, one bounded Codex connection
   and recovery, one approved real import, review/confirmation, editor/preview,
   one contextual proposal review, PDF export, save/reopen, and source deletion.
   The fixed budget remains one authorization, one import/semantic attempt, and
   one proposal; a failure is recorded without retry.
3. **Issue #75 owner-managed controls are unverified.** The repository owner must
   verify or enable read-only Actions defaults, required quality/security checks
   and CODEOWNERS review, CodeQL blocking policy, dependency/native secret
   controls (without duplicate fallbacks), and a monitored private
   vulnerability-reporting route. The first hosted CodeQL/Trivy image runs and
   triage must also be observed rather than inferred from workflow files.
4. **Rendered UX and response-policy evidence is absent.** The #58 desktop/mobile
   critical states and #76 built-image CSP/font/print/cache behavior have source
   tests but no successful rendered run from either the source or integration
   orb.

### Known limitations

- Community remains loopback-only HTTP. HSTS and a supported reverse-proxy/TLS
  topology are intentionally hosted concerns, not Community blockers.
- Malware scanning and a separately deployed no-secret/no-network parser are
  documented hosted requirements; Community uses the bounded isolated parser
  subprocess and local scanner decision documented by #40.
- There is no image publication workflow, so release SBOM and keyless
  provenance remain deferred until real release artifacts exist.
- The repository's older Local Play capability list is not release evidence;
  only successful current-candidate commands may close the blockers above.

## Evidence rules

- Run from a clean checkout of the exact candidate commit using the repository's
  Docker Compose workflow. Record the candidate SHA, UTC timestamp, Docker and
  Compose versions, and the integrated dependency SHAs.
- Use only `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN` for each row. A blocker stays
  visible; do not convert it to a limitation to obtain a positive decision.
- Store only commands, exit statuses, bounded reason codes, aggregate counts,
  and assertions. Never record the owner access secret, session cookie, device
  code, provider tokens, prompts/responses, source text, structured resume
  contents, private storage references, or screenshots/traces containing them.
- Use versioned synthetic fixtures for deterministic tests. A real-provider run
  is a separate, deliberate phase with the fixed budget below. Never retry a
  provider action until it succeeds.
- Inspect only bounded, redacted logs. If safe evidence cannot establish an
  assertion, mark it `BLOCKED`; do not capture private data to make the evidence
  stronger.

## Candidate and prerequisites

Record these before starting. For every dependency, record the integrated commit
SHA and the issue acceptance evidence supplied by its owner. An open issue or
overlapping implementation on `main` is not completion evidence.

| Input | Required evidence | Baseline audit on 2026-09-05 |
| --- | --- | --- |
| Candidate | exact SHA; clean `git status --short` | starting `main`: `4e258cb727fd71caa2dd54141c6f082163deadee` |
| #58 onboarding/journey states | integrated SHA; desktop/mobile and accessibility evidence for critical states | integrated; source checks limited and combined runtime blocked |
| #40 hostile-upload boundary | integrated SHA; deterministic hostile corpus, resource/isolation and prompt-injection evidence; documented scanner/CDR decisions | integrated; decisions/static checks present and combined runtime blocked |
| #75 supply-chain verification | integrated SHA; quality coordination, blocking security checks and private intake evidence applicable to Community distribution | integrated; source scanner evidence limited and owner gates remain |
| #76 browser response policy | integrated SHA; built-container policy checks for public, authenticated, error, static and API responses | integrated; built-container/report-only execution blocked |
| #60 Community user guide | integrated SHA; guidance verified against the shipped journey and privacy behavior | integrated; static checks passed and runtime blocked |

Also record the already-required issue #61 foundations: #54 (deterministic
import-to-PDF fidelity), #55 (save/reopen), #56 (reviewable contextual AI), and
#57 (safe source deletion). They are closed on the baseline, but their tests
must still pass in the integrated candidate.

All five dependency patches were semantically integrated for the final execution
record above. Future reruns must still verify their acceptance behavior together;
integration alone is not a pass.

## Phase A — deterministic combined gate

Run once from the integrated candidate:

```sh
scripts/community-alpha-deterministic-gate.sh
```

The script deliberately performs no provider login or provider invocation. It
validates Compose, the frozen install, formatting, lint, types, unit/contract/
import/security tests, isolated persistence tests, builds, the network-disabled
parser checks, and Docker-backed deterministic product journeys. The product
journey uses explicit Local Play test composition, so its result must not be
used as evidence for normal Community authentication or a production provider.

Record each script phase and exit status. A skipped or unavailable Docker phase
is `BLOCKED`, not `PASS`.

## Phase B — clean Docker-first Community installation

Use a previously unused Compose project name and a fresh generated config. First
verify that no container or volume exists for that project name; this protects
the clean-install claim without deleting any existing developer data. Preserve
the generated configuration privately for the restart/recovery checks.

```sh
export COMPOSE_PROJECT_NAME=nuvitae-alpha-gate-<unique-run-id>
export NUVITAE_COMMUNITY_CONFIG_PATH=.community.issue-61.env
sh scripts/community-bootstrap.sh
docker compose --env-file "$NUVITAE_COMMUNITY_CONFIG_PATH" config --quiet
docker compose --env-file "$NUVITAE_COMMUNITY_CONFIG_PATH" up -d --build
docker compose --env-file "$NUVITAE_COMMUNITY_CONFIG_PATH" up --wait
docker compose --env-file "$NUVITAE_COMMUNITY_CONFIG_PATH" ps
```

Required `PASS` assertions:

- exactly `postgres`, `queue`, `api`, `worker`, and `web` become healthy;
- Local Play is false and no development-only banner or identity is present;
- only the web loopback port is published; database, queue, API, private storage,
  and provider session storage are not public;
- first-boot migrations succeed and a normal stop/start without volume deletion
  preserves application and provider state;
- the normal home page loads through the supported Community URL.

Do not use `down -v`, reuse an existing project, or reset developer data as part
of this gate.

## Phase C — normal owner access and session

Retrieve the owner secret only at the moment of entry with
`scripts/community-owner-secret.sh`. Do not redirect, copy into evidence, or put
it in a command argument.

- Verify first access is signed out and protected API reads fail closed.
- Sign in through the browser form. Verify the normal product appears, refresh
  preserves the session, and the cookie is HttpOnly, Secure, SameSite=Strict,
  path `/`, and absent from browser storage and URLs.
- Sign out and verify the prior session is revoked and protected reads again
  fail closed. Sign in once more for the remaining journey.
- Run the #76 cache/header assertions against public, authenticated, error,
  static, and API responses without recording response bodies.

## Phase D — bounded real provider journey

This is not a benchmark. Use one deliberately approved, non-sensitive resume
whose handling is allowed for this validation. Keep all browser traces,
screenshots, video, network-body capture, and verbose provider/application logs
disabled.

Fixed budget for the entire release run:

| Action | Maximum | Stop condition |
| --- | ---: | --- |
| Codex device authorization | 1 completed authorization | Any failure or expiry is recorded; do not start a second authorization |
| Real resume import | 1 upload and 1 resulting semantic-analysis attempt | Any terminal failure is recorded; do not re-upload or retry |
| Contextual AI proposal | 1 request | Any failure is recorded; do not regenerate or retry |

Execute and record content-free assertions only:

1. Connect Codex once. Verify the connection reaches ready, survives a page
   refresh, and recovers after the normal Compose stop/start from Phase B.
2. Upload the approved resume once. Verify truthful processing states reach
   review. Do not repeat the upload if the provider or document fails.
3. Review uncertainty/provenance, make one correction if needed, explicitly
   confirm, and open the created resume.
4. Verify editor controls and live preview update together. Save, leave via **My
   resumes**, reopen, and verify the saved state without recording its values.
5. Request one contextual AI action. Verify before/after review is shown; reject
   it and verify no content changed. There is no regeneration in this gate.
6. Export through the browser print flow. Save one PDF privately; verify it has
   selectable text, materially correct reading order, expected section presence,
   and no missing important field. Record booleans/counts only, never text.
7. Delete the imported source with **Delete source only**. Verify the operation
   is owner-scoped and idempotent, source bytes/source-only artifacts are no
   longer available, stale source detail is absent, and the saved resume still
   opens and exports.

## Phase E — critical security and quality evidence

All must be `PASS` in the integrated candidate:

- #40 hostile file, MIME/signature mismatch, archive/resource bound, parser
  isolation/no-network, inert markup, safe persistence/logging, and indirect
  prompt-injection tests;
- unauthenticated and wrong-owner auth/BOLA tests across imports, drafts,
  structured resumes, provider connections, AI proposals, export reads, and
  source deletion;
- privacy sentinel tests proving logs/evidence omit source text, prompts,
  responses, credentials, cookies, tokens, private references, and control/
  multiline injection;
- queue replay/idempotency, stale revision, failed-provider atomicity,
  fact-preservation, confirmation, save/reopen, and deletion regressions;
- #75 quality, dependency, secret, CodeQL, container/configuration, disclosure
  intake, and release-artifact checks that apply to Community alpha;
- #76 browser headers, sensitive `no-store`, production OpenAPI policy, and CSP
  compatibility checks;
- #58 non-technical desktop/mobile journey and accessibility regressions;
- #60 shipped Community guide cross-check.

Record scanner name/version, policy threshold, exit status, finding counts by
severity, and links to private reports where applicable. Do not paste finding
payloads if they contain paths or data that the release record should not hold.

## Known limitations and decision

Before deciding, list every observed limitation with owner, severity, affected
workflow, workaround (if any), and whether it blocks Community alpha. Do not
copy stale roadmap limitations: verify each against the candidate.

The only final outcomes are:

- **READY** — every prerequisite is integrated, every required row above is
  `PASS`, provider usage stayed within budget, evidence is privacy-safe, and no
  release-blocking limitation remains.
- **NOT READY** — identify each concrete failed/blocked prerequisite or gate,
  its evidence, owner, and required remediation. Do not rerun provider actions
  while waiting for fixes.

The 5 September 2026 execution record above is **NOT READY**. A later run may
replace that verdict only after the blockers are resolved and the complete
checklist is executed again without exceeding the provider budget.
