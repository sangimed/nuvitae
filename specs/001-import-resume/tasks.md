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

- [ ] T001 Create monorepo workspace manifests with pinned package-manager configuration and container-only scripts in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- [ ] T002 Create Docker development workspace image definition with pinned Node.js, Corepack, pnpm, shared tools, `/workspace` working directory, and no host dependency assumptions in `docker/dev/Dockerfile`
- [ ] T003 [P] Create production Docker image definitions or multi-stage targets for non-root web, API, and worker runtimes in `docker/web/Dockerfile`, `docker/api/Dockerfile`, and `docker/worker/Dockerfile`
- [ ] T004 [P] Create Compose service definitions for `workspace`, web, API, worker, PostgreSQL, Redis-compatible queue, local private object storage, Docker-managed pnpm store, and Docker-managed `node_modules` volumes in `compose.yml` and `compose.dev.yml`
- [ ] T005 [P] Create Docker build context rules and container entrypoint targets for workspace, web, API, worker, parser, and test commands in `.dockerignore` and `docker/entrypoints`
- [ ] T006 [P] Create application and package directory structure in `apps/web`, `apps/api`, `packages/domain`, `packages/extraction`, `packages/storage`, and `packages/test-fixtures`
- [ ] T007 [P] Configure container-based lint, format, typecheck, unit, integration, browser/accessibility, migration, and build commands plus setup checks using `docker compose run --rm workspace ...` in `package.json`, `vitest.config.ts`, and `tests`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared domain, persistence, storage, authorization, worker, logging, concrete extraction adapters, resource-limit enforcement foundations, and fixture foundations that all user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T008 Define import domain types and enums for imported documents, artifacts, drafts, fields, warnings, work experience, corrections, structured resumes, and deletion jobs in `packages/domain/src/resume-import/types.ts`
- [ ] T009 Define domain validation helpers for upload limits, draft thresholds, warning review states, retention deadlines, and confirmation blocking in `packages/domain/src/resume-import/validation.ts`
- [ ] T010 Define persistence schema for import and structured resume entities in `apps/api/src/db/schema/resume-import.ts`
- [ ] T011 [P] Implement privacy-safe logger with redaction for resumes, raw text, snippets, files, tokens, credentials, prompts, and unnecessary personal data in `apps/api/src/observability/privacy-logger.ts`
- [ ] T012 [P] Implement authenticated user context and ownership guard utilities in `apps/api/src/auth/user-context.ts` and `apps/api/src/auth/ownership.ts`
- [ ] T013 [P] Implement private object storage key policy and signed internal access helpers for a containerized or Docker-volume-backed local private storage implementation in `packages/storage/src/private-import-storage.ts`
- [ ] T014 [P] Implement import rate-limit and concurrent-work guard interfaces for 5 attempts per rolling 10 minutes, 1 active job, and 2 queued jobs per user in `apps/api/src/services/import-resume/import-limits.ts`
- [ ] T015 Implement background job queue contracts for validation, extraction, cancellation, retry, and deletion jobs in `apps/api/src/workers/import-jobs.ts`
- [ ] T016 [P] Create deterministic extraction adapter interfaces for PDF, DOCX, language detection, page counting, selectable text, and source locations in `packages/extraction/src/adapters.ts`
- [ ] T017 [P] Create optional AI classifier adapter interface that accepts deterministic extraction output and returns only classifications and ambiguity warnings in `packages/extraction/src/ai-classifier.ts`
- [ ] T018 Create fixture manifest covering PDF, DOCX, French, English, bilingual, partial, unsupported-language, oversized, over-page-limit, malformed, corrupted, password-protected, image-only/scanned, mixed text-and-image, hostile, mixed-content, and no-supported-field resumes in `packages/test-fixtures/src/resume-import/manifest.ts`
- [ ] T019 [P] Define API response envelope and plain-language error categories for import flows in `apps/api/src/routes/import-resume/responses.ts`
- [ ] T020 [P] Define web route shell and import feature state machine types in `apps/web/src/features/import-resume/state.ts`
- [ ] T099 [P] Implement concrete PDF.js PDF extraction adapter for page count and text extraction with page, bounding-box, and text-item source-location provenance in `packages/extraction/src/pdf/pdfjs-pdf-adapter.ts`
- [ ] T100 [P] Implement concrete DOCX Office Open XML extraction adapter with package part, paragraph/table/cell/run, and character-offset source-location provenance in `packages/extraction/src/docx/ooxml-docx-adapter.ts`
- [ ] T101 [P] Implement isolated DOCX rendered-page-count validator that runs LibreOffice headless only inside the worker or parser container and uses PDF page counting in `packages/extraction/src/docx/libreoffice-rendered-page-count.ts`
- [ ] T102 Implement isolated parser runner contract for worker/parser container execution with configurable 512 MiB memory limit, 3-minute foreground timeout, process termination, and no-partial-output commit semantics in `packages/extraction/src/isolated-parser-runner.ts`
- [ ] T103 [P] Define production-safe processing limit configuration schema that can tune but not disable file size, page count, timeout, memory, concurrency, queue, and rolling attempt limits in `apps/api/src/config/import-processing-limits.ts`

**Checkpoint**: Foundation ready, including concrete PDF/DOCX adapters and isolated parser limits. User story implementation can now begin.

---

## Phase 3: User Story 1 - Start From an Existing Resume (Priority: P1) MVP

**Goal**: A user starting resume creation sees import as the recommended path, can choose functional manual entry, can authenticate before upload, can upload a supported PDF/DOCX, and receives plain-language validation/extraction progress through draft creation or timeout.

**Independent Test**: Start resume creation, choose manual entry and verify `/resumes/new/manual`, then choose import, sign in if needed, upload a supported document, and reach either review draft creation or a recoverable timeout state within the 3-minute foreground limit.

### Tests for User Story 1

- [ ] T021 [P] [US1] Add contract tests for start import, validate document, and process extraction responses in `tests/contract/import-resume/start-import.contract.test.ts`
- [ ] T022 [P] [US1] Add integration test for authenticated supported PDF/DOCX upload through progress and draft-ready state in `tests/integration/import-resume/start-upload.integration.test.ts`
- [ ] T023 [P] [US1] Add integration test for unauthenticated upload requiring sign-in before file acceptance in `tests/integration/import-resume/authentication-gate.integration.test.ts`
- [ ] T024 [P] [US1] Add fixture tests for PDF/DOCX file type, 10 MB limit, 5 rendered page limit, selectable text, and French/English/bilingual language validation in `tests/integration/import-resume/upload-validation.integration.test.ts`
- [ ] T025 [P] [US1] Add accessibility test for upload labels, keyboard focus, and progress live announcements in `tests/accessibility/import-resume/upload-progress.a11y.test.ts`
- [ ] T104 [P] [US1] Add PDF fixture tests for page-count extraction and PDF text extraction with page and source-location provenance in `packages/extraction/src/pdf/pdfjs-pdf-adapter.test.ts`
- [ ] T105 [P] [US1] Add DOCX fixture tests for rendered-page-count validation and text extraction with source-location provenance in `packages/extraction/src/docx/ooxml-docx-adapter.test.ts`
- [ ] T106 [P] [US1] Add malformed, corrupted, and password-protected document fixture tests for PDF and DOCX validation failures in `tests/integration/import-resume/malformed-protected-documents.integration.test.ts`
- [ ] T107 [P] [US1] Add image-only/scanned PDF detection and mixed text-and-image PDF fixture tests in `tests/integration/import-resume/pdf-selectable-text.integration.test.ts`
- [ ] T108 [P] [US1] Add French, English, and bilingual fixture tests for each supported document format in `tests/integration/import-resume/supported-language-fixtures.integration.test.ts`
- [ ] T116 [P] [US1] Add contract tests proving `/resumes/new/manual` creates a blank manual structured-resume draft without imported document or import job in `tests/contract/manual-resume/create-manual-draft.contract.test.ts`

### Implementation for User Story 1

- [ ] T026 [P] [US1] Implement create-resume entry and import/manual choice UI in `apps/web/src/features/import-resume/CreateResumeEntry.tsx`
- [ ] T027 [P] [US1] Implement upload guidance, supported-file copy, privacy copy, and file chooser UI in `apps/web/src/features/import-resume/UploadStep.tsx`
- [ ] T028 [P] [US1] Implement progress state UI with plain-language states and screen-reader live region in `apps/web/src/features/import-resume/ProcessingStep.tsx`
- [ ] T029 [US1] Implement start import API route with authentication, rate-limit check, private storage write, and `ImportedDocument` creation in `apps/api/src/routes/import-resume/start-import.ts`
- [ ] T030 [US1] Implement document validation service for format, size, rendered pages, language, selectable text, unsafe/unreadable/corrupted/password-protected failures, and recovery categories in `apps/api/src/services/import-resume/validate-document.ts`
- [ ] T031 [US1] Implement deterministic extraction orchestration that creates a draft only when at least one supported field has explicit source content and source location in `apps/api/src/services/import-resume/process-extraction.ts`
- [ ] T032 [US1] Implement worker handlers for validation, extraction, timeout, and progress state persistence in `apps/api/src/workers/import-processing-worker.ts`
- [ ] T033 [US1] Implement web polling/subscription client for processing status and timeout recovery actions in `apps/web/src/services/import-resume/import-status-client.ts`
- [ ] T034 [US1] Wire import flow route from create entry through upload and processing states in `apps/web/src/app/import-resume/page.tsx`
- [ ] T119 [US1] Implement `/resumes/new/manual` route that creates a blank editable structured-resume draft without import records in `apps/web/src/app/resumes/new/manual/page.tsx`
- [ ] T120 [P] [US1] Implement reusable structured-resume section editing components shared by manual entry and import review where appropriate in `apps/web/src/features/resume-editor/StructuredResumeSections.tsx`

**Checkpoint**: User Story 1 is independently testable as the MVP import entry, upload, validation, progress, and draft/timeout path.

---

## Phase 4: User Story 2 - Review and Correct Extracted Information (Priority: P1)

**Goal**: A user can review extracted resume data in recognizable sections, see uncertainty warnings, correct or remove every extracted field, preserve multiple roles, and handle inferred groupings before confirmation.

**Independent Test**: Import a resume with complete, missing, duplicate, conflicting, inferred, and ambiguous fields, then resolve every field or warning in review without modifying the uploaded source.

### Tests for User Story 2

- [ ] T035 [P] [US2] Add contract tests for read import draft and update review actions in `tests/contract/import-resume/review-draft.contract.test.ts`
- [ ] T036 [P] [US2] Add integration test for grouped review sections and field correction actions in `tests/integration/import-resume/review-correction.integration.test.ts`
- [ ] T037 [P] [US2] Add integration test for duplicate, conflicting, missing, low-confidence, and inferred warning state transitions in `tests/integration/import-resume/warning-resolution.integration.test.ts`
- [ ] T038 [P] [US2] Add domain test for multiple roles under one employer and ongoing-role display semantics in `packages/domain/src/resume-import/work-experience.test.ts`
- [ ] T039 [P] [US2] Add accessibility test for warning labels, non-colour warning treatment, editable fields, and keyboard review flow in `tests/accessibility/import-resume/review.a11y.test.ts`

### Implementation for User Story 2

- [ ] T040 [P] [US2] Implement extracted field, warning, correction, work experience, and role domain operations in `packages/domain/src/resume-import/review.ts`
- [ ] T041 [US2] Implement read import draft service with grouped resume sections, source status, confidence status, inference status, and available review actions in `apps/api/src/services/import-resume/read-draft.ts`
- [ ] T042 [US2] Implement update review service for confirm, edit, remove, complete, add, exclude, and intentionally leave actions in `apps/api/src/services/import-resume/update-review.ts`
- [ ] T043 [US2] Implement read draft and update review API routes in `apps/api/src/routes/import-resume/review.ts`
- [ ] T044 [P] [US2] Implement sectioned review UI for personal/contact, headline, summary, work experience, education, skills, languages, projects, certifications, and links using shared structured-resume section components where appropriate in `apps/web/src/features/import-resume/ReviewStep.tsx`
- [ ] T045 [P] [US2] Implement warning and provenance UI components in `apps/web/src/features/import-resume/ReviewWarning.tsx` and `apps/web/src/features/import-resume/FieldProvenance.tsx`
- [ ] T046 [US2] Implement review API client and optimistic review state updates without source-document mutation in `apps/web/src/services/import-resume/review-client.ts`

**Checkpoint**: User Story 2 is independently testable as a review and correction surface for extracted data.

---

## Phase 5: User Story 3 - Confirm Creation of Structured Resume (Priority: P1)

**Goal**: A user explicitly confirms reviewed import data before structured resume creation, and structured resume data remains distinct from the uploaded source.

**Independent Test**: Complete import review, attempt confirmation with unresolved warnings, resolve them, confirm creation, then verify edits target structured resume data and source retention remains unchanged.

### Tests for User Story 3

- [ ] T047 [P] [US3] Add contract tests for confirm structured resume success and blocking errors in `tests/contract/import-resume/confirm-resume.contract.test.ts`
- [ ] T048 [P] [US3] Add integration test for unresolved warning blocking, explicit confirmation, and user-confirmed field status in `tests/integration/import-resume/confirm-structured-resume.integration.test.ts`
- [ ] T049 [P] [US3] Add domain test proving confirmation does not restart source/artifact retention and source deletion does not delete structured resume data in `packages/domain/src/resume-import/confirmation.test.ts`
- [ ] T050 [P] [US3] Add integration test for resuming or discarding an unconfirmed draft before 7-day expiry in `tests/integration/import-resume/resume-draft.integration.test.ts`

### Implementation for User Story 3

- [ ] T051 [P] [US3] Implement structured resume creation domain mapper from reviewed fields and user corrections in `packages/domain/src/resume-import/structured-resume-mapper.ts`
- [ ] T052 [US3] Implement confirmation service that blocks unresolved warnings, requires one user-confirmed supported field, creates `StructuredResume`, and preserves original retention deadline in `apps/api/src/services/import-resume/confirm-structured-resume.ts`
- [ ] T053 [US3] Implement confirm structured resume API route in `apps/api/src/routes/import-resume/confirm.ts`
- [ ] T054 [P] [US3] Implement confirmation dialog and blocked-confirmation summary UI in `apps/web/src/features/import-resume/ConfirmationStep.tsx`
- [ ] T055 [P] [US3] Implement structured resume provenance display that excludes raw snippets after source deletion in `apps/web/src/features/import-resume/StructuredResumeProvenance.tsx`
- [ ] T056 [US3] Implement resume draft resume/discard client behavior before expiry in `apps/web/src/services/import-resume/draft-lifecycle-client.ts`

**Checkpoint**: User Story 3 is independently testable as explicit structured resume creation from reviewed import data.

---

## Phase 6: User Story 5 - Complete Import Accessibly (Priority: P1)

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

## Phase 7: User Story 6 - Protect Imported Resume Data (Priority: P1)

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

### Implementation for User Story 6

- [ ] T069 [US6] Enforce ownership checks on all import routes and services in `apps/api/src/routes/import-resume/index.ts`
- [ ] T070 [US6] Implement rate-limit and concurrent-work enforcement with 5 attempts per rolling 10 minutes, 1 active job, 2 queued jobs, HTTP 429, Retry-After where applicable, and plain-language recovery messages in `apps/api/src/services/import-resume/import-limits.ts`
- [ ] T071 [US6] Implement parser-container isolation, no-execution safeguards, prompt-injection ignoring, 512 MiB hard memory enforcement, timeout termination, and no abrupt partial-output commit behavior in `packages/extraction/src/safety.ts`
- [ ] T072 [US6] Implement source deletion service for source documents and all source-reconstructing artifacts in `apps/api/src/services/import-resume/delete-source.ts`
- [ ] T073 [US6] Implement retention worker for 7-day expiry and deletion verification in `apps/api/src/workers/import-retention-worker.ts`
- [ ] T074 [P] [US6] Implement delete source UI and privacy-safe confirmation copy in `apps/web/src/features/import-resume/DeleteSourceControl.tsx`
- [ ] T075 [US6] Wire privacy-safe logging into import routes, workers, storage, extraction, deletion, and confirmation services in `apps/api/src/observability/import-events.ts`
- [ ] T114 [US6] Implement resource-limit failure cleanup service for parser workspaces, converted PDFs, extracted raw text, snippets, page references, cached parser output, and temporary contact data in `apps/api/src/services/import-resume/resource-failure-cleanup.ts`
- [ ] T115 [US6] Implement API response mapping for memory-limit, timeout, active-job, queued-job, upload-attempt, processing-start, HTTP 429, Retry-After, and plain-language recovery messages in `apps/api/src/routes/import-resume/limit-responses.ts`

**Checkpoint**: User Story 6 is independently testable as authorization, isolation, rate-limit, deletion, retention, and logging protection.

---

## Phase 8: User Story 4 - Recover From Partial Extraction or Failure (Priority: P2)

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
- [ ] T086 [US4] Implement recovery API routes for retry, replace upload, cancel, discard, expired draft, manual fallback, and no-supported-field states in `apps/api/src/routes/import-resume/recovery.ts`
- [ ] T087 [P] [US4] Implement retry, replacement upload, cancellation, discard, manual-entry fallback, expired draft, and no-supported-field UI states in `apps/web/src/features/import-resume/RecoveryActions.tsx`
- [ ] T088 [US4] Wire optional AI classifier after deterministic extraction without blocking deterministic review or manual entry in `apps/api/src/services/import-resume/optional-ai-classification.ts`
- [ ] T121 [US4] Wire manual-entry recovery actions from unsupported-file, no-usable-extraction, timeout, processing-failure, expired-draft, and unsupported-language states to `/resumes/new/manual` in `apps/web/src/features/import-resume/RecoveryActions.tsx`
- [ ] T124 [US4] Implement unsupported-language contact-only preview service with explicit confirmation before manual-entry transfer and no import-draft creation in `apps/api/src/services/import-resume/unsupported-language-contact-preview.ts`
- [ ] T125 [P] [US4] Implement unsupported-language warning and contact-only preview UI with confirm-transfer, discard, upload-another, and manual-without-transfer actions in `apps/web/src/features/import-resume/UnsupportedLanguageContactPreview.tsx`

**Checkpoint**: User Story 4 is independently testable as full import recovery and failure handling.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and constitutional gates that span user stories.

- [ ] T089 [P] Update user-facing support/help documentation for supported files, languages, limits, selectable text, retention, deletion, partial extraction, unsupported documents, and confirmation in `docs/import-resume-user-help.md`
- [ ] T090 [P] Update architecture documentation for import pipeline boundaries, deterministic extraction first, optional AI adapter, private storage, retention, deletion, and no source snippets after deletion in `docs/adr/0002-import-resume-pipeline.md`
- [ ] T091 [P] Add Docker Compose quickstart validation command mapping for all scenarios in `tests/import-resume-quickstart.md`
- [ ] T092 Run through Docker Compose and document complete quickstart validation results in `tests/import-resume-quickstart-results.md`
- [ ] T093 [P] Add constitution gate regression for non-technical UX excluding JSON, YAML, prompts, parser internals, provider names, model names, and technical diagnostics in `tests/integration/import-resume/non-technical-ux.integration.test.ts`
- [ ] T094 [P] Add constitution gate regression proving templates, visual customization, generated PDFs, raw PDF structures, and rendering components are untouched by import in `tests/integration/import-resume/protected-templates.integration.test.ts`
- [ ] T095 [P] Add AI behavior evaluation for missing facts, prompt injection, unsupported claims, provenance handling, and no silent structured resume creation in `tests/integration/import-resume/ai-behavior.integration.test.ts`
- [ ] T096 [P] Add extraction outcome evaluation measuring English, French, bilingual, partial, hostile, unsupported, and mixed-content fixture coverage against SC-001 and SC-002 in `tests/integration/import-resume/extraction-outcomes.integration.test.ts`
- [ ] T097 [P] Add usability evaluation protocol for SC-003, SC-004, and SC-009 covering review-warning identification, correction timing, and participant understanding that the uploaded source is not the editable resume, structured edits do not modify the source file, source deletion does not delete a separately confirmed structured resume, and source plus reconstructable extraction artifacts expire under the 7-day policy in `docs/research/import-review-usability-protocol.md`
- [ ] T098 Perform final cleanup of import feature exports, route registrations, and package public APIs in `apps/api/src/routes/import-resume/index.ts` and `apps/web/src/features/import-resume/index.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories. T099-T103 are foundational despite their appended IDs and must complete before tasks that depend on concrete extraction or resource-limit enforcement.
- **User Stories (Phases 3-8)**: Depend on Foundational completion.
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 Start From an Existing Resume (P1)**: First MVP story after Foundation. PDF/DOCX adapter fixture tests T104-T108 depend on T099-T102 and T018.
- **US2 Review and Correct Extracted Information (P1)**: Depends on US1 draft creation path for end-to-end behavior; domain and UI work can begin after Foundation.
- **US3 Confirm Creation of Structured Resume (P1)**: Depends on US2 review states and warning resolution.
- **US5 Complete Import Accessibly (P1)**: Can run alongside US1-US3 after Foundation; final integration depends on those UI surfaces.
- **US6 Protect Imported Resume Data (P1)**: Can run alongside US1-US3 after Foundation; final enforcement touches all import routes, parser processes, workers, and cleanup services. Resource-limit tests T109-T113 and implementation tasks T114-T115 depend on T102-T103.
- **US4 Recover From Partial Extraction or Failure (P2)**: Depends on US1 processing states and integrates with US5 accessibility and US6 deletion/retention protections. Manual-entry recovery tasks T117-T118 and T121 depend on T119-T120. Unsupported-language contact preview tasks T122-T125 depend on the validation and recovery contracts.

### Within Each User Story

- Tests and evaluations must be written first and fail before implementation.
- Domain operations before services.
- Services before API routes.
- API routes before web clients.
- Web clients before full UI integration.
- Story checkpoint validation before moving to the next priority story.

---

## Parallel Opportunities

- Setup tasks T003-T007 can run in parallel after T001-T002 define the workspace manifest and development image.
- Foundational tasks T011-T014, T016-T020, T099-T101, and T103 can run in parallel after T008-T010 establish shared domain and schema; T102 integrates parser execution after T099-T101.
- US1 test tasks T021-T025, T104-T108, and T116 can run in parallel after fixtures and adapter contracts exist.
- US2 test tasks T035-T039 and UI component tasks T044-T045 can run in parallel.
- US3 test tasks T047-T050 and UI tasks T054-T055 can run in parallel.
- US5 tests T057-T059 and components T060-T062 can run in parallel.
- US6 tests T064-T068 and T109-T113 can run in parallel, and T074-T075 plus T114-T115 can run in parallel with backend enforcement tasks after contracts are stable.
- US4 tests T076-T081, T117-T118, and T122-T123 can run in parallel, and T087, T121, and T125 can run in parallel with backend recovery services after route contracts are stable.
- Polish tasks T089-T091 and T093-T097 can run in parallel.

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

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: US1 Start From an Existing Resume.
4. Stop and validate upload, authentication gate, validation, progress, draft creation, and timeout recovery independently.

### Incremental Delivery

1. Setup + Foundation.
2. US1 MVP import start/upload/progress.
3. US2 review and correction.
4. US3 explicit structured resume confirmation.
5. US5 accessibility completion across the P1 path.
6. US6 security/privacy/retention hardening across the P1 path.
7. US4 P2 recovery paths.
8. Polish and constitution gates.

### Parallel Team Strategy

After Foundation:

- Developer A: US1 processing path and upload UI.
- Developer B: US2 review model and review UI.
- Developer C: US6 security/privacy tests and enforcement.
- Developer D: US5 accessibility components and tests.

---

## Notes

- `[P]` tasks use different files and avoid direct dependency on incomplete tasks.
- `[US#]` labels map tasks to user stories from `spec.md`.
- `T099`-`T125` were appended during specification-analysis remediation to preserve existing task references; dependency notes above define their execution order.
- Each user story includes required tests/evaluations/regression checks before implementation tasks.
- No rendering-generation task is included because this feature does not generate final PDFs or modify templates; protected-template regression is included to enforce that boundary.
- Optional AI tasks are limited to classification and ambiguity warnings after deterministic extraction.
