# Community alpha release-readiness gate

This is the execution record and reproducible checklist for issue #61. It is a
final integration gate, not a substitute for completing its dependencies. A
passing subset must never be reported as **READY**.

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
| #58 onboarding/journey states | integrated SHA; desktop/mobile and accessibility evidence for critical states | issue open; prerequisite not yet supplied |
| #40 hostile-upload boundary | integrated SHA; deterministic hostile corpus, resource/isolation and prompt-injection evidence; documented scanner/CDR decisions | issue open; prerequisite not yet supplied |
| #75 supply-chain verification | integrated SHA; quality coordination, blocking security checks and private intake evidence applicable to Community distribution | issue open; prerequisite not yet supplied |
| #76 browser response policy | integrated SHA; built-container policy checks for public, authenticated, error, static and API responses | issue open; prerequisite not yet supplied |
| #60 Community user guide | integrated SHA; guidance verified against the shipped journey and privacy behavior | issue open; prerequisite not yet supplied |

Also record the already-required issue #61 foundations: #54 (deterministic
import-to-PDF fidelity), #55 (save/reopen), #56 (reviewable contextual AI), and
#57 (safe source deletion). They are closed on the baseline, but their tests
must still pass in the integrated candidate.

Do not begin the final decision run until all five pending dependency patches or
commits have been semantically integrated and their acceptance evidence is
available. If a dependency is intentionally excluded, record that as a release
blocker rather than silently narrowing this gate.

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

Until the integrated dependency commits arrive and this complete checklist is
executed, the issue #61 verdict is **deferred**, not READY or NOT READY.
