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

Start the local stack:

```bash
docker compose up
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

After shared persistence, API TypeORM integration, and worker TypeORM
integration are implemented, run TypeORM database migrations through Compose and
project-local tooling:

```bash
docker compose run --rm workspace pnpm db:migration:generate
docker compose run --rm workspace pnpm db:migration:create
docker compose run --rm workspace pnpm db:migration:run
docker compose run --rm workspace pnpm db:migration:revert
docker compose run --rm workspace pnpm db:migration:show
```

The exact package scripts may be finalized during persistence integration, but
they must call project-local TypeORM tooling inside Docker and use the Compose
PostgreSQL service. Do not use a globally installed TypeORM CLI or host-side
Node.js dependencies. `synchronize` must be false outside explicitly disposable
test databases. Migration lifecycle validation is not a Phase 1 bootstrap gate.

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

After T010 and T127-T133 are complete, run the final integrated persistence
validation through Docker only. This validation covers project-local TypeORM
migration generate/create/run/revert/show workflows against the Compose
PostgreSQL service, shared TypeORM DataSource configuration, `synchronize:
false`, API database connectivity health, worker database connectivity and
transaction integration, and complete Docker-only validation after persistence
integration.

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

### 1. Happy Path Import

1. Start the stack with `docker compose up`.
2. Sign in as `user-a`.
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
2. Upload a fixture that can produce at least one explicitly sourced field but cannot complete all sections within the processing limit.
3. Let processing reach the 3-minute foreground timeout.

**Expected Outcome**: The app shows threshold-qualified partial results, identifies missing or unprocessed sections, and offers retry, replacement upload, manual entry, and deletion/discard actions.

### 4. Validation Failures

Run the upload flow with unsupported, empty, corrupted, unreadable,
password-protected, image-only, oversized, over-page-limit, and
unsupported-language fixtures.

**Expected Outcome**: Each failure gives a non-technical reason and recovery actions. No review draft is created unless at least one supported field is explicitly sourced. Focus moves to an error summary.

### 5. Review Warning Resolution

1. Upload a fixture with duplicate contact data, ambiguous dates, conflicting employers, missing education fields, and inferred work-experience grouping.
2. Verify every uncertain, missing, duplicate, conflicting, inferred, and low-confidence item is marked as needing review.
3. Attempt confirmation before resolving warnings.
4. Resolve each warning by confirming, editing, excluding, or intentionally leaving it.

**Expected Outcome**: Confirmation is blocked until all warnings are addressed. After resolution, confirmation succeeds only if at least one supported field is user-confirmed.

### 6. Multiple Roles And Ongoing Role

1. Upload a fixture with one employer and multiple explicit roles.
2. Include an ongoing role with no end date.

**Expected Outcome**: Roles remain separate under the same employer. The ongoing role stores no end date and displays as "Present".

### 7. No-AI Operation

1. Disable optional AI assistance.
2. Upload a supported fixture with deterministic fields.

**Expected Outcome**: The user can complete review and create a structured resume from deterministic extraction alone.

### 8. Hostile Document Safety

1. Upload fixtures containing macros, scripts, active objects, unsafe links, hidden text, and prompt-injection instructions.
2. Verify validation/extraction handles them as untrusted document content.

**Expected Outcome**: No active content executes. Document instructions are not treated as application or AI instructions. Logs do not contain raw source content or unnecessary personal data.

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
- Extraction fixture tests for supported languages, formats, partial results, selectable-text requirements, no-supported-field failures, and hostile documents.
- REST API/contract tests for authorization, rate limits, validation failures, retry, cancellation, deletion, and confirmation.
- Worker integration tests for timeout, cancellation, deletion verification, deletion races, and expired drafts.
- Persistence tests for TypeORM migrations, explicit transactions, database constraints, unique indexes, foreign keys, lifecycle constraints, repository ownership behavior, and domain/persistence mapper behavior.
- Accessibility tests for labels, keyboard operation, live regions, error focus, dialog focus restoration, and non-colour warning treatment.
- Logging/security tests proving raw resumes, source snippets, uploaded files, credentials, prompts, tokens, and unnecessary personal data are not logged.
