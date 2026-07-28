# Tasks: Import Existing Resume

**Input**: Design documents from `/specs/001-import-resume/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-resume.md, quickstart.md

**Tests**: Required by the feature specification and Nuvitae constitution for acceptance criteria, security/privacy, accessibility, failure states, provider independence, and optional AI behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5, US6)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the TypeScript monorepo skeleton, shared package boundaries, and test harness expected by the implementation plan.

- [ ] T001 Create monorepo workspace files in `/home/mibrihen/Repositories/nuvitae/package.json`, `/home/mibrihen/Repositories/nuvitae/pnpm-workspace.yaml`, and `/home/mibrihen/Repositories/nuvitae/tsconfig.base.json`
- [ ] T002 Create application and package directory structure in `/home/mibrihen/Repositories/nuvitae/apps/web`, `/home/mibrihen/Repositories/nuvitae/apps/api`, `/home/mibrihen/Repositories/nuvitae/packages/domain`, `/home/mibrihen/Repositories/nuvitae/packages/extraction`, `/home/mibrihen/Repositories/nuvitae/packages/storage`, and `/home/mibrihen/Repositories/nuvitae/packages/test-fixtures`
- [ ] T003 [P] Configure shared TypeScript, lint, format, and test scripts in `/home/mibrihen/Repositories/nuvitae/package.json` and `/home/mibrihen/Repositories/nuvitae/tsconfig.base.json`
- [ ] T004 [P] Configure web app package entrypoints in `/home/mibrihen/Repositories/nuvitae/apps/web/package.json`, `/home/mibrihen/Repositories/nuvitae/apps/web/tsconfig.json`, and `/home/mibrihen/Repositories/nuvitae/apps/web/src/main.tsx`
- [ ] T005 [P] Configure API app package entrypoints in `/home/mibrihen/Repositories/nuvitae/apps/api/package.json`, `/home/mibrihen/Repositories/nuvitae/apps/api/tsconfig.json`, and `/home/mibrihen/Repositories/nuvitae/apps/api/src/server.ts`
- [ ] T006 [P] Configure shared package manifests in `/home/mibrihen/Repositories/nuvitae/packages/domain/package.json`, `/home/mibrihen/Repositories/nuvitae/packages/extraction/package.json`, `/home/mibrihen/Repositories/nuvitae/packages/storage/package.json`, and `/home/mibrihen/Repositories/nuvitae/packages/test-fixtures/package.json`
- [ ] T007 [P] Create test folder structure and Vitest/Playwright configuration in `/home/mibrihen/Repositories/nuvitae/tests/contract`, `/home/mibrihen/Repositories/nuvitae/tests/integration`, `/home/mibrihen/Repositories/nuvitae/tests/accessibility`, `/home/mibrihen/Repositories/nuvitae/tests/security`, and `/home/mibrihen/Repositories/nuvitae/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared domain, persistence, storage, authorization, worker, logging, and fixture foundations that all user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T008 Define import domain types and enums for imported documents, artifacts, drafts, fields, warnings, work experience, corrections, structured resumes, and deletion jobs in `/home/mibrihen/Repositories/nuvitae/packages/domain/src/resume-import/types.ts`
- [ ] T009 Define domain validation helpers for upload limits, draft thresholds, warning review states, retention deadlines, and confirmation blocking in `/home/mibrihen/Repositories/nuvitae/packages/domain/src/resume-import/validation.ts`
- [ ] T010 Define persistence schema for import and structured resume entities in `/home/mibrihen/Repositories/nuvitae/apps/api/src/db/schema/resume-import.ts`
- [ ] T011 [P] Implement privacy-safe logger with redaction for resumes, raw text, snippets, files, tokens, credentials, prompts, and unnecessary personal data in `/home/mibrihen/Repositories/nuvitae/apps/api/src/observability/privacy-logger.ts`
- [ ] T012 [P] Implement authenticated user context and ownership guard utilities in `/home/mibrihen/Repositories/nuvitae/apps/api/src/auth/user-context.ts` and `/home/mibrihen/Repositories/nuvitae/apps/api/src/auth/ownership.ts`
- [ ] T013 [P] Implement private object storage key policy and signed internal access helpers in `/home/mibrihen/Repositories/nuvitae/packages/storage/src/private-import-storage.ts`
- [ ] T014 [P] Implement import rate-limit and concurrent-work guard interfaces in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/import-limits.ts`
- [ ] T015 Implement background job queue contracts for validation, extraction, cancellation, retry, and deletion jobs in `/home/mibrihen/Repositories/nuvitae/apps/api/src/workers/import-jobs.ts`
- [ ] T016 [P] Create deterministic extraction adapter interfaces for PDF, DOCX, language detection, page counting, selectable text, and source locations in `/home/mibrihen/Repositories/nuvitae/packages/extraction/src/adapters.ts`
- [ ] T017 [P] Create optional AI classifier adapter interface that accepts deterministic extraction output and returns only classifications and ambiguity warnings in `/home/mibrihen/Repositories/nuvitae/packages/extraction/src/ai-classifier.ts`
- [ ] T018 Create fixture manifest covering supported, partial, unsupported, oversized, over-page-limit, password-protected, image-only, corrupted, hostile, mixed-content, and no-supported-field resumes in `/home/mibrihen/Repositories/nuvitae/packages/test-fixtures/src/resume-import/manifest.ts`
- [ ] T019 [P] Define API response envelope and plain-language error categories for import flows in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/responses.ts`
- [ ] T020 [P] Define web route shell and import feature state machine types in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/state.ts`

**Checkpoint**: Foundation ready. User story implementation can now begin.

---

## Phase 3: User Story 1 - Start From an Existing Resume (Priority: P1) MVP

**Goal**: A user starting resume creation sees import as the recommended path, can authenticate before upload, can upload a supported PDF/DOCX, and receives plain-language validation/extraction progress through draft creation or timeout.

**Independent Test**: Start resume creation, choose import, sign in if needed, upload a supported document, and reach either review draft creation or a recoverable timeout state within the 3-minute foreground limit.

### Tests for User Story 1

- [ ] T021 [P] [US1] Add contract tests for start import, validate document, and process extraction responses in `/home/mibrihen/Repositories/nuvitae/tests/contract/import-resume/start-import.contract.test.ts`
- [ ] T022 [P] [US1] Add integration test for authenticated supported PDF/DOCX upload through progress and draft-ready state in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/start-upload.integration.test.ts`
- [ ] T023 [P] [US1] Add integration test for unauthenticated upload requiring sign-in before file acceptance in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/authentication-gate.integration.test.ts`
- [ ] T024 [P] [US1] Add fixture tests for PDF/DOCX file type, 10 MB limit, 5 rendered page limit, selectable text, and French/English/bilingual language validation in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/upload-validation.integration.test.ts`
- [ ] T025 [P] [US1] Add accessibility test for upload labels, keyboard focus, and progress live announcements in `/home/mibrihen/Repositories/nuvitae/tests/accessibility/import-resume/upload-progress.a11y.test.ts`

### Implementation for User Story 1

- [ ] T026 [P] [US1] Implement create-resume entry and import/manual choice UI in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/CreateResumeEntry.tsx`
- [ ] T027 [P] [US1] Implement upload guidance, supported-file copy, privacy copy, and file chooser UI in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/UploadStep.tsx`
- [ ] T028 [P] [US1] Implement progress state UI with plain-language states and screen-reader live region in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ProcessingStep.tsx`
- [ ] T029 [US1] Implement start import API route with authentication, rate-limit check, private storage write, and `ImportedDocument` creation in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/start-import.ts`
- [ ] T030 [US1] Implement document validation service for format, size, rendered pages, language, selectable text, unsafe/unreadable/corrupted/password-protected failures, and recovery categories in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/validate-document.ts`
- [ ] T031 [US1] Implement deterministic extraction orchestration that creates a draft only when at least one supported field has explicit source content and source location in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/process-extraction.ts`
- [ ] T032 [US1] Implement worker handlers for validation, extraction, timeout, and progress state persistence in `/home/mibrihen/Repositories/nuvitae/apps/api/src/workers/import-processing-worker.ts`
- [ ] T033 [US1] Implement web polling/subscription client for processing status and timeout recovery actions in `/home/mibrihen/Repositories/nuvitae/apps/web/src/services/import-resume/import-status-client.ts`
- [ ] T034 [US1] Wire import flow route from create entry through upload and processing states in `/home/mibrihen/Repositories/nuvitae/apps/web/src/app/import-resume/page.tsx`

**Checkpoint**: User Story 1 is independently testable as the MVP import entry, upload, validation, progress, and draft/timeout path.

---

## Phase 4: User Story 2 - Review and Correct Extracted Information (Priority: P1)

**Goal**: A user can review extracted resume data in recognizable sections, see uncertainty warnings, correct or remove every extracted field, preserve multiple roles, and handle inferred groupings before confirmation.

**Independent Test**: Import a resume with complete, missing, duplicate, conflicting, inferred, and ambiguous fields, then resolve every field or warning in review without modifying the uploaded source.

### Tests for User Story 2

- [ ] T035 [P] [US2] Add contract tests for read import draft and update review actions in `/home/mibrihen/Repositories/nuvitae/tests/contract/import-resume/review-draft.contract.test.ts`
- [ ] T036 [P] [US2] Add integration test for grouped review sections and field correction actions in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/review-correction.integration.test.ts`
- [ ] T037 [P] [US2] Add integration test for duplicate, conflicting, missing, low-confidence, and inferred warning state transitions in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/warning-resolution.integration.test.ts`
- [ ] T038 [P] [US2] Add domain test for multiple roles under one employer and ongoing-role display semantics in `/home/mibrihen/Repositories/nuvitae/packages/domain/src/resume-import/work-experience.test.ts`
- [ ] T039 [P] [US2] Add accessibility test for warning labels, non-colour warning treatment, editable fields, and keyboard review flow in `/home/mibrihen/Repositories/nuvitae/tests/accessibility/import-resume/review.a11y.test.ts`

### Implementation for User Story 2

- [ ] T040 [P] [US2] Implement extracted field, warning, correction, work experience, and role domain operations in `/home/mibrihen/Repositories/nuvitae/packages/domain/src/resume-import/review.ts`
- [ ] T041 [US2] Implement read import draft service with grouped resume sections, source status, confidence status, inference status, and available review actions in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/read-draft.ts`
- [ ] T042 [US2] Implement update review service for confirm, edit, remove, complete, add, exclude, and intentionally leave actions in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/update-review.ts`
- [ ] T043 [US2] Implement read draft and update review API routes in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/review.ts`
- [ ] T044 [P] [US2] Implement sectioned review UI for personal/contact, headline, summary, work experience, education, skills, languages, projects, certifications, and links in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ReviewStep.tsx`
- [ ] T045 [P] [US2] Implement warning and provenance UI components in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ReviewWarning.tsx` and `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/FieldProvenance.tsx`
- [ ] T046 [US2] Implement review API client and optimistic review state updates without source-document mutation in `/home/mibrihen/Repositories/nuvitae/apps/web/src/services/import-resume/review-client.ts`

**Checkpoint**: User Story 2 is independently testable as a review and correction surface for extracted data.

---

## Phase 5: User Story 3 - Confirm Creation of Structured Resume (Priority: P1)

**Goal**: A user explicitly confirms reviewed import data before structured resume creation, and structured resume data remains distinct from the uploaded source.

**Independent Test**: Complete import review, attempt confirmation with unresolved warnings, resolve them, confirm creation, then verify edits target structured resume data and source retention remains unchanged.

### Tests for User Story 3

- [ ] T047 [P] [US3] Add contract tests for confirm structured resume success and blocking errors in `/home/mibrihen/Repositories/nuvitae/tests/contract/import-resume/confirm-resume.contract.test.ts`
- [ ] T048 [P] [US3] Add integration test for unresolved warning blocking, explicit confirmation, and user-confirmed field status in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/confirm-structured-resume.integration.test.ts`
- [ ] T049 [P] [US3] Add domain test proving confirmation does not restart source/artifact retention and source deletion does not delete structured resume data in `/home/mibrihen/Repositories/nuvitae/packages/domain/src/resume-import/confirmation.test.ts`
- [ ] T050 [P] [US3] Add integration test for resuming or discarding an unconfirmed draft before 7-day expiry in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/resume-draft.integration.test.ts`

### Implementation for User Story 3

- [ ] T051 [P] [US3] Implement structured resume creation domain mapper from reviewed fields and user corrections in `/home/mibrihen/Repositories/nuvitae/packages/domain/src/resume-import/structured-resume-mapper.ts`
- [ ] T052 [US3] Implement confirmation service that blocks unresolved warnings, requires one user-confirmed supported field, creates `StructuredResume`, and preserves original retention deadline in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/confirm-structured-resume.ts`
- [ ] T053 [US3] Implement confirm structured resume API route in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/confirm.ts`
- [ ] T054 [P] [US3] Implement confirmation dialog and blocked-confirmation summary UI in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ConfirmationStep.tsx`
- [ ] T055 [P] [US3] Implement structured resume provenance display that excludes raw snippets after source deletion in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/StructuredResumeProvenance.tsx`
- [ ] T056 [US3] Implement resume draft resume/discard client behavior before expiry in `/home/mibrihen/Repositories/nuvitae/apps/web/src/services/import-resume/draft-lifecycle-client.ts`

**Checkpoint**: User Story 3 is independently testable as explicit structured resume creation from reviewed import data.

---

## Phase 6: User Story 5 - Complete Import Accessibly (Priority: P1)

**Goal**: A user can complete upload, processing, review, confirmation, retry, cancellation, and deletion flows with accessible labels, status announcements, keyboard-only operation, and recoverable focus behavior.

**Independent Test**: Complete the full import path and failure/recovery dialogs using keyboard-only navigation and assistive technology checks.

### Tests for User Story 5

- [ ] T057 [P] [US5] Add end-to-end accessibility test for full keyboard-only import completion in `/home/mibrihen/Repositories/nuvitae/tests/accessibility/import-resume/keyboard-full-flow.a11y.test.ts`
- [ ] T058 [P] [US5] Add accessibility test for status live regions across processing, success, timeout, cancellation, validation error, and processing failure states in `/home/mibrihen/Repositories/nuvitae/tests/accessibility/import-resume/status-announcements.a11y.test.ts`
- [ ] T059 [P] [US5] Add accessibility test for error-summary focus and dialog focus restoration in `/home/mibrihen/Repositories/nuvitae/tests/accessibility/import-resume/focus-recovery.a11y.test.ts`

### Implementation for User Story 5

- [ ] T060 [P] [US5] Implement shared accessible dialog wrapper for confirmation, retry, cancellation, discard, and deletion flows in `/home/mibrihen/Repositories/nuvitae/apps/web/src/components/AccessibleDialog.tsx`
- [ ] T061 [P] [US5] Implement reusable import status live region component in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ImportStatusLiveRegion.tsx`
- [ ] T062 [P] [US5] Implement import error summary and focus management utilities in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ErrorSummary.tsx` and `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/focus-management.ts`
- [ ] T063 [US5] Apply accessible names, keyboard handlers, visible focus states, non-colour warning treatment, and focus restoration across import components in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/ImportFlow.tsx`

**Checkpoint**: User Story 5 is independently testable as an accessibility and recovery layer over the import flow.

---

## Phase 7: User Story 6 - Protect Imported Resume Data (Priority: P1)

**Goal**: Imported documents, extracted content, processing state, drafts, temporary artifacts, and deletion jobs are private to the initiating user, isolated from hostile content, rate-limited, and removed according to retention/deletion rules.

**Independent Test**: Attempt cross-user access, exceed upload/processing limits, import hostile documents, delete source documents, and verify only minimal structured resume provenance remains.

### Tests for User Story 6

- [ ] T064 [P] [US6] Add authorization isolation tests for imported documents, drafts, fields, warnings, artifacts, deletion jobs, and structured resumes in `/home/mibrihen/Repositories/nuvitae/tests/security/import-resume/authorization-isolation.security.test.ts`
- [ ] T065 [P] [US6] Add rate-limit and concurrent-work tests for upload and extraction attempts in `/home/mibrihen/Repositories/nuvitae/tests/security/import-resume/rate-limits.security.test.ts`
- [ ] T066 [P] [US6] Add hostile document safety tests for macros, scripts, active objects, links, hidden text, prompt injection, malformed files, and parser isolation in `/home/mibrihen/Repositories/nuvitae/tests/security/import-resume/hostile-documents.security.test.ts`
- [ ] T067 [P] [US6] Add deletion and retention verification tests for source files, raw text, snippets, page references, thumbnails, cached parsing output, embeddings, and minimal provenance in `/home/mibrihen/Repositories/nuvitae/tests/security/import-resume/deletion-retention.security.test.ts`
- [ ] T068 [P] [US6] Add privacy logging test proving full resumes, source snippets, uploaded files, credentials, prompts, tokens, and unnecessary personal data are excluded from logs in `/home/mibrihen/Repositories/nuvitae/tests/security/import-resume/privacy-logging.security.test.ts`

### Implementation for User Story 6

- [ ] T069 [US6] Enforce ownership checks on all import routes and services in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/index.ts`
- [ ] T070 [US6] Implement rate-limit and concurrent-work enforcement in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/import-limits.ts`
- [ ] T071 [US6] Implement parser isolation, no-execution safeguards, and prompt-injection ignoring in `/home/mibrihen/Repositories/nuvitae/packages/extraction/src/safety.ts`
- [ ] T072 [US6] Implement source deletion service for source documents and all source-reconstructing artifacts in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/delete-source.ts`
- [ ] T073 [US6] Implement retention worker for 7-day expiry and deletion verification in `/home/mibrihen/Repositories/nuvitae/apps/api/src/workers/import-retention-worker.ts`
- [ ] T074 [P] [US6] Implement delete source UI and privacy-safe confirmation copy in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/DeleteSourceControl.tsx`
- [ ] T075 [US6] Wire privacy-safe logging into import routes, workers, storage, extraction, deletion, and confirmation services in `/home/mibrihen/Repositories/nuvitae/apps/api/src/observability/import-events.ts`

**Checkpoint**: User Story 6 is independently testable as authorization, isolation, rate-limit, deletion, retention, and logging protection.

---

## Phase 8: User Story 4 - Recover From Partial Extraction or Failure (Priority: P2)

**Goal**: A user receives understandable recovery paths for partial extraction, validation failure, processing failure, timeout, cancellation, retry, replacement upload, manual entry, expired drafts, no-supported-field extraction, and mixed-content documents.

**Independent Test**: Run unreadable, unsupported, password-protected, image-heavy, oversized, duplicate, partially readable, mixed-content, and expired-draft fixtures and verify each failure state has a clear outcome and recovery path.

### Tests for User Story 4

- [ ] T076 [P] [US4] Add contract tests for retry, replace upload, cancel/discard import, delete source, expired draft, and no-supported-field responses in `/home/mibrihen/Repositories/nuvitae/tests/contract/import-resume/recovery.contract.test.ts`
- [ ] T077 [P] [US4] Add integration tests for validation failures and plain-language recovery actions in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/validation-failures.integration.test.ts`
- [ ] T078 [P] [US4] Add integration tests for partial extraction, timeout, retry, replacement upload, and manual-entry fallback in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/partial-timeout-recovery.integration.test.ts`
- [ ] T079 [P] [US4] Add integration tests for cancellation, discard, expired drafts, and retention-scheduled deletion in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/cancel-expiry.integration.test.ts`
- [ ] T080 [P] [US4] Add fixture tests for unrelated pages, separable resume content, inseparable mixed content, and no-supported-field extraction in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/mixed-content.integration.test.ts`
- [ ] T081 [P] [US4] Add no-AI fallback and optional AI classifier degradation tests in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/no-ai-fallback.integration.test.ts`

### Implementation for User Story 4

- [ ] T082 [US4] Implement retry and replacement upload services with rate-limit checks and independent retention deadlines in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/retry-replace.ts`
- [ ] T083 [US4] Implement cancellation and discard services that stop processing where possible and schedule source/artifact deletion in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/cancel-discard.ts`
- [ ] T084 [US4] Implement expired draft and no-supported-field failure services in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/failure-states.ts`
- [ ] T085 [US4] Implement mixed-content classification for separable and inseparable resume/unrelated content in `/home/mibrihen/Repositories/nuvitae/packages/extraction/src/mixed-content.ts`
- [ ] T086 [US4] Implement recovery API routes for retry, replace upload, cancel, discard, expired draft, manual fallback, and no-supported-field states in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/recovery.ts`
- [ ] T087 [P] [US4] Implement retry, replacement upload, cancellation, discard, manual-entry fallback, expired draft, and no-supported-field UI states in `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/RecoveryActions.tsx`
- [ ] T088 [US4] Wire optional AI classifier after deterministic extraction without blocking deterministic review or manual entry in `/home/mibrihen/Repositories/nuvitae/apps/api/src/services/import-resume/optional-ai-classification.ts`

**Checkpoint**: User Story 4 is independently testable as full import recovery and failure handling.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and constitutional gates that span user stories.

- [ ] T089 [P] Update user-facing support/help documentation for supported files, languages, limits, selectable text, retention, deletion, partial extraction, unsupported documents, and confirmation in `/home/mibrihen/Repositories/nuvitae/docs/import-resume-user-help.md`
- [ ] T090 [P] Update architecture documentation for import pipeline boundaries, deterministic extraction first, optional AI adapter, private storage, retention, deletion, and no source snippets after deletion in `/home/mibrihen/Repositories/nuvitae/docs/adr/0002-import-resume-pipeline.md`
- [ ] T091 [P] Add quickstart validation command mapping for all scenarios in `/home/mibrihen/Repositories/nuvitae/tests/import-resume-quickstart.md`
- [ ] T092 Run and document complete quickstart validation results in `/home/mibrihen/Repositories/nuvitae/tests/import-resume-quickstart-results.md`
- [ ] T093 [P] Add constitution gate regression for non-technical UX excluding JSON, YAML, prompts, parser internals, provider names, model names, and technical diagnostics in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/non-technical-ux.integration.test.ts`
- [ ] T094 [P] Add constitution gate regression proving templates, visual customization, generated PDFs, raw PDF structures, and rendering components are untouched by import in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/protected-templates.integration.test.ts`
- [ ] T095 [P] Add AI behavior evaluation for missing facts, prompt injection, unsupported claims, provenance handling, and no silent structured resume creation in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/ai-behavior.integration.test.ts`
- [ ] T096 [P] Add extraction outcome evaluation measuring English, French, bilingual, partial, hostile, unsupported, and mixed-content fixture coverage against SC-001 and SC-002 in `/home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/extraction-outcomes.integration.test.ts`
- [ ] T097 [P] Add usability evaluation protocol for SC-003 and SC-004 review-warning identification and correction timing in `/home/mibrihen/Repositories/nuvitae/docs/research/import-review-usability-protocol.md`
- [ ] T098 Perform final cleanup of import feature exports, route registrations, and package public APIs in `/home/mibrihen/Repositories/nuvitae/apps/api/src/routes/import-resume/index.ts` and `/home/mibrihen/Repositories/nuvitae/apps/web/src/features/import-resume/index.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user stories.
- **User Stories (Phases 3-8)**: Depend on Foundational completion.
- **Polish (Phase 9)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 Start From an Existing Resume (P1)**: First MVP story after Foundation.
- **US2 Review and Correct Extracted Information (P1)**: Depends on US1 draft creation path for end-to-end behavior; domain and UI work can begin after Foundation.
- **US3 Confirm Creation of Structured Resume (P1)**: Depends on US2 review states and warning resolution.
- **US5 Complete Import Accessibly (P1)**: Can run alongside US1-US3 after Foundation; final integration depends on those UI surfaces.
- **US6 Protect Imported Resume Data (P1)**: Can run alongside US1-US3 after Foundation; final enforcement touches all import routes and workers.
- **US4 Recover From Partial Extraction or Failure (P2)**: Depends on US1 processing states and integrates with US5 accessibility and US6 deletion/retention protections.

### Within Each User Story

- Tests and evaluations must be written first and fail before implementation.
- Domain operations before services.
- Services before API routes.
- API routes before web clients.
- Web clients before full UI integration.
- Story checkpoint validation before moving to the next priority story.

---

## Parallel Opportunities

- Setup tasks T003-T007 can run in parallel after T001-T002 create the workspace.
- Foundational tasks T011-T014 and T016-T020 can run in parallel after T008-T010 establish shared domain and schema.
- US1 test tasks T021-T025 can run in parallel.
- US2 test tasks T035-T039 and UI component tasks T044-T045 can run in parallel.
- US3 test tasks T047-T050 and UI tasks T054-T055 can run in parallel.
- US5 tests T057-T059 and components T060-T062 can run in parallel.
- US6 tests T064-T068 can run in parallel, and T074 can run in parallel with backend enforcement tasks after contracts are stable.
- US4 tests T076-T081 can run in parallel, and T087 can run in parallel with backend recovery services after route contracts are stable.
- Polish tasks T089-T091 and T093-T097 can run in parallel.

---

## Parallel Example: User Story 1

```bash
Task: "T021 [P] [US1] Add contract tests for start import, validate document, and process extraction responses in /home/mibrihen/Repositories/nuvitae/tests/contract/import-resume/start-import.contract.test.ts"
Task: "T022 [P] [US1] Add integration test for authenticated supported PDF/DOCX upload through progress and draft-ready state in /home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/start-upload.integration.test.ts"
Task: "T023 [P] [US1] Add integration test for unauthenticated upload requiring sign-in before file acceptance in /home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/authentication-gate.integration.test.ts"
Task: "T024 [P] [US1] Add fixture tests for PDF/DOCX file type, limits, selectable text, and supported languages in /home/mibrihen/Repositories/nuvitae/tests/integration/import-resume/upload-validation.integration.test.ts"
Task: "T025 [P] [US1] Add accessibility test for upload labels, keyboard focus, and progress live announcements in /home/mibrihen/Repositories/nuvitae/tests/accessibility/import-resume/upload-progress.a11y.test.ts"
```

---

## Parallel Example: User Story 6

```bash
Task: "T064 [P] [US6] Add authorization isolation tests for import resources in /home/mibrihen/Repositories/nuvitae/tests/security/import-resume/authorization-isolation.security.test.ts"
Task: "T065 [P] [US6] Add rate-limit and concurrent-work tests in /home/mibrihen/Repositories/nuvitae/tests/security/import-resume/rate-limits.security.test.ts"
Task: "T066 [P] [US6] Add hostile document safety tests in /home/mibrihen/Repositories/nuvitae/tests/security/import-resume/hostile-documents.security.test.ts"
Task: "T067 [P] [US6] Add deletion and retention verification tests in /home/mibrihen/Repositories/nuvitae/tests/security/import-resume/deletion-retention.security.test.ts"
Task: "T068 [P] [US6] Add privacy logging tests in /home/mibrihen/Repositories/nuvitae/tests/security/import-resume/privacy-logging.security.test.ts"
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
- Each user story includes required tests/evaluations/regression checks before implementation tasks.
- No rendering-generation task is included because this feature does not generate final PDFs or modify templates; protected-template regression is included to enforce that boundary.
- Optional AI tasks are limited to classification and ambiguity warnings after deterministic extraction.
