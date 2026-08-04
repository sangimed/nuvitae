# Tasks: Import Existing Resume

**Feature Branch**: `main`

**Input**: Design documents from `specs/001-import-resume/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-resume.md, quickstart.md

**Tests**: Required by the feature specification and Nuvitae constitution for acceptance criteria, security/privacy, accessibility, failure states, provider independence, and optional AI behavior. All setup checks, lint, format, typecheck, unit, integration, browser/accessibility, migration, and build commands run through Docker Compose, using the `workspace` service unless a dedicated parser or test image is required.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Phase 1: Setup (Docker-First Shared Infrastructure)

**Purpose**: Create the Docker-first TypeScript monorepo skeleton, shared package boundaries, Compose services, container images, and test harness expected by the implementation plan. No task in this phase may require Node.js, npm, pnpm, PostgreSQL, Redis, LibreOffice, Playwright browsers, linters, formatters, compilers, or test runners on the host.

- [x] T001 Create monorepo workspace manifests with pinned package-manager configuration and container-only scripts covering `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/extraction`, `packages/persistence`, `packages/storage`, and `packages/test-fixtures` in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- [x] T002 Create Docker development workspace image definition with pinned Node.js, Corepack, pnpm, shared tools, `/workspace` working directory, and no host dependency assumptions in `docker/dev/Dockerfile`
- [x] T003 [P] Create production Docker image definitions or multi-stage targets for the non-root Next.js web runtime, NestJS API runtime, and NestJS standalone worker runtime in `docker/web/Dockerfile`, `docker/api/Dockerfile`, and `docker/worker/Dockerfile`
- [x] T004 [P] Create Compose service definitions for `workspace`, web, API, worker, PostgreSQL, Redis-compatible queue, a Docker-managed named `private-storage` volume mounted only into services that require private source/artifact access, Docker-managed pnpm store, and Docker-managed `node_modules` volumes in `compose.yml` and `compose.dev.yml`
- [x] T005 [P] Create Docker build context rules, container entrypoint targets for workspace, web, API, worker, parser, and test commands, and the dedicated Playwright test image definition in `.dockerignore`, `docker/entrypoints`, and `docker/test/Dockerfile`
- [x] T006 [P] Create application and package directory structure in `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/extraction`, `packages/persistence`, `packages/storage`, and `packages/test-fixtures`
- [x] T007 [P] Create minimum buildable real framework scaffolding with no resume-import business logic in Next.js files `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`; NestJS API files `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`; NestJS standalone worker files `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/nest-cli.json`, `apps/worker/src/main.ts`, `apps/worker/src/worker.module.ts`; shared package scaffolding `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/extraction/package.json`, `packages/extraction/tsconfig.json`, `packages/persistence/package.json`, `packages/persistence/tsconfig.json`, `packages/persistence/src/data-source.ts`, `packages/persistence/src/typeorm-options.ts`, `packages/persistence/src/entities`, `packages/persistence/src/repositories`, `packages/persistence/src/mappers`, `packages/persistence/src/migrations`, `packages/persistence/src/index.ts`, `packages/storage/package.json`, `packages/storage/tsconfig.json`, `packages/test-fixtures/package.json`, and `packages/test-fixtures/tsconfig.json`
- [x] T126 Configure and document Phase 1 container-only bootstrap validation requiring `docker compose config`, `docker compose build workspace`, `docker compose build web api worker`, `docker compose build test`, `docker compose run --rm workspace pnpm install --frozen-lockfile`, `docker compose run --rm workspace pnpm format:check`, `docker compose run --rm workspace pnpm lint`, `docker compose run --rm workspace pnpm typecheck`, `docker compose run --rm workspace pnpm test`, `docker compose run --rm workspace pnpm build`, application image builds, `docker compose up --wait`, bootstrap liveness/readiness for the Next.js web app, NestJS API bootstrap health endpoint without database-aware TypeORM health integration, NestJS standalone worker readiness without database transaction integration, PostgreSQL service readiness, queue service readiness, `docker compose down`, and documented clean-volume rebuild. This Phase 1 bootstrap validation explicitly excludes TypeORM migration generation, TypeORM migration creation, TypeORM migration run, TypeORM migration revert, TypeORM migration show, database-aware NestJS health integration, and API/worker shared TypeORM DataSource validation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared domain, persistence, storage, authorization, worker, logging, concrete extraction adapters, resource-limit enforcement foundations, and fixture foundations that all user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 Define import domain types and enums for imported documents, artifacts, drafts, fields, warnings, work experience, corrections, structured resumes, and deletion jobs in `packages/domain/src/resume-import/types.ts`
- [x] T009 Define domain validation helpers for upload limits, draft thresholds, warning review states, retention deadlines, and confirmation blocking in `packages/domain/src/resume-import/validation.ts`
- [x] T010 Define TypeORM Data Mapper persistence entities, database constraints, unique indexes, foreign keys, lifecycle constraints, explicit mappers, and repository interfaces for import and structured resume state in the shared API/worker persistence boundary at `packages/persistence/src/entities`, `packages/persistence/src/mappers`, and `packages/persistence/src/repositories`
- [x] T127 [P] Add TypeORM migration workflow tests for generate/create/run/revert/show commands using project-local tooling inside Docker and the Compose PostgreSQL service in `tests/integration/persistence/typeorm-migrations.integration.test.ts`
- [x] T128 [P] Add persistence tests for explicit transactions across multi-record import lifecycle operations in `tests/integration/persistence/import-lifecycle-transactions.integration.test.ts`
- [x] T129 [P] Add persistence tests for database constraints, unique indexes, foreign keys, retention lifecycle constraints, and `synchronize` disabled outside disposable test databases in `tests/integration/persistence/import-constraints.integration.test.ts`
- [x] T130 [P] Add repository ownership and domain/persistence mapper tests proving TypeORM entities do not leak into `packages/domain` and controllers/processors do not contain query logic in `tests/integration/persistence/repository-boundaries.integration.test.ts`
- [x] T011 [P] Implement privacy-safe logger with redaction for resumes, raw text, snippets, files, tokens, credentials, prompts, and unnecessary personal data in `apps/api/src/observability/privacy-logger.ts`
- [x] T012 [P] Implement authenticated user context and ownership guard utilities in `apps/api/src/auth/user-context.ts` and `apps/api/src/auth/ownership.ts`
- [x] T013 [P] Implement private object storage key policy and signed internal access helpers for the Docker-volume-backed local private storage implementation in `packages/storage/src/private-import-storage.ts`
- [x] T014 [P] Implement import rate-limit and concurrent-work guard interfaces for 5 attempts per rolling 10 minutes, 1 active job, and 2 queued jobs per user in `apps/api/src/services/import-resume/import-limits.ts`
- [x] T015 Implement Zod-backed background job payload contracts for validation, extraction, cancellation, retry, and deletion jobs in `packages/contracts/src/import-resume/jobs.ts`
- [x] T016 [P] Create deterministic extraction adapter interfaces for PDF, DOCX, language detection, page counting, selectable text, and source locations in `packages/extraction/src/adapters.ts`
- [x] T017 [P] Preserve the legacy optional AI classifier adapter interface as a superseded compatibility boundary that may emit only classifications and ambiguity warnings from deterministic extraction output and must not be used as the complete semantic parsing path in `packages/extraction/src/ai-classifier.ts`; provider-independent AI-first semantic parsing foundation is T146-T188, bounded official Codex app-server validation is T189-T195, direct Codex OAuth compatibility validation is T196-T203, and Codex-specific production tasks T164-T165 remain gated by a qualifying T203 decision whose mandatory security, credential lifecycle, invocation, and semantic evaluation conditions have been satisfied
- [x] T018 Create fixture manifest covering PDF, DOCX, French, English, bilingual, partial, unsupported-language, oversized, over-page-limit, malformed, corrupted, password-protected, image-only/scanned, mixed text-and-image, hostile, mixed-content, and no-supported-field resumes in `packages/test-fixtures/src/resume-import/manifest.ts`
- [x] T019 [P] Define Zod-backed REST response envelopes and plain-language error categories for import flows in `packages/contracts/src/import-resume/responses.ts`
- [x] T020 [P] Define web route shell and import feature state machine types in `apps/web/src/features/import-resume/state.ts`
- [x] T099 [P] Implement concrete PDF.js PDF extraction adapter for page count and text extraction with page, bounding-box, and text-item source-location provenance in `packages/extraction/src/pdf/pdfjs-pdf-adapter.ts`
- [x] T100 [P] Implement concrete DOCX Office Open XML extraction adapter with package part, paragraph/table/cell/run, and character-offset source-location provenance in `packages/extraction/src/docx/ooxml-docx-adapter.ts`
- [x] T101 [P] Implement isolated DOCX rendered-page-count validator that runs LibreOffice headless only inside the worker or parser container and uses PDF page counting in `packages/extraction/src/docx/libreoffice-rendered-page-count.ts`
- [x] T102 Implement isolated parser runner contract for worker/parser container execution with configurable 512 MiB memory limit, 3-minute foreground timeout, process termination, and no-partial-output commit semantics in `packages/extraction/src/isolated-parser-runner.ts`
- [x] T103 [P] Define production-safe processing limit configuration schema that can tune but not disable file size, page count, timeout, memory, concurrency, queue, and rolling attempt limits in `apps/api/src/config/import-processing-limits.ts`
- [x] T131 Configure shared TypeORM DataSource, asynchronous NestJS TypeORM options, environment-validated PostgreSQL settings, `synchronize: false` defaults for non-disposable environments, and project-local migration entrypoints in `packages/persistence/src/data-source.ts`, `packages/persistence/src/typeorm-options.ts`, and `packages/persistence/src/index.ts`
- [x] T132 Wire `apps/api` to the shared persistence package through `TypeOrmModule.forRootAsync`, `TypeOrmModule.forFeature` where appropriate, injectable repository abstractions or persistence services, and database connectivity health checks without exposing secrets in `apps/api/src/app.module.ts` and `apps/api/src/health/health.controller.ts`
- [x] T133 Wire `apps/worker` to the shared persistence package with compatible TypeORM DataSource configuration, no imports from API implementation modules, explicit transaction support for worker jobs, and queue acknowledgement only after required persistence operations succeed in `apps/worker/src/worker.module.ts`
- [x] T134 Run final integrated persistence validation after T010 and T127-T133 using Docker-only commands for project-local TypeORM migration generate/create/run/revert/show workflows against the Compose PostgreSQL service, shared TypeORM DataSource configuration, `synchronize: false`, API database connectivity health, worker database connectivity and transaction integration, and complete Docker-only validation after persistence integration in `tests/integration/persistence` and documented validation results.

**Checkpoint**: Foundation ready, including concrete PDF/DOCX adapters, isolated parser limits, and final integrated persistence validation T134. User story implementation can now begin only after all Phase 2 foundation tasks, including T134, are complete.

---

## Phase 3: User Story 1 - Start From an Existing Resume (Priority: P1) MVP

**Goal**: A user starting resume creation sees import as the recommended path, can choose functional manual entry, can authenticate before upload, can upload a supported PDF/DOCX, and receives plain-language validation/extraction progress through draft creation or timeout.

**Independent Test**: Start resume creation, choose manual entry and verify `/resumes/new/manual`, then choose import, sign in if needed, upload a supported document, and reach either review draft creation or a recoverable timeout state within the 3-minute foreground limit.

### Tests for User Story 1

- [x] T021 [P] [US1] Add contract tests for start import, validate document, and process extraction responses in `tests/contract/import-resume/start-import.contract.test.ts`
- [x] T022 [P] [US1] Add integration test for authenticated supported PDF/DOCX upload through progress and draft-ready state in `tests/integration/import-resume/start-upload.integration.test.ts`
- [x] T023 [P] [US1] Add integration test for unauthenticated upload requiring sign-in before file acceptance in `tests/integration/import-resume/authentication-gate.integration.test.ts`
- [x] T024 [P] [US1] Add fixture tests for PDF/DOCX file type, 10 MB limit, 5 rendered page limit, selectable text, and French/English/bilingual language validation in `tests/integration/import-resume/upload-validation.integration.test.ts`
- [x] T025 [P] [US1] Add accessibility test for upload labels, keyboard focus, and progress live announcements in `tests/accessibility/import-resume/upload-progress.a11y.test.ts`
- [x] T104 [P] [US1] Add PDF fixture tests for page-count extraction and PDF text extraction with page and source-location provenance in `packages/extraction/src/pdf/pdfjs-pdf-adapter.test.ts`
- [x] T105 [P] [US1] Add DOCX fixture tests for rendered-page-count validation and text extraction with source-location provenance in `packages/extraction/src/docx/ooxml-docx-adapter.test.ts`
- [x] T106 [P] [US1] Add malformed, corrupted, and password-protected document fixture tests for PDF and DOCX validation failures in `tests/integration/import-resume/malformed-protected-documents.integration.test.ts`
- [x] T107 [P] [US1] Add image-only/scanned PDF detection and mixed text-and-image PDF fixture tests in `tests/integration/import-resume/pdf-selectable-text.integration.test.ts`
- [x] T108 [P] [US1] Add French, English, and bilingual fixture tests for each supported document format in `tests/integration/import-resume/supported-language-fixtures.integration.test.ts`
- [x] T116 [P] [US1] Add contract tests proving `/resumes/new/manual` creates a blank manual structured-resume draft without imported document or import job in `tests/contract/manual-resume/create-manual-draft.contract.test.ts`

### Implementation for User Story 1

- [x] T026 [P] [US1] Implement create-resume entry and import/manual choice UI in `apps/web/src/features/import-resume/CreateResumeEntry.tsx`
- [x] T027 [P] [US1] Implement upload guidance, supported-file copy, privacy copy, and file chooser UI in `apps/web/src/features/import-resume/UploadStep.tsx`
- [x] T028 [P] [US1] Implement progress state UI with plain-language states and screen-reader live region in `apps/web/src/features/import-resume/ProcessingStep.tsx`
- [x] T029 [US1] Implement thin NestJS start-import REST controller with authentication, rate-limit check delegation, private storage write delegation, and `ImportedDocument` creation service call in `apps/api/src/import-resume/start-import.controller.ts` and `apps/api/src/import-resume/start-import.service.ts`
- [x] T030 [US1] Implement document validation service for format, size, rendered pages, language, selectable text, unsafe/unreadable/corrupted/password-protected failures, and recovery categories in `apps/api/src/services/import-resume/validate-document.ts`
- [x] T031 [US1] Implement deterministic source-preparation orchestration that validates physical PDF/DOCX content and may create only threshold-qualified drafts from explicitly sourced deterministic fields, without claiming complete semantic resume parsing when provider-first semantic parsing is required, in `apps/api/src/services/import-resume/process-extraction.ts`; AI-first review-draft creation depends on T152, T157-T160, T171-T174, and T180-T184
- [x] T032 [US1] Implement NestJS standalone worker processors for validation, extraction, timeout, and progress state persistence orchestration in `apps/worker/src/import-resume/import-processing.processor.ts`
- [x] T033 [US1] Implement web polling/subscription client for processing status and timeout recovery actions in `apps/web/src/services/import-resume/import-status-client.ts`
- [x] T034 [US1] Wire import flow route from create entry through upload and processing states in `apps/web/src/app/import-resume/page.tsx`
- [x] T119 [US1] Implement `/resumes/new/manual` route that creates a blank editable structured-resume draft without import records in `apps/web/src/app/resumes/new/manual/page.tsx`
- [x] T120 [P] [US1] Implement reusable structured-resume section editing components shared by manual entry and import review where appropriate in `apps/web/src/features/resume-editor/StructuredResumeSections.tsx`

**Checkpoint**: User Story 1 is independently testable as the MVP import entry, upload, validation, progress, and draft/timeout path.

---

## Phase 4: User Story 2 - Review and Correct Extracted Information (Priority: P1)

**Goal**: A user can review extracted resume data in recognizable sections, see uncertainty warnings, correct or remove every extracted field, preserve multiple roles, and handle inferred groupings before confirmation.

**Independent Test**: Import a resume with complete, missing, duplicate, conflicting, inferred, and ambiguous fields, then resolve every field or warning in review without modifying the uploaded source.

### Tests for User Story 2

- [x] T035 [P] [US2] Add contract tests for read import draft and update review actions in `tests/contract/import-resume/review-draft.contract.test.ts`
- [x] T036 [P] [US2] Add integration test for grouped review sections and field correction actions in `tests/integration/import-resume/review-correction.integration.test.ts`
- [x] T037 [P] [US2] Add integration test for duplicate, conflicting, missing, low-confidence, and inferred warning state transitions in `tests/integration/import-resume/warning-resolution.integration.test.ts`
- [x] T038 [P] [US2] Add domain test for multiple roles under one employer and ongoing-role display semantics in `packages/domain/src/resume-import/work-experience.test.ts`
- [x] T039 [P] [US2] Add accessibility test for warning labels, non-colour warning treatment, editable fields, and keyboard review flow in `tests/accessibility/import-resume/review.a11y.test.ts`

### Implementation for User Story 2

- [x] T040 [P] [US2] Implement extracted field, warning, correction, work experience, and role domain operations in `packages/domain/src/resume-import/review.ts`
- [x] T041 [US2] Implement read import draft service with grouped resume sections, source status, confidence status, inference status, and available review actions in `apps/api/src/services/import-resume/read-draft.ts`
- [x] T042 [US2] Implement update review service for confirm, edit, remove, complete, add, exclude, and intentionally leave actions in `apps/api/src/services/import-resume/update-review.ts`
- [x] T043 [US2] Implement thin NestJS read draft and update review REST controllers with use-case logic delegated to providers/services in `apps/api/src/import-resume/review.controller.ts`
- [x] T044 [P] [US2] Implement sectioned review UI for personal/contact, headline, summary, work experience, education, skills, languages, projects, certifications, and links using shared structured-resume section components where appropriate in `apps/web/src/features/import-resume/ReviewStep.tsx`
- [x] T045 [P] [US2] Implement warning and provenance UI components in `apps/web/src/features/import-resume/ReviewWarning.tsx` and `apps/web/src/features/import-resume/FieldProvenance.tsx`
- [x] T046 [US2] Implement review API client and optimistic review state updates without source-document mutation in `apps/web/src/services/import-resume/review-client.ts`

**Checkpoint**: User Story 2 is independently testable as a review and correction surface for extracted data.

---

## Phase 5: User Story 3 - Confirm Creation of Structured Resume (Priority: P1)

**Goal**: A user explicitly confirms reviewed import data before structured resume creation, and structured resume data remains distinct from the uploaded source.

**Independent Test**: Complete import review, attempt confirmation with unresolved warnings, resolve them, confirm creation, then verify edits target structured resume data and source retention remains unchanged.

### Tests for User Story 3

- [x] T047 [P] [US3] Add contract tests for confirm structured resume success and blocking errors in `tests/contract/import-resume/confirm-resume.contract.test.ts`
- [x] T048 [P] [US3] Add integration test for unresolved warning blocking, explicit confirmation, and user-confirmed field status in `tests/integration/import-resume/confirm-structured-resume.integration.test.ts`
- [x] T049 [P] [US3] Add domain test proving confirmation does not restart source/artifact retention and source deletion does not delete structured resume data in `packages/domain/src/resume-import/confirmation.test.ts`
- [x] T050 [P] [US3] Add integration test for resuming or discarding an unconfirmed draft before 7-day expiry in `tests/integration/import-resume/resume-draft.integration.test.ts`

### Implementation for User Story 3

- [x] T051 [P] [US3] Implement structured resume creation domain mapper from reviewed fields and user corrections in `packages/domain/src/resume-import/structured-resume-mapper.ts`
- [x] T052 [US3] Implement confirmation service that blocks unresolved warnings, requires one user-confirmed supported field, creates `StructuredResume`, and preserves original retention deadline in `apps/api/src/services/import-resume/confirm-structured-resume.ts`
- [x] T053 [US3] Implement thin NestJS confirm structured resume REST controller with use-case logic delegated to providers/services in `apps/api/src/import-resume/confirm.controller.ts`
- [x] T054 [P] [US3] Implement confirmation dialog and blocked-confirmation summary UI in `apps/web/src/features/import-resume/ConfirmationStep.tsx`
- [x] T055 [P] [US3] Implement structured resume provenance display that excludes raw snippets after source deletion in `apps/web/src/features/import-resume/StructuredResumeProvenance.tsx`
- [x] T056 [US3] Implement resume draft resume/discard client behavior before expiry in `apps/web/src/services/import-resume/draft-lifecycle-client.ts`

**Checkpoint**: User Story 3 is independently testable as explicit structured resume creation from reviewed import data.

---

## Phase 6: AI-First Semantic Parsing Foundation

**Purpose**: Add the provider-independent semantic parsing architecture required by the amended specification before the remaining accessibility, security, recovery, and polish work. This phase extends the completed Docker, web, API, worker, persistence, private storage, deterministic PDF/DOCX source extraction, provenance, review, confirmation, manual-entry, and Playwright foundations without recreating them.

**CRITICAL**: The completed T139-T145 spike remains a scoped historical NO-GO only for direct production use of `codex exec`, direct reuse or copying of Codex CLI credential files, Nuvitae directly reading, storing, refreshing, or manipulating ChatGPT access and refresh tokens, and Nuvitae reproducing the ChatGPT/Codex OAuth flow. The completed T189-T195 app-server spike remains a scoped historical NO-GO only for the tested `codex app-server` 0.146.0 ChatGPT-managed authentication candidate. Do not interpret T145 or T195 as a general NO-GO for all Codex subscription integration. Full production Codex adapter tasks T164-T165 now depend on a qualifying T203 direct-OAuth decision plus successful direct OAuth, credential lifecycle, invocation, semantic evaluation, and mandatory security conditions. Do not assume the direct-OAuth spike succeeds. If T203 is NO-GO, complete the provider-independent contracts, validation, no-provider recovery, manual-entry fallback, and alternative-provider boundary tasks without building the Codex adapter.

### Codex Subscription Adapter Spike

- [x] T139 [P] Validate use of an existing user-authenticated Codex/ChatGPT subscription session from the self-hosted Docker environment, including official support constraints, required user action, and non-host credential assumptions, in `docs/research/codex-spike-authentication.md`
- [x] T140 [P] Validate non-interactive Codex invocation from the worker/parser Docker environment without exposing shell, file-editing, repository, arbitrary tool, or host profile access for resume parsing in `docs/research/codex-spike-runtime-isolation.md`
- [x] T141 [P] Validate supported PDF and DOCX input strategies for Codex by measuring original-file, rendered-page-image, extracted-text-with-source-locations, and controlled-combination approaches in `docs/research/codex-spike-input-representation.md`
- [x] T142 [P] Validate strict structured output against the planned Nuvitae extraction schema, malformed output behavior, timeout handling, provider unavailability, expired authentication, quota or subscription exhaustion, and privacy-safe diagnostics in `docs/research/codex-spike-output-and-failures.md`
- [x] T143 [P] Validate credential/session isolation, private storage separation from resume artifacts, disconnect and revocation behavior, cross-user inaccessibility, and absence of credentials/session material from logs in `docs/research/codex-spike-credential-isolation.md`
- [x] T144 [P] Measure Codex spike field precision, field recall, work-experience grouping accuracy, valid-evidence rate, invented-field rate, latency, malformed-output rate, and provider failure behavior using anonymous French, English, bilingual, single-column, and multi-column PDF/DOCX fixtures in `docs/research/codex-spike-evaluation-results.md`; measurements may be baseline-only until T145 defines acceptance thresholds
- [x] T145 Record the Codex adapter spike go/no-go decision, observed precision/recall/evidence/invention/latency/failure results from T144, selected input representation if any, unacceptable failure modes, compatibility and usage constraints, measurement-only gaps where thresholds are not yet known, and the thresholds or acceptance decision required before full Codex adapter implementation in `docs/research/codex-subscription-adapter-go-no-go.md`

### Provider-Independent Contracts And Schemas

- [x] T146 [P] Add provider contract tests for `ResumeSemanticParserProvider`, provider capabilities, provider connection states, parse request/response contracts, and generic provider failure results in `tests/contract/import-resume/semantic-parser-provider.contract.test.ts`
- [x] T147 [P] Add versioned Nuvitae extraction response schema tests for candidate sections, relationships, warnings, evidence records, explicit/inferred classification, confidence categories, unknown-field rejection, and forward-compatible response versioning in `packages/contracts/src/import-resume/semantic-extraction.schema.test.ts`
- [x] T148 [P] Add provider-independence boundary tests proving `packages/domain` and import domain services do not import Codex, OpenAI, ChatGPT, Claude, Ollama, provider SDK types, or provider-native JSON in `tests/architecture/import-resume/provider-independence.architecture.test.ts`
- [x] T149 [P] Define `ResumeSemanticParserProvider`, provider capabilities, provider connection and availability states, provider-neutral error taxonomy, normalized PDF/DOCX transcript input, flattened source fragments, fragment hashes, fragment bounds, and parse request/response contracts in `packages/import-application/src/semantic-parser/resume-semantic-parser-provider.ts`
- [x] T150 [P] Define versioned Nuvitae structured resume extraction Zod schemas with response version metadata, candidate sections, candidate relationships, explicit absence handling using required nullable optional fields and empty arrays for absent collections, canonical flattened evidence using `line`, `start`, `end`, fragment hashes, fragment bounds, explicit/inferred classification, confidence categories, diagnostics, and forward-compatible parsing rules in `packages/contracts/src/import-resume/semantic-extraction.ts`
- [x] T151 [P] Define provider-neutral error taxonomy and recovery action mapping for not configured, disconnected, authentication expired, unavailable, rate limited, quota exceeded, unsupported capability, timeout, malformed output, invalid schema, invalid grounding, ambiguous output, conflicting output, explicit absence mismatch, and invented facts in `packages/import-application/src/semantic-parser/provider-errors.ts`
- [x] T152 Implement strict semantic response validation that rejects malformed output, unknown fields, invalid relationships, unsupported values, omitted required nullable fields, invalid absence representations, missing flattened evidence for non-null candidates, provider-supplied physical PDF coordinates, invalid classifications, invalid confidence categories, and provider-native schema leakage before persistence in `packages/import-application/src/semantic-parser/validate-semantic-response.ts`

### Grounding, No-Invention, And Safety

- [x] T153 [P] Add grounding validator tests for canonical flattened evidence over normalized PDF/DOCX transcripts, including `line`, `start`, `end`, fragment hashes, fragment bounds, missing evidence, out-of-bounds ranges, hash mismatches, absent-field declarations, and rejection of model-predicted physical PDF coordinates in `packages/import-application/src/validation/evidence-grounding.test.ts`
- [x] T154 [P] Add no-invention validator tests proving unsupported AI-produced values, invented employers, roles, dates, skills, certifications, education, links, achievements, metrics, languages, contact details, invented non-null values for explicitly absent fields, and inferred-only draft candidates are rejected or marked unusable in `packages/import-application/src/validation/no-invention.test.ts`
- [x] T155 [P] Add prompt-injection resistance tests proving document text cannot alter extraction instructions, validation rules, provider tool permissions, privacy handling, or no-invention enforcement in `tests/security/import-resume/semantic-parser-prompt-injection.security.test.ts`
- [x] T156 [P] Add duplicate and conflict detection tests for repeated contact fields, overlapping roles, conflicting dates, duplicate employers, ambiguous links, and competing section classifications in `packages/import-application/src/validation/semantic-conflicts.test.ts`
- [x] T157 Implement evidence grounding validation that checks non-null values against canonical flattened transcript evidence using `line`, `start`, `end`, fragment hashes, and fragment bounds; treats null fields through explicit absence declarations without value evidence; rejects or marks unusable any candidate unsupported by flattened PDF/DOCX transcript evidence; and rejects model-predicted physical PDF coordinates before persistence in `packages/import-application/src/validation/evidence-grounding.ts`
- [x] T158 Implement no-invention enforcement for AI-produced values, relationships, groupings, inferred skills, unsupported claims, invented non-null values for explicitly absent fields, and provider-native leakage before review-draft creation in `packages/import-application/src/validation/no-invention.ts`
- [x] T159 Implement explicit absence, ambiguity, and inferred-grouping handling that maps null optional fields, absent collections, ambiguous date interpretation, work-experience association, semantic grouping, and inferred section classification to provider-neutral diagnostics and review-required warnings in `packages/import-application/src/validation/inference-review.ts`
- [x] T160 Implement duplicate and conflict detection for semantic candidates, explicit absence contradictions, competing flattened evidence, relationship groupings, repeated contact fields, overlapping roles, conflicting dates, duplicate employers, ambiguous links, and competing section classifications before warning creation in `packages/import-application/src/validation/semantic-conflicts.ts`
- [x] T161 Implement privacy-safe provider request/response failure and diagnostic events that exclude resume contents, prompts, raw provider payloads, source snippets, flattened transcript text, credentials, session material, tokens, complete provider errors, and unnecessary personal data while preserving sanitized warning and validation categories in `apps/api/src/observability/provider-import-events.ts`

### MVP Provider-Neutral Semantic Import Vertical Slice

- [x] T209 Integrate the provider-neutral semantic import workflow so the worker depends only on `ResumeSemanticParserProvider`, replaces direct use of `DeterministicResumeFieldExtractor` in the real orchestration path, accepts normalized PDF/DOCX text and flattened fragments, validates provider output through T149-T161 before persistence, persists an unconfirmed review draft and sanitized warnings, reuses the existing review, correction, confirmation, and editor flow, keeps the provider implementation injectable, avoids activating incomplete production routes prematurely, and states that templates and final PDF generation are outside this import vertical slice but not outside the overall Nuvitae MVP in `apps/worker/src/import-resume/semantic-import.processor.ts`; depends on T149-T161
- [x] T210 Add a deterministic semantic-provider test adapter that implements `ResumeSemanticParserProvider` only for automated/local integration testing, consumes real normalized fixture transcripts, returns contract-valid grounded semantic results, is never enabled as a production provider, allows end-to-end browser and worker testing without external credentials, and makes provider absence fail explicitly outside test/local modes in `packages/import-application/src/providers/testing/deterministic-semantic-parser-provider.ts`; depends on T149-T150 and T152
- [x] T211 Validate the semantic-import vertical slice with one real selectable-text PDF and one real DOCX covering upload and private storage, deterministic extraction and normalization, provider-neutral semantic invocation, grounding, absence, ambiguity, and no-invention validation, review-draft persistence, review UI, user correction and confirmation, structured-resume persistence, navigation to the editor, failure behavior when no production semantic provider is configured, and the boundary that templates and final PDF generation are outside this import vertical slice but not outside the overall Nuvitae MVP in `tests/browser/import-resume/semantic-import-vertical-slice.spec.ts`; depends on T209 and T210

### Provider Runtime Connection Persistence Before Semantic Result Persistence

- [x] T162 Implement adapter-neutral `AIProviderRuntimeConnection` persistence, private session reference metadata, ownership checks, revocation metadata, and separation from resume source artifacts for self-hosted provider runtime connections in `packages/persistence/src/entities/ai-provider-runtime-connection.entity.ts`, `packages/persistence/src/repositories/ai-provider-runtime-connections.repository.ts`, and `packages/storage/src/provider-session-storage.ts`; depends on T149-T151 and does not assume T145, T195, or T203 Codex spike success

### Codex Adapter Implementation After Direct-OAuth Decision Gate

- [x] T163 Implement provider status checks, connect/reconnect/disconnect/revoke service boundaries, expired-session detection, quota/subscription state handling, and capability snapshots in `apps/api/src/services/import-resume/provider-connections.ts`; depends on T149-T152 and T162
- [ ] T164 Implement the production Codex direct-OAuth adapter outside the import domain with `CodexDirectProviderAdapter`, isolated `CodexOAuthBroker` invocation, broker-owned credential lifecycle, direct Codex ChatGPT transport, fail-closed host/path allowlists, strict structured response capture, and provider-specific error mapping behind the generic boundary in `packages/import-application/src/providers/codex/codex-direct-provider-adapter.ts`; remains incomplete and blocked despite T195 being NO-GO only for the app-server candidate, and depends on T149-T152, a qualifying T203 decision, successful direct OAuth, successful credential lifecycle, successful invocation, successful semantic evaluation, and satisfaction of every mandatory security condition recorded by T203
- [ ] T165 Implement provider-specific conversion from direct Codex transport output into the Nuvitae-owned extraction response without exposing Codex OAuth, tokens, backend routes, headers, response types, provider-native JSON, or SDK types to the import domain or structured resume model in `packages/import-application/src/providers/codex/codex-direct-response-converter.ts`; remains incomplete and blocked despite T195 being NO-GO only for the app-server candidate, and depends on T150-T152, a qualifying T203 decision, successful direct OAuth, successful credential lifecycle, successful invocation, successful semantic evaluation, and satisfaction of every mandatory security condition recorded by T203

### Application Integration, Recovery, And Fallbacks

- [x] T166 [P] Add worker integration tests proving orchestration runs through `ResumeSemanticParserProvider`, validates schema and grounding before persistence, creates unconfirmed AI semantic candidates, and creates warnings before review-draft creation in `tests/integration/import-resume/semantic-parser-worker.integration.test.ts`
- [x] T167 [P] Add no-provider, expired-session, provider-unavailable, quota-exhausted, timeout, malformed-output, retry, alternative-provider, limited deterministic partial extraction, and manual-entry fallback recovery tests in `tests/integration/import-resume/provider-recovery.integration.test.ts`; depends on T185-T188 for the explicit limited deterministic partial fallback contract
- [x] T168 [P] Add credential isolation tests proving provider session material is private to the authenticated user, revocable, isolated from resume source artifacts, and absent from diagnostics in `tests/security/import-resume/provider-credential-isolation.security.test.ts`
- [x] T169 [P] Add realistic anonymous parser fixtures and expected structured JSON outputs for French, English, bilingual, single-column, multi-column, PDF, and DOCX resumes in `packages/test-fixtures/src/resume-import/semantic-parser-fixtures.ts` and `packages/test-fixtures/src/resume-import/expected-semantic-json.ts`
- [x] T170 [P] Add parser evaluation tests measuring field precision, field recall, work-experience grouping accuracy, valid-evidence rate, invented-field rate, latency, provider-independent threshold compliance where available, Codex-specific T203 threshold compliance only if direct OAuth is selected, and provider failure behavior in `tests/integration/import-resume/semantic-parser-evaluation.integration.test.ts`; baseline-only provider-independent metrics remain allowed until production acceptance thresholds are defined
- [ ] T171 Implement worker orchestration from deterministic validation/source preparation through `ResumeSemanticParserProvider`, strict schema validation, grounding validation, no-invention validation, warning generation, and review-draft creation in `apps/worker/src/import-resume/semantic-import.processor.ts`; depends on T152, T157-T160, T180-T184, and T164 or an alternative provider adapter
- [x] T172 Implement mapping from validated AI semantic candidates into unconfirmed import draft fields with source provenance, explicit/inferred classification, confidence categories, and review-required status in `apps/api/src/services/import-resume/semantic-candidates-to-draft.ts`; depends on T152, T157-T160, and T180-T184
- [x] T173 Implement warning creation for inferred, ambiguous, unsupported, duplicate, conflicting, low-confidence, malformed-provider-output, invalid-evidence, ungrounded, invented, no-provider, provider-auth-expired, provider-unavailable, provider-rate-limited, provider-quota-exceeded, and provider-timeout states in `apps/api/src/services/import-resume/semantic-warning-generation.ts`; depends on T151, T157-T160, and T180-T184
- [ ] T174 Update review-draft creation to require schema-valid, grounded, non-invented candidates before persistence and to reject inferred-only or evidence-free provider output in `apps/api/src/services/import-resume/process-extraction.ts`; depends on T152, T157, T158, T171, T172, and T180-T184
- [ ] T175 Implement provider connection requirement and provider-use disclosure in the self-hosted upload and processing UI without exposing provider configuration, prompts, model names, credentials, session details, or raw diagnostics in `apps/web/src/features/import-resume/ProviderDisclosure.tsx` and `apps/web/src/features/import-resume/UploadStep.tsx`
- [ ] T176 Implement no-provider, expired-session, provider-unavailable, rate-limited, quota-exhausted, malformed-output, timeout, retry, alternative-provider, limited deterministic partial extraction, and manual-entry recovery UI states with explicit disclosure that deterministic fallback is partial and does not provide reliable full semantic parsing in `apps/web/src/features/import-resume/ProviderRecoveryActions.tsx`; depends on T187-T188

### Browser Sentinels And Semantic Evaluation

- [ ] T177 [P] [US1] Update browser E2E acceptance to keep the user journey focused on upload, provider disclosure, processing, review arrival, and a small sentinel set of grounded fields in `tests/browser/import-resume/import-flow.spec.ts`; depends on T171-T176
- [ ] T178 [P] [US2] Update review integration tests to assert AI semantic candidates remain unconfirmed, inferred groupings require review, unsupported candidates are absent or unusable, and sentinel source provenance is preserved in `tests/integration/import-resume/review-correction.integration.test.ts`; depends on T172-T174
- [ ] T179 [P] [US3] Update confirmation integration tests to assert schema validation, grounding, and no-invention gates precede structured resume creation and unresolved semantic warnings block confirmation in `tests/integration/import-resume/confirm-structured-resume.integration.test.ts`; depends on T172-T174

### Semantic Persistence And Limited Deterministic Fallback Corrections

- [x] T180 [P] Add persistence and migration integration tests for `SemanticParseAttempt`, `NuvitaeExtractionResponse`, `EvidenceRecord`, response schema version metadata, provider capability snapshots, schema-validation status, grounding-validation status, no-invention validation status, ownership relationships, retention relationships, and deletion relationships in `tests/integration/persistence/semantic-parser-persistence.integration.test.ts`
- [x] T181 Implement `SemanticParseAttempt` TypeORM entity, repository, mapper, database constraints, ownership relationship to `ImportedDocument`, optional `AIProviderRuntimeConnection` relationship, retention/deletion lifecycle fields, and migration in `packages/persistence/src/entities/semantic-parse-attempt.entity.ts`, `packages/persistence/src/repositories/semantic-parse-attempts.repository.ts`, `packages/persistence/src/mappers/semantic-parse-attempt.mapper.ts`, and `packages/persistence/src/migrations`
- [x] T182 Implement `NuvitaeExtractionResponse` TypeORM entity, repository, mapper, response schema version persistence, validation status persistence, relationship to `SemanticParseAttempt`, retention/deletion lifecycle fields, and migration in `packages/persistence/src/entities/nuvitae-extraction-response.entity.ts`, `packages/persistence/src/repositories/nuvitae-extraction-responses.repository.ts`, `packages/persistence/src/mappers/nuvitae-extraction-response.mapper.ts`, and `packages/persistence/src/migrations`
- [x] T183 Implement `EvidenceRecord` TypeORM entity, repository, mapper, document-location persistence, source fragment reference persistence, explicit/inferred classification persistence, confidence category persistence, validation status persistence, relationship to `NuvitaeExtractionResponse`, ownership-safe retention/deletion lifecycle fields, and migration in `packages/persistence/src/entities/evidence-record.entity.ts`, `packages/persistence/src/repositories/evidence-records.repository.ts`, `packages/persistence/src/mappers/evidence-record.mapper.ts`, and `packages/persistence/src/migrations`
- [x] T184 Implement provider capability snapshot persistence and semantic parser validation status persistence for schema validation, grounding validation, and no-invention validation using persistence entities, repositories, bidirectional domain-to-persistence and persistence-to-domain mappers, migrations, owner-scoped access relationships, source-retention relationships, deletion relationships, and persistence/migration integration test coverage in `packages/persistence/src/entities/provider-capability-snapshot.entity.ts`, `packages/persistence/src/entities/semantic-parser-validation-status.entity.ts`, `packages/persistence/src/repositories/provider-capability-snapshots.repository.ts`, `packages/persistence/src/repositories/semantic-parser-validation-status.repository.ts`, `packages/persistence/src/mappers/provider-capability-snapshot.mapper.ts`, `packages/persistence/src/mappers/semantic-parser-validation-status.mapper.ts`, `packages/persistence/src/migrations`, and `tests/integration/persistence/semantic-parser-persistence.integration.test.ts`
- [x] T185 [P] Add contract tests defining limited deterministic partial extraction fallback allowed field set, minimum explicit source evidence, confidence and inference rules, draft creation threshold, warning behavior, and plain-language no-full-semantic-parsing disclosure in `tests/contract/import-resume/limited-deterministic-partial-fallback.contract.test.ts`
- [x] T186 [P] Add integration tests for limited deterministic partial extraction fallback in no-provider, provider-unavailable, expired-session, quota-exhausted, timeout, and malformed-provider-output flows, including manual-entry recovery and no claim of reliable full semantic parsing in `tests/integration/import-resume/limited-deterministic-partial-fallback.integration.test.ts`
- [x] T187 Define the limited deterministic partial extraction fallback contract with allowed deterministic fields, required explicit source evidence, confidence categories, inferred-value prohibition rules, draft creation threshold, warning behavior, and provider-unavailable disclosure metadata in `packages/contracts/src/import-resume/limited-deterministic-partial-fallback.ts`
- [x] T188 Implement limited deterministic partial extraction fallback orchestration that reuses completed PDF/DOCX physical extraction foundations without reopening them, creates only threshold-qualified explicitly sourced partial candidates, marks confidence and warnings correctly, and routes no-provider/provider-failure users to retry/reconnect/alternative-provider/manual-entry options in `apps/api/src/services/import-resume/limited-deterministic-partial-fallback.ts`

**Checkpoint**: Completed US1-US3 implementation remains preserved as foundation work, but US1-US3 are not fully accepted against the amended AI-first specification until T171-T179 and T180-T188 pass. AI-first semantic parsing contracts, persistence, validation, spike decision, provider integration path, no-provider recovery, limited deterministic partial fallback, fixture evaluations, and sentinel E2E coverage must be ready before accessibility, security, recovery, and polish tasks that touch provider-backed parsing are considered complete.

### Official Codex App-Server Integration Spike

**Purpose**: Preserve the completed bounded validation of the official Codex app-server interface. This phase is historical research and evaluation only; it did not implement the production Codex adapter. T189 established the exact Codex version, generated protocol artifacts, supported methods and payloads, stable versus experimental operation classification, and protocol basis for the app-server spike. T190 depended on T189; T191 depended on T189-T190 and completed only as a terminal `BLOCKED` authentication investigation; T192 required a successful T191 authentication acceptance gate and remains blocked because no authenticated runtime exists; T193 remains blocked because T192 did not execute; T194 completed using T189-T191 evidence and the explicit non-execution of T192-T193; T195 completed after T194 using completed T189, completed T190, terminally completed `BLOCKED` T191, completed T194, and the recorded blocked/non-executed status of T192-T193. T195 is the Codex app-server candidate decision only, and marking T191 complete as a blocked investigation does not unblock T164-T165. Provider-independent contracts, validation, grounding, no-invention enforcement, persistence, review, confirmation, recovery, deterministic fallback, and manual entry remain independent of successful Codex authentication and T195.

- [x] T189 Investigate the official Codex CLI/app-server protocol and compatibility by installing the official Codex CLI/app-server in the bounded spike environment, detecting the installed Codex version, generating the app-server TypeScript or JSON Schema protocol artifacts from that exact installed version, deriving supported authentication, account, thread, turn, cancellation, logout, and shutdown operations from the generated artifacts, validating JSON-RPC initialization over stdio with explicit Nuvitae client information, documenting request and notification correlation, distinguishing stable, beta, experimental, deprecated, and unsupported operations, recording version compatibility and upgrade risks, and rejecting the experimental WebSocket transport for the initial spike in `docs/research/codex-app-server-protocol-and-compatibility.md`; do not hardcode unverified RPC names or payloads
- [x] T190 Spike the dedicated bounded Codex app-server Docker runtime with private persistent Codex state volume, empty ephemeral workspace, no Nuvitae repository mount, no private resume-storage mount, no PostgreSQL access, no Valkey access, no host Codex configuration or credential inheritance, no user MCP-server inheritance, no user plugin inheritance, restricted environment variables, CPU, memory, process, timeout, and temporary-storage limits, controlled stdout and stderr, privacy-safe diagnostics, crash detection and bounded restart, cleanup after execution, and experimental verification of shell, file-editing, web, MCP, plugin, and filesystem capabilities including whether those capabilities can be disabled, excluded, restricted, or adequately neutralized in `docs/research/codex-app-server-runtime-isolation.md`; depends on T189
- [x] T191 Spike Codex app-server authentication and session lifecycle behavior in `docs/research/codex-app-server-authentication-lifecycle.md`; depends on completed T189-T190. Terminal result: BLOCKED — the bounded authentication investigation is complete, but official ChatGPT authentication was not established; the authentication acceptance gate failed; marking T191 complete does not mean authentication passed, does not mean the Codex provider is production-ready, and no authenticated runtime exists for T192.
  - Preserve the experimentally verified device-code result: `chatgptDeviceCode` exists in the generated Codex 0.146.0 protocol; app-server device-code initiation was rejected before verification URL or user-code issuance; the official controlled CLI device-auth diagnostic failed in the same general stage; enabling device-code authorization did not change the result; basic Docker DNS, TCP, TLS, and CA reachability did not explain the failure; repeated device-code retries are no longer required for this spike; this result is scoped to the tested account, runtime, and Codex version and is not yet a global Codex integration NO-GO.
  - Evaluate one final bounded authentication candidate: official `account/login/start` with `type: chatgpt`; the managed child-process topology selected by T190; an ephemeral host-loopback callback relay; Codex-owned PKCE, OAuth state validation, callback handling, token exchange, credential persistence, refresh, and logout; no direct OAuth implementation by Nuvitae; no copied credential files or authentication cache.
  - Require the callback relay to bind host callback ports only to `127.0.0.1`; support the callback ports selected by the pinned Codex runtime, expected to be `1455` or `1457`; forward raw bidirectional TCP only; run inside the trusted Codex runtime boundary; never run as the Nuvitae probe identity; never parse HTTP; never inspect or log query parameters; never persist callback requests; never persist authorization codes; never handle or expose access, refresh, or ID tokens; start only while an official login is pending; stop immediately after login completion, cancellation, failure, or timeout; expose no long-running inbound service; use bounded connections and timeouts.
  - Explicitly reject binding callback ports to `0.0.0.0`, LAN or public exposure, Docker socket mounting, host networking as the default solution, direct OAuth endpoint implementation, callback proxies that parse OAuth data, copying `auth.json`, and API-key authentication as a substitute for the subscription requirement.
  - Validate the official authorization URL before displaying it: authorization URL scheme must be HTTPS; authorization host must match the official OpenAI authentication host returned by the pinned runtime; the encoded redirect URI must use HTTP loopback; redirect hostname must be `localhost` or `127.0.0.1`; redirect path must be `/auth/callback`; callback port must be `1455` or `1457`; any unexpected scheme, host, path, or port must fail closed. The complete authorization URL may be displayed only in the live terminal and must not be persisted in repository evidence because it may contain transient OAuth parameters.
  - Validate the final browser-flow lifecycle: fresh private Codex state volume; unauthenticated `account/read` before login; callback relay starts before login; official browser login starts through app-server; authorization URL and redirect URI pass strict validation; the host browser can reach the callback listener through the loopback-only relay; `account/login/completed` reports success; `account/updated` reports authenticated ChatGPT state; `account/read` reports authenticated ChatGPT state; no raw access, refresh, or ID token reaches the Nuvitae probe; no authorization code reaches repository evidence or Nuvitae logs; the Nuvitae probe identity cannot list, stat, read, copy, or modify Codex credential state; authentication survives container recreation with the same private volume; login cancellation is tested with a separate pending login attempt; authenticated logout succeeds; unauthenticated state survives restart after logout; final browser reauthentication succeeds; the final private volume remains authenticated for T192; callback relay ports are absent after login completion; secret scans pass.
  - If callback reachability is proven but official login still fails, preserve the safe OAuth or app-server error category, do not start T192, carry the authentication blocker into T194 and T195, and do not add another authentication workaround inside T191.
  - Final observed result: official browser login produced a valid authorization URL on `auth.openai.com`, a valid localhost redirect URI, callback port `1455`, loopback-only Docker publication, reachable relay and Codex callback listener, no public or LAN exposure, protected Codex state unreadable by the Nuvitae probe identity, no persisted raw token, authorization code, complete authorization URL, credential content, or personal account information, and callback-port teardown after failure; however no successful `account/login/completed`, authenticated `account/updated`, or authenticated `account/read` was observed.
- [ ] T192 Spike authenticated Codex app-server semantic parsing invocation after login using non-interactive invocation, ephemeral thread creation where supported, isolated empty working directory, restrictive permissions or sandbox configuration, explicit timeout and cancellation, deterministic resume text input with stable page, block, line, or fragment identifiers and compact layout hints, synthetic anonymous fixtures only, French, English, and bilingual resumes, single-column and multi-column layouts, PDF-derived and DOCX-derived extracted text, no original PDF or DOCX mounted into the Codex runtime, a temporary strict structured extraction schema for personal/contact information, professional summary, work experience, education, skills, languages, evidence references, explicit versus inferred classification, and confidence categories, strict schema validation, conversion boundary toward a Nuvitae-owned provider-independent response, and no normal resume-import persistence in `docs/research/codex-app-server-semantic-parsing.md`; requires a successful T191 authentication acceptance gate, but T191 completed with terminal `BLOCKED` result, so T192 was not executed, must not start under the current decision, no authenticated semantic parsing invocation occurred, and T192 is not classified as a failed semantic parser experiment because it never had an authenticated runtime; may be reconsidered only after an objective reevaluation trigger and successful authentication delta validation.
- [ ] T193 Evaluate Codex app-server failure, security, and quality behavior covering malformed output, missing or unknown fields, unsupported evidence identifiers, invented values, inferred values incorrectly labelled as explicit, duplicate entries, work-experience grouping errors, timeout, cancellation, app-server crash, app-server restart, network unavailability, unsupported model, unauthenticated invocation, authentication expiry, quota exhaustion or rate limiting where safely reproducible, prompt-injection content inside synthetic resume text, invocation success rate, schema-valid response rate, field precision, field recall, work-experience grouping accuracy, valid-evidence rate, unsupported-evidence rate, invented-field rate, startup latency, turn latency, cancellation latency, restart recovery, and authentication recovery in `docs/research/codex-app-server-evaluation-results.md`; authenticated semantic evaluation could not execute and remains blocked by absence of a successful T192 invocation, so invocation success rate, schema-valid response rate, field precision, field recall, work-experience grouping accuracy, valid-evidence rate, unsupported-evidence rate, invented-field rate, authenticated turn latency, cancellation latency, quota or rate-limit behavior, and authenticated restart/recovery behavior remain unverified rather than zero; do not invent, estimate, or default missing metrics.
- [x] T194 Review Codex app-server self-hosted security and product suitability covering the current authentication blocker, device-code and browser-flow operability, token-blindness, credential and filesystem isolation, process and runtime isolation, Docker operability, user onboarding feasibility, support and troubleshooting burden, protocol and Codex-version coupling, upgrade strategy, privacy and security, missing semantic-quality evidence, consequences of not having authenticated extraction measurements, limitations of using Codex for non-code resume semantic parsing, suitability of the current app-server path for self-hosted Nuvitae, objective reevaluation triggers, and confirmation that the commercial hosted provider remains out of scope in `docs/research/codex-app-server-security-and-product-review.md`; immediately startable using completed T189 protocol and compatibility evidence, completed T190 runtime and isolation evidence, completed T191 investigation with terminal `BLOCKED` result, and explicit non-execution/blocked status of T192-T193. Reevaluation triggers include a newer official Codex version with a relevant authentication fix, an official OpenAI-documented resolution, a confirmed account or workspace configuration change, a supported official authentication operation that preserves token-blindness, or successful login reproduction in the same bounded Docker topology.
- [x] T195 Record the explicit Codex app-server GO, CONDITIONAL GO, or NO-GO decision in `docs/research/codex-app-server-go-no-go.md`; depends on completed T189, completed T190, terminally completed `BLOCKED` T191, completed T194 security and product review, and explicitly blocked/non-executed T192-T193 status. T195 may proceed without completed T192-T193 only because the mandatory authentication gate prevented their execution, and must state why T192-T193 were not executed, which semantic, latency, quota, cancellation, and recovery metrics remain unverified, that no authenticated semantic-quality conclusion was produced, that authentication is a failed mandatory production gate, the scope of the tested blocker including version/account/workspace/environment/date limitations, objective reevaluation triggers, and GO, CONDITIONAL GO, or NO-GO. GO is impossible while mandatory authentication and semantic-evaluation gates remain unsatisfied; CONDITIONAL GO may describe a future reevaluation path but must not unblock production implementation until every stated condition has been experimentally satisfied.

### Direct Codex OAuth Compatibility Spike

**Purpose**: Run a second Codex integration candidate that reproduces the architecture used by current OpenClaw and Hermes implementations: `Nuvitae worker -> provider-independent ResumeSemanticParserProvider -> CodexDirectProviderAdapter -> isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT transport`. This phase is research and evaluation only; it must not implement production Codex integration, must not add another app-server attempt, must not add API-key substitution, and must not reopen T192-T193. The completed T189-T195 app-server spike remains historical and unchanged in its factual findings, with T195 NO-GO scoped only to the tested app-server candidate. T196-T203 must run strictly in sequence.

- [x] T196 Audit exact pinned revisions of OpenClaw, Hermes Agent, and relevant official OpenAI sources, recording OAuth client and endpoints, PKCE/state behavior, callback behavior, scopes and originator, token exchange and refresh, credential persistence, logout, account identity, direct Codex transport, backend URL and headers, request and response shape, licensing and attribution, official versus undocumented behavior, compatibility risks, and policy risks in `docs/research/codex-direct-oauth-upstream-audit.md`
- [x] T197 Define and compare bounded credential-broker topologies covering sole token ownership, trust boundaries, encrypted storage, key management, user isolation, filesystem permissions, logs, queue and API boundaries, callback exposure, SSRF protections, token deletion, refresh races, crash recovery, backups, and multi-user behavior in `docs/research/codex-direct-oauth-security-design.md`; depends on T196
- [x] T198 Build a spike-only OAuth Authorization Code with PKCE login proof derived from T196 covering official authorization host, local loopback callback, PKCE, state validation, exact audited parameters, human browser login, code exchange, safe account status, no token leakage outside the broker, and no credential persistence beyond an isolated disposable spike store in `docs/research/codex-direct-oauth-login.md`; depends on T197
- [x] T199 Using the isolated broker, validate encrypted credential persistence, restart recovery, refresh, concurrent refresh protection, expired and revoked behavior, logout, local deletion, secret scanning, and absence of tokens in API, logs, queues, browser, or domain in `docs/research/codex-direct-oauth-credential-lifecycle.md`; depends on T198
- [x] T200 Use the authenticated broker to perform one minimal synthetic invocation against the exact audited Codex transport covering allowlisted host and path, required headers, account identity, response streaming, timeout, cancellation, bounded response size, 401/403/429/5xx behavior, refresh and retry rules, and confirmation that ChatGPT subscription usage is accepted in `docs/research/codex-direct-invocation.md`; use no resume data; depends on T199. Finalized from the successful bounded live evidence: HTTP 200, valid SSE framing despite missing Content-Type, 15 processed events, verified `NUVITAE_T200_OK`, encrypted T199 state preserved, no raw credential or account identifier exposed to the parent, no raw response persisted, broker teardown succeeded, and callback port 1455 remained absent.
- [ ] T201 Only after T200 succeeds, parse anonymous synthetic resume fixtures covering provider-independent structured output, strict schema validation, evidence references, grounding, no invention, French, English, bilingual, PDF-derived text, DOCX-derived text, single-column, and multi-column cases in `docs/research/codex-direct-semantic-parsing.md`; depends on T200. C01-C03 remain passed canonical live validation; C04 B01 remains an immutable failed live attempt under the contract active at execution time; C04 B02 and any further C04 live attempt remain unauthorized; C05-C06 remain unexecuted; and T201 remains incomplete. T202, T203, T164, and T165 remain blocked.
- [ ] T202 Measure authentication success, schema-valid rate, precision, recall, grouping, evidence validity, invention rate, latency, cancellation, quota behavior, refresh, restart, provider/backend compatibility risk, operational burden, and non-technical onboarding feasibility in `docs/research/codex-direct-oauth-evaluation.md`; depends on T201
- [ ] T203 Record the explicit direct-OAuth GO, CONDITIONAL GO, or NO-GO decision distinguishing technical viability, security viability, product viability, official supportability, undocumented-backend risk, licensing, operational stability, and semantic quality in `docs/research/codex-direct-oauth-go-no-go.md`; GO requires every mandatory gate to pass, CONDITIONAL GO must not unblock production until its conditions are satisfied, and NO-GO remains acceptable; depends on T202

---

## Phase 7: User Story 5 - Complete Import Accessibly (Priority: P1)

**Goal**: A user can complete upload, processing, review, confirmation, retry, cancellation, and deletion flows with accessible labels, status announcements, keyboard-only operation, and recoverable focus behavior.

**Independent Test**: Complete the full import path and failure/recovery dialogs using keyboard-only navigation and assistive technology checks.

### Tests for User Story 5

- [ ] T057 [P] [US5] Add containerized Playwright accessibility test for full keyboard-only import completion in `tests/accessibility/import-resume/keyboard-full-flow.a11y.test.ts`
- [ ] T058 [P] [US5] Add containerized Playwright accessibility test for status live regions across processing, success, timeout, cancellation, validation error, and processing failure states in `tests/accessibility/import-resume/status-announcements.a11y.test.ts`
- [ ] T059 [P] [US5] Add containerized Playwright accessibility test for error-summary focus and dialog focus restoration in `tests/accessibility/import-resume/focus-recovery.a11y.test.ts`

### Implementation for User Story 5

- [ ] T060 [P] [US5] Implement shared accessible dialog wrapper for confirmation, retry, cancellation, discard, and deletion flows in `apps/web/src/components/AccessibleDialog.tsx`
- [ ] T061 [P] [US5] Implement reusable import status live region component in `apps/web/src/features/import-resume/ImportStatusLiveRegion.tsx`
- [ ] T062 [P] [US5] Implement import error summary and focus management utilities in `apps/web/src/features/import-resume/ErrorSummary.tsx` and `apps/web/src/features/import-resume/focus-management.ts`
- [ ] T063 [US5] Apply accessible names, keyboard handlers, visible focus states, non-colour warning treatment, and focus restoration across import components in `apps/web/src/features/import-resume/ImportFlow.tsx`

**Checkpoint**: User Story 5 is independently testable as an accessibility and recovery layer over the import flow.

---

## Phase 8: User Story 6 - Protect Imported Resume Data (Priority: P1)

**Goal**: Imported documents, extracted content, processing state, drafts, temporary contact previews, temporary artifacts, parser processes, and deletion jobs are private to the initiating user, isolated from hostile content, rate-limited, resource-limited, and removed according to retention/deletion rules.

**Independent Test**: Attempt cross-user access, exceed upload/processing/concurrency/memory/time limits, import hostile documents, delete source documents, and verify only minimal structured resume provenance remains.

### Tests for User Story 6

- [ ] T064 [P] [US6] Add authorization isolation tests for imported documents, drafts, fields, warnings, artifacts, deletion jobs, and structured resumes in `tests/security/import-resume/authorization-isolation.security.test.ts`
- [ ] T065 [P] [US6] Add rate-limit and concurrent-work tests for upload and extraction attempts in `tests/security/import-resume/rate-limits.security.test.ts`
- [ ] T066 [P] [US6] Add hostile document safety tests for macros, scripts, active objects, links, hidden text, prompt injection, malformed files, and parser isolation in `tests/security/import-resume/hostile-documents.security.test.ts`
- [ ] T067 [P] [US6] Add deletion and retention verification tests for source files, raw text, snippets, page references, thumbnails, cached parsing output, embeddings, and minimal provenance in `tests/security/import-resume/deletion-retention.security.test.ts`
- [ ] T068 [P] [US6] Add privacy logging test proving full resumes, source snippets, uploaded files, credentials, prompts, tokens, and unnecessary personal data are excluded from logs in `tests/security/import-resume/privacy-logging.security.test.ts`
- [ ] T109 [P] [US6] Add hard parser memory enforcement tests proving 512 MiB excess terminates the isolated parser process and creates no review draft from abrupt partial output in `tests/security/import-resume/parser-memory-limit.security.test.ts`
- [ ] T110 [P] [US6] Add timeout enforcement tests proving the 3-minute foreground limit returns only threshold-qualified partial results with retry, replacement-upload, and manual-entry options in `tests/security/import-resume/parser-timeout.security.test.ts`
- [ ] T111 [P] [US6] Add per-user active-job, queued-job, upload-attempt, processing-start, HTTP 429, and Retry-After behavior tests in `tests/security/import-resume/rate-limit-retry-after.security.test.ts`
- [ ] T112 [P] [US6] Add parser isolation tests proving one terminated memory-limit or timeout job does not affect another user's or same user's independent job in `tests/security/import-resume/parser-job-isolation.security.test.ts`
- [ ] T113 [P] [US6] Add cleanup tests proving files, converted DOCX PDFs, raw text, snippets, page references, cached parser output, and temporary contact data are deleted after resource-limit failure in `tests/security/import-resume/resource-failure-cleanup.security.test.ts`
- [ ] T138 [P] [US6] Add duplicate-upload tests proving same-file and materially identical uploads create independent imports, count against rolling limits, do not merge drafts, do not share source-reconstructing artifacts, and keep independent retention deadlines in `tests/security/import-resume/duplicate-uploads.security.test.ts`
- [ ] T135 [P] [US6] Add deletion race and idempotency tests for processing-active deletion, already-deleted source, confirmed structured resume, scheduled retention job, repeated cancel/discard/delete requests, and no retention extension in `tests/security/import-resume/deletion-races.security.test.ts`

### Implementation for User Story 6

- [ ] T069 [US6] Enforce ownership checks on all import REST controllers and services in `apps/api/src/import-resume/import-resume.module.ts`
- [ ] T070 [US6] Implement rate-limit and concurrent-work enforcement with 5 attempts per rolling 10 minutes, 1 active job, 2 queued jobs, HTTP 429, Retry-After where applicable, and plain-language recovery messages in `apps/api/src/services/import-resume/import-limits.ts`
- [ ] T071 [US6] Implement parser-container isolation, no-execution safeguards, prompt-injection ignoring, 512 MiB hard memory enforcement, timeout termination, and no abrupt partial-output commit behavior in `packages/extraction/src/safety.ts`
- [ ] T072 [US6] Implement source deletion service for source documents and all source-reconstructing artifacts in `apps/api/src/services/import-resume/delete-source.ts`
- [ ] T073 [US6] Implement NestJS standalone retention worker processor for 7-day expiry and deletion verification in `apps/worker/src/import-resume/import-retention.processor.ts`
- [ ] T074 [P] [US6] Implement delete source UI and privacy-safe confirmation copy in `apps/web/src/features/import-resume/DeleteSourceControl.tsx`
- [ ] T075 [US6] Wire privacy-safe logging into import routes, workers, storage, extraction, deletion, and confirmation services in `apps/api/src/observability/import-events.ts`
- [ ] T114 [US6] Implement resource-limit failure cleanup service for parser workspaces, converted PDFs, extracted raw text, snippets, page references, cached parser output, and temporary contact data in `apps/api/src/services/import-resume/resource-failure-cleanup.ts`
- [ ] T115 [US6] Implement NestJS REST response mapping for memory-limit, timeout, active-job, queued-job, upload-attempt, processing-start, HTTP 429, Retry-After, and plain-language recovery messages in `apps/api/src/import-resume/limit-responses.ts`
- [ ] T136 [US6] Implement duplicate-upload handling that creates independent imports, applies rolling attempt limits, keeps separate retention deadlines, prevents cross-import artifact reuse, and may show user guidance without merging drafts in `apps/api/src/services/import-resume/duplicate-upload-policy.ts`
- [ ] T137 [US6] Implement idempotent deletion lifecycle handling for cancellation, discard, source deletion, expiry, retention jobs, processing-active cleanup, already-deleted source, and confirmed structured resume preservation in `apps/api/src/services/import-resume/deletion-lifecycle.ts`

**Checkpoint**: User Story 6 is independently testable as authorization, isolation, rate-limit, deletion, retention, and logging protection.

---

## Phase 9: User Story 4 - Recover From Partial Extraction or Failure (Priority: P2)

**Goal**: A user receives understandable recovery paths for partial extraction, validation failure, processing failure, timeout, cancellation, retry, replacement upload, manual entry, expired drafts, unsupported-language contact-only preview, no-supported-field extraction, and mixed-content documents.

**Independent Test**: Run unreadable, unsupported, password-protected, image-heavy, oversized, duplicate, partially readable, unsupported-language contact-only, mixed-content, and expired-draft fixtures and verify each failure state has a clear outcome and recovery path.

### Tests for User Story 4

- [ ] T076 [P] [US4] Add contract tests for retry, replace upload, cancel/discard import, delete source, expired draft, and no-supported-field responses in `tests/contract/import-resume/recovery.contract.test.ts`
- [ ] T077 [P] [US4] Add integration tests for validation failures and plain-language recovery actions in `tests/integration/import-resume/validation-failures.integration.test.ts`
- [ ] T078 [P] [US4] Add integration tests for partial extraction, timeout, retry, replacement upload, and manual-entry fallback in `tests/integration/import-resume/partial-timeout-recovery.integration.test.ts`
- [ ] T079 [P] [US4] Add integration tests for cancellation, discard, expired drafts, and retention-scheduled deletion in `tests/integration/import-resume/cancel-expiry.integration.test.ts`
- [ ] T080 [P] [US4] Add fixture tests for unrelated pages, separable resume content, inseparable mixed content, and no-supported-field extraction in `tests/integration/import-resume/mixed-content.integration.test.ts`
- [ ] T081 [P] [US4] Add no-AI fallback and optional AI classifier degradation tests in `tests/integration/import-resume/no-ai-fallback.integration.test.ts`
- [ ] T117 [P] [US4] Add navigation and integration tests proving manual-entry actions from unsupported-file, no-usable-extraction, timeout, processing-failure, expired-draft, and unsupported-language states reach `/resumes/new/manual` in `tests/integration/manual-resume/manual-entry-navigation.integration.test.ts`
- [ ] T118 [P] [US4] Add accessibility tests proving every manual-entry action has an accessible name, keyboard focus, and reaches the functional manual route in `tests/accessibility/manual-resume/manual-entry-route.a11y.test.ts`
- [ ] T122 [P] [US4] Add contract tests for unsupported-language contact-only preview, explicit transfer confirmation, no import draft creation, discard, and temporary data deletion in `tests/contract/import-resume/unsupported-language-contact-preview.contract.test.ts`
- [ ] T123 [P] [US4] Add integration tests for unsupported-language contact preview warning, manual-entry transfer, user-added field marking, and no draft-threshold satisfaction in `tests/integration/import-resume/unsupported-language-contact-preview.integration.test.ts`

### Implementation for User Story 4

- [ ] T082 [US4] Implement retry and replacement upload services with rate-limit checks and independent retention deadlines in `apps/api/src/services/import-resume/retry-replace.ts`
- [ ] T083 [US4] Implement cancellation and discard services that stop processing where possible and schedule source/artifact deletion in `apps/api/src/services/import-resume/cancel-discard.ts`
- [ ] T084 [US4] Implement expired draft and no-supported-field failure services in `apps/api/src/services/import-resume/failure-states.ts`
- [ ] T085 [US4] Implement mixed-content classification for separable and inseparable resume/unrelated content in `packages/extraction/src/mixed-content.ts`
- [ ] T086 [US4] Implement thin NestJS recovery REST controllers for retry, replace upload, cancel, discard, expired draft, manual fallback, and no-supported-field states in `apps/api/src/import-resume/recovery.controller.ts`
- [ ] T087 [P] [US4] Implement retry, replacement upload, cancellation, discard, manual-entry fallback, expired draft, and no-supported-field UI states in `apps/web/src/features/import-resume/RecoveryActions.tsx`
- [ ] T088 [US4] Supersede the optional AI classifier path with provider-failure recovery wiring that never claims complete semantic parsing without `ResumeSemanticParserProvider`, preserves manual entry and limited deterministic partial extraction fallback as defined by T185-T188, and delegates full AI-first semantics to T171-T176 in `apps/api/src/services/import-resume/optional-ai-classification.ts`
- [ ] T121 [US4] Wire manual-entry recovery actions from unsupported-file, no-usable-extraction, timeout, processing-failure, expired-draft, and unsupported-language states to `/resumes/new/manual` in `apps/web/src/features/import-resume/RecoveryActions.tsx`
- [ ] T124 [US4] Implement unsupported-language contact-only preview service with explicit confirmation before manual-entry transfer and no import-draft creation in `apps/api/src/services/import-resume/unsupported-language-contact-preview.ts`
- [ ] T125 [P] [US4] Implement unsupported-language warning and contact-only preview UI with confirm-transfer, discard, upload-another, and manual-without-transfer actions in `apps/web/src/features/import-resume/UnsupportedLanguageContactPreview.tsx`

**Checkpoint**: User Story 4 is independently testable as full import recovery and failure handling.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and constitutional gates that span user stories.

- [ ] T089 [P] Update user-facing support/help documentation for supported files, languages, limits, selectable text, retention, deletion, partial extraction, unsupported documents, and confirmation in `docs/import-resume-user-help.md`
- [ ] T090 [P] Update architecture documentation for import pipeline boundaries, deterministic source preparation, AI-first provider-independent semantic parsing, scoped T145 historical NO-GO, scoped T195 Codex app-server NO-GO, T203 direct-OAuth decision gate, provider adapter isolation, private storage, retention, deletion, and no source snippets after deletion in `docs/adr/0002-import-resume-pipeline.md`
- [ ] T091 [P] Add Docker Compose quickstart validation command mapping for all scenarios in `tests/import-resume-quickstart.md`
- [ ] T092 Run through Docker Compose and document complete quickstart validation results in `tests/import-resume-quickstart-results.md`
- [ ] T093 [P] Add constitution gate regression for non-technical UX excluding JSON, YAML, prompts, parser internals, provider names, model names, and technical diagnostics in `tests/integration/import-resume/non-technical-ux.integration.test.ts`
- [ ] T094 [P] Add constitution gate regression proving templates, visual customization, generated PDFs, raw PDF structures, and rendering components are untouched by import in `tests/integration/import-resume/protected-templates.integration.test.ts`
- [ ] T095 [P] Add AI behavior evaluation for provider-independent semantic parsing covering missing facts, prompt injection, unsupported claims, inferred classifications, malformed provider output, provider failure states, provenance handling, and no silent structured resume creation in `tests/integration/import-resume/ai-behavior.integration.test.ts`; depends on T152, T157-T160, and T166-T176
- [ ] T096 [P] Add extraction correctness evaluation measuring field precision, field recall, work-experience grouping accuracy, valid-evidence rate, invented-field rate, latency, provider-independent threshold compliance where available, Codex-specific T203 threshold compliance only if direct OAuth is selected, English/French/bilingual fixture coverage, PDF/DOCX fixture coverage, partial extraction, hostile documents, unsupported-language behavior, and mixed-content behavior against SC-001, SC-002, SC-006, SC-011, and SC-012 in `tests/integration/import-resume/extraction-outcomes.integration.test.ts`; depends on T169-T170 and T185-T188
- [ ] T097 [P] Add usability evaluation protocol for SC-003, SC-004, and SC-009 covering review-warning identification, correction timing, and participant understanding that the uploaded source is not the editable resume, structured edits do not modify the source file, source deletion does not delete a separately confirmed structured resume, and source plus reconstructable extraction artifacts expire under the 7-day policy in `docs/research/import-review-usability-protocol.md`
- [ ] T098 Perform final cleanup of import feature exports, NestJS module registrations, and package public APIs in `apps/api/src/import-resume/import-resume.module.ts` and `apps/web/src/features/import-resume/index.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on corrected Phase 1 bootstrap validation T126. Phase 2 blocks all user stories. T099-T103, T127-T133, and T134 are foundational despite their appended IDs and must complete before tasks that depend on concrete extraction, resource-limit enforcement, persistence, migrations, transactions, repository behavior, API/worker database integration, or complete persistence validation.
- **User Stories (Phases 3-5)**: Depend on Foundational completion and preserve the implemented upload, review, and confirmation foundations.
- **AI-First Semantic Parsing (Phase 6)**: Depends on Foundational completion and the implemented US1-US3 foundations it extends. T139-T145 remain completed historical research whose NO-GO is scoped only to direct `codex exec` production use, direct Codex CLI credential-file reuse/copying, Nuvitae-managed ChatGPT tokens, and Nuvitae-reproduced ChatGPT/Codex OAuth. The observed official Codex app-server spike path is historical: T189 completed -> T190 completed -> T191 research completed with terminal `BLOCKED` result -> T192 not executed and blocked -> T193 not executed and blocked -> T194 completed -> T195 completed NO-GO for the tested app-server candidate. The direct Codex OAuth compatibility spike follows the strict sequence T196 -> T197 -> T198 -> T199 -> T200 -> T201 -> T202 -> T203; T201 remains incomplete, C04 B02 and any further C04 live attempt remain unauthorized, C05-C06 remain unexecuted, and T202/T203/T164/T165 remain blocked. T208 remains deferred and non-blocking for the MVP semantic-import vertical slice. T146-T152 provider-neutral contracts and schema validation precede provider adapters and do not depend on successful Codex authentication. T153-T161 flattened-evidence grounding, no-invention, prompt-injection, absence, ambiguity, conflict, and privacy diagnostics precede T209. T209 depends only on T149-T161 and creates the provider-neutral worker workflow without selecting a production provider. T210 depends on the provider-neutral interface and schemas and is a test/local adapter only. T211 depends on T209 and T210. T171-T179 remain blocked by missing production semantic integration and must not be marked complete merely because T210 enables deterministic local testing. Adapter-neutral `AIProviderRuntimeConnection` persistence T162 depends on T149-T151 and does not depend on T145, T195, or T203. T180-T184 semantic result persistence precedes any production worker or application task that persists AI semantic parsing results. T164-T165 direct-OAuth production Codex integration depend on a qualifying T203 decision, successful direct OAuth, successful credential lifecycle, successful invocation, successful semantic evaluation, and satisfaction of every mandatory security condition recorded by T203; they cannot proceed based on T145, T195, T191 completion as a blocked investigation, T209, T210, or T211.
- **Remaining User Stories (Phases 7-9)**: Depend on Foundational completion and on the relevant AI-first semantic parsing tasks where they touch provider-backed parsing, semantic warnings, provider recovery, privacy, or browser acceptance.
- **Polish (Phase 10)**: Depends on all desired user stories and the AI-first semantic parsing phase being complete.

### User Story Dependencies

- **US1 Start From an Existing Resume (P1)**: First MVP story after Foundation. PDF/DOCX adapter fixture tests T104-T108 depend on T099-T102 and T018.
- **US2 Review and Correct Extracted Information (P1)**: Depends on US1 draft creation path for end-to-end behavior; domain and UI work can begin after Foundation.
- **US3 Confirm Creation of Structured Resume (P1)**: Depends on US2 review states and warning resolution.
- **AI-First Semantic Parsing Foundation**: Begins after US1-US3 foundations are available. The shortest MVP vertical-slice sequence is T149-T161 -> T209 -> T210 -> T211. T146-T148 can be completed before or alongside T149-T161 as verification, but T209 starts only after T149-T161 are done. T210 is a deterministic test/local adapter, not a production provider and not a substitute for the Codex Community objective. T171-T179 remain blocked by missing production semantic integration and must not be marked complete because T210 works. Provider contracts T146-T152 precede adapter-neutral `AIProviderRuntimeConnection` persistence T162 and adapters T164-T165, and provider-independent work remains valid without successful Codex authentication. T189 is complete, T190 is complete, T191 is complete only as a terminal `BLOCKED` authentication investigation, T192-T193 remain incomplete and blocked/non-executed, T194 is complete, and T195 is complete as NO-GO for the tested app-server candidate only. Direct Codex OAuth research remains stopped at incomplete T201; T202/T203/T164/T165 remain blocked. T208 remains deferred and non-blocking for this MVP vertical slice, and no C04-C06 live attempt is authorized. Codex production adapter implementation T164-T165 depends on a qualifying T203 decision, successful direct OAuth, successful credential lifecycle, successful invocation, successful semantic evaluation, and satisfaction of every mandatory security condition recorded by T203; it cannot proceed based on the first T145 spike, T195 app-server NO-GO, T191 completion as a blocked investigation, or the deterministic test adapter. Schema validation T152 and grounding/no-invention validation T157-T158 precede review-draft persistence in T209. Limited deterministic partial fallback contract T185-T188 precedes provider recovery tests/UI T167 and T176.
- **US5 Complete Import Accessibly (P1)**: Can run alongside US6/US4 after Foundation; final integration depends on US1-US3 UI surfaces and provider disclosure/recovery UI T175-T176 where provider-backed states are shown.
- **US6 Protect Imported Resume Data (P1)**: Can run alongside US5/US4 after Foundation; final enforcement touches all import routes, parser processes, provider sessions, workers, persistence repositories, and cleanup services. Resource-limit tests T109-T113 and implementation tasks T114-T115 depend on T102-T103. Persistence-sensitive enforcement depends on T010 and T127-T134. Provider credential/session isolation and privacy logging depend on T161-T163 and T168; Codex direct-OAuth credential-broker security conclusions depend on T196-T203 only when the direct-OAuth adapter is selected.
- **US4 Recover From Partial Extraction or Failure (P2)**: Depends on US1 processing states and integrates with US5 accessibility, US6 deletion/retention protections, provider recovery T167, T173, and T176, and limited deterministic partial fallback T185-T188. Manual-entry recovery tasks T117-T118 and T121 depend on T119-T120. Unsupported-language contact preview tasks T122-T125 depend on the validation and recovery contracts.

### Within Each User Story

- Tests and evaluations must be written first and fail before implementation.
- Domain operations before services.
- Services before API routes.
- API routes before web clients.
- Web clients before full UI integration.
- Story checkpoint validation before moving to the next priority story.

---

## Parallel Opportunities

- Setup tasks T003-T007 can run in parallel after T001-T002 define the workspace manifest and development image; T126 runs after T001-T007 provide the bootstrap targets and covers bootstrap-only container validation.
- Foundational tasks T011-T014, T016-T020, T099-T101, T103, and T127-T130 can run in parallel after T008-T010 establish shared domain and persistence targets; T102 integrates parser execution after T099-T101, T131-T133 integrate TypeORM configuration after T010 and the migration/constraint tests are defined, and T134 runs after T010 and T127-T133 complete.
- US1 test tasks T021-T025, T104-T108, and T116 can run in parallel after fixtures and adapter contracts exist.
- US2 test tasks T035-T039 and UI component tasks T044-T045 can run in parallel.
- US3 test tasks T047-T050 and UI tasks T054-T055 can run in parallel.
- Completed T139-T144 ran in parallel because each wrote a distinct historical research file and converged at T145. Official Codex app-server spike tasks follow the observed blocked historical path: T189 and T190 are complete, T191 is complete only as terminal `BLOCKED` research, T192-T193 are blocked and not parallelizable because no authenticated runtime exists, and T194-T195 are complete. Direct Codex OAuth compatibility tasks are strictly sequential and currently stopped at incomplete T201; T202/T203/T164/T165 remain blocked. T208 is deferred and non-blocking for the MVP semantic-import vertical slice, and C04-C06 live attempts remain unauthorized or unexecuted. Provider contract/schema tests T146-T148 can run in parallel with implementation tasks T149-T151, while T152 depends on the schema shape from T150; grounding and safety tests T153-T156 can run in parallel before implementations T157-T160; T209 waits for T149-T161; T210 can start after the provider-neutral interface and schemas exist; T211 waits for T209 and T210. Semantic persistence test T180 precedes persistence implementations T181-T184; fallback tests T185-T186 precede fallback contract/orchestration tasks T187-T188. Application tests T166-T170 can run in parallel before production orchestration tasks T171-T176, but T171-T179 remain blocked by missing production semantic integration and are not unblocked by T210.
- US5 tests T057-T059 and components T060-T062 can run in parallel.
- US6 tests T064-T068 and T109-T113 can run in parallel, and T074-T075 plus T114-T115 can run in parallel with backend enforcement tasks after contracts are stable.
- US4 tests T076-T081, T117-T118, and T122-T123 can run in parallel, and T087, T121, and T125 can run in parallel with backend recovery services after route contracts are stable.
- Polish tasks T089-T091 and T093-T097 can run in parallel after the AI-first dependencies noted on T095-T096 are satisfied.

---

## Parallel Example: User Story 1

```bash
Task: "T021 [P] [US1] Add contract tests for start import, validate document, and process extraction responses in tests/contract/import-resume/start-import.contract.test.ts"
Task: "T022 [P] [US1] Add integration test for authenticated supported PDF/DOCX upload through progress and draft-ready state in tests/integration/import-resume/start-upload.integration.test.ts"
Task: "T023 [P] [US1] Add integration test for unauthenticated upload requiring sign-in before file acceptance in tests/integration/import-resume/authentication-gate.integration.test.ts"
Task: "T024 [P] [US1] Add fixture tests for PDF/DOCX file type, limits, selectable text, and supported languages in tests/integration/import-resume/upload-validation.integration.test.ts"
Task: "T025 [P] [US1] Add accessibility test for upload labels, keyboard focus, and progress live announcements in tests/accessibility/import-resume/upload-progress.a11y.test.ts"
```

---

## Parallel Example: User Story 6

```bash
Task: "T064 [P] [US6] Add authorization isolation tests for import resources in tests/security/import-resume/authorization-isolation.security.test.ts"
Task: "T065 [P] [US6] Add rate-limit and concurrent-work tests in tests/security/import-resume/rate-limits.security.test.ts"
Task: "T066 [P] [US6] Add hostile document safety tests in tests/security/import-resume/hostile-documents.security.test.ts"
Task: "T067 [P] [US6] Add deletion and retention verification tests in tests/security/import-resume/deletion-retention.security.test.ts"
Task: "T068 [P] [US6] Add privacy logging tests in tests/security/import-resume/privacy-logging.security.test.ts"
```

---

## Execution Example: MVP Provider-Neutral Semantic Import

```bash
Task: "T149 [P] Define ResumeSemanticParserProvider, normalized transcript input, flattened fragments, fragment hashes, and provider-neutral contracts in packages/import-application/src/semantic-parser/resume-semantic-parser-provider.ts"
Task: "T150 [P] Define the versioned structured resume extraction schema with required nullable absence handling and flattened evidence in packages/contracts/src/import-resume/semantic-extraction.ts"
Task: "T151 [P] Define provider-neutral failure and recovery categories in packages/import-application/src/semantic-parser/provider-errors.ts"
Task: "T152 Implement strict semantic response validation in packages/import-application/src/semantic-parser/validate-semantic-response.ts"
Task: "T153 [P] Add flattened-evidence grounding tests in packages/import-application/src/validation/evidence-grounding.test.ts"
Task: "T154 [P] Add no-invention tests in packages/import-application/src/validation/no-invention.test.ts"
Task: "T155 [P] Add prompt-injection resistance tests in tests/security/import-resume/semantic-parser-prompt-injection.security.test.ts"
Task: "T156 [P] Add ambiguity and conflict tests in packages/import-application/src/validation/semantic-conflicts.test.ts"
Task: "T157 Implement flattened-evidence grounding validation in packages/import-application/src/validation/evidence-grounding.ts"
Task: "T158 Implement no-invention validation in packages/import-application/src/validation/no-invention.ts"
Task: "T159 Implement explicit absence, ambiguity, and inferred-grouping diagnostics in packages/import-application/src/validation/inference-review.ts"
Task: "T160 Implement duplicate and conflict detection in packages/import-application/src/validation/semantic-conflicts.ts"
Task: "T161 Implement privacy-safe provider diagnostics in apps/api/src/observability/provider-import-events.ts"
Task: "T209 Integrate the provider-neutral semantic import workflow in apps/worker/src/import-resume/semantic-import.processor.ts after T149-T161"
Task: "T210 Add the deterministic test/local semantic provider in packages/import-application/src/providers/testing/deterministic-semantic-parser-provider.ts after the provider-neutral interface and schemas"
Task: "T211 Validate the browser and worker semantic-import vertical slice in tests/browser/import-resume/semantic-import-vertical-slice.spec.ts after T209 and T210"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup, including T126 container-only bootstrap validation.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: US1 Start From an Existing Resume.
4. Stop and validate upload, authentication gate, validation, progress, draft creation, and timeout recovery independently.

### Incremental Delivery

1. Setup + Foundation.
2. US1 MVP import start/upload/progress.
3. US2 review and correction.
4. US3 explicit structured resume confirmation.
5. MVP provider-neutral semantic import vertical slice: T149-T161, then T209, T210, and T211, preserving the Codex Community objective without selecting a new production provider.
6. US5 accessibility completion across the P1 path, including provider disclosure and recovery states.
7. US6 security/privacy/retention hardening across the P1 path, including provider credential/session isolation.
8. US4 P2 recovery paths, including no-provider and provider-failure recovery.
9. Polish and constitution gates.

### Parallel Team Strategy

After Foundation:

- Developer A: US1 processing path and upload UI.
- Developer B: US2 review model and review UI.
- Developer C: AI-first provider contracts, schema validation, grounding, and no-invention gates.
- Developer D: US6 security/privacy tests and enforcement.
- Developer E: US5 accessibility components and tests.

---

## Notes

- `[P]` tasks use different files and avoid direct dependency on incomplete tasks.
- `[US#]` labels map tasks to user stories from `spec.md`.
- `T099`-`T125` and `T127`-`T138` were appended during specification-analysis remediation to preserve existing task references where possible; dependency notes above define their execution order.
- Each user story includes required tests/evaluations/regression checks before implementation tasks.
- No rendering-generation task is included because this feature does not generate final PDFs or modify templates; protected-template regression is included to enforce that boundary.
- T017 and T088 preserve/supersede the older optional AI classifier boundary only as compatibility/recovery notes; complete semantic parsing is now covered by provider-independent tasks T146-T188, the MVP provider-neutral vertical-slice tasks T209-T211, historical app-server evidence T189-T195, and the direct Codex OAuth compatibility spike T196-T203.
- T139-T145 remain completed and historical; T145 does not block all Codex subscription integration, but T164-T165 must not proceed from T145 alone.
- T189-T195 remain completed historical app-server research; T195 NO-GO applies only to the tested app-server candidate and does not reopen T192-T193.
- Codex-specific production adapter tasks T164-T165 must not be implemented unless T203 records GO or a qualifying CONDITIONAL GO whose stated conditions have been satisfied, including successful direct OAuth, credential lifecycle, invocation, semantic evaluation, and all mandatory security conditions; adapter-independent contracts and recovery behavior still proceed.
- T208 remains deferred and non-blocking for the MVP provider-neutral semantic-import vertical slice; C04-C06 live attempts remain outside this task sequence.

## Phase 11: Convergence

- [x] T204 Reconcile the canonical T201 status record before any further live Campaign B execution: record that C02 passed canonical live validation, C03 B01 and B02 are immutable failed evidence, and then-pending C04-C06/T202/T203/T164/T165 status required explicit future authorization before advancement; preserve one-run/one-request/zero-retry limits; retain every real-resume-fact grounding and recall threshold; require `document_language` as a separately evaluated document-level classification gate excluded from exact/high-priority fact recall; and retain only sanitized canonical evidence with no raw model output. Do not authorize or run C03 B03 as part of this reconciliation. Current post-C04-B01 status is governed by T208. Trace to T201, FR-019, FR-021, FR-021f, and Constitution VI/IX/X/XIII (partial).
- [x] T205 Reconcile T201-C04 optional-absence, evidence-coordinate, and provenance-category contracts before authorization across `spikes/codex-direct-oauth/schemas/t201-output-schema.json`, `spikes/codex-direct-oauth/schemas/t201-fixture-manifest.schema.json`, `spikes/codex-direct-oauth/fixtures/t201-matrix/t201-c02.manifest.json` through `t201-c06.manifest.json`, `spikes/codex-direct-oauth/t201-semantic-broker.mjs`, `spikes/codex-direct-oauth/lib/t201-semantic-evaluator.mjs`, `spikes/codex-direct-oauth/lib/t201-matrix-evaluator.mjs`, deterministic golden outputs in `spikes/codex-direct-oauth/fixtures/t201-expected-facts.json`, semantic and matrix tests in `spikes/codex-direct-oauth/test/t201-semantic.test.mjs` and `spikes/codex-direct-oauth/test/t201-matrix.test.mjs`, versioned PDF coordinate-mapping code in `spikes/codex-direct-oauth/lib/t201-pdf-coordinate-mapping.mjs` and tests in `spikes/codex-direct-oauth/test/t201-pdf-coordinate-mapping.test.mjs`, and narrow non-destructive canonical-status cross-references in `docs/research/codex-direct-semantic-parsing.md`. Require required nullable optional scalar and nested-object properties, `[]` for absent collections, rejection of omitted required nullable fields, explicit prompt `null` for declared absent paths, evaluator rejection of omission and invented non-null values, no value evidence for `null`, explicit manifest absent paths, explicit valid provenance category for every expected fact and diagnostic, fail-closed semantic category-to-path validation, continued flattened `line`/`start`/`end` support, preservation of physical page/item/offset provenance, and a versioned deterministic mapping with multi-page, multi-item, and multi-column tests. Preserve C01-C03 historical evidence byte-identically through an adapter or versioned contract rather than rewriting it; update status references without rewriting historical records. Current post-C04-B01 status is governed by T208: C04 B01 remains failed under its original active contract, C04 B02 and further C04 live attempts remain unauthorized, C05-C06 remain unexecuted, T201 remains incomplete, and T202, T203, T164, and T165 remain blocked. Depends on T204. Trace to FR-009d through FR-009g, FR-021n, and Constitution VI/IX/X/XIII.

## Phase 12: Convergence

- [x] T206 Restore fail-closed Campaign-B canonical-target authorization validation in a dedicated minimal test environment by providing Git only to the targeted authorization-test image or command, retaining real `git ls-files --error-unmatch` verification of `run-t201-live.sh`, `t201-campaign-b-runner.mjs`, and `run-t201-live-execute.sh`, and proving missing, untracked, stale, reused-evidence, multi-request, and retry contracts still fail before Docker in `docker/test/Dockerfile`, `compose.yml`, and `spikes/codex-direct-oauth/test/t201-campaign-b-authorization.test.mjs`; do not add Git to production/runtime images, weaken the tracked-target guard, modify the authorization registry, authorize C04, or execute a live request. Current post-C04-B01 readiness is governed by T208, and no C04 B02 or further C04 live attempt is authorized. Trace to FR-021n and Constitution VI/IX/XIII (partial).

## Phase 13: Convergence

- [x] T207 Reconcile the stale FR-009g provenance-category vocabulary with the approved T201 v2 contract in `specs/001-import-resume/spec.md`, `spikes/codex-direct-oauth/schemas/t201-output-schema.json`, `spikes/codex-direct-oauth/schemas/t201-fixture-manifest.schema.json`, `spikes/codex-direct-oauth/lib/t201-semantic-evaluator.mjs`, `spikes/codex-direct-oauth/lib/t201-matrix-evaluator.mjs`, and `spikes/codex-direct-oauth/test/t201-matrix.test.mjs`: current v2 C02-C06 must use only `basics`, `work`, `education`, `skills`, `languages`, `certifications`, `ambiguity`, and `absence`, while immutable v1 C01-C03 historical outputs retain their explicit compatibility vocabulary. Preserve fail-closed schema and semantic category-to-path validation, historical evidence byte identity, and all T205 absence/coordinate gates; do not authorize or execute C04. Current post-C04-B01 readiness is governed by T208, and no C04 B02 or further C04 live attempt is authorized. Trace to FR-009g, FR-021n, and Constitution VI/XIII (contradicts).

## Phase 14: Convergence

- [ ] T208 Move physical document provenance from model output to deterministic post-model enrichment across `spikes/codex-direct-oauth/schemas/t201-output-schema.json`, `spikes/codex-direct-oauth/schemas/t201-fixture-manifest.schema.json`, current-version manifests in `spikes/codex-direct-oauth/fixtures/t201-matrix/`, `spikes/codex-direct-oauth/t201-semantic-broker.mjs`, `spikes/codex-direct-oauth/lib/t201-semantic-evaluator.mjs`, `spikes/codex-direct-oauth/lib/t201-matrix-evaluator.mjs`, a deterministic provenance-enrichment module such as `spikes/codex-direct-oauth/lib/t201-document-provenance-enrichment.mjs`, focused tests under `spikes/codex-direct-oauth/test/`, and only narrowly required plan/task/status references: model output must contain only canonical flattened evidence (`line`, `start`, `end`, fragment hash, and existing grounded fragment metadata) and must reject `page`, `item`, and physical offsets; prompts, output schema, semantic evaluator, and matrix evaluator must align on that rule; flattened coordinates, fragment bounds, fragment hashes, unsupported-fact rejection, no-invention guarantees, explicit-null handling, ambiguity handling, and existing grounded fragment metadata remain mandatory; physical-enrichment failure must not erase or relabel a valid flattened grounding result; deterministic PDF/DOCX extraction metadata may enrich validated flattened evidence after model evaluation using versioned deterministic mapping, with PDF enrichment allowed to include page/item/physical offsets, DOCX enrichment using format-specific deterministic metadata where available, and plain-text imports allowed to have no physical provenance; evaluator order must be schema validation, flattened grounding validation, recall/ambiguity/absence/no-invention validation, deterministic provenance enrichment, then separate enrichment-consistency validation, keeping semantic parsing success distinct from physical-provenance enrichment status; C01-C04 historical evidence must remain byte-identical, C04 B01 must remain failed under its original active contract, historical evidence must not be reinterpreted or rewritten, and contract versioning or an adapter must preserve historical readers; tests must prove valid flattened-only model output passes, model output containing physical coordinates is rejected, deterministic PDF enrichment succeeds for multiple items, multiple pages, and multi-column ordering, invalid deterministic mapping is reported as enrichment failure rather than semantic hallucination, plain text passes without physical provenance, C02/C03 regressions pass, and C04 deterministic offline semantic parsing passes under the corrected boundary. Do not implement production import behavior, do not authorize or run any live case, do not create C04 B02, keep T201 incomplete, keep C05-C06 pending, and keep T202, T203, T164, and T165 blocked. Depends on T204-T207. Trace to FR-009c, FR-009f, FR-009h, FR-009i, FR-021n, and Constitution VI/IX/X/XIII.
