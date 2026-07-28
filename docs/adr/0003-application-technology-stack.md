# Application Technology Stack

## Status

Accepted

Accepted date: 2026-07-28

## Context

ADR 0001 accepts a Nuvitae-owned hybrid architecture and ADR 0002 requires all
application tools and dependencies to be installed and executed only inside
Docker. Before Docker bootstrap begins, the concrete application framework stack
must be fixed so scaffolding, Docker build inputs, package boundaries, validation
commands, and future implementation tasks target the real application shape
rather than generic TypeScript placeholders.

## Decision

Nuvitae uses a TypeScript monorepo with separate web, API, worker, domain,
contracts, persistence, extraction, storage, and fixture package boundaries.

### Web Application

`apps/web` uses Next.js App Router, React, and strict TypeScript. It uses the
`src/app` convention. Product routes use `app/**/page.tsx`, and the minimum
bootstrap files are:

- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/next.config.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`

The visual resume editor may use client components where interactivity requires
them. Server-side rendering may be used for public pages and application-shell
pages. Next.js route handlers must not contain Nuvitae business logic, must not
replace the dedicated API, and must not make Next.js a second business backend.

### API Application

`apps/api` uses NestJS with the default Express platform. The API is REST-first,
and OpenAPI is generated through the NestJS OpenAPI integration. The minimum
bootstrap files are:

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/nest-cli.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/health/health.controller.ts`

GraphQL is not introduced. Controllers stay thin, and use-case logic belongs
behind providers and services.

### Worker Application

`apps/worker` is a separate NestJS standalone application. It uses BullMQ with
the Compose-managed Redis-compatible service and does not expose the main
product HTTP API. The minimum bootstrap files are:

- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/nest-cli.json`
- `apps/worker/src/main.ts`
- `apps/worker/src/worker.module.ts`

The worker orchestrates jobs. Hostile document parsing remains isolated behind
the later parser runner and must not execute directly inside queue handlers
without the required resource boundary.

### Persistence

PostgreSQL remains the primary database. Nuvitae uses TypeORM with the official
NestJS TypeORM integration through `@nestjs/typeorm`, the PostgreSQL `pg`
driver, TypeORM migrations, and the TypeORM Data Mapper pattern only. The shared
`packages/persistence` boundary is used by the API and worker. Planned files
include:

- `packages/persistence/package.json`
- `packages/persistence/tsconfig.json`
- `packages/persistence/src/data-source.ts`
- `packages/persistence/src/typeorm-options.ts`
- `packages/persistence/src/entities/`
- `packages/persistence/src/repositories/`
- `packages/persistence/src/mappers/`
- `packages/persistence/src/migrations/`
- `packages/persistence/src/index.ts`

Persistence schema targets that need worker access must live in
`packages/persistence`, not only under `apps/api`. The domain package must not
import TypeORM, NestJS, PostgreSQL drivers, database decorators, or the
persistence package. TypeORM entities are persistence models, not business-domain
entities, and persistence rows must be converted through explicit mappers before
entering the domain layer.

Architecture rules:

- Use the TypeORM Data Mapper pattern.
- Do not use Active Record entities.
- `synchronize` must be false outside explicitly disposable test databases.
- Production and shared development environments use versioned migrations.
- Application startup must not silently mutate production database schemas.
- Avoid lazy relations.
- Fetch plans and relations must be explicit.
- Transactions must be explicit for multi-record lifecycle operations.
- QueryBuilder may be used for complex PostgreSQL queries.
- Raw SQL may be used only behind the persistence boundary when justified and
  tested.
- Database constraints, unique indexes, foreign keys, and lifecycle constraints
  must be represented explicitly.
- TypeORM entities are persistence models, not business-domain entities.
- NestJS decorators and TypeORM decorators must not appear in `packages/domain`.
- Persistence rows must be converted through explicit mappers before entering
  the domain layer.
- Controllers and queue processors must not directly contain database query
  logic.

The persistence package may depend on TypeORM, `@nestjs/typeorm` where
NestJS-specific integration belongs, `pg`, `packages/domain` for mapping targets
only where architecture permits, and `packages/contracts` only when strictly
required at an application boundary.

### Contracts

Nuvitae adds `packages/contracts` using Zod runtime schemas. Contracts may be
shared by web, API, worker, and tests. Transport and persistence mappings must be
explicit. The domain package must not depend on Next.js, NestJS, Zod transport
schemas, TypeORM, PostgreSQL drivers, database decorators, or BullMQ.

### Boundaries

`apps/web` may depend on contracts but not API implementation modules.
`apps/api` and `apps/worker` may depend on domain, contracts, persistence,
storage, and extraction interfaces. `packages/domain` remains
framework-independent. `packages/extraction` remains independent from Next.js
and NestJS. NestJS decorators and DTOs must not leak into domain entities.
TypeORM entities must not leak into domain entities.

API integration uses `TypeOrmModule.forRootAsync` or an equivalent asynchronous
configuration, `TypeOrmModule.forFeature` for application-owned repositories and
entities where appropriate, environment-validated PostgreSQL configuration,
injectable repository abstractions or persistence services, and health checks
that verify database connectivity without exposing secrets.

Worker integration uses the same persistence package and compatible TypeORM
`DataSource` configuration as the API. The API and worker must not import
implementation modules from each other. Worker jobs may participate in explicit
transactions where needed, and queue acknowledgement happens only after required
persistence operations succeed.

### Docker

All frameworks and CLI tools remain installed and executed only inside Docker.
Nest CLI, Next.js, TypeORM tooling, BullMQ, Zod, and all package dependencies are
project-local pinned dependencies. Nothing is installed globally on the host.
The container-only workflow from ADR 0002 remains the only supported development,
build, test, migration, and runtime workflow.

Migration commands run through the workspace container against the Compose
PostgreSQL service. Planned project-local commands include:

- `docker compose run --rm workspace pnpm db:migration:generate`
- `docker compose run --rm workspace pnpm db:migration:create`
- `docker compose run --rm workspace pnpm db:migration:run`
- `docker compose run --rm workspace pnpm db:migration:revert`
- `docker compose run --rm workspace pnpm db:migration:show`

The exact package scripts may be finalized during bootstrap, but they must call
project-local TypeORM tooling inside Docker and must not require a globally
installed TypeORM CLI on the host or in the image. API and worker production
images contain only the runtime dependencies and artifacts they require.

## Decision History

- 2026-07-28: TypeORM replaced the initially proposed Drizzle choice before
  implementation. The change was made for stronger NestJS integration, shared
  API/worker usage, and lower delivery risk. No application code, migration
  code, package manifests, Dockerfiles, or Compose files existed when the
  decision changed.

## Rejected Alternatives

- Generic TypeScript web bootstrap with `apps/web/src/main.tsx`: rejected because
  the web app is Next.js App Router and must use `src/app`.
- Generic Node API service with `apps/api/src/server.ts`: rejected because the
  API is NestJS on Express with REST and generated OpenAPI.
- Vite for the product web app: rejected because Next.js App Router is the
  accepted web application framework.
- GraphQL: rejected for this bootstrap because the API is REST-first.
- API-owned persistence schema under `apps/api/src/db` for shared import state:
  rejected because API and worker both require the persistence boundary.
- Next.js business API routes: rejected because business use cases belong in the
  dedicated NestJS API and shared domain/service boundaries.
- Drizzle: rejected for now. Its lower-level SQL-like API is useful, but it does
  not currently justify additional NestJS integration work for this project.
- Prisma: rejected for now. Its generated client and separate schema language
  would add a new workflow without a sufficiently strong benefit for this
  project.

## Consequences

Docker bootstrap tasks must create and validate real framework scaffolding for
Next.js, NestJS API, NestJS standalone worker, shared Zod contracts, and shared
TypeORM persistence. Typecheck, lint, test, build, Docker image definitions, and
Compose build inputs must include `apps/web`, `apps/api`, `apps/worker`,
`packages/contracts`, and `packages/persistence` from the start.
