# Implementation Plan: Import Existing Resume

**Branch**: `main` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-import-resume/spec.md`

## Summary

Build Nuvitae's import-first onboarding feature for authenticated users who upload an existing PDF or DOCX resume. The feature validates the document, runs deterministic extraction first, creates a temporary review draft only from explicitly sourced fields, flags uncertainty for review, and creates structured resume data only after explicit user confirmation. Source documents and source-reconstructing artifacts remain separate from the structured resume and are deleted no later than 7 days after the original upload.

The repository currently contains specifications and architecture decisions, not application source. This plan therefore defines the initial application/service structure required to implement the feature in a Nuvitae-owned architecture, consistent with the accepted hybrid foundation ADR and [ADR 0002](../../docs/adr/0002-container-only-development.md).

The implementation plan adopts a container-only workflow for development, build, test, database, queue, parsing, migration, and runtime commands. This is required for reproducibility, host independence, dependency isolation, parser security, CI parity, and easier self-hosting across Windows with WSL 2, Linux, and macOS.

## Technical Context

**Language/Version**: TypeScript on pinned Node.js 20+ executed only inside Docker images for web, API, workers, domain packages, and extraction orchestration.

**Primary Dependencies**: Next.js App Router, React, and strict TypeScript for `apps/web`; NestJS with the default Express platform for the REST-first `apps/api`; NestJS standalone application plus BullMQ for `apps/worker`; Zod runtime schemas in `packages/contracts`; TypeORM with `@nestjs/typeorm`, the PostgreSQL `pg` driver, TypeORM migrations, and the Data Mapper pattern in shared `packages/persistence`; PostgreSQL for relational domain state; private object storage for source documents and derived artifacts; Redis-compatible queue/rate-limit backend for processing jobs; PDF.js (`pdfjs-dist`) for deterministic PDF page counting and text extraction with page and coordinate provenance; a DOCX adapter using `yauzl` plus `fast-xml-parser` for Office Open XML text extraction with package/paragraph/run provenance; isolated LibreOffice headless conversion to PDF only for DOCX rendered-page-count validation; optional provider-independent AI classifier adapter after deterministic extraction. All application dependencies are installed and executed in containers.

**Storage**: PostgreSQL for users, imported documents, import drafts, warnings, extracted fields, structured resumes, deletion jobs, and audit events. PostgreSQL runs as a Compose service in development and test. Phase 1 uses a Docker-managed named volume as the local private storage implementation for uploaded files and temporary source-reconstructing artifacts, with keys scoped by user/import and retention deadline. The named private-storage volume is mounted only into services that require private source/artifact access. A managed-cloud S3-compatible storage adapter remains a later implementation boundary and is not introduced during bootstrap. The Redis-compatible queue/rate-limit backend runs as a Compose service.

**Testing**: Unit tests for domain validation and extraction mapping; integration tests for upload validation, processing state transitions, authorization, retention, deletion, and confirmation; contract tests for API/UI flows; fixture-based extraction tests for English, French, bilingual, hostile, unsupported, partial, and timeout cases; accessibility checks for keyboard, screen-reader state announcements, focus, labels, and non-colour warnings. Lint, format, typecheck, unit, integration, browser, accessibility, fixture, parser, migration, and build checks run through Docker Compose, with Playwright browsers supplied by a dedicated test image or test stage.

**Target Platform**: Web application with server-side API and background worker suitable for self-hosted and managed cloud deployments.

**Project Type**: Full-stack web application plus background processing service.

**Performance Goals**: Accepted uploads either reach review or a recoverable timeout state within 3 minutes. Supported documents are limited to 10 MB and 5 rendered pages. At least 90% of supported uploads with one explicitly sourced supported field produce a reviewable partial or complete extraction.

**Constraints**: Authentication required before upload; PDF/DOCX only; French, English, and bilingual French-English only; selectable text required; deterministic extraction required before optional AI; no structured resume creation from inferred-only data or abruptly terminated partial parser output; all warnings must be addressed before confirmation; source and source-reconstructing artifacts deleted within 7 days of original upload; source deletion does not delete confirmed structured resumes; raw source content, credentials, and full resumes must not be logged. Developers must not install or execute Node.js, npm, pnpm, PostgreSQL, Redis, LibreOffice, Playwright browsers, PDF/DOCX libraries, linters, formatters, compilers, or test runners on the host for Nuvitae work.

**Initial Configurable Resource Limits**: Maximum uploaded file size 10 MB; maximum rendered length 5 pages; maximum foreground processing duration 3 minutes; maximum parser-process memory 512 MiB; maximum per user 1 active processing job and 2 queued processing jobs; maximum 5 upload or processing-start attempts per rolling 10-minute window per authenticated user. Limits must be configurable by environment but must not be disabled in production. Rate or concurrency limit responses reject the operation, return a rate-limit response such as HTTP 429, include `Retry-After` where applicable, and show a plain-language recovery message. Parser memory and timeout enforcement terminate the isolated parser process, clean up files and source-reconstructing artifacts for the failed attempt, and offer retry, replacement upload, and manual-entry recovery. Memory-limit breaches must not create an import review draft from partial output produced before termination.

**Container Workflow**: The only supported host prerequisites are Docker, Git, GitHub CLI, and the chosen coding agent. Development uses a pinned `workspace` image with Node.js, Corepack, pnpm, and shared developer tools. Source code is mounted into `/workspace` inside development containers, while dependency caches, pnpm store, and `node_modules` live in Docker-managed volumes. Production uses separate non-root web, API, and worker images or stages. LibreOffice headless and parser dependencies run only in the worker image or an isolated parser image. Development and CI use the same Dockerfiles and Compose definitions wherever practical. Known trade-offs are slower cold builds, Docker Desktop file-watch behavior, cache and volume management, image maintenance, and WSL 2 integration considerations.

**Scale/Scope**: First product feature for resume creation onboarding. Scope covers upload, validation, processing, review, confirmation, cancellation, retry, source deletion, expiry, and a real manual-entry route at `/resumes/new/manual`. It excludes job-description adaptation, AI rewriting, templates, final PDF generation, ATS scoring, cover letters, job tracking, payments, subscriptions, and automatic applications.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Non-technical UX**: PASS. The user flow is visual, guided, and excludes JSON, YAML, prompts, provider names, model names, parser internals, and configuration details.
- **Import-first onboarding**: PASS. Import is the primary create-resume path while manual entry remains available.
- **Structured source of truth**: PASS. Imported content enters an import draft; structured resume data is created only after explicit confirmation. Uploaded source files stay distinct and immutable.
- **Deterministic rendering**: PASS. This feature does not generate final documents or change rendering. It preserves structured section relationships needed by later deterministic rendering.
- **AI reviewability and provenance**: PASS. Optional AI is limited to classification and ambiguity warnings after deterministic extraction; all AI-influenced fields remain reviewable and require confirmation.
- **Protected templates**: PASS. Template source, template configuration, PDFs, and rendering components are out of scope.
- **Human and ATS readability**: PASS. The plan preserves structured role, employer, date, location, education, skill, language, project, certification, and link relationships for later rendering.
- **Security and privacy**: PASS. Authorization, upload validation, hostile document handling, private storage, isolation, rate limits, logging limits, retention, and deletion are first-class design requirements.
- **Provider independence and no-AI usability**: PASS. Deterministic extraction is required and can complete review without any AI provider.
- **Accessibility and recovery**: PASS. Upload, progress, review, warning, confirmation, cancellation, retry, deletion, and failure states include accessibility and recovery requirements.
- **Quality gates**: PASS. Required tests, fixture evaluations, security checks, accessibility checks, documentation, and failure-state validation are identified in research and quickstart.

## Project Structure

### Documentation (this feature)

```text
specs/001-import-resume/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── import-resume.md
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── web/
│   ├── src/
│   │   ├── app/
│   │   │   └── **/page.tsx
│   │   ├── features/import-resume/
│   │   ├── components/
│   │   └── services/
│   └── tests/
├── api/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── health/
│   │   ├── import-resume/
│   │   └── auth/
│   └── tests/
└── worker/
    ├── src/
    │   ├── main.ts
    │   ├── worker.module.ts
    │   └── import-resume/
    └── tests/

packages/
├── contracts/
│   └── src/
├── domain/
│   └── src/resume-import/
├── extraction/
│   └── src/
├── persistence/
│   ├── src/
│   │   ├── data-source.ts
│   │   ├── typeorm-options.ts
│   │   ├── entities/
│   │   ├── repositories/
│   │   ├── mappers/
│   │   ├── migrations/
│   │   └── index.ts
├── storage/
│   └── src/
└── test-fixtures/
    └── resume-import/

tests/
├── contract/
├── integration/
├── accessibility/
└── security/
```

**Structure Decision**: Use a Nuvitae-owned full-stack TypeScript monorepo with `apps/web` as a Next.js App Router application using `src/app`, `apps/api` as a NestJS REST API on Express, `apps/worker` as a separate NestJS standalone BullMQ worker, and separate contracts, domain, extraction, persistence, storage, and fixture packages. Product routes in the web app use `app/**/page.tsx`; `apps/web/src/main.tsx` is not part of the plan. The API bootstrap uses `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, and NestJS controllers/services; `apps/api/src/server.ts` is not part of the plan. Shared TypeORM DataSource configuration, entities, repositories, mappers, and migrations live in `packages/persistence`, not `apps/api/src/db`, whenever API and worker access is required. The API uses `TypeOrmModule.forRootAsync` or an equivalent asynchronous configuration, `TypeOrmModule.forFeature` where appropriate, environment-validated PostgreSQL configuration, injectable repository abstractions or persistence services, and database health checks that do not expose secrets. The worker uses the same persistence package and compatible TypeORM DataSource configuration, does not import API implementation modules, and acknowledges queue jobs only after required persistence operations succeed. The domain package must not depend on Next.js, NestJS, Zod transport schemas, TypeORM, PostgreSQL drivers, database decorators, or BullMQ. TypeORM entities are persistence models, not business-domain entities; explicit mappers convert persistence rows before they enter the domain layer. Reactive Resume and Resuml remain references only, not imported runtime foundations.

### Container Artifacts (repository root)

```text
Dockerfile or docker/dev/Dockerfile
docker/
├── web/Dockerfile
├── api/Dockerfile
├── worker/Dockerfile
├── test/Dockerfile
└── entrypoints/
compose.yml
compose.dev.yml
.dockerignore
```

**Container Structure Decision**: Phase 1 tasks must define the Docker-first monorepo bootstrap before application feature work starts. Planned artifacts include a pinned workspace image; multi-stage or distinct production images for the Next.js web app, NestJS API, and NestJS standalone worker; Docker build inputs for `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/extraction`, `packages/persistence`, `packages/storage`, and `packages/test-fixtures`; a dedicated Playwright test image or stage in `docker/test/Dockerfile`; Compose services for PostgreSQL, Redis-compatible queue, a Docker-managed named `private-storage` volume mounted only into services that require private source/artifact access, Docker-managed pnpm store and `node_modules` volumes, health checks, non-root runtime users, entrypoints, and container-based lint, format, typecheck, test, migration, and build commands. Phase 1 must not introduce an additional local S3-compatible server; the managed-cloud S3-compatible adapter remains a later implementation boundary. These files are design/planning targets only in this phase and must not be implemented until implementation work begins.

**Migration Decision**: TypeORM migrations are versioned and run only through project-local tooling inside Docker, using commands such as `docker compose run --rm workspace pnpm db:migration:generate`, `docker compose run --rm workspace pnpm db:migration:create`, `docker compose run --rm workspace pnpm db:migration:run`, `docker compose run --rm workspace pnpm db:migration:revert`, and `docker compose run --rm workspace pnpm db:migration:show`. `synchronize` must be false outside explicitly disposable test databases, and application startup must not silently mutate production or shared development schemas.

## Complexity Tracking

No constitutional violations or exceptions are required.

## Phase 0 Research

See [research.md](./research.md).

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/import-resume.md](./contracts/import-resume.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **Non-technical UX**: PASS. Contracts expose plain-language states and user actions, with technical details kept behind service boundaries.
- **Import-first onboarding**: PASS. The first contract starts from resume creation and makes import the recommended path.
- **Structured source of truth**: PASS. The data model separates `ImportedDocument`, `DerivedExtractionArtifact`, `ImportDraft`, and `StructuredResume`.
- **Deterministic rendering**: PASS. No rendering behavior is modified; structured output preserves relationships for later rendering.
- **AI reviewability and provenance**: PASS. `ExtractedField.sourceStatus`, `inferenceStatus`, `reviewStatus`, and `ImportWarning` force reviewable provenance.
- **Protected templates**: PASS. No template files, configuration, or PDF output contracts are introduced.
- **Human and ATS readability**: PASS. Work experience roles, dates, sections, and explicit source provenance are modeled.
- **Security and privacy**: PASS. Ownership, retention, deletion, rate limiting, hostile document isolation, and log exclusions are in contracts and validation scenarios.
- **Provider independence and no-AI usability**: PASS. Contracts require deterministic extraction paths and optional AI degradation.
- **Accessibility and recovery**: PASS. UI contracts include accessible labels, live status announcements, keyboard operation, focus recovery, and recovery actions.
- **Quality gates**: PASS. Quickstart defines validation scenarios for happy path, partial extraction, failure, security, privacy, retention, and accessibility.
