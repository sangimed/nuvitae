# Quickstart: Import Existing Resume Validation

This guide defines container-only validation scenarios for the import feature. It
assumes implementation tasks will create the Next.js web app, NestJS REST API,
NestJS standalone BullMQ worker, shared contracts, persistence, storage,
database, queue, fixture packages, Dockerfiles, Compose files, and test images
described in [plan.md](./plan.md).

## Prerequisites

- Docker.
- Git.
- GitHub CLI.
- The chosen coding agent.

Do not install Node.js, npm, pnpm, PostgreSQL, Redis, LibreOffice, Playwright
browsers, PDF/DOCX libraries, linters, formatters, compilers, or test runners on
the host for Nuvitae development.

## First Start

Build all planned images:

```bash
docker compose build
```

Start infrastructure, run migrations explicitly, then start the application:

```bash
docker compose up -d postgres queue
docker compose run --rm workspace pnpm db:migration:run
docker compose up -d web api worker
docker compose up --wait
```

The planned stack includes Next.js web, NestJS API, NestJS standalone worker,
PostgreSQL, Redis-compatible queue, shared contracts and persistence packages,
and a Docker-managed named private-storage volume for local private source and
artifact storage. Source code is mounted into `/workspace` inside development
containers. Dependency caches, pnpm store, `node_modules`, database data, queue
data, and local private-storage data use Docker-managed volumes. The
private-storage volume is mounted only into services that require private
source/artifact access.

## Dependency Installation

Install application dependencies inside the `workspace` service:

```bash
docker compose run --rm workspace pnpm install
```

No application dependency is installed globally on the host.

## Development

Run development commands through the `workspace` service:

```bash
docker compose run --rm workspace pnpm dev
```

If a long-running development process is needed alongside services, keep
`docker compose up` running in a separate terminal.

## Lint

```bash
docker compose run --rm workspace pnpm lint
```

## Format

```bash
docker compose run --rm workspace pnpm format
```

## Typecheck

```bash
docker compose run --rm workspace pnpm typecheck
```

## Unit Tests

```bash
docker compose run --rm workspace pnpm test
```

## Deterministic Source Preparation Tests

The active V1 PDF.js PDF extraction and streaming Office Open XML DOCX extractor
are tested with deterministic, in-memory synthetic document generators. These
tests validate physical text extraction, page/rendered-page limits, source
locations, and the V1 provider-ready source representation. They do not assert
that deterministic code owns full semantic resume reconstruction when a usable
AI provider is connected. The future Document Understanding Layer and
Current Extractor versus Docling benchmark are research-only and are not part
of these commands:

```bash
docker compose run --rm workspace pnpm exec vitest run packages/extraction/src/pdf/pdfjs-pdf-adapter.test.ts
docker compose run --rm workspace pnpm exec vitest run packages/extraction/src/docx/ooxml-docx-adapter.test.ts
docker compose run --rm workspace pnpm exec vitest run packages/extraction/src/isolated-parser-runner.test.ts
```

PDF provenance uses one-based pages and zero-based item/global-order indexes
with PDF-point geometry. DOCX provenance uses zero-based package-part paragraph,
table, row, cell, run, character-offset, and global-order indexes. DOCX does
not infer visual pages or rendered coordinates. Image-only/scanned PDFs are
rejected because OCR is not implemented.

## Codex Direct-OAuth Compatibility Spike

Before any production Codex adapter implementation, run the bounded direct-OAuth
compatibility spike from [plan.md](./plan.md). T189-T195 remains complete and
historical; its NO-GO applies only to the tested `codex app-server` 0.146.0
ChatGPT-managed authentication candidate. The new spike evaluates this distinct
architecture:

```text
Nuvitae worker
→ ResumeSemanticParserProvider
→ CodexDirectProviderAdapter
→ isolated CodexOAuthBroker
→ OpenAI-hosted OAuth
→ direct Codex ChatGPT transport
```

The spike is accepted only when it records evidence for the following, in order:

1. Upstream and licensing audit.
2. Security and token-ownership design.
3. OAuth login proof.
4. Token persistence, refresh, logout, and deletion proof.
5. Minimal direct Codex backend invocation with synthetic input.
6. Structured resume parsing with synthetic fixtures.
7. Security, quality, failure, and compatibility evaluation.
8. Final GO, CONDITIONAL GO, or NO-GO.

Required upstream audit evidence:

- Exact pinned commit SHAs for OpenClaw and Hermes Agent.
- Exact official OpenAI Codex documentation/source revisions where relevant.
- Exact OAuth flow, client identifier, authorization endpoint, token endpoint,
  callback behavior, PKCE and state handling, requested scopes, and originator
  parameters.
- Token refresh, credential storage, logout behavior, Codex transport/base URL,
  required request headers, and account identity extraction.
- License and attribution obligations.
- Differences between OpenClaw and Hermes.
- Explicit confirmation that no upstream code was copied before license review.

Required supportability classification:

- Officially documented OpenAI behavior.
- Behavior verified from official source code.
- Behavior used by OpenClaw or Hermes.
- Undocumented compatibility behavior.
- Experimentally verified Nuvitae behavior.
- Inference.

Treat the direct ChatGPT Codex backend as undocumented or
compatibility-sensitive unless an official source explicitly documents it for
third-party use.

Required broker validation:

- PKCE verifier and challenge generation.
- OAuth state generation and validation.
- Local loopback callback.
- Authorization-code exchange.
- Encrypted access-token and refresh-token storage proof.
- Access-token refresh proof.
- Logout and local deletion proof.
- Privacy-safe connection status.
- Codex provider request execution.
- Provider-neutral result return.
- Threat-model comparison of dedicated Docker service, isolated worker-side
  process, and another bounded infrastructure component.

Required credential-storage validation:

- Dedicated encrypted credential store.
- Master encryption key supplied as Docker secret or environment secret.
- Authenticated encryption.
- Restrictive filesystem permissions.
- One credential namespace per Nuvitae owner.
- Atomic writes.
- Rotation and deletion.
- No plaintext credentials in PostgreSQL unless explicitly encrypted.
- No credentials in image layers, logs, fixtures, Git, browser storage, queue
  payloads, or backups without documented encryption.
- No production credential persistence implemented during the first auth spike.

Required backend invocation validation:

- Exact upstream request-shape audit.
- Fail-closed host and path allowlist.
- No arbitrary base URL.
- No redirects to unapproved hosts.
- Bounded response size.
- Timeout and cancellation.
- Rate-limit handling.
- Token refresh on authorized failure categories only.
- Synthetic prompts before any resume content.
- No production integration until supportability and stability are reviewed.

Required semantic validation after authentication and minimal invocation
succeed:

- Structured Nuvitae-owned output.
- Schema validity.
- Source evidence.
- Grounding.
- No invention.
- French, English, bilingual, single-column, and multi-column synthetic
  fixtures.
- Latency.
- Cancellation.
- Quota behavior.

Token-blind surfaces:

- Web application.
- Browser storage.
- Import domain.
- API controllers.
- Regular worker jobs.
- Database domain entities.
- Semantic extraction contracts.
- Logs and diagnostics.

Use only synthetic anonymous source-text fixtures prepared from synthetic PDF
and DOCX examples where useful. Preserve source identifiers needed for evidence
validation. Do not add production provider behavior until the direct-OAuth
decision gate records GO or qualifying CONDITIONAL GO.

LibreOffice is installed only in the worker and the network-disabled,
non-root, one-shot parser test image. Host LibreOffice is not supported:

```bash
docker compose build parser-test
docker compose run --rm parser-test
```

LibreOffice uses `--headless`, `--nologo`, `--nodefault`, `--nolockcheck`,
`--nofirststartwizard`, `--norestore`, a unique `UserInstallation` profile, a
generated `input.docx` name, and an isolated output directory. The parent
runner invokes commands without a shell, supplies an allow-listed environment,
enforces a three-minute timeout, and terminates the detached process group with
`SIGTERM` followed by bounded `SIGKILL` escalation.

The 512 MiB parser ceiling is Linux `prlimit --as` (`RLIMIT_AS`) inherited by
descendants. It limits process virtual address space rather than claiming
cgroup-level resident-memory enforcement and fails closed when unavailable.
Parser output is staged and atomically committed only after successful exit,
path confinement, symlink checks, expected-output validation, and cleanup.
Cancellation, timeout, conversion failure, or invalid output leaves no
committed partial output and preserves an existing valid final output.

The worker/parser image is larger because it contains the minimum LibreOffice
Writer runtime and basic fonts. No API/web image contains LibreOffice, no
Docker socket or privileged mode is used, and no parser HTTP service exists.
With T099 through T102 validated, every Phase 2 foundational task is complete;
Phase 3 and later user-story work remains outside this implementation.

## Integration Tests

Run integration tests against the Compose-managed PostgreSQL,
Redis-compatible queue, worker, API, and named private-storage volume:

```bash
docker compose run --rm workspace pnpm test:integration
```

## Browser And Accessibility Tests

Browser and accessibility tests must run in the containerized Playwright test
environment built from `docker/test/Dockerfile`:

```bash
docker compose build test
docker compose run --rm test pnpm test:browser
docker compose run --rm test pnpm test:a11y
```

The Playwright browsers and browser binaries are provided by the planned test
image or test stage, not by a host installation.

## Migrations

Shared persistence migrations run through Compose and project-local tooling:

```bash
docker compose run --rm workspace pnpm db:migration:generate
docker compose run --rm workspace pnpm db:migration:create
docker compose run --rm workspace pnpm db:migration:run
docker compose run --rm workspace pnpm db:migration:revert
docker compose run --rm workspace pnpm db:migration:show
```

The commands call the package-local TypeORM CLI and shared DataSource. `show` is
read-only; `run` and `revert` mutate the configured database. `generate` and
`create` write disposable files below `.tmp/migrations` so they cannot overwrite
the committed initial migration. Do not use a globally installed TypeORM CLI or
host-side Node.js dependencies. `synchronize` and automatic migration execution
are always false. API and worker startup never runs migrations.

Persistence integration tests require `POSTGRES_TEST_DB` to end in `_test`.
Every suite uses a unique schema within that database and drops it during
cleanup:

```bash
docker compose run --rm workspace pnpm test:integration:persistence
```

## Build

```bash
docker compose run --rm workspace pnpm build
```

Production builds are expected to use the same Docker build definitions wherever
practical, with non-root runtime images or stages for web, API, and worker.

## Phase 1 Bootstrap Validation

Phase 1 bootstrap is accepted only when the following commands run without
host-side Node.js, npm, pnpm, application dependencies, Playwright browsers, or
service dependencies:

```bash
docker compose config
docker compose build workspace
docker compose build web api worker
docker compose build test
docker compose run --rm workspace pnpm install --frozen-lockfile
docker compose run --rm workspace pnpm format:check
docker compose run --rm workspace pnpm lint
docker compose run --rm workspace pnpm typecheck
docker compose run --rm workspace pnpm test
docker compose run --rm workspace pnpm build
docker compose up --wait
docker compose down
docker compose down --volumes
docker compose build
docker compose run --rm workspace pnpm install --frozen-lockfile
docker compose up --wait
docker compose down
```

Health verification must cover bootstrap liveness/readiness for the Next.js web
app, the NestJS API bootstrap health endpoint without database-aware TypeORM
health integration, NestJS standalone worker readiness without database
transaction integration, PostgreSQL service readiness, and queue service
readiness after `docker compose up --wait`. Typecheck, lint, unit/bootstrap
tests, and build validation must include `apps/web`, `apps/api`, `apps/worker`,
`packages/contracts`, `packages/domain`, `packages/extraction`,
`packages/persistence`, `packages/storage`, and `packages/test-fixtures`.

Phase 1 bootstrap validation explicitly excludes TypeORM migration generation,
TypeORM migration creation, TypeORM migration run, TypeORM migration revert,
TypeORM migration show, database-aware NestJS health integration, and API/worker
shared TypeORM DataSource validation.

## Integrated Persistence Validation

Run the final integrated persistence validation through Docker only:

```bash
docker compose run --rm workspace pnpm test:integration:persistence
```

The API and worker both call the shared persistence configuration and option
factories. `GET /health/live` is API process liveness; `GET /health` is
database-aware readiness and returns a generic HTTP 503 payload without
connection diagnostics when PostgreSQL is unavailable. The standalone worker
writes its readiness file only after its Nest context, queue bootstrap,
Nest-managed TypeORM data source, and `SELECT 1` probe succeed, and removes the
file during shutdown.

The worker persistence execution boundary resolves only after a transaction
commits and rejects after rollback, allowing future BullMQ processors to return
that promise without acknowledging a job before persistence succeeds. No
product queue processor, resume-import controller, or user-story persistence use
case is implemented yet.

Local Compose credentials are development-only defaults. Production
configuration must explicitly provide PostgreSQL host, user, password, and
database values. Application startup does not generate, run, or revert
migrations.

## Cleanup

Stop the stack without deleting named volumes:

```bash
docker compose down
```

## Resetting Volumes

Reset dependency caches, `node_modules`, database data, queue data, and local
private-storage data by removing Compose volumes:

```bash
docker compose down --volumes
docker compose build
docker compose run --rm workspace pnpm install
docker compose up
```

Use this when Docker-managed caches or local service data need a clean state.

## Validation Scenarios

> **Community V1 status:** T257, T212, T213-T218, and T258 are complete.
> T258 Attempt #3 passed the bounded Community owner → persisted Codex
> connection → one upload → one primary invocation → usable grounded review
> gate. Tranche 1 is complete; T219 completed on 2026-08-20. T220, T221,
> T222, and the planning-added T259 long-form evidence stability task are the
> independently executable next Tranche-2 tasks.
> The local-play identity is development-only; it must not be used as a
> Community sign-in substitute. The scenarios below describe the required
> authenticated behavior now available through that boundary.

### Community OAuth callback and real import closure (T258 complete)

T258 is a Tranche-1 gate, not a replacement for T246 or T235. Attempts #1 and
#2 are consumed as `QUALITY FAIL`. Attempt #1 proved owner auth,
cookie-free owner-bound OAuth callback, provider-ready state, one upload, one
primary invocation, canonical partial acceptance, and review availability, but
invalid redundant scalar evidence removed important Work/Education/headline
content. Attempt #2 reused the proven OAuth connection and again used exactly
one upload and one invocation; it reached review with 63 active fields and five
warnings, materially improving Work/Education group retention, but important
grounded scalars were semantically truncated and Summary was rejected. The
offline correction preserves strict grounding, restores safe continuations
across only contiguous normalized-empty extraction items/runs, forbids provider
semantic shortening, and explicitly separates long-form refs from scalar
continuation rules. Attempt #3 reused the already live-proven persisted Codex
connection and used exactly one upload and one primary provider invocation. It
reached review with 57 active fields and one warning; all four major Work groups
and all three major Education groups were materially retained, together with
expected contact fields, meaningful skills, and both source languages. No
fallback or material invention was observed. Summary remained rejected as not
grounded, and some optional-field projection remains incomplete, so exhaustive
field fidelity is not claimed. T258 is complete and Tranche 1 is complete. This
does not rerun or alter finalized-FAILED T246, qualify Codex globally, or change
T203's NO-GO. T219 later completed independently. T259 records the generic
long-form stability and grounded-semantic-uncertainty follow-up; it does not
reopen T258. T235 remains the later full-MVP install-to-PDF validation.

### 0. Manual Entry Draft

1. Start the API and web stack with migrations already run.
2. Visit `/resumes/new/manual`.
3. If signed out, verify the page shows an authentication-required state and no
   manual draft is created.
4. Establish the normal Community owner session and visit `/resumes/new/manual` again.
5. Verify one blank manual structured-resume draft is created or resumed with
   `source: manual_entry`, `status: editing`, all supported sections present,
   and personal, contact, work experience, education, skills, languages,
   projects, certifications, and professional links initially empty.
6. Edit personal information, contact information, headline, summary, work
   experience with multiple roles and ongoing-role state, education, skills,
   languages, projects, certifications, and professional links.
7. Save explicitly, refresh the page, and verify the same owner-scoped draft
   reloads from the draft UUID in the URL without using localStorage as the
   source of truth.
8. Open the same draft in two tabs, save in the first tab, then attempt to save
   stale content in the second tab.

**Expected Outcome**: Manual entry creates a dedicated unconfirmed manual draft,
not a confirmed `StructuredResume`. It creates no `ImportedDocument`, no
`ImportDraft`, no `DerivedExtractionArtifact`, no retention record, no source
storage key, and no BullMQ import job. Manual values are marked `user_added`
with `not_applicable` confidence, `not_inferred` inference, and no source
location. The editor announces save state, warns before leaving with unsaved
changes, supports keyboard operation, uses visible labels, and reports stale
conflicts without overwriting newer edits. The reusable section editor is shared
in shape for future import review, but Phase 4 import-review editing and warning
resolution are not implemented yet.

### 1. Happy Path Import

1. Start the stack with `docker compose up`.
2. Establish the normal Community owner session.
3. Start resume creation.
4. Verify import is presented as the recommended path and manual entry is available.
5. Upload a supported selectable-text PDF or DOCX under 10 MB and 5 rendered pages.
6. Verify plain-language progress states appear and are announced.
7. Verify review opens with grouped resume sections.
8. Confirm or edit every warning.
9. Confirm structured resume creation.

**Expected Outcome**: A structured resume is created only after explicit confirmation. Confirmed fields are marked with review/provenance status. The source document remains a separate temporary artifact with the original 7-day expiry.

### 2. Authentication Gate

1. Sign out.
2. Start resume creation and choose import.
3. Attempt to upload a file.

**Expected Outcome**: The app requires sign-in before accepting the file and does not create an imported document.

### 3. Partial Extraction And Timeout

1. Sign in as `user-a`.
2. Upload a fixture that can produce at least one supported candidate with required document evidence but cannot complete all sections within the processing limit.
3. Let processing reach the 3-minute foreground timeout.

**Expected Outcome**: The app shows threshold-qualified partial results, identifies missing or unprocessed sections, and offers retry, replacement upload, manual entry, and deletion/discard actions.

### 4. Validation Failures

Run the upload flow with unsupported, empty, corrupted, unreadable,
password-protected, image-only, oversized, over-page-limit, and
unsupported-language fixtures.

**Expected Outcome**: Each failure gives a non-technical reason and recovery actions. No review draft is created unless at least one supported candidate has required document evidence. Focus moves to an error summary.

### 5. Review Warning Resolution

1. Upload a fixture with duplicate contact data, ambiguous dates, conflicting employers, missing education fields, and inferred work-experience grouping.
2. Verify every uncertain, missing, duplicate, conflicting, inferred, and low-confidence item is marked as needing review.
3. Attempt confirmation before resolving warnings.
4. Resolve each warning by confirming, editing, excluding, or intentionally leaving it.

**Expected Outcome**: Confirmation is blocked until all warnings are addressed. After resolution, confirmation succeeds only if at least one supported field is user-confirmed.

### 5a. Long-Form Evidence Stability And Semantic Review Eligibility (T259 deterministic validation)

Use only independently constructed sanitized PDF/DOCX source representations
and deterministic provider-response fixtures. Exercise Summary, Work
responsibilities, Work achievements, and project descriptions across complete
single-fragment and ordered multi-fragment evidence; provably equivalent
evidence representations where the contract supports them; redundant refs;
partial, missing-intermediate, reordered, malformed, and ambiguous repeated-text
refs; normalized-empty continuation boundaries; long multi-sentence content;
and mixed valid/invalid siblings. Add metamorphic variants that rename fragment
IDs while preserving provenance/content, add unrelated fragments, remove
necessary evidence, and vary provider ref selection without manufacturing
provenance.

Separately exercise verified grounded values; fully grounded text with
ambiguous field classification, grouping, or genuinely ambiguous source
boundary; one invented token; a longer submitted value with only partial
evidence; a materially shortened submitted prefix/subset whose own characters
are grounded but whose claimed complete concept is deterministically
identifiable; invalid refs; repeated text with non-unique provenance; and
explicit user confirmation of an eligible review-required candidate.

**Expected Outcome**: Complete provably equivalent evidence has one stable
canonical result when equivalence is deterministically demonstrable. Fully
grounded semantic uncertainty may remain visibly review-required and inactive
until explicit user action only when deterministic evidence does not prove
material truncation of the claimed concept. Both partial evidence for a longer
submitted value and a materially truncated grounded submitted value remain
rejected/unusable. Deterministic reconstruction is allowed only when existing
evidence rules prove the complete value without guessing; otherwise recovery is
truthfully source-assisted or manual. Invented, invalid, unsupported, or
provenance-ambiguous values also remain rejected/unusable; provider text is not
shown as a warning-badged suggestion. No OAuth, provider call, upload, live
Semantic V2 run, benchmark, or private resume fixture is part of this scenario.

**Implemented deterministic result**: the long-form matrix uses the real
Summary, Work responsibility, Work achievement, and project-description paths.
The supported equivalence is a complete fragment cited once versus the same
complete fragment partitioned into ordered refs separated only by whitespace;
both produce identical canonical evidence. Complete consecutive fragments pass.
Partial-fragment values, missing/reordered/duplicate/overlapping/unsupported
refs, invented content, non-unique provenance, and deterministically incomplete
grounded prefixes fail closed. Evidence-linked section/group ambiguity retains
the complete candidate as inactive `inferred_needs_review` with field-bound
warning and canonical semantic provenance. Explicit confirmation is required
and audited. The deterministic sanitized corpus and the existing Semantic V2,
scalar-continuation, PDF/DOCX continuation, mapping, draft, and confirmation
regressions are the validation boundary; no live smoke is required.

### 6. Multiple Roles And Ongoing Role

1. Upload a fixture with one employer and multiple explicit roles.
2. Include an ongoing role with no end date.

**Expected Outcome**: Roles remain separate under the same employer. The ongoing role stores no end date and displays as "Present".

### 7. Provider-Backed Semantic Parsing

1. Connect the self-hosted Codex provider only after the direct-OAuth compatibility spike records GO or qualifying CONDITIONAL GO.
2. Upload supported French, English, bilingual, one-column, and multi-column PDF/DOCX fixtures.
3. Verify deterministic validation and source preparation complete before provider semantic parsing.
4. Verify the provider response is translated into the versioned Nuvitae extraction response.
5. Verify strict schema validation, evidence grounding validation, no-invention checks, and warning generation run before review opens.

**Expected Outcome**: Review opens only with grounded candidate fields and relationships. Every AI-produced value is unconfirmed, has required evidence, has explicit-versus-inferred classification and confidence category, and requires user review before structured resume creation.

### 7a. No Provider And Provider Failure Recovery

1. Run import with no configured provider.
2. Run import with provider disconnected, login cancelled, expired authentication, revoked authentication, provider unavailable, rate/quota exceeded, provider timeout, and malformed structured output states.
3. Verify each state is represented in API, worker, and UI contracts.

**Expected Outcome**: The product does not claim reliable full semantic parsing. It offers retry, reconnect, another configured provider if available, limited deterministic partial extraction where available, replacement upload where relevant, and manual entry.

### 8. Hostile Document Safety

1. Upload fixtures containing macros, scripts, active objects, unsafe links, hidden text, and prompt-injection instructions.
2. Verify validation/extraction handles them as untrusted document content.

**Expected Outcome**: No active content executes. Document instructions are not treated as application or AI instructions. Provider instructions remain system-controlled. Logs do not contain raw source content, provider payloads, credentials, session material, prompts, or unnecessary personal data.

### 9. Authorization Isolation

1. As `user-a`, upload a supported resume and reach review.
2. As `user-b`, attempt to access, resume, update, confirm, cancel, or delete `user-a`'s import resources.

**Expected Outcome**: Every cross-user action is denied without exposing `user-a`'s personal data.

### 10. Source Deletion And Retention

1. Create a structured resume from an import.
2. Delete the source document before the 7-day deadline.
3. Inspect the structured resume.
4. Run the retention job for an import older than 7 days.

**Expected Outcome**: Source document and all source-reconstructing artifacts are deleted. The structured resume remains available and contains only minimal non-sensitive provenance. Confirmation does not extend the original retention deadline.

### 11. Duplicate Uploads And Deletion Races

1. Upload the same supported source twice as the same user.
2. Verify each upload has a separate import id, draft state, rate-limit accounting, and retention deadline.
3. Start processing, then cancel or delete source while processing is active.
4. Repeat delete, cancel, discard, expiry, and retention cleanup actions after deletion is already scheduled.

**Expected Outcome**: Duplicate uploads do not merge drafts or share source-reconstructing artifacts. Cancellation and deletion are idempotent, stop future artifact commits where possible, preserve any separately confirmed structured resume, and never extend retention.

### 12. Source-Deleted Review Before Confirmation

1. Reach review with a threshold-qualified draft.
2. Delete the source document before confirming structured resume creation.
3. Return to the draft before the original expiry.

**Expected Outcome**: Review shows no raw snippets, page references, thumbnails, extracted raw text, cached parser output, or source-location previews. It may show saved field values, user corrections, warning states, and minimal non-sensitive provenance. Confirmation is possible only if warning resolution and at least one user-confirmed supported field remain valid without source artifacts; otherwise discard and manual entry are offered.

### 13. Accessibility Pass

Complete upload, validation failure, processing, timeout, review, warning
resolution, confirmation, cancellation, retry, and source deletion using the
containerized browser/accessibility test environment.

**Expected Outcome**: All controls have accessible names, focus is visible, status changes are announced, warnings do not rely on colour alone, error summaries receive focus, and dialogs restore focus logically.

## Required Test Groups

- Domain unit tests for state transitions, warning resolution, confirmation blocking, source deletion, duplicate uploads, deletion idempotency, and retention.
- Extraction fixture tests for supported languages, formats, provider-ready source representation, partial results, selectable-text requirements, no-supported-field failures, and hostile documents.
- Semantic parser provider tests for provider capability reporting, connection states, strict Nuvitae extraction response validation, evidence grounding, no-invention checks, malformed output, timeout, quota/rate/auth failures, and privacy-safe diagnostics.
- REST API/contract tests for authorization, provider connection/disconnect/reconnect, provider failures, rate limits, validation failures, retry, cancellation, deletion, and confirmation.
- Worker integration tests for deterministic source preparation, provider invocation boundary, timeout, cancellation, deletion verification, deletion races, and expired drafts.
- Persistence tests for TypeORM migrations, explicit transactions, database constraints, unique indexes, foreign keys, lifecycle constraints, repository ownership behavior, and domain/persistence mapper behavior.
- Accessibility tests for labels, keyboard operation, live regions, error focus, dialog focus restoration, and non-colour warning treatment.
- Logging/security tests proving raw resumes, source snippets, uploaded files, provider payloads, credentials, provider session material, prompts, tokens, and unnecessary personal data are not logged.
