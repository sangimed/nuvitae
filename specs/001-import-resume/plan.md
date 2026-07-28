# Implementation Plan: Import Existing Resume

**Branch**: `001-import-resume` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-import-resume/spec.md`

## Summary

Build Nuvitae's import-first onboarding feature for authenticated users who upload an existing PDF or DOCX resume. The feature validates the document, runs deterministic extraction first, creates a temporary review draft only from explicitly sourced fields, flags uncertainty for review, and creates structured resume data only after explicit user confirmation. Source documents and source-reconstructing artifacts remain separate from the structured resume and are deleted no later than 7 days after the original upload.

The repository currently contains specifications and architecture decisions, not application source. This plan therefore defines the initial application/service structure required to implement the feature in a Nuvitae-owned architecture, consistent with the accepted hybrid foundation ADR.

## Technical Context

**Language/Version**: TypeScript on Node.js 20+ for web, API, workers, domain packages, and extraction orchestration.

**Primary Dependencies**: React-based web UI; Node API service; PostgreSQL for relational domain state; private object storage for source documents and derived artifacts; Redis-compatible queue/rate-limit backend for processing jobs; deterministic PDF and DOCX text extraction libraries selected behind adapter interfaces; optional provider-independent AI classifier adapter after deterministic extraction.

**Storage**: PostgreSQL for users, imported documents, import drafts, warnings, extracted fields, structured resumes, deletion jobs, and audit events. Private object storage for uploaded files and temporary source-reconstructing artifacts with keys scoped by user/import and retention deadline.

**Testing**: Unit tests for domain validation and extraction mapping; integration tests for upload validation, processing state transitions, authorization, retention, deletion, and confirmation; contract tests for API/UI flows; fixture-based extraction tests for English, French, bilingual, hostile, unsupported, partial, and timeout cases; accessibility checks for keyboard, screen-reader state announcements, focus, labels, and non-colour warnings.

**Target Platform**: Web application with server-side API and background worker suitable for self-hosted and managed cloud deployments.

**Project Type**: Full-stack web application plus background processing service.

**Performance Goals**: Accepted uploads either reach review or a recoverable timeout state within 3 minutes. Supported documents are limited to 10 MB and 5 rendered pages. At least 90% of supported uploads with one explicitly sourced supported field produce a reviewable partial or complete extraction.

**Constraints**: Authentication required before upload; PDF/DOCX only; French, English, and bilingual French-English only; selectable text required; deterministic extraction required before optional AI; no structured resume creation from inferred-only data; all warnings must be addressed before confirmation; source and source-reconstructing artifacts deleted within 7 days of original upload; source deletion does not delete confirmed structured resumes; raw source content, credentials, and full resumes must not be logged.

**Scale/Scope**: First product feature for resume creation onboarding. Scope covers upload, validation, processing, review, confirmation, cancellation, retry, source deletion, expiry, and manual-entry fallback. It excludes job-description adaptation, AI rewriting, templates, final PDF generation, ATS scoring, cover letters, job tracking, payments, subscriptions, and automatic applications.

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
│   │   ├── features/import-resume/
│   │   ├── components/
│   │   └── services/
│   └── tests/
└── api/
    ├── src/
    │   ├── routes/import-resume/
    │   ├── services/import-resume/
    │   ├── workers/
    │   └── auth/
    └── tests/

packages/
├── domain/
│   └── src/resume-import/
├── extraction/
│   └── src/
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

**Structure Decision**: Use a Nuvitae-owned full-stack TypeScript monorepo with separate web, API, domain, extraction, storage, and fixture packages. The current repository does not yet contain these directories; implementation tasks must create them. Reactive Resume and Resuml remain references only, not imported runtime foundations.

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
