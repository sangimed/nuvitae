# MVP Roadmap Proposal — Nuvitae Import → Editor → Export

**Feature spec**: `specs/001-import-resume/spec.md`
**Branch analyzed**: `feat/import-resume-codex-direct-oauth-spike`
**Date**: 2026-08-05
**Nature**: Analysis and documentation only. No production code modified, no task checkbox changed.

---

## 1. Executive recommendation

Nuvitae's import foundation is unusually solid at the engineering layer but does not yet
constitute a usable product for a non-technical user. The import→review→confirm journey is
implemented and tested, yet **no real user can complete it today**: production wiring registers
no AI provider, so every accepted upload terminates at "Reliable resume parsing is not available
on this server right now." The entire second half of the product promise — visual resume editor,
templates, live preview, AI improvement, ATS-friendly PDF export — does not exist in the
repository at all (no routes, no components, no tasks).

The highest-value next move is **one decisive vertical slice** that makes the product promise real
for a real user, not a continuation of the current task graph:

> **Tranche 1 (the "usable product" slice):** Ship a hosted, managed-AI import that ends in a
> visually credible resume editor with a live preview and a one-click ATS-friendly PDF export.

Concretely: wire a production hosted AI parser behind the existing provider-neutral boundary
(`ResumeSemanticParserProvider`), route real uploads to review instead of the dead-end
`provider_unavailable` state, and build the smallest credible editor + preview + export surface on
top of the confirmed `StructuredResume`. Everything that does not serve that single user journey
this month is deferred.

- **Pause** the direct-Codex OAuth work (T201/T202/T203/T164/T165). It is research-blocked, targets
  a self-hosting audience, and is the wrong release shape for a non-technical alpha.
- **Pause** the deep US4/US6 hardening (deletion races, duplicate-upload policy, unsupported-language
  preview, mixed-content classification). These are real but later.
- **Do not** spend MVP time on a fully generalized provider marketplace, many templates, elaborate
  billing, or comprehensive localization.

The current import stack is the strongest asset. Keep it. Build the product on top of it.

---

## 2. Verified current product state

### What was inspected

- `specs/001-import-resume/spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`,
  `quickstart.md`, `contracts/import-resume.md`, checklists.
- Root `README.md`, `AGENTS.md`, `compose.yml`, `compose.local.yml`, `package.json`, `next.config.ts`.
- Web app: all routes (`/`, `/import-resume`, `/import-resume/:id/review`, `/resumes/new/manual`,
  `/resumes/:id`), all feature components, `styles.css`, service clients.
- API: `start-import`, `import-status`, `review`, `confirm`, `manual-resume` controllers/services;
  `import-resume.module.ts`, `local-play-runtime.module.ts`, `app.module.ts`.
- Worker: `import-processing.processor.ts`, `semantic-import.processor.ts`, runtime provider
  registration, semantic-provider-mode gating.
- Packages: domain (mapper, review, confirmation, types), import-application (semantic-parser,
  validation, providers/testing), contracts, extraction, persistence entities/migrations.
- Tests: contract, integration, security, accessibility, browser/e2e, architecture.
- Docs: `docs/research/import-resume-local-play-baseline.md` (documents known production-mode
  failure of the two legacy browser scenarios), all Codex spike research docs.

### Evidence gathered from the running application

The stack was run through Docker (`compose.yml` + `compose.local.yml`), migrations applied, and the
real rendered experience captured with Playwright in the `playwright-test` container at 1440×900 and
390×844. Screenshots and DOM text dumps are in `.local-play/artifacts/screens/` (git-ignored):

- `01-home-desktop`, `02-create-entry-desktop`, `03/04-upload-desktop`, `05-processing-desktop`,
  `06-terminal-failure-desktop`, `07-manual-editor-desktop`
- `11-home-mobile`, `12-upload-mobile`, `14-manual-editor-mobile`
- `21-processing-deterministic-desktop`, `22-review-ready-desktop`, `23-review-top-desktop`
- `30-review-desktop`, `31-review-confirmed-desktop`, `32-confirmation-dialog-desktop`,
  `33-structured-resume-desktop` (post-confirm), `40-review-mobile`
- `50-structured-resume-page-desktop`, `51-structured-resume-page-mobile`

Two runtime passes were used:

1. **Production worker (default)** — exactly what a real user would run today. Result: upload →
   validation passes → semantic parsing → `provider_unavailable` →
   "Reliable resume parsing is not available on this server right now." Terminal dead-end
   (verified in PostgreSQL: `processing_status = provider_unavailable`, zero drafts).
2. **Deterministic E2E worker** (`NUVITAE_SEMANTIC_PROVIDER_MODE=deterministic-e2e-test`) — the
   real UI journey with the fixture-matched test provider: upload → processing → review →
   confirm → structured resume. This is how the review/confirmation screens were captured.

### Current-state map (38 stages)

Legend: **Op** operational end-to-end · **Imp-unwired** implemented but not integrated · **Scaf**
scaffolded · **Test-only** verified only in automated tests · **Part** partially functional · **Abs**
absent · **Blk** blocked.

| # | Stage | State | Evidence / notes |
|---|-------|-------|------------------|
| 1 | Authentication | **Abs / Blk** | No credential-verifying adapter anywhere. `AppModule` only registers import routes under `NUVITAE_LOCAL_PLAY_MODE`; `VerifiedPrincipalGuard` requires a principal only the local-play middleware can mint. Manual-resume routes exist always but would also need a real principal. |
| 2 | Create-resume entry | **Op** | `/` → `CreateResumeEntry` with import-first + manual choice. Visible. |
| 3 | Manual resume creation | **Op** | `/resumes/new/manual` creates/edits/saves/reloads an owner-scoped blank draft (T119/T120). Form-only, no preview. |
| 4 | PDF upload | **Op** | `POST /import-resume` multipart, private storage, 10 MB/5-page checks, worker validation. Verified live. |
| 5 | DOCX upload | **Op** | OOXML extractor + isolated LibreOffice rendered-page count in worker image. Verified in E2E (maya-chen.docx). |
| 6 | Deterministic extraction | **Op** | PDF.js/DOCX text + provenance, language detection, transcript normalization — used for validation and (theoretically) fallback. |
| 7 | Semantic AI parsing | **Blk** | `createProductionSemanticParserProvider()` returns `undefined` (`worker-import-runtime.providers.ts`). No production provider. E2E test adapter matches only fixed fixtures. Real users cannot reach review. |
| 8 | Review draft creation | **Part/Blk** | Works end-to-end in deterministic E2E mode (`ready_for_review` + draft persisted); impossible for real users in production mode. |
| 9 | Warning & ambiguity review | **Part** | Warnings render with text + icons; flow works in E2E. Copy is confusing (see §3). "0 warnings still need review" blocking message. |
| 10 | Field correction | **Part** | Confirm/Edit/Remove/Add per field works (verified via 8 PATCH round-trips). Interface is a database-editor: 3 raw buttons per field, no inline editing, "Add information" inserts placeholder text "Added information". |
| 11 | Confirmation → structured resume | **Part** | Works in E2E. **Critical**: mapper carries only fields explicitly confirmed/edited (`isIncludedField`), so a user who confirms only some fields silently loses the rest — verified: confirming 1 field produced a structured resume containing exactly one value. Confirmation is also gated by "at least one user-confirmed field" while many UX flows would expect "all reviewed fields carry over". |
| 12 | Visual resume editor | **Abs** | No editor routes/components beyond the manual form. |
| 13 | Section reordering | **Abs** | Move up/down only inside the manual form (buttons), no drag, no editor. |
| 14 | Manual content editing | **Part** | Form-based structured sections work; long single-column form, no preview, no autosave (explicit Save). |
| 15 | Template selection | **Abs** | No template concept anywhere. |
| 16 | Live preview | **Abs** | No preview. |
| 17 | ATS-safe PDF generation | **Abs** | No PDF generation. |
| 18 | AI rewrite of one field | **Abs** | None. |
| 19 | AI rewrite of one section | **Abs** | None. |
| 20 | Conversational editing | **Abs** | None. |
| 21 | Job-description adaptation | **Abs** | None. |
| 22 | Version history | **Abs** | None (only optimistic review revision + stale-conflict guard). |
| 23 | Undo / restore | **Abs** | None (review edits are not undoable; no AI change review). |
| 24 | Save & reopen resumes | **Part** | Manual drafts reload via `?draftId`; confirmed resume is a read-only view. No resume list/dashboard, no way to return to a saved resume except the URL. |
| 25 | Source-file deletion | **Abs** | Discard schedules a job (`user_discarded_import`) but no deletion service (T072), no retention worker (T073), no `DeleteSourceControl` UI (T074). |
| 26 | Hosted-provider UX | **Abs** | No hosted provider, no connection UI. |
| 27 | Self-hosted / provider-connected UX | **Blk** | `AIProviderRuntimeConnection` persistence (T162) and provider-connections service (T163) exist but no production provider and no management UI; Codex direct-OAuth blocked at T201. |
| 28 | Onboarding | **Scaf** | Home → import/manual choice only. No signup, no dashboard, no guided first-run. |
| 29 | Basic usage limits | **Op** | 5 attempts / 10 min rolling, 1 active + 2 queued, HTTP 429 + Retry-After; persisted `import_limit_attempts`; verified live (6th upload rate-limited). |
| 30 | Payment readiness | **Abs** | None. |
| 31 | Overall visual design maturity | **Primitive** | Hand-rolled single `styles.css`; developer-looking home page shows a "Web / ok / API route /api" status card. |
| 32 | Consistency of design system | **Low** | No design tokens beyond 5 CSS variables; component classes scattered; no design system. |
| 33 | Desktop editor usability | **Abs (no editor)** | Manual form is usable but uninspired; import review is a long flat list of sections. |
| 34 | Mobile usability | **Part** | Basic stacking; review = endless scroll with 92 buttons (measured) on a single screen; no tabbed/persistent preview concept. |
| 35 | Empty / loading / success / error states | **Part** | Loading and error states exist and are announced; empty sections say "No imported information is active in this section."; success state after confirmation is weak (stale review page remains). |
| 36 | Perceived trust & professionalism | **Low–Moderate** | Wording is mostly plain-language; undermined by technical vocabulary ("Review revision", "Confidence: high. Inference: not inferred."), the dev-style status card, the local-play banner, and "0 warnings still need review". |
| 37 | Clarity of AI interactions | **Abs** | No AI features exposed. |
| 38 | Preview↔PDF fidelity | **N/A** | Neither exists. |

---

## 3. Frank UI/UX audit

Rating: **"functional but visually primitive / developer-oriented."** A non-technical user could
not confidently complete the journey, and today they cannot complete it at all (no provider).

### Main usability and visual defects (with rendered evidence)

1. **The primary journey dead-ends.** In the default runtime, every accepted upload ends at a
   terminal failure message ("Reliable resume parsing is not available…"). There is no "limited
   extraction" option even though `runLimitedDeterministicPartialFallback` is fully implemented —
   it is **not wired** into `SemanticImportProcessor` (it only transitions to `provider_unavailable`).
   `ProviderRecoveryActions.tsx` (a complete, well-written recovery panel) is also **not rendered**
   by `ImportFlow`'s failure path, which uses `ProcessingStep` with hard-coded
   `["replace_upload", "manual_entry"]`. The product's most valuable journey is silently unavailable.
2. **Technical vocabulary in the primary journey** (verified in `30-review-desktop.txt`):
   - "Review revision: 8" rendered as a stat card.
   - Every field shows "Review state: unreviewed. Confidence: high. Inference: not inferred."
   - "Date range" rendered literally as the value text for a non-ongoing role (users should see
     "2020 – 2023" or similar).
   - Home page exposes "Web / ok / API route /api" — a developer scaffold, not a product.
3. **Review looks like a database editor.** 92 buttons on the review screen; every field row has
   "Confirm field / Edit field / Remove from draft" raw buttons; "Add information" inserts the
   literal placeholder "Added information"; "Exclude section" on every section. No grouped
   employer→roles visual model (Nova Systems appears twice as two flat entries). No inline editing;
   edit opens a separate textarea with "Save change / Cancel edit".
4. **Confusing blocking logic.** "Confirmation is blocked — 0 warnings still need review. Confirm or
   edit at least one field before creating a resume." A user with 0 warnings is still blocked with
   no explanation of which field to confirm and why. Confirming one field and clicking "Create
   structured resume" is the only path, and it silently drops every other field.
5. **Confirmed state is not communicated.** After confirmation, the page stays on the review screen
   with a small "Your structured resume was created… Open structured resume" status line; the
   review form (all 92 controls) remains visible and the "Create structured resume" button is still
   rendered. No celebratory/terminal state, no clear next step.
6. **The confirmed resume view is threadbare.** `ConfirmedResumeView` renders only personal/contact/
   headline/summary/skills/languages/links — **work experience, education, projects and
   certifications are not displayed at all** (verified: `50-structured-resume-page-desktop.txt`).
   It is a read-only page with no "Edit this resume" entry point.
7. **No editor, no preview, no export.** The manual editor is a long single-column form with no
   preview, no template, no export, no section navigation, no autosave indicator beyond a text
   status line.
8. **No application shell.** No persistent header/nav/logo/home link/branding anywhere. Every page is
   a bare `<main>` with a card. There is no way for a user to "go home" or "my resumes" except the
   browser back button.
9. **Responsive is minimal.** One `max-width: 720px` rule. The review screen at 390×844 is a very
   long scroll; the manual editor inputs stretch full-width with no comfort. No mobile-adaptive
   editor strategy exists.
10. **Empty/loading/success states are functional but flat** — single gray `message` boxes, no
    illustration, no progress bar (processing shows text steps only), no designed empty dashboard.

### What is genuinely good (keep)

- Import-first onboarding copy is clear and non-technical.
- Upload guidance ("Before you upload") is excellent and plain-language.
- Provider disclosure is honest and provider-neutral.
- Accessibility fundamentals are strong: live regions, focus management, labelled inputs, visible
  focus, keyboard paths, dialog focus restoration (T060–T063 built and tested).
- Processing state copy is human ("Reading the selectable text in your resume.").
- Privacy/ownership/limits are real and tested.

---

## 4. Screenshots / rendered evidence

All artifacts under `.local-play/artifacts/screens/` (git-ignored, kept for the team):

| File | What it proves |
|------|----------------|
| `06-terminal-failure-desktop.png` | Real production-mode outcome: upload ends at "This resume could not be prepared… Reliable resume parsing is not available on this server right now." |
| `07-manual-editor-desktop.png` | Manual editor: bare form, no preview/shell/nav. |
| `23-review-top-desktop.png` / `30-review-desktop.png` | Review screen: stat cards incl. "Review revision", 92 buttons, per-field raw actions. |
| `32-confirmation-dialog-desktop.png` | Confirmation dialog after confirming 1 field. |
| `33-structured-resume-desktop.png` | Post-confirmation: review page remains; success line + link only. |
| `50-structured-resume-page-desktop.png` | Read-only confirmed resume; work experience/education/projects missing from view. |
| `11-home-mobile.png`, `12-upload-mobile.png`, `14-manual-editor-mobile.png`, `40-review-mobile.png` | Mobile widths. |
| `*.txt` / `*.json` dumps | Full DOM text + computed-style facts for each screen. |

---

## 5. Minimum safe production baseline (retain; do not remove)

The MVP must keep, unchanged in guarantee:

- Authentication requirement before upload and ownership isolation on every route (strict,
  same-not-found for missing vs wrong-owner).
- Private, volume-backed storage not served by the web layer; signed internal references.
- Privacy-safe logging (allow-listed identifiers, recursive redaction).
- Basic upload validation: PDF/DOCX only, 10 MB, 5 rendered pages, selectable text, language gate.
- Basic cost/rate limits: 5 attempts / 10 min, 1 active + 2 queued, HTTP 429 + Retry-After.
- Parser isolation: 512 MiB `prlimit`, 3-min foreground timeout, no partial-output commits,
  fail-closed staged output.
- Recoverable user-facing failures: every state explains itself and offers a next action.
- No silent AI writes: AI candidates stay unconfirmed until user action; grounding/no-invention
  gates stay on the semantic path.
- Deferred (explicitly, not by accident): deletion execution (T072–T074), retention worker (T073),
  duplicate-upload policy, deletion races, unsupported-language preview, mixed-content
  classification, OCR.

**Important consequence:** because the 7-day retention promise exists, a **working source-deletion
and retention job is a BETA-SAFETY item** (data promises a user relies on), not MVP-BLOCKER.

---

## 6. MVP definition (smallest credible release)

### 6.1 Must-have before private alpha (the product promise must be exercisable)

The promise is: import → review/correct → structured resume → visual edit → AI improve → ATS PDF →
reopen. Therefore, before a single real user is invited:

1. A **working production AI parser** behind `ResumeSemanticParserProvider` (hosted managed AI,
   server-side credential, no user provider setup) so import reaches review for real documents.
2. **Wire the existing limited-deterministic fallback** into the worker as a no-provider/partial
   path with the existing `ProviderRecoveryActions` UI, so a provider outage is recoverable, not a
   dead end.
3. **A coherent application shell + design system** (nav, branding, consistent primitives) applied
   to every journey screen.
4. **A visual resume editor** over the confirmed `StructuredResume`: direct content editing, section
   navigation, simple reorder, visible save status.
5. **At least one polished ATS-friendly template + live preview + PDF export.**
6. **A small set of reversible AI actions** (see §9) with accept/reject/regenerate/undo.
7. **Reopen journey**: a "My resumes" list and a route to continue editing any saved resume.
8. **Onboarding**: create account/sign-in → create resume → import/manual, one clear primary action
   per screen.

### 6.2 Must-have before inviting unknown users (controlled beta)

- Authentication that is real (password or OAuth) with verified ownership isolation.
- Working **source deletion + retention** (T072/T073/T074 + T114) so the 7-day promise holds.
- Privacy-safe logging verified across the new editor/export/AI surfaces.
- Core AI correctness gates active on the editing path (no invented facts; changes shown before
  replacement).
- Cost protection on AI editing calls (per-user limits; visible, recoverable quota state).
- Critical error recovery: provider outage, export failure, save failure, stale conflicts.
- Usability pass with 3–5 real target users (constitution gate + new-strategy mandate).
- Basic analytics hooks (no resume content) for the funnel metrics in §12.

### 6.3 Post-validation (defer aggressively)

- Exhaustive parser resource-failure scenarios (T109/T110/T113).
- Every deletion race (T135/T137), duplicate-upload policy (T136/T138).
- Unsupported-language contact preview (T122–T125), mixed-content classification (T080/T085).
- Many providers / provider marketplace / provider-selection UX in the main flow.
- Codex direct-OAuth production adapter (T164/T165) and the full T201–T203 spike sequence.
- Perfect self-hosting experience, rare document formats, comprehensive localization, advanced
  observability, horizontal scale, elaborate billing, collaboration, enterprise controls,
  advanced analytics, many templates.
- OCR.

---

## 7. Task classification of every incomplete task

Full audit of `specs/001-import-resume/tasks.md`. Categories:
`MVP-BLOCKER`, `MVP-CORE`, `MVP-POLISH`, `MVP-UX-BLOCKER`, `MVP-UX-CORE`, `MVP-UX-POLISH`,
`BETA-SAFETY`, `POST-VALIDATION`, `POST-VALIDATION-DESIGN`, `OBSOLETE`, `MERGE-WITH-OTHER-TASK`,
`NEEDS-REWRITE`.

Counts at end of audit: **MVP-UX-BLOCKER 0 (all missing tasks are new)**, **MVP-UX-CORE 1**,
**MVP-CORE 3**, **MVP-POLISH 6**, **BETA-SAFETY 8**, **POST-VALIDATION 31**, **OBSOLETE 2**,
**NEEDS-REWRITE 1**, **MERGE 2**. (New tasks listed separately in §10.)

### Codex / provider spike (Phase 6 & 11–14)

| Task | Description | Category | Justification | Tech dependency | Action | Effort | Confidence | Unknowns |
|------|-------------|----------|---------------|-----------------|--------|--------|------------|----------|
| T192 | app-server semantic parsing spike | OBSOLETE | Historical; app-server auth BLOCKED (T191), NO-GO (T195). Do not reopen for MVP. | — | Defer; keep historical | — | High | — |
| T193 | app-server evaluation | OBSOLETE | Same; no authenticated runtime. | T192 | Defer | — | High | — |
| T201 | direct-OAuth semantic parsing (C04–C06) | POST-VALIDATION | Research is real but the MVP uses hosted managed AI; self-hosted Codex is post-validation. | T200 | Pause | L | Med | Live-auth viability; C04–C06 execution requires explicit re-authorization |
| T202 | direct-OAuth evaluation | POST-VALIDATION | Depends on T201. | T201 | Pause | M | Med | — |
| T203 | direct-OAuth go/no-go | POST-VALIDATION | Gate for Codex adapter only. | T202 | Pause | S | Med | — |
| T208 | deterministic provenance enrichment (spike) | POST-VALIDATION | Spike-contract refactor; no user impact. | — | Defer | M | Med | — |
| T164 | Codex direct-OAuth production adapter | POST-VALIDATION | Blocked by T203; wrong release shape for MVP. | T149–T152, T203 | Defer | XL | Low | T203 outcome |
| T165 | Codex response converter | POST-VALIDATION | Same. | T150–T152, T203 | Defer | L | Low | — |

### Production semantic import (Phase 6)

| Task | Description | Category | Justification | Tech dependency | Action | Effort | Confidence | Unknowns |
|------|-------------|----------|---------------|-----------------|--------|--------|------------|----------|
| T171 | Worker orchestration via provider (production) | MVP-BLOCKER / NEEDS-REWRITE | The provider-neutral worker (T209) is done, but no production provider exists and the fallback isn't wired. Rewrite scope: invoke a hosted provider adapter OR run the existing limited fallback; never dead-end at `provider_unavailable` silently. | T152/T157–T160/T180–T184 | **Rewrite** | L | High | Hosted provider contract/latency |
| T174 | Review-draft creation gate (schema-valid/grounded) | MVP-CORE / MERGE-WITH-T171 | Validation gates already enforced by `validateSemanticResponse` + grounding/no-invention before draft build; this task is effectively part of the T171 rewrite. | T152/T157–T158 | **Merge into T171** | S | High | — |
| T177 | Update browser E2E acceptance (US1) | MVP-CORE | Owns the two known-failing legacy browser scenarios (`local-play-baseline.md`). Must be updated to the provider journey once a provider exists. | T171/T174–T176 | Rewrite scope | M | High | — |
| T178 | Review integration tests for semantic candidates | MVP-CORE | Assert candidates stay unconfirmed + provenance preserved; aligns with the editor-era review redesign. | T172–T174 | Keep, reduce scope | M | High | — |
| T179 | Confirmation tests for gates | MVP-CORE | Extend to assert structured-resume gates incl. the field-carry-over behavior decision in §2/§10. | T172–T174 | Keep, adjust to new mapper behavior | S | High | Decision on unreviewed-field carry-over |

### US5 Accessibility (Phase 7)

| Task | Description | Category | Justification | Action | Effort | Confidence |
|------|-------------|----------|---------------|--------|--------|------------|
| T057 | keyboard-full-flow a11y test | MVP-POLISH | Components (T060–T063) already exist and are tested at component level; an end-to-end keyboard test is worth keeping but not a blocker. | Keep, reduced | M | Med |
| T058 | status-announcements a11y test | MVP-POLISH | Live-region components + unit tests exist. | Keep, reduced | S | Med |
| T059 | focus-recovery a11y test | MVP-POLISH | Same. | Keep, reduced | S | Med |

### US6 Security/retention (Phase 8)

| Task | Description | Category | Justification | Action | Effort | Confidence |
|------|-------------|----------|---------------|--------|--------|------------|
| T067 | deletion/retention verification tests | BETA-SAFETY | Backs the user-facing 7-day promise once T072/T073 land. | Keep | M | High |
| T072 | source deletion service | BETA-SAFETY | User-facing data-control promise (source ≠ structured resume). | Keep | M | High |
| T073 | retention worker processor | BETA-SAFETY | Enforces 7-day expiry promised in upload copy. | Keep | M | High |
| T074 | delete source UI + privacy copy | BETA-SAFETY | Visible privacy control; small. | Keep | S | High |
| T114 | resource-limit failure cleanup | BETA-SAFETY | Prevents orphaned private files on parser failures; bounds storage cost. | Keep, reduced | M | Med |
| T109 | hard parser memory-limit security test | POST-VALIDATION | Enforcement already implemented + unit-tested (`safety.ts`, `isolated-parser-runner`); integration-level test is nice-to-have. | Defer | M | Med |
| T110 | parser timeout security test | POST-VALIDATION | Same. | Defer | M | Med |
| T113 | resource-failure cleanup tests | POST-VALIDATION | With T114 BETA-SAFETY, the test can wait. | Defer | M | Med |
| T135 | deletion-races security test | POST-VALIDATION | Explicitly listed as deferrable. | Defer | L | Med |
| T136 | duplicate-upload policy | POST-VALIDATION | Real but low-frequency; costs not urgent. | Defer | M | Med |
| T137 | idempotent deletion lifecycle | POST-VALIDATION | Deletion races; defer. | Defer | L | Med |
| T138 | duplicate-upload security test | POST-VALIDATION | Same. | Defer | M | Med |

### US4 Recovery (Phase 9)

| Task | Description | Category | Justification | Action | Effort | Confidence |
|------|-------------|----------|---------------|--------|--------|------------|
| T076 | recovery contract tests | POST-VALIDATION | Core recovery states already covered by existing contracts; extend later. | Defer | M | Med |
| T077 | validation-failure integration tests | POST-VALIDATION | Validation-failure state already wired + tested at unit level. | Defer | M | Med |
| T078 | partial/timeout recovery tests | POST-VALIDATION | Timeout state exists; deep retry/replace flows later. | Defer | L | Med |
| T079 | cancel/expiry integration tests | POST-VALIDATION | With T083 BETA-SAFETY later. | Defer | M | Med |
| T080 | mixed-content fixture tests | POST-VALIDATION | Rare docs; defer. | Defer | M | Med |
| T081 | no-AI fallback tests | POST-VALIDATION | Once fallback is wired (T171 rewrite), add integration tests. | Defer | M | Med |
| T082 | retry/replacement services | POST-VALIDATION | Replacement upload exists ("upload a different file"); full retry/replace service later. | Defer | M | Med |
| T083 | cancellation/discard services | BETA-SAFETY | User-facing control; discard UI exists (ConfirmationStep) but stop-processing + scheduled deletion need it. | Keep, reduced | M | Med |
| T084 | expired draft / no-supported-field services | POST-VALIDATION | Expired state already surfaced by status service. | Defer | S | Med |
| T085 | mixed-content classification | POST-VALIDATION | Defer. | Defer | L | Low |
| T086 | recovery REST controllers | POST-VALIDATION | Add with T082/T083/T084. | Defer | M | Med |
| T087 | recovery UI states | MVP-POLISH / MERGE | `ProviderRecoveryActions` exists; wire into `ImportFlow` failure path (today the terminal failure uses `ProcessingStep` only). | **Merge into T171 rewrite** | S | High |
| T088 | supersede optional AI classifier | OBSOLETE | `SemanticImportProcessor` already replaces the legacy classifier path; task is historical bookkeeping. | Skip (note in docs) | S | High |
| T117 | manual-entry navigation integration tests | MVP-POLISH | Route already reachable from failure states; add coverage with reduced scope. | Keep, reduced | M | Med |
| T118 | manual-entry route a11y tests | MVP-POLISH | Same. | Keep, reduced | S | Med |
| T121 | wire manual-entry recovery actions | MVP-POLISH / MERGE | `manualEntryUrl` already used by `ProviderRecoveryActions`; verify wiring in redesign. | Merge into shell redesign | S | High |
| T122 | unsupported-language contact-preview contract tests | POST-VALIDATION | Defer. | Defer | S | Med |
| T123 | unsupported-language contact-preview integration tests | POST-VALIDATION | Defer. | Defer | M | Med |
| T124 | unsupported-language contact-preview service | POST-VALIDATION | Defer. | Defer | M | Med |
| T125 | unsupported-language contact-preview UI | POST-VALIDATION | Defer. | Defer | M | Med |

### Polish (Phase 10)

| Task | Description | Category | Justification | Action | Effort | Confidence |
|------|-------------|----------|---------------|--------|--------|------------|
| T089 | user-facing help docs | BETA-SAFETY | Non-technical users need plain help; content must be refreshed to match new editor/export surface. | Keep, reduced | M | Med |
| T090 | ADR for pipeline | POST-VALIDATION-DESIGN | Useful but not user-facing; write after the hosted-provider decision is made. | Defer | S | High |
| T091 | quickstart validation mapping | POST-VALIDATION | Internal tooling doc. | Defer | S | High |
| T092 | quickstart validation results | POST-VALIDATION | Internal. | Defer | S | High |
| T093 | non-technical UX regression | MVP-POLISH | Guards plain-language across the redesigned journey; valuable and small. | Keep | M | High |
| T094 | protected-templates regression | MVP-CORE | Once templates/rendering exist, prove import can't touch them. Move up. | Keep | S | High |
| T095 | AI behavior evaluation | BETA-SAFETY | Core AI correctness checks on the editing path. | Keep, expanded to AI-edit | L | Med |
| T096 | extraction correctness evaluation | BETA-SAFETY | Grounds import quality gates. | Keep | L | Med |
| T097 | usability evaluation protocol | MVP-CORE | The new strategy requires testing with real users; protocol should cover editor + AI + export. | Keep, expanded | M | Med |
| T098 | final export cleanup | MVP-POLISH | Do at the end of the tranche. | Keep | S | High |

---

## 8. Critical path to a testable MVP

Optimize for visible value and end-to-end completeness. Each tranche is independently
implementable and demoable. **Vertical slices, not infrastructure batches.**

### Tranche A — "Make import real" (MVP-BLOCKER)

- **Goal**: A real user can upload a real resume and reach review in the hosted deployment, with a
  recoverable path when AI is down.
- **Included task IDs**: T171 (rewrite), T174 (merged), T177, T178, T179 (adjusted), T087/T121
  (wired), T081 (partial).
- **New tasks**: hosted managed-AI provider adapter (OpenAI-compatible, server-side key) behind
  `ResumeSemanticParserProvider`; worker wiring that calls the provider then the existing limited
  fallback on failure; provider-recovery panel integrated into `ImportFlow`.
- **Dependencies**: T149–T161, T180–T188, T209–T211 (all done). New: an env/secret for the hosted
  provider + small adapter.
- **Acceptance criteria**: upload a real (non-fixture) PDF and DOCX → review opens; kill the
  provider → recovery panel offers "Continue with limited extraction" / "Enter manually"; no
  `provider_unavailable` dead end; privacy-safe logs; cost cap enforced.
- **UI/UX acceptance**: processing shows steps and progress; failure states explain in plain language;
  "limited extraction" clearly labeled as partial.
- **Demo**: host a deployment, upload a real resume, reach review in under 2 minutes; simulate
  outage and recover.
- **Effort**: agent ~4–6 days; human review ~1–2 days.
- **Risks**: hosted provider latency/quality (product); provider cost control (technical).

### Tranche B — "Coherent shell + design system" (MVP-UX-BLOCKER)

- **Goal**: Every screen shares a calm, credible shell; no screen looks like a scaffold.
- **Included**: no existing tasks — all new. Removes dev status cards, adds nav/branding, typography,
  spacing, buttons, forms, cards, toasts, empty/loading/error states, responsive behavior.
- **New tasks**: DesignSystem tokens + primitives (§10); AppShell + nav; redesigned Home/Dashboard;
  redesigned upload/processing; redesigned review; redesigned manual editor; mobile pass.
- **Dependencies**: none (can overlap Tranche A's UI).
- **Acceptance**: §11 gates; no raw framework controls in primary journey; one primary action per
  screen.
- **Demo**: walk home → create → upload → review with a non-technical user and no explanation.
- **Effort**: agent ~3–5 days; human review ~1–2 days.
- **Risks**: scope creep into "complete design system" (product); none significant (technical).

### Tranche C — "Editor + preview + template + PDF" (MVP-UX-BLOCKER + MVP-CORE)

- **Goal**: The user reaches a split-pane editor with live preview, chooses a template, and exports
  an ATS-friendly PDF.
- **New tasks**: editor shell (left form / right preview); section navigation + reorder; save status;
  template model + 2–3 polished ATS-safe templates; deterministic renderer (HTML→PDF via headless
  Chromium or `react-pdf`); export flow with loading/error/success; preview↔PDF fidelity check.
- **Dependencies**: confirmed `StructuredResume` persistence (exists); design system (B).
- **Acceptance**: §11 editor criteria; exported PDF closely matches preview; ATS-safe (single column,
  standard fonts, semantic order).
- **Demo**: import → review → confirm → open editor → switch template → edit a bullet → export PDF →
  open in system viewer.
- **Effort**: agent ~6–10 days; human review ~2–3 days.
- **Risks**: PDF fidelity (product); headless-render runtime cost in containers (technical).

### Tranche D — "AI improvement actions" (MVP-CORE)

- **Goal**: 5 reversible, context-aware AI actions near the content they affect.
- **New tasks**: AI edit service (hosted provider, field/section scope); change-review UI
  (before/after diff, accept/reject/regenerate/undo); progress + plain-language failures; cost caps.
- **Dependencies**: hosted provider (A); editor (C).
- **Acceptance**: §9 + §11 AI criteria; no invented facts; every change previewed before replacement.
- **Demo**: select a summary → "Strengthen the impact" → see diff → accept.
- **Effort**: agent ~4–6 days; human review ~1–2 days.
- **Risks**: output quality/invention (product); cost (technical).

### Tranche E — "Reopen + metrics + beta safety" (MVP-POLISH + BETA-SAFETY)

- **Goal**: Users return, and we can measure the funnel.
- **Included**: T072/T073/T074/T114, T067, T089, T097, T095/T096 (reduced), plus analytics hooks.
- **New tasks**: "My resumes" dashboard (list, continue editing, delete source); minimal privacy-safe
  analytics (§12); auth (real) before inviting unknowns.
- **Dependencies**: editor persistence (C).
- **Acceptance**: second-session resume reopening works; funnel metrics produce data; source deletion
  honors the 7-day promise.
- **Demo**: user leaves, returns, resumes editing, exports again.
- **Effort**: agent ~4–6 days; human review ~1–2 days.
- **Risks**: retention (product); auth complexity (technical).

**Critical-path total**: agent ≈ 21–33 days; human review ≈ 6–11 days to a testable private alpha
with a real user completing import → editor → export.

---

## 9. AI feature scope — the smallest set that proves value

Recommend **five user-visible AI actions** for MVP:

| Candidate | Classification | Note |
|-----------|----------------|------|
| Semantic import (parse into structured draft) | **Essential for MVP** | Already built; needs a production provider (Tranche A). |
| Improve this section's clarity & impact | **Essential for MVP** | "Improve this experience" — highest perceived value. |
| Make it more concise | **Essential for MVP** | "Make this more concise." |
| Transform responsibilities into achievement bullets | **Essential for MVP** | "Strengthen the impact" — the classic resume pain. |
| Fix grammar and typos | **Useful for alpha** | Cheap, high trust. |
| Adapt full resume to a job description | **Useful for alpha** | Paste a job description → tailored summary + reordered bullets; demo-able, measurable. |
| Generate a professional summary | Post-validation | Needs an empty-text policy; defer. |
| Expand text | Post-validation | Verbosity risk. |
| Change tone / translate | Post-validation | Defer. |
| Identify job-description keywords / recommend skills | Post-validation | Recommend-with-evidence risk; defer. |
| Produce multiple variants | Post-validation | Adds UX complexity (variant picker). |
| Conversational editing | Post-validation | Secondary experience only after direct editing is proven. |
| Undo AI change / before-after compare / regenerate | **Essential (platform, not a "feature")** | Non-negotiable affordances on every AI action. |
| Provider selection (user-facing) | Reject for now | Hidden from the main journey; hosted provider is server-managed. |
| Direct Codex OAuth | Reject for now (post-validation) | T201 blocked; wrong audience for MVP. |
| API-key provider connection UI | Reject for now | Self-host/advanced users only, later. |
| Hosted managed AI | **Essential for MVP** | The release vehicle for every action above. |

**Five actions selected**: (1) Improve this experience; (2) Make this more concise; (3) Strengthen
the impact (responsibilities → achievements); (4) Fix grammar and typos; (5) Adapt to a job
description.

**Factual-preservation safeguards** (all must hold):
- Every AI action operates on an explicit, user-visible scope (this field / this section).
- Every change is shown as a before/after diff; nothing is applied silently.
- User must explicitly accept; reject discards; regenerate produces a new variant; undo returns to
  the last saved state.
- The edit prompt includes the grounded source content and instructs no invented facts; a
  post-check rejects changes that add new names/dates/companies not present in the source or user
  text.
- AI editing writes through the same structured-resume transaction boundary as manual edits, with
  the same save/conflict semantics.

---

## 10. Required new / rewritten tasks (proposal — do not edit tasks.md yet)

New `T-*` IDs are placeholders for the next task-graph revision:

| Proposed ID | Name | Tranche | Notes |
|-------------|------|---------|-------|
| T-N01 | Hosted managed-AI semantic parser adapter | A | OpenAI-compatible, server-side key, behind existing boundary. |
| T-N02 | Worker wiring: provider → limited fallback → review | A | Rewrite of T171; integrates T188 + `ProviderRecoveryActions`. |
| T-N03 | Review-copy and vocabulary cleanup | B | Remove "Review revision", raw enum text, "Date range" literal, "0 warnings" message; grouped employer/roles. |
| T-N04 | Design-system tokens + reusable primitives | B | §10 of this doc. |
| T-N05 | Application shell + navigation + branding | B | |
| T-N06 | Home / dashboard (create, import, my resumes entry) | B | |
| T-N07 | Editor shell: split pane + section navigation + reorder + save status | C | |
| T-N08 | Template model + 2–3 ATS-safe templates | C | |
| T-N09 | Live preview + preview↔PDF fidelity | C | |
| T-N10 | ATS-friendly PDF export flow | C | |
| T-N11 | AI edit service + change-review UI (accept/reject/regenerate/undo) | D | |
| T-N12 | Confirm-carry-over decision + mapper fix (all reviewed fields carry, excluded only on explicit action) | A/C | Critical data-integrity fix from §2. |
| T-N13 | Structured-resume full read/edit view (work experience/education/projects/certs) | C | `ConfirmedResumeView` gap. |
| T-N14 | My-resumes list + continue-editing route | E | |
| T-N15 | Privacy-safe funnel analytics hooks | E | §12. |
| T-N16 | Real authentication for beta | E | Before inviting unknown users. |

**Tasks to pause explicitly**: T164, T165, T192, T193, T201, T202, T203, T208 (Codex path);
T135, T136, T137, T138, T080, T085, T122, T123, T124, T125 (deep US4/US6 hardening);
T090, T091, T092 (internal docs).

---

## 11. Proposed MVP information architecture

- **Primary navigation (persistent shell)**: Home/My resumes · Create resume (primary CTA) ·
  Account (settings when auth exists).
- **Screens**:
  1. **Home / Dashboard** — "My resumes" list (cards: name, updated, status) + "Create a resume"
     primary CTA. Empty state: friendly illustration + create/import choice.
  2. **Create resume** (single screen) — Import card (primary) and Manual card (secondary), as today
     but redesigned.
  3. **Import flow** — Upload → Processing → Review (wizard-like, one step at a time with progress).
  4. **Review** — sectioned, grouped (employer→roles), inline editing, warnings as calm cards.
  5. **Editor** — split pane; the product's home surface.
  6. **Export** — modal/inline: template already chosen, "Download PDF" with success/error states.
- **Merged/removed**: no separate "settings" screen yet; provider/technical settings are hidden
  (hosted provider is server-managed). The old `/` dev status card is removed.
- **Contextual (not in nav)**: AI actions live next to edited content; template picker lives in the
  editor's design panel; undo/save status live in the editor chrome; source deletion lives on the
  resume's privacy/danger zone, not the main flow.
- **Returning users**: dashboard → resume card → continue editing. No localStorage as source of truth.

---

## 12. Recommended editor layout (choose one)

**Primary approach: structured form editor with persistent live preview (split pane).**

- **Desktop (≥ 1024 px)**: fixed left pane = editable content with section navigation (vertical
  section list + "Add section"), fixed right pane = live resume preview rendered from the current
  template. A slim top bar holds: back-to-dashboard, resume title, save status, template menu,
  AI menu, "Export PDF" primary button.
- **Mobile (< 768 px)**: tabbed toggle **Edit | Preview** with a sticky bottom bar
  (Save + Export). Editing stays the primary tab; preview is one tap away. Advanced editing
  (reorder by drag) is desktop-optimized; mobile keeps up/down reorder buttons.
- **Section navigation**: sticky vertical rail on desktop; horizontal chips on mobile. Clicking
  scrolls to the section and highlights it.
- **Content editing**: inline inputs/textarea per field; autosave (debounced) with explicit
  "Saving… / Saved / Error — retry" indicator; optimistic local state with stale-conflict guard
  (reuse the manual-draft pattern).
- **Reorder**: drag-and-drop on desktop + up/down buttons everywhere; keyboard accessible.
- **Validation feedback**: inline under the field, non-technical wording.
- **AI placement**: an "Improve" menu button per section header (and per textarea) → the action menu
  → diff review panel (right side over the preview or a modal) with Accept / Reject / Regenerate.
- **Undo/compare**: AI changes open as before/after side-by-side diff; undo returns to the last
  saved version. A minimal version list (now / last saved) is enough for MVP — full version history
  is post-validation.
- **Template controls**: a "Design" panel (template choice + optional color/typography presets)
  separated from content editing; template change never touches content.
- **PDF preview behavior**: the preview is the live page rendering; export uses the same template
  renderer to a real PDF so preview↔PDF fidelity is structurally guaranteed.

Rejected alternatives and why: inline-canvas editing (expensive, harder for a11y and for
ATS-preserving structure); tabbed editor/preview everywhere (preview should be persistent on
desktop); fully WYSIWYG editor (overkill for MVP).

---

## 13. Lightweight design-system direction

- **Typography**: Inter (already the fallback stack) as the single family; type scale
  `13 / 15 / 16 / 20 / 24 / 32` px with weights 400/500/600/700; line-heights 1.5 body, 1.2 headings.
- **Spacing scale**: 4px base: `4 8 12 16 24 32 48 64`. Page gutters 16 mobile / 24–32 desktop.
- **Content widths**: shell max 1200 px; single-column journeys ≤ 640 px; editor split panes
  ~ 1fr / 1.1fr.
- **Surface hierarchy**: white cards on a cool gray canvas (`#f7f8fb`), elevated card for the
  active pane, subtle borders only where needed.
- **Border radius**: 10–12 px cards, 8 px inputs, 999 px pills.
- **Shadows**: one soft default, one for dialogs/panels; no chunky shadows.
- **Form controls**: 44 px min-height inputs; 1 px border with a calm focus ring (not the current
  high-contrast yellow only — keep a visible-but-calm 2–3 px ring that satisfies §11 focus).
- **Button hierarchy**: primary (filled accent), secondary (outline), ghost (text), destructive
  (outline red), icon button. One primary per screen.
- **Feedback states**: success (green), warning (amber), error (red), info (blue-gray); always with
  text, never color alone.
- **Color usage**: restrained — one accent (`#176b87` family), neutrals, semantic colors only for
  status. No arbitrary per-component colors.
- **Icons**: a single stroke icon set (e.g., Lucide) used consistently; icons never carry meaning
  alone (label always present).
- **Motion**: 120–200 ms ease-out transitions; only for feedback/expansion; respect
  `prefers-reduced-motion`.
- **Breakpoints**: `640 / 768 / 1024 / 1200`.

### Minimum reusable primitives

`AppShell` · `PageHeader` · `PrimaryButton` · `SecondaryButton` · `GhostButton` · `IconButton` ·
`TextField` · `TextArea` · `Select` · `Card` · `Modal`/`Drawer` · `Toast` · `EmptyState` ·
`LoadingState` (with progress) · `ErrorState` · `Stepper` (import wizard) · `SectionNavigation` ·
`ResumePreview` · `AIActionMenu` · `AIChangeReview` (diff) · `SaveStatus` · `DangerZone`.

---

## 14. Objective UI/UX acceptance criteria ("clean and modern")

1. No raw, unstyled framework controls anywhere in the primary journey.
2. Consistent typography and spacing across every MVP screen (lint-able via token usage).
3. Every main screen has exactly one obvious primary action.
4. All loading, empty, success, and failure states are designed (no unstyled text dumps).
5. The import-to-export journey is completable without documentation by a non-technical user
   (tested in §15).
6. The editor is fully usable at 1024–1920 px desktop widths.
7. The main journey is usable on mobile (390 px), with advanced editing desktop-optimized.
8. AI changes can be previewed, accepted, rejected, regenerated, and undone.
9. The preview visually matches the exported PDF closely (per-template fidelity check).
10. No internal technical terminology in the normal user journey (enforced by T093-style regression).
11. Keyboard focus is always visible; primary flows are keyboard-completable.
12. Forms give clear inline validation in plain language.
13. No visually broken layout at 320/390/768/1024/1440 px.
14. No inconsistent button styles, spacing, or heading hierarchy.
15. No screen looks like a raw developer scaffold (no status cards, no enum text).

### Short usability test script (non-technical participant, ~30 min)

1. "Create a resume from your own PDF/DOCX." → watch: did they find the entry, upload, understand
   progress? (T2T time to review.)
2. "Check that your phone number is right, then fix it if wrong." (SC-004 target <30 s.)
3. "Change the headline to something stronger." (direct editing.)
4. "Use the AI to make the summary more impactful, then undo it." (AI diff + undo.)
5. "Download the PDF and open it." (export success + fidelity.)
6. "Close the browser, come back, and keep editing." (reopen.)
7. Ask: "What happened to the file you uploaded?" (7-day retention / source ≠ resume.)
8. Ask: "Would you trust this with your resume? Would you pay for it?" (trust/WTP probe.)
9. Note where the user needed help, got confused, or gave up.

---

## 15. First commercial shape

Compare:

| Model | Onboarding friction | Target-user fit | Support burden | Credential risk | AI cost | Time to market | Usage measurement | WTP validation |
|-------|--------------------|-----------------|----------------|-----------------|---------|----------------|-------------------|-----------------|
| 1. Private hosted alpha + managed AI | **Low** (sign up, use) | **Excellent** | Low (one surface) | None (server key) | Medium (controlled) | **Fastest** | Full | **Yes** |
| 2. Hosted beta, users supply provider keys | Medium (get a key) | Poor (non-tech users can't) | High | High (users' keys) | Low | Medium | Partial | Weak |
| 3. Self-hosted technical preview | High (Docker) | Poor | Very high | High (Codex OAuth) | Low | Blocked (T201) | Weak | No |
| 4. Hybrid hosted + self-hosted | High complexity | Split | Very high | Mixed | Mixed | Slow | Weak | No |

**Recommendation: Model 1 — private hosted alpha with managed AI, immediately.** Target users are
non-technical; the Codex path (Model 3/4) is blocked and aimed at a different audience; Model 2
violates onboarding simplicity. Self-hosting and bring-your-own-key remain post-validation
(boundaries already exist). Reuse of `ResumeSemanticParserProvider` means the hosted adapter is a
small, well-isolated addition.

---

## 16. Product metrics (privacy-safe, no resume content)

Funnel (event-level, no content):
- Signup → first import initiated
- Import success rate (upload → review reached)
- Import → review → confirmation rate
- Confirmation → editor-open rate
- Editor → first successful PDF export
- Median time from signup to first exported PDF
- Median manual corrections made during review
- AI action usage: actions offered → invoked → accepted / rejected / regenerated / undone
- Export frequency per resume; second-session return rate; second resume/version creation
- User-reported trust (post-session 1–5 survey, no PII)
- Willingness to pay (post-session "would you pay $X/month?" + in-product pricing test later)

**Three primary MVP success metrics**:
1. **% of new users who export a first PDF** (funnel completion — proves the product promise).
2. **AI acceptance rate** (accepted / invoked actions) — proves AI value without hallucination
   damage.
3. **Second-session return within 7 days** — proves retention/trust.

Analytics: minimal server-side counters (Postgres or a single event table), no third-party
platform, no resume content, no personal identifiers beyond the existing owner UUID.

---

## 17. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hosted AI import quality (grouping/fields) | Med | High | Keep grounding/no-invention gates; review UI is the safety net; measure precision on the fixture suite (T096). |
| AI edit invents facts | Med | High | Scope-limited prompts, before/after diff, explicit accept, no-invention post-check. |
| AI cost explosion | Med | Med | Per-user/monthly caps, token budget per action, visible quota state. |
| PDF fidelity / ATS safety | Med | High | Single renderer for preview + export; ATS checks (single column, standard fonts) in the fidelity test. |
| Team returns to infrastructure-first habits | Med | Med | Freeze task graph to tranches; all work demoable; acceptance = rendered UI. |
| Scope creep on design system | Med | Low | Ship primitives, not a design-token framework. |
| Review confirm-carry-over data loss | High (exists now) | High | Ship T-N12 fix in Tranche A/C; regression test on T179. |

---

## 18. Recommended first tranche (decisive)

**Tranche A: "Make import real"** — T171 (rewritten: hosted managed-AI provider + worker wiring that
calls the provider then the existing limited fallback), T174 (merged into T171), T177, T178, T179
(adjusted), T087/T121 (wire existing `ProviderRecoveryActions`), plus new tasks **T-N01**, **T-N02**,
**T-N03**, **T-N12**. Work **concurrently on Tranche B** (shell + design system) because it is
independent, and the UI work makes every other tranche demoable.

**Why it is the highest-value next step**: it is the only tranche that unblocks the actual product
promise. Today a real user cannot even reach review; nothing else matters until that is true. It is
small, reuses completed work (T209–T211, T185–T188, T175–T176), and produces a demo a non-technical
user can experience.

**Exact existing task IDs included**: T171, T174, T177, T178, T179, T087, T121.

**New tasks required**: T-N01 (hosted provider adapter), T-N02 (worker wiring + fallback integration),
T-N03 (review-copy cleanup), T-N12 (confirm-carry-over / mapper fix).

**Tasks to pause**: T164, T165, T192, T193, T201, T202, T203, T208 (Codex path); T135–T138,
T080, T085, T122–T125 (deep hardening); T090–T092 (internal docs).

**Concrete UI/UX outcome**: import no longer dead-ends; users see a calm, plain-language processing
experience and reach a review screen that reads like a product (no "Review revision", no raw
enum text, no "Date range" literal, grouped work experience, sensible confirmation copy, all
reviewed fields carried into the structured resume).

**Demoable product outcome**: "Upload a real resume → review it → confirm → a complete structured
resume appears" — end to end, in the hosted stack, with a graceful limited-extraction path when AI
is down.

**Estimated implementation range**: agent 5–8 days; human review 2–4 days.

**Single largest product risk**: AI import quality for real-world (non-fixture) resumes — mitigated
by keeping the review step as the explicit safety net and measuring quality early.

**Single largest technical risk**: hosted AI provider latency/behavior within the 3-minute
foreground window and cost control — mitigated by the existing timeout/limit scaffolding, response
validation, and per-user cost caps.

---

## 19. Proposed task-order table (do not rewrite tasks.md yet)

| Order | Tranche | Work |
|-------|---------|------|
| 1 | A | T-N01 Hosted provider adapter (contract already fixed) |
| 2 | A | T171→T-N02 worker wiring (provider → limited fallback → review) |
| 3 | A | T087/T121 wire `ProviderRecoveryActions` into `ImportFlow` |
| 4 | B | T-N04 design tokens + primitives |
| 5 | B | T-N05 shell/nav + T-N06 home/dashboard |
| 6 | B | T-N03 review-copy + T-N12 mapper carry-over fix |
| 7 | A | T177/T178/T179 adjusted tests + T-N02 integration tests |
| 8 | C | T-N07 editor shell (split pane, nav, save) |
| 9 | C | T-N08 templates + T-N13 structured-resume read/edit view |
| 10 | C | T-N09 live preview + T-N10 PDF export |
| 11 | D | T-N11 AI edit service + change-review UI |
| 12 | E | T-N14 my-resumes + T072/T073/T074/T114 + T-N15 analytics + T-N16 auth (before public beta) |
| 13 | — | T095/T096/T097, T093, T094, T089, T057–T059, T098 (gates + polish) |
| 14 | — | Paused/backlog: Codex path, deep US4/US6, localization, multi-template, billing |

---

## 20. Final report summary

- **Files inspected**: full `specs/001-import-resume/` corpus, root README/AGENTS/compose/package
  config, all web routes/components/styles, all API import+manual controllers/services, worker
  processors + runtime wiring, import-application/domain/extraction/contracts/persistence source,
  Codex research docs, test suites.
- **Screens inspected**: home, create-entry, upload, upload-with-file, processing, terminal failure,
  manual editor, review (desktop + mobile), confirmation dialog, post-confirm state, structured
  resume page (desktop + mobile).
- **Screenshots captured**: 24 PNGs + 9 DOM-text/JSON dumps in `.local-play/artifacts/screens/`.
- **Current-state conclusions**: import→review→confirm is implemented and E2E-tested but not
  reachable by real users (no production AI provider; fallback unwired); editor/template/preview/
  PDF/AI-edit/dashboard entirely absent; UI is developer-oriented and primitive; significant
  data-integrity issue at confirmation (unreviewed fields silently dropped).
- **UI/UX maturity rating**: **2/5 — functional but visually primitive / developer-oriented.**
- **Incomplete-task classifications**: MVP-BLOCKER 1 (rewrite), MVP-CORE 3, MVP-POLISH 6,
  BETA-SAFETY 8, POST-VALIDATION 31, POST-VALIDATION-DESIGN 1, OBSOLETE 2, NEEDS-REWRITE 1,
  MERGE-WITH-OTHER-TASK 2.
- **Proposed MVP critical path**: A (make import real) → B (shell+design) → C (editor+preview+
  template+PDF) → D (AI actions) → E (reopen+metrics+beta safety). Agent ≈ 21–33 days total.
- **Selected five AI actions**: Improve this experience; Make more concise; Strengthen the impact;
  Fix grammar/typos; Adapt to a job description.
- **Information architecture**: dashboard-first shell; create → import/manual → review → editor →
  export; contextual AI/template/save controls; hidden technical/provider settings.
- **Editor approach**: split-pane structured form editor + persistent live preview (tabbed on mobile).
- **Design-system direction**: Inter, 4px spacing base, restrained accent color, 10–12 px radii,
  44 px controls, one primary action per screen, full designed states.
- **Release model**: private hosted alpha with managed AI; self-host/Codex post-validation.
- **Three primary success metrics**: new-user → first PDF export rate; AI acceptance rate;
  7-day second-session return.
- **Recommended first tranche**: Tranche A (T171 rewrite + T-N01/T-N02/T-N03/T-N12 + T177–T179 +
  T087/T121), running with Tranche B.
- **Generated document**: `specs/001-import-resume/mvp-roadmap-proposal.md`.
- **Compliance**: no production code modified; no task checkbox changed; `.local-play/` artifacts
  are git-ignored; `git diff --check` clean (see validation below).
