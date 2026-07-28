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

Start the current bootstrap stack:

```bash
docker compose up --wait
```

Stop it without deleting Docker-managed data:

```bash
docker compose down
```

Current local service URLs and health expectations:

- Web: `http://localhost:3000`, health at `http://localhost:3000/health`
  returns `{"service":"web","status":"ok"}`.
- API: `http://localhost:3001`, health at `http://localhost:3001/health`
  returns `{"service":"api","status":"ok"}`.
- Worker: no product HTTP API; Docker health checks the worker readiness file.
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

TypeORM migrations, migration lifecycle commands, persistence entities, product
tables, and database-aware application health checks remain deferred. The
current API health endpoint is liveness-only and does not check PostgreSQL.

### Reset Volumes

This removes dependency caches, `node_modules`, PostgreSQL data, queue data, and
private local storage data. It is destructive for local Docker-managed data:

```bash
docker compose --profile tools --profile test down --volumes
docker compose build
docker compose run --rm workspace pnpm install --frozen-lockfile
docker compose up --wait
```
