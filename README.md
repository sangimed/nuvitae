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

### Development Stack

Start PostgreSQL and the queue, run the explicit migration operation, then
start the application services:

```bash
docker compose up -d postgres queue
docker compose run --rm workspace pnpm db:migration:run
docker compose up -d web api worker
docker compose up --wait
```

Application startup never runs migrations. Both `synchronize` and
`migrationsRun` remain `false`, so deployments must complete the migration step
before starting or updating API and worker instances.

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

Format files through Docker when needed:

```bash
docker compose run --rm workspace pnpm format
```

The API and worker both use the shared TypeORM Data Mapper persistence package
for validated environment configuration, entities, migrations, repositories,
and transactions. They do not carry application-specific entity lists or create
independent data sources. `synchronize` and automatic migration execution are
always disabled.

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

The current import foundation does not expose a product upload route or resume
import controller.

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

### Reset Volumes

This removes dependency caches, `node_modules`, PostgreSQL data, queue data, and
private local storage data. It is destructive for local Docker-managed data:

```bash
docker compose --profile tools --profile test down --volumes
docker compose build
docker compose run --rm workspace pnpm install --frozen-lockfile
docker compose up --wait
```
