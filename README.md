# Nuvitae

Nuvitae is a visual, AI-native resume builder designed for non-technical users.

Its primary experience is:

1. Import an existing resume.
2. Review and correct the extracted information.
3. Improve and customize the resume visually.
4. Adapt it to a job description with AI-assisted, reviewable changes.
5. Export a professional, human-readable and ATS-readable PDF.

Nuvitae is not a "resume as code" product. Technical formats and AI-provider
configuration must remain outside the standard user journey.

The product is intended to support:

- a free self-hosted edition where users can connect their own AI assistant;
- a managed cloud edition with hosting and AI usage included.

## Docker Bootstrap

Development, dependency installation, checks, tests, builds, and runtime
services run through Docker Compose. The host workflow requires Docker, Git,
GitHub CLI, and the coding agent only.

### Nuvitae Community quick start

For a same-machine Community installation, use the generated configuration and
the loopback-only Compose deployment described in
[the Community installation guide](docs/community-installation.md). Community
uses production authentication for one installation owner; Local Play below is
a separate development-only mode.

Pinned bootstrap versions:

- Node.js Docker base: `node:24.15.0-bookworm-slim`
- pnpm package manager: `pnpm@11.15.1`
- PostgreSQL image: `postgres:17.10-alpine3.24`
- Redis-compatible queue image: `valkey/valkey:8.1.9-alpine3.24`
- Playwright test image: `mcr.microsoft.com/playwright:v1.62.0-noble`
- Next.js: `15.5.22`
- React: `19.2.8`
- NestJS: `11.1.28`
- TypeORM: `0.3.28`
- Zod: `4.4.3`

### Setup

Install dependencies only inside the workspace container:

```bash
docker compose build workspace
docker compose run --rm workspace pnpm install --frozen-lockfile
```

Do not install Node.js, npm, pnpm, PostgreSQL, Valkey/Redis, Playwright, NestJS
CLI, Next.js, TypeScript, or application dependencies on the host for Nuvitae
development.

### Local Playable Stack

Local play mode is a Docker-only development runtime for exercising the current
manual resume and import flows from a real browser. It uses PostgreSQL, Valkey,
BullMQ, the API, the worker, private storage, PDF parsing, DOCX OOXML parsing,
LibreOffice-rendered DOCX page counting, review, confirmation, and persistence.

Prerequisites on the host:

- Docker with Docker Compose.
- Git.
- GitHub CLI.
- The coding agent.

Start the playable stack:

```bash
./scripts/local-play-up.sh
```

Then open:

```text
http://localhost:3000
```

#### Connect Codex from an Amp Orb

Nuvitae uses Codex's device authorization flow, so no localhost callback or URL
editing is required. Select **Connect Codex** in Nuvitae: it opens the secure
OpenAI device page and displays a one-time code, which it also attempts to copy.
Enter the code on the OpenAI page. Nuvitae detects completion automatically.

Only the Nuvitae web portal is needed when running in an Amp Orb. Port 1455 is
not used. Treat the one-time code as short-lived authentication data: do not
paste it into issues, logs, docs, or chat.

Stop the stack without deleting Docker volumes:

```bash
./scripts/local-play-down.sh
```

`local-play-down.sh` removes local containers and the local network, but it does
not pass `-v`; PostgreSQL, queue, pnpm, node_modules, and private-storage
volumes are preserved. Data remains available after restarting the stack unless
you explicitly delete those volumes.

Local play mode sets `NUVITAE_LOCAL_PLAY_MODE=true` for the API and web
containers and uses one fixed development identity from server configuration.
This is not production authentication. The browser cannot choose or switch the
user by sending headers, query strings, or request-body owner IDs, and the API
refuses to start local play mode when `NODE_ENV=production`.

Supported current local flows:

- Open the home page and choose import or manual creation.
- Create, edit, save, reload, and continue a manual resume draft.
- Upload selectable-text PDF files.
- Upload supported DOCX files.
- Observe real queue-backed validation and extraction progress.
- Review, correct, and confirm imported fields.
- Explicitly create one `StructuredResume`.
- Reload a confirmed resume from the server.

Unsupported current flows:

- Production authentication, OAuth, passwords, sessions, billing, and account
  settings.
- Production Valkey rate-limit state.
- Source deletion execution, retention workers, retry/replacement upload,
  processing cancellation, and general deletion lifecycle orchestration.
- AI classification, OCR, PDF generation, templates, structured-resume editing,
  dashboards, and later user stories.

The browser calls the API through the same-origin `/api` prefix. Next.js
rewrites that prefix to the internal API service (`http://api:3001`) in Compose,
so browsers do not see internal hostnames and CORS is not required. Next.js does
not contain API business logic and does not connect to PostgreSQL.

For the Community Compose path, the API owns versioned migration execution at
startup (`NUVITAE_RUN_MIGRATIONS=true`). `local-play-up.sh` also runs migrations
explicitly through the workspace container before starting the application
services, so the development flow remains deterministic.

Inspect logs:

```bash
docker compose -f compose.yml -f compose.local.yml logs -f web api worker
```

Run the real non-mocked local-play browser suite after the stack is running:

```bash
docker compose \
  -f compose.yml \
  -f compose.local.yml \
  --profile test \
  run --rm playwright-test \
  pnpm exec playwright test \
  --config=playwright.local-play.config.ts \
  tests/e2e/local-play/local-play-flow.e2e.test.ts
```

Check service health:

```bash
curl http://localhost:3000/health
curl http://localhost:3001/health/live
curl http://localhost:3001/health
docker compose -f compose.yml -f compose.local.yml ps
```

Troubleshooting commands:

```bash
docker compose -f compose.yml -f compose.local.yml config
docker compose -f compose.yml -f compose.local.yml logs api worker
docker compose -f compose.yml -f compose.local.yml run --rm workspace pnpm db:migration:show
docker compose -f compose.yml -f compose.local.yml up -d postgres queue
docker compose -f compose.yml -f compose.local.yml up --wait
```

Destructive data reset, only when you intentionally want to erase local data:

```bash
# WARNING: this deletes local play PostgreSQL, queue, dependency, and private-storage data.
docker compose -f compose.yml -f compose.local.yml down -v
```

### Development Stack

Start PostgreSQL and the queue, run the explicit migration operation, then
start the application services:

```bash
docker compose up -d postgres queue
docker compose run --rm workspace pnpm db:migration:run
docker compose up -d web api worker
docker compose up --wait
```

TypeORM `synchronize` and the persistence default `migrationsRun` remain
`false`. The canonical Community Compose API explicitly enables its versioned
migration runner at startup; its worker never runs migrations. Development
commands may run migrations explicitly before starting services.

Stop it without deleting Docker-managed data:

```bash
docker compose down
```

Current local service URLs and health expectations:

- Web: `http://localhost:3000`, health at `http://localhost:3000/health`
  returns `{"service":"web","status":"ok"}`.
- API liveness: `http://localhost:3001/health/live` checks only the API
  process.
- API readiness: `http://localhost:3001/health` verifies the Nest-managed
  TypeORM data source with a minimal PostgreSQL probe and returns a generic HTTP
  503 response when PostgreSQL is unavailable.
- Worker: no product HTTP API; Docker checks a readiness file that is written
  only after the Nest context, queue bootstrap, TypeORM initialization, and
  PostgreSQL probe succeed. The file is removed during shutdown.
- PostgreSQL: internal Compose service `postgres`, checked with `pg_isready`.
- Queue: internal Compose service `queue`, checked with authenticated
  `valkey-cli ping`.

PostgreSQL and the queue are not published to the host by the default Compose
file. The `private-storage` volume is mounted only into API and worker services.

### Checks

Run bootstrap checks through Docker:

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
```

These are the same root-level validation commands enforced by CI. See the
[code quality gate guide](docs/development/quality-gates.md) for the tooling
decision, focused package commands, and policy for adding rules or packages.

Fix supported lint and formatting issues through Docker when needed:

```bash
docker compose run --rm workspace pnpm lint:fix
docker compose run --rm workspace pnpm format
```

The API and worker both use the shared TypeORM Data Mapper persistence package
for validated environment configuration, entities, migrations, repositories,
and transactions. They do not carry application-specific entity lists or create
independent data sources. `synchronize` is always disabled. The shared
persistence default keeps `migrationsRun` disabled; the Community API explicitly
opts into migration execution at startup, while the worker never does.

The defaults `nuvitae` / `nuvitae_dev_password` are local Compose development
credentials only. Production sets `NODE_ENV=production` and must explicitly
supply PostgreSQL host, user, password, and database values.

Run project-local migration tooling only through Docker:

```bash
docker compose run --rm workspace pnpm db:migration:show
docker compose run --rm workspace pnpm db:migration:run
docker compose run --rm workspace pnpm db:migration:revert
docker compose run --rm workspace pnpm db:migration:generate
docker compose run --rm workspace pnpm db:migration:create
```

`show` is read-only. `run` and `revert` mutate the configured database.
`generate` and `create` write disposable files under `.tmp/migrations`; they do
not overwrite the committed initial migration. Move and review an intentional
generated migration before committing it.

#### Pre-production schema evolution

Nuvitae is currently pre-production and its schema is under active iteration.
Fresh development and test schemas are built from the committed TypeORM
migration set, so the entities and that pre-production schema history must stay
consistent. Unless migration, upgrade, release, or compatibility behavior is
part of the task, an iterative entity change does not require another migration
file solely to preserve experimental history. Instead:

1. update the entities and deliberately revise the relevant canonical
   pre-production migration definitions;
2. update affected repositories, fixtures, contracts, and tests;
3. run the Docker persistence integration suite below to prove that migrations
   build a fresh schema matching the current model.

Do not enable TypeORM `synchronize`, bypass migration/schema tests, or blindly
delete or rewrite migration history. Migration generation remains available for
tasks that explicitly require a reviewed migration; generated files are only a
starting point and must be inspected before they join the committed history.

The integration suite's unique schemas in a database ending in `_test` are
inherently disposable and are removed by the suite. Local Play and Community
use named PostgreSQL volumes: normal shutdown preserves them, so do not assume
their data is disposable. Use the documented [Local Play destructive reset](#local-playable-stack)
only after a human intentionally confirms that all affected local data may be
erased. Never reset a Community or other database containing important user or
developer data; preserving such state requires an explicit reviewed forward
migration rather than editing the history already applied to it.

Before the first production or hosted release stores real user data, establish
a production database baseline and deliberately decide whether the
pre-production migration history is squashed, rebased into that baseline, or
retained. Once that baseline is established, normal production discipline
applies: every durable schema change receives a reviewed forward-compatible
migration and upgrade validation.

Persistence integration tests require `POSTGRES_TEST_DB` to end in `_test`.
They create a unique schema per suite, run migrations there, and drop the schema
afterward, leaving the development database schema untouched:

```bash
docker compose run --rm workspace pnpm test:integration:persistence
```

This integrated suite covers migration create/generate/show/run/revert,
API liveness and database readiness, privacy-safe readiness failure, worker
database-aware readiness, repository provider identity, and transaction
commit/rollback behavior. No resume-import controller, use case, or product
queue processor is implemented by this persistence wiring.

## Import Security Foundations

The current import foundation exposes the initial browser flow at
`/import-resume` plus the owner-scoped API boundaries needed by that slice.
Import is presented as the recommended resume-creation path. Manual entry is
visible as a secondary action and links to `/resumes/new/manual`, where the
current manual draft editor can create, edit, save, reload, and continue an
owner-scoped draft.

Supported uploads in this slice:

- PDF or DOCX only.
- French, English, or bilingual French-English resumes.
- 10 MB maximum.
- 5 rendered pages maximum.
- Selectable text required; scanned or image-only documents are not supported.

The server requires filename extension, declared MIME type, and PDF/DOCX binary
signature agreement before private persistence. The complete upload inventory,
resource ceilings, parser-isolation posture, and Community/hosted malware, CDR,
and moderation decisions are documented in
[`docs/security/upload-security.md`](docs/security/upload-security.md).

The web client uploads only after an explicit submit action, sends one
multipart `file` field without setting the multipart boundary manually, and does
not store source bytes in URLs, browser storage, cookies, analytics, or logs.
Selected filenames remain local UI state only. Server validation remains
authoritative.

After upload, the browser polls the owner-scoped
`GET /import-resume/:importId/status` endpoint. The endpoint runs the verified
principal guard before lookup, reads imports through owner-scoped repository
methods, and returns the same privacy-safe not-found status for missing and
wrong-owner imports. Browser code never reads PostgreSQL, BullMQ, Redis, or
Valkey directly.

Current public status outcomes are processing, draft-ready, partial extraction,
recoverable timeout, validation failure, terminal processing failure,
authentication required, connectivity lost, not found, expired, and cancelled.
Processing exposes only plain-language steps and known percentages when the
strict contract provides them. Queue progress is supplemental, schema-validated,
and cannot override terminal PostgreSQL lifecycle state.

The review-and-correction slice is available at
`/import-resume/:importId/review` after the owner-scoped status API reports a
draft-ready or partial-extraction result with a valid draft. The route reloads
through `GET /import-resume/:importId/review`; browser state and URLs never
carry field values, filenames, source locations, storage keys, or owner IDs.
Review mutations use `PATCH /import-resume/:importId/review` with one explicit
operation per request, an operation UUID for idempotency, and
`expectedReviewRevision` for optimistic concurrency.

Review responses group fields and warnings into personal, contact, headline,
summary, work experience, education, skills, languages, projects,
certifications, and professional links. Users can confirm, edit, remove, add,
complete missing information, exclude sections, resolve warnings, or
intentionally leave warnings. Provenance is reduced to safe public labels such
as imported page or document body, added by you, edited by you with safe
original provenance, or inferred grouping requiring confirmation. Raw snippets,
bounding boxes, offsets, parser details, filenames, storage keys, SQL errors,
and stack traces are not exposed or logged.

The imported source document remains immutable during review. Review completion
can move the draft to `ready_to_confirm`; the user must then explicitly choose
Create structured resume and confirm the dialog before
`POST /import-resume/:importId/confirm` creates a `StructuredResume`.
Confirmation requires an operation UUID, `expectedReviewRevision`, and
`explicitConfirmation: true`. Unknown keys, owner IDs, resume IDs, retention
deadlines, source locations, source statuses, review statuses, arbitrary
content, and browser-supplied field lists are rejected.

Confirmation is blocked when the draft is not owner-scoped to the principal,
is expired, is not `ready_to_confirm`, has unresolved required warnings, has no
confirmed or edited active field, still contains unconfirmed inferred fields,
or cannot be mapped without data loss. Confirmation is transactional and
idempotent: repeated or racing confirmations for one owner/source draft return
the existing structured resume and do not duplicate child rows. It preserves
the imported document, artifact, and draft retention deadlines and schedules no
deletion job.

The post-confirmation route is `/resumes/:resumeId`, backed by the read-only
`GET /structured-resumes/:resumeId` endpoint. The response contains confirmed
content plus safe provenance summaries only. `StructuredResumeProvenance` can
show labels such as created from reviewed initial resume, confirmed by you,
source retained temporarily until the original deadline, source no longer
available, added by you, edited by you, and originally imported from a page
while safe page provenance is available. It never shows raw snippets, bounding
boxes, offsets, storage keys, filenames, parser names, or queue/database
internals. A pure domain helper reduces source provenance to minimal imported
provenance after future source deletion without deleting or mutating the
structured resume content.

Unconfirmed drafts can be resumed by reloading
`/import-resume/:importId/review` before expiry. `POST
/import-resume/:importId/discard` requires an operation UUID,
`expectedReviewRevision`, and `explicitDiscard: true`; it marks an unconfirmed
review draft discarded and schedules one `user_discarded_import` deletion job.
Discard scheduling does not execute deletion synchronously, does not delete
source rows or artifact rows immediately, does not create a structured resume,
and does not delete an already confirmed structured resume.

Source deletion execution, retry/replacement upload, cancellation of active
processing, full deletion lifecycle orchestration, retention workers, AI, OCR,
PDF generation, resume templates, structured-resume editing, production
identity-provider integration, billing, and subscriptions remain intentionally
absent.

Accessibility coverage for this slice includes semantic choices, labelled file
input, associated upload/privacy guidance, keyboard activation, visible focus,
error focus, live status announcements, terminal-state recovery actions, and a
containerized Playwright coverage. Local play mode additionally supports a real
non-mocked stack for browser validation.

- API application code can use the provider-ready privacy logger with an
  injected sink. It preserves allow-listed operational identifiers and
  recursively replaces credentials, document content, prompts, files, contact
  data, arbitrary personal metadata, raw errors, and other unsafe values. Error
  stacks and driver diagnostics are never serialized.
- Authenticated application context is created only from a principal already
  verified by a future authentication adapter. Request headers, cookies, email
  addresses, and unverified JWT payloads are not identity sources. Ownership
  helpers use stable user IDs and deliberately return the same public not-found
  outcome for missing and wrong-owner resources.
- `@nuvitae/storage` provides private, volume-backed storage below an explicit
  root. Application-generated keys contain UUID owner/import scopes, an object
  kind, and a random 128-bit object ID; original filenames are not part of the
  key. Writes use restrictive permissions and a same-directory temporary file
  followed by atomic rename. The storage volume is not served by Next.js or a
  static-file handler.
- Signed storage references are internal API/worker coordination tokens, not
  public pre-signed URLs. They bind the private key, expiry, operation, and
  audience with HMAC-SHA-256, use an explicit signing secret and maximum TTL,
  and are verified with a constant-time signature comparison.
- Import attempt and concurrency rules consume validated processing-limit
  configuration and deterministic caller-supplied timestamps. The current code
  defines pure decisions and an atomic reservation/transition/rollback
  interface for five attempts per rolling ten minutes, one active job, and two
  queued jobs per user. It fails closed when state is unavailable. A future
  distributed Redis/Valkey adapter must implement the atomic store contract;
  no in-process production store, Redis adapter, or BullMQ business processor
  is included yet.

### Deterministic Document Parsers

`@nuvitae/extraction` now provides the final Phase 2 parser foundations. PDF
page counting and selectable-text extraction use the Node-compatible legacy
build of pinned `pdfjs-dist`. PDF provenance keeps the one-based page number,
zero-based PDF.js item index, zero-based global reading order, and PDF-point
geometry. Pages and text items retain PDF.js order; the adapter does not infer
resume fields or rewrite source wording. Fully scanned or image-only PDFs are
rejected because OCR is not implemented.

DOCX text extraction treats Office Open XML as an untrusted ZIP package. It
streams only recognized package parts, validates the main document content type
and relationship, rejects traversal, encryption, macros, malformed structures,
external non-hyperlink relationships, and configured ZIP/XML/text resource
limits, and never dereferences external relationships. Provenance uses
`word/document.xml`, zero-based paragraph,
table, row, cell, and run indexes, zero-based character offsets, and global
reading order. Rendered coordinates are not promised for DOCX.

DOCX rendered page counting runs LibreOffice only in the non-root worker image
or the network-disabled one-shot `parser-test` image. It uses a generated input
name, a unique profile, headless/non-interactive flags, an isolated output
directory, and PDF.js to count the converted PDF. Host LibreOffice is neither
required nor supported. Installing LibreOffice Writer, its core runtime, and
basic fonts increases the worker/parser image size; this is the accepted
trade-off for deterministic DOCX rendered-page validation without a parser
network service or Docker-socket access.

External parser commands run without a shell and without inheriting the full
environment. The parent enforces the three-minute timeout, terminates the
detached process group with `SIGTERM` followed by `SIGKILL`, and bounds stdout
and stderr independently without returning them in public failures. Linux
`prlimit` enforces 180-second CPU and 512 MiB address-space limits inherited by
descendants. These are process-level limits, not cgroup resident-memory limits;
the runner fails closed when `prlimit` is unavailable.

Parser output is written to a unique staging directory and atomically renamed
only after successful exit, confinement checks, expected-output validation, and
cleanup hooks. Failures, cancellation, timeout, malformed output, and symlink
escapes remove staging and preserve any existing final output. Inputs,
generated PDFs, LibreOffice profiles, and work directories are removed after
both success and failure.

Run deterministic fixture tests and the LibreOffice integration suite through
Docker:

```bash
docker compose run --rm workspace pnpm exec vitest run packages/extraction/src
docker compose build parser-test
docker compose run --rm parser-test
```

Fixtures are generated in memory from synthetic names and text with fixed
metadata. No generated documents are committed. Current limitations are no
OCR, no browser-side parsing, no semantic resume-field classification, and no
support for password-protected, macro-enabled, or active-content documents.
Recovery is represented only by stable typed parser failures; product upload
and recovery routes remain later user-story work.

All Phase 2 foundational tasks are complete. Phase 3 and later user-story work
has not been started by this parser-foundation change.

### Start Import Backend Slice

The first backend slice exposes `POST /import-resume` as an authenticated
`multipart/form-data` boundary with exactly one `file` field. Authentication
must already have been completed by a future credential-verifying adapter; the
Nest guard accepts only the existing symbol-backed verified principal and does
not trust identity-like headers, cookies, or unverified tokens.

After an atomic upload-attempt reservation, accepted PDF or DOCX bytes are
stored through the private-storage boundary before one `ImportedDocument` is
created in an explicit persistence transaction. The source object and document
record use application-generated owner/import scopes, and retention expires
exactly seven days after that upload starts. This slice does not validate page
count or selectable text, detect language, start extraction, enqueue processing,
create an import draft, or create a structured resume.

The feature module remains intentionally disconnected from `AppModule`.
Production wiring still requires both a real credential-verifying principal
adapter and a distributed atomic import-limit store. No fake production
authentication provider, header-based development identity, in-process
production limit store, or Redis/Valkey limit adapter is installed.

### Deterministic Extraction Slice

The T031 slice reads already-validated private PDF/DOCX content through the
existing concrete adapters and extracts only explicit, source-located evidence.
The conservative baseline recognizes English and French labels/headings for
identity, contact, headline, summary, experience, education, skills, languages,
projects, certifications, and professional links. It uses no AI or OCR and does
not persist a normalized fragment list. A draft requires at least one explicit
supported field with concrete PDF/DOCX provenance; otherwise processing fails
with replacement-upload and manual-entry recovery. Missing core evidence creates
reviewable partial warnings, while optional sections do not block a draft.
Finalization preserves the original retention deadline, is idempotent at one
draft per owner/import, and does not enqueue work or create a structured resume.
Queue/worker orchestration, progress routes, review UI, and the remaining User
Story 1 flow are intentionally later tasks.

### Reset Volumes

This removes dependency caches, `node_modules`, PostgreSQL data, queue data, and
private local storage data. It is destructive for local Docker-managed data:

```bash
docker compose --profile tools --profile test down --volumes
docker compose build
docker compose run --rm workspace pnpm install --frozen-lockfile
docker compose up --wait
```
