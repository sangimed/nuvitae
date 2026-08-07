# Implementation Plan: Import Existing Resume

**Branch**: `001-import-resume` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-import-resume/spec.md`

## Summary

Build Nuvitae's import-first onboarding feature for authenticated users who upload an existing PDF or DOCX resume. The feature validates the document deterministically, prepares a provider-ready source representation from physical PDF.js/DOCX extraction, uses a provider-independent AI semantic parser as the primary semantic mapping path whenever a usable provider is connected, creates a temporary review draft only from candidate values with required document evidence, flags uncertainty for review, and creates structured resume data only after explicit user confirmation. Source documents, provider-ready source artifacts, and source-reconstructing artifacts remain separate from the structured resume and are deleted no later than 7 days after the original upload.

The repository now contains implemented foundations for the Nuvitae-owned full-stack architecture. This plan preserves those foundations and extends them with the provider-independent AI semantic parsing boundary required by the amended specification, consistent with the accepted hybrid foundation ADR and [ADR 0002](../../docs/adr/0002-container-only-development.md).

The implementation plan adopts a container-only workflow for development, build, test, database, queue, parsing, migration, and runtime commands. This is required for reproducibility, host independence, dependency isolation, parser security, CI parity, and easier self-hosting across Windows with WSL 2, Linux, and macOS.

**Strategic direction (2026-08-05)**: The approved strategy is product-first. **Nuvitae Community** is the first MVP release: self-hosted, distributed through the existing Docker-first setup, free to use, and powered by the user's own Codex access connected through OAuth. Direct Codex OAuth is the production primary AI connection path and part of onboarding; hosted managed AI is deferred to a later commercial edition and is not on the Community critical path. The plan below delivers Community in vertical tranches: real Codex import → credible resume + PDF → visual editor → reversible Codex editing → Community alpha readiness. Existing completed foundations, historical spike evidence, and unresolved security gates are preserved.

## Technical Context

**Language/Version**: TypeScript on pinned Node.js 20+ executed only inside Docker images for web, API, workers, domain packages, and extraction orchestration.

**Primary Dependencies**: Next.js App Router, React, and strict TypeScript for `apps/web`; NestJS with the default Express platform for the REST-first `apps/api`; NestJS standalone application plus BullMQ for `apps/worker`; Zod runtime schemas in `packages/contracts`; TypeORM with `@nestjs/typeorm`, the PostgreSQL `pg` driver, TypeORM migrations, and the Data Mapper pattern in shared `packages/persistence`; PostgreSQL for relational domain state; private object storage for source documents and derived artifacts; Redis-compatible queue/rate-limit backend for processing jobs; PDF.js (`pdfjs-dist`) for deterministic PDF page counting and text extraction with page and coordinate provenance; a DOCX adapter using `yauzl` plus `fast-xml-parser` for Office Open XML text extraction with package/paragraph/run provenance; isolated LibreOffice headless conversion to PDF only for DOCX rendered-page-count validation; provider-independent `ResumeSemanticParserProvider` boundary with provider capability discovery, connection state, strict Zod validation for a versioned Nuvitae extraction response, evidence grounding validation, no-invention checks, warning generation, and provider failure mapping; the completed direct-Codex OAuth compatibility spike (`CodexDirectProviderAdapter`, isolated `CodexOAuthBroker`, OpenAI-hosted OAuth, direct Codex ChatGPT transport) whose T196-T200 evidence is reusable, whose T201 matrix is complete and all-passing, whose T245 lifecycle proof was accepted on 2026-08-07, and whose T202 is measured, while T203 was re-evaluated on 2026-08-06 and re-confirmed on 2026-08-07 as NO-GO and T164/T165 remain incomplete or blocked; a Community application shell and lightweight design system; a clean visual resume editor with section reordering, visible save status, lightweight undo, and a minimal resume dashboard; at least one credible resume template with a shared preview/export renderer and ATS-friendly PDF generation; reversible contextual AI editing through the Codex path with before/after review, accept/reject/regenerate/undo, and fact-preservation checks; and minimal privacy-safe product metrics. All application dependencies are installed and executed in containers.

**Storage**: PostgreSQL for users, imported documents, import drafts, warnings, extracted fields, structured resumes, deletion jobs, and audit events. PostgreSQL runs as a Compose service in development and test. Phase 1 uses a Docker-managed named volume as the local private storage implementation for uploaded files and temporary source-reconstructing artifacts, with keys scoped by user/import and retention deadline. The named private-storage volume is mounted only into services that require private source/artifact access. A managed-cloud S3-compatible storage adapter remains a later implementation boundary and is not introduced during bootstrap. The Redis-compatible queue/rate-limit backend runs as a Compose service.

**Testing**: Unit tests for domain validation, extraction mapping, provider boundary behavior, schema validation, grounding validation, and no-invention checks; integration tests for upload validation, provider connection state, processing state transitions, authorization, retention, deletion, and confirmation; contract tests for API/UI flows; fixture-based extraction and semantic parser tests for English, French, bilingual, one-column, multi-column, hostile, unsupported, partial, malformed-provider-output, quota/auth failure, and timeout cases; accessibility checks for keyboard, screen-reader state announcements, focus, labels, and non-colour warnings. Lint, format, typecheck, unit, integration, browser, accessibility, fixture, parser, provider-spike, migration, and build checks run through Docker Compose, with Playwright browsers supplied by a dedicated test image or test stage.

**Target Platform**: Web application with server-side API and background worker suitable for self-hosted and managed cloud deployments.

**Project Type**: Full-stack web application plus background processing service.

**Performance Goals**: Accepted uploads either reach review or a recoverable timeout/provider-failure state within 3 minutes. Supported documents are limited to 10 MB and 5 rendered pages. At least 90% of supported uploads processed with a connected usable AI provider and containing one supported field with required document evidence produce a reviewable partial or complete extraction.

**Constraints**: Authentication required before upload; PDF/DOCX only; French, English, and bilingual French-English only; selectable text required; AI-assisted semantic parsing is the primary semantic extraction path whenever a usable provider is connected; deterministic processing remains responsible for document validation, safety, parser isolation, storage, schema validation, evidence validation, provenance, no-invention enforcement, review, confirmation, and retention; no structured resume creation from inferred-only data, evidence-free candidates, invalid provider output, or abruptly terminated partial parser output; all warnings must be addressed before confirmation; source and source-reconstructing artifacts deleted within 7 days of original upload; source deletion does not delete confirmed structured resumes; raw source content, provider payloads, credentials, session material, prompts, and full resumes must not be logged. The import domain must not depend directly on Codex, OpenAI, ChatGPT, Claude, Ollama, provider-native JSON, or provider SDKs. Developers must not install or execute Node.js, npm, pnpm, PostgreSQL, Redis, LibreOffice, Playwright browsers, PDF/DOCX libraries, linters, formatters, compilers, or test runners on the host for Nuvitae work.

**AI Provider Runtime Constraints**: Provider invocation must be non-interactive from the worker, Docker-compatible, session-isolated per authenticated user/self-hosted installation, and restricted to semantic parsing only. The corrected Codex candidate uses the flow `Nuvitae worker -> ResumeSemanticParserProvider -> CodexDirectProviderAdapter -> isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT transport`. The web application, browser storage, import domain, API controllers, regular worker jobs, database domain entities, semantic extraction contracts, logs, and diagnostics remain token-blind. Only the dedicated infrastructure broker may generate PKCE verifier/challenge, generate and validate OAuth state, host a loopback callback, exchange authorization codes, store encrypted access and refresh tokens, refresh access tokens, perform logout/local deletion, expose privacy-safe connection status, execute Codex provider requests, and return provider-neutral results. The spike must compare whether the broker should be a dedicated Docker service, isolated worker-side process, or another bounded infrastructure component before selecting a production topology. Provider states include connected, not configured, login pending, login cancelled, disconnected, authentication expired, authentication revoked, unavailable, rate limited, subscription/quota exceeded, timeout, malformed output, and unsupported capability. Failures map to retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, or manual entry.

**Initial Configurable Resource Limits**: Maximum uploaded file size 10 MB; maximum rendered length 5 pages; maximum foreground processing duration 3 minutes; maximum parser-process memory 512 MiB; maximum per user 1 active processing job and 2 queued processing jobs; maximum 5 upload or processing-start attempts per rolling 10-minute window per authenticated user. Limits must be configurable by environment but must not be disabled in production. Rate or concurrency limit responses reject the operation, return a rate-limit response such as HTTP 429, include `Retry-After` where applicable, and show a plain-language recovery message. Parser memory and timeout enforcement terminate the isolated parser process, clean up files and source-reconstructing artifacts for the failed attempt, and offer retry, replacement upload, and manual-entry recovery. Memory-limit breaches must not create an import review draft from partial output produced before termination.

**Container Workflow**: The only supported host prerequisites are Docker, Git, GitHub CLI, and the chosen coding agent. Development uses a pinned `workspace` image with Node.js, Corepack, pnpm, and shared developer tools. Source code is mounted into `/workspace` inside development containers, while dependency caches, pnpm store, and `node_modules` live in Docker-managed volumes. Production uses separate non-root web, API, and worker images or stages. LibreOffice headless and parser dependencies run only in the worker image or an isolated parser image. Development and CI use the same Dockerfiles and Compose definitions wherever practical. Known trade-offs are slower cold builds, Docker Desktop file-watch behavior, cache and volume management, image maintenance, and WSL 2 integration considerations.

**Scale/Scope**: First product feature for resume creation onboarding, delivered as the Nuvitae Community MVP. Scope covers Docker-first Community installation and first-run onboarding, Codex OAuth connection/reconnect/disconnect/status and provider-unavailable recovery, upload, validation, processing, Codex-backed AI-first semantic parsing through the provider boundary, bounded deterministic fallback, review, safe confirmation (all reviewed fields carry over), cancellation, retry, source deletion, expiry, a real manual-entry route at `/resumes/new/manual`, a clean visual editor with section reordering and visible save status, at least one credible template, live preview, ATS-friendly PDF export, save-and-reopen with a minimal resume dashboard, up to five reversible contextual AI actions with accept/reject/regenerate/undo and fact preservation, and minimal privacy-safe product metrics. It defers hosted managed AI, Nuvitae-managed usage credits, billing, subscriptions, provider marketplace, multiple production providers, enterprise controls, collaboration, exhaustive hardening, OCR, ATS scoring, cover letters, job tracking, and automatic applications to a later hosted commercial edition.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Non-technical UX**: PASS. The user flow is visual, guided, and excludes JSON, YAML, prompts, model names, parser internals, credentials, session details, and provider configuration. It includes plain-language disclosure that resume content is sent to the configured AI provider when provider-backed semantic parsing is used.
- **Import-first onboarding**: PASS. Import is the primary create-resume path while manual entry remains available.
- **Structured source of truth**: PASS. Imported content enters an import draft; structured resume data is created only after explicit confirmation. Uploaded source files stay distinct and immutable.
- **Deterministic rendering**: PASS. This feature does not generate final documents or change rendering. It preserves structured section relationships needed by later deterministic rendering.
- **AI reviewability and provenance**: PASS. Provider-backed semantic parsing produces only versioned, strictly validated candidate values, relationships, evidence, confidence categories, and warnings. Every AI-produced value remains unconfirmed and requires user review before structured resume creation.
- **Protected templates**: PASS. Template source, template configuration, PDFs, and rendering components are out of scope.
- **Human and ATS readability**: PASS. The plan preserves structured role, employer, date, location, education, skill, language, project, certification, and link relationships for later rendering.
- **Security and privacy**: PASS. Authorization, upload validation, hostile document handling, private storage, isolation, rate limits, logging limits, retention, and deletion are first-class design requirements.
- **Provider independence and no-AI usability**: PASS. Semantic parsing is expressed through `ResumeSemanticParserProvider` and a Nuvitae-owned extraction schema. Direct Codex OAuth is the production primary path for the Community MVP, implemented only as an adapter behind that boundary; production adapter implementation remains gated on the direct-OAuth decision-gate conditions (T203 qualifying decision and the T164/T165 mandatory security conditions). No provider SDK, provider-native JSON, provider token, Codex route, header, or OAuth detail enters the domain. Without a usable provider, upload, validation, retry, deletion, manual entry, and limited deterministic partial extraction where available remain usable, and the bounded deterministic fallback plus provider-recovery actions are wired so accepted uploads do not silently dead-end; the product does not claim reliable full semantic parsing without a usable provider.
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
├── import-application/
│   └── src/
│       ├── semantic-parser/
│       ├── providers/
│       └── validation/
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

**Structure Decision**: Use a Nuvitae-owned full-stack TypeScript monorepo with `apps/web` as a Next.js App Router application using `src/app`, `apps/api` as a NestJS REST API on Express, `apps/worker` as a separate NestJS standalone BullMQ worker, and separate contracts, domain, extraction, import-application, persistence, storage, and fixture packages. Product routes in the web app use `app/**/page.tsx`; `apps/web/src/main.tsx` is not part of the plan. The API bootstrap uses `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, and NestJS controllers/services; `apps/api/src/server.ts` is not part of the plan. Shared TypeORM DataSource configuration, entities, repositories, mappers, and migrations live in `packages/persistence`, not `apps/api/src/db`, whenever API and worker access is required. The API uses `TypeOrmModule.forRootAsync` or an equivalent asynchronous configuration, `TypeOrmModule.forFeature` where appropriate, environment-validated PostgreSQL configuration, injectable repository abstractions or persistence services, and database health checks that do not expose secrets. The worker uses the same persistence package and compatible TypeORM DataSource configuration, does not import API implementation modules, and acknowledges queue jobs only after required persistence operations succeed. `packages/extraction` remains responsible for deterministic physical text/source extraction and parser isolation; `packages/import-application` orchestrates the upload-to-review pipeline, owns the provider-independent `ResumeSemanticParserProvider` boundary, validates provider output against contracts, performs grounding/no-invention checks, and maps failures to review/recovery states. The domain package must not depend on Next.js, NestJS, Zod transport schemas, TypeORM, PostgreSQL drivers, database decorators, BullMQ, Codex, OpenAI, ChatGPT, Claude, Ollama, provider SDKs, or provider-native JSON. TypeORM entities are persistence models, not business-domain entities; explicit mappers convert persistence rows before they enter the domain layer. Reactive Resume and Resuml remain references only, not imported runtime foundations.

## Preserved Architecture

The AI-first plan extends, rather than replaces, the implemented foundations: Docker-only development and runtime commands; Next.js web application; NestJS REST API; NestJS BullMQ worker; PostgreSQL and TypeORM persistence; private source storage; PDF.js PDF extraction; Office Open XML DOCX extraction plus isolated LibreOffice rendered-page validation; upload validation; source provenance; review and confirmation flows; manual-entry fallback; retention/deletion boundaries; local playable stack; and Playwright/browser acceptance workflow.

The existing deterministic extraction components remain necessary, but their role is clarified: they validate and safely prepare source text, page counts, language, source locations, and provider-ready evidence. They do not own semantic resume reconstruction when a connected provider is usable.

## AI-First Semantic Parsing Architecture

The import processing pipeline is:

```text
Document upload
→ deterministic validation and safety checks
→ provider-ready document or extracted source representation
→ AI semantic parsing through ResumeSemanticParserProvider
→ versioned Nuvitae extraction response
→ strict Zod schema validation
→ evidence grounding validation
→ no-invention enforcement
→ warning generation
→ import review
→ explicit user confirmation
→ StructuredResume creation
```

New provider abstractions and contracts:

- `ResumeSemanticParserProvider`: domain-independent application boundary implemented by provider adapters. It accepts a controlled extraction request and returns a provider-agnostic Nuvitae extraction response or a typed provider failure.
- Provider capabilities: supported input modes, supported formats, max pages/size, evidence modes, structured-output support, non-interactive support, timeout behavior, and whether original files, rendered images, extracted text, or combinations are supported.
- Provider runtime connection state: `not_configured`, `login_pending`, `connected`, `login_cancelled`, `disconnected`, `auth_expired`, `auth_revoked`, `unavailable`, `rate_limited`, `quota_exceeded`, `unsupported_capability`, `timeout`, `malformed_output`.
- Versioned Nuvitae extraction response: candidate sections, field values, relationships, warnings, evidence records, explicit/inferred classification, confidence category, response schema version, and provider-neutral diagnostics.
- Strict validation: Zod schemas reject malformed output, unknown fields, invalid relationships, unsupported values, provider-native schema leakage, missing evidence, invented facts, and confidence/category violations before data reaches import review.
- Evidence contract: every AI-produced candidate includes document location, exact source text or source fragment identifier, explicit-versus-inferred classification, and confidence category. Unsupported or ungrounded values are rejected or marked unusable.
- Warning generation: missing, ambiguous, duplicate, conflicting, inferred, low-confidence, partial, invalid-provider-output, ungrounded, unsupported-provider, and provider-failure warnings are reviewable and block confirmation until addressed where applicable.

The first self-hosted provider candidate is Codex through a separate direct-OAuth compatibility spike. It must use the user's existing ChatGPT/Codex subscription only through a dedicated infrastructure-level broker, must run non-interactively from Docker after login, and must remain outside the import domain. Future hosted commercial provider selection is out of scope and must not assume reuse of user ChatGPT subscription credentials.

**Community provider decision (2026-08-05)**: For the Community MVP, direct Codex OAuth is the production primary AI connection path, not merely a candidate. The plan reuses the validated direct-OAuth spike evidence where it qualifies (T196 upstream audit, T197 security design, T198 browser OAuth login proof, T199 encrypted credential lifecycle, T200 minimal direct invocation, and the accepted T245 lifecycle proof) and keeps one authoritative semantic parsing path: `Nuvitae worker -> ResumeSemanticParserProvider -> CodexDirectProviderAdapter -> isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT transport`. The T201 semantic matrix is complete (six cases, all passing), T202 is measured, and T245 is accepted (2026-08-07); production adapter implementation (T164/T165) remains incomplete and blocked because the T203 decision gate was re-evaluated on 2026-08-06 and re-confirmed on 2026-08-07 as NO-GO (live real-document semantic quality T246 and bounded-fallback wiring T217 remain unexecuted). The Community product decision does not by itself authorize or complete the production adapter. No OAuth spike task is marked complete merely because Community depends on it.

## Codex Direct-OAuth Compatibility Spike

The completed T189-T195 app-server spike remains historical and complete. Its NO-GO applies only to the tested `codex app-server` 0.146.0 ChatGPT-managed authentication candidate. It does not reject Codex globally, direct OAuth, future Codex versions, the provider-independent parser boundary, or the AI-first import architecture.

The corrected candidate architecture is:

```text
Nuvitae worker
→ provider-independent ResumeSemanticParserProvider
→ CodexDirectProviderAdapter
→ isolated CodexOAuthBroker
→ OpenAI-hosted OAuth
→ direct Codex ChatGPT transport
```

Codex-specific OAuth, tokens, backend routes, request headers, response types, and transport details stay outside `packages/domain`, provider-independent contracts, import entities, and normal job payloads. The import domain consumes only the Nuvitae-owned provider-independent semantic extraction response.

**Current spike status (2026-08-05, historical)**: T196 (upstream audit), T197 (security design), T198 (browser OAuth login proof, local Docker Desktop same-host mode), T199 (encrypted credential lifecycle: persistence, refresh, single-flight, logout, deletion), and T200 (minimal direct invocation, HTTP 200 + valid SSE) are complete and are reusable evidence for the Community path. The 2026-08-05 qualification run implemented the T208 deterministic-enrichment contract in the spike (deterministic offline matrix passes 6/6 under the corrected contract; historical evidence unchanged), registered C04-B02/B03, C05-B01, and C06-B01 Campaign-B attempts, and recorded the T203 gate decision as NO-GO for production adapter implementation at this time because no valid ChatGPT/Codex session existed on the host (C04-C06 live cases not executable; fresh browser login blocked). T201 was incomplete at that time: C01-C03 passed canonical live validation, C04 B01 remained a failed immutable attempt under its original physical-coordinate contract, and C05-C06 were unexecuted. T202 was recorded as BLOCKED. T164/T165 production adapter tasks remained incomplete and blocked by the T203 NO-GO. This block is preserved as historical context.

**Current spike status (2026-08-06)**: T196-T200 are complete and reusable. T243 executed the registered Campaign-B attempts: C04-B02 failed immutably at credential recovery (`transport_failure`); C04-B03 (corrected T208 contract), C05-B01, and C06-B01 passed canonical live validation. The T201 semantic matrix is complete and all-passing (`matrix_state: all_cases_live_passed`; authoritative aggregate `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json`). T202 has been re-measured offline from the accepted evidence by the deterministic evaluator `spikes/codex-direct-oauth/lib/t202-evaluator.mjs`: every evidence-supported metric passes; latency, cancellation, quota behavior, and non-technical onboarding feasibility remain explicitly unmeasured (canonical record `docs/research/codex-direct-oauth-evaluation.md`, sanitized aggregate `codex-direct-oauth-t202-metrics.json`). The T203 gate was re-evaluated on 2026-08-06 and remains **NO-GO** for production adapter implementation: the mandatory real-document live Codex semantic gate (T246) is not run, bounded-fallback wiring (T217) is partial, and non-technical onboarding feasibility is unmeasured. T164/T165 remain incomplete and blocked by the NO-GO.

**Current spike status (2026-08-07)**: T245 completed and was accepted on
2026-08-07: fresh browser OAuth login, callback completion,
`connection_status_after_callback: connected`, encrypted persistence, restart
recovery, successful invocation after restart (T200, exact HTTP 200), live
refresh with rotation, explicit reconnect, disconnect/credential removal, and
deterministic invalid-grant recovery — 9/9 mandatory criteria passing (8
live-observed; 1 deterministic-only invalid-grant classification); provider-side
remote revocation not exercised and not required (canonical T245 does not
require it). Authoritative aggregate:
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`.
T245 satisfies T203 re-evaluation trigger 1 and unblocks T213-T215 Community
connection-UI qualification, which remain incomplete. The T203 gate was
re-confirmed on 2026-08-07 as **NO-GO** for production adapter implementation.
Remaining blockers: T246 real-document live Codex semantic evaluation (the next
live gate), T217 bounded-fallback wiring, and non-technical onboarding
validation (unmeasured). T164/T165 remain incomplete and blocked by the NO-GO.

The spike order is mandatory:

1. Upstream and licensing audit.
2. Security and token-ownership design.
3. OAuth login proof.
4. Token persistence, refresh, logout, and deletion proof.
5. Minimal direct Codex backend invocation with synthetic input.
6. Structured resume parsing with synthetic fixtures.
7. Security, quality, failure, and compatibility evaluation.
8. Final GO, CONDITIONAL GO, or NO-GO.

The upstream audit must pin and inspect exact revisions of OpenClaw, Hermes Agent, and official OpenAI Codex documentation and source where relevant. It must record exact commit SHAs; exact OAuth flow; client identifier; authorization endpoint; token endpoint; callback behavior; PKCE and state handling; requested scopes; originator parameters; token refresh; credential storage; logout behavior; Codex transport and base URL; required request headers; account identity extraction; license and attribution obligations; and differences between OpenClaw and Hermes. Do not copy upstream code before completing a license review.

Supportability classification must separate:

1. Officially documented OpenAI behavior.
2. Behavior verified from official source code.
3. Behavior used by OpenClaw or Hermes.
4. Undocumented compatibility behavior.
5. Experimentally verified Nuvitae behavior.
6. Inference.

The direct ChatGPT Codex backend must be treated as an undocumented or compatibility-sensitive surface unless an official source explicitly documents it for third-party use.

The `CodexOAuthBroker` must generate PKCE verifier/challenge, generate and validate OAuth state, host a loopback callback, exchange authorization codes, store access and refresh tokens encrypted at rest, refresh access tokens, provide logout and local deletion, provide privacy-safe connection status, execute Codex provider requests, and return only provider-neutral results. The spike must compare three topology options before selecting a production direction: dedicated Docker service, isolated worker-side process, or another bounded infrastructure component.

Credential-storage evaluation must cover a dedicated encrypted credential store, master encryption key supplied as a Docker secret or environment secret, authenticated encryption, restrictive filesystem permissions, one credential namespace per Nuvitae owner, atomic writes, rotation and deletion, no plaintext credentials in PostgreSQL unless explicitly encrypted, and no credentials in image layers, logs, fixtures, Git, browser storage, queue payloads, or backups without documented encryption. The first auth spike must not implement production credential persistence.

Backend invocation evaluation may inspect the ChatGPT Codex backend used by audited open-source implementations. It must require exact upstream request-shape audit, fail-closed host and path allowlist, no arbitrary base URL, no redirects to unapproved hosts, bounded response size, timeout and cancellation, rate-limit handling, token refresh on authorized failure categories only, synthetic prompts before any resume content, and no production integration until supportability and stability are reviewed.

Semantic validation begins only after OAuth authentication and minimal invocation succeed. It evaluates structured Nuvitae-owned output, schema validity, source evidence, grounding, no invention, French fixtures, English fixtures, bilingual fixtures, single-column fixtures, multi-column fixtures, latency, cancellation, and quota behavior.

Measurement methods:

- Upstream audit completeness: every required OpenClaw, Hermes Agent, and official OpenAI source field is recorded with exact revision, source classification, and evidence link or marked unavailable with rationale.
- OAuth login behavior: successful PKCE/state generation, loopback callback handling, authorization-code exchange, account identity extraction, and failure classification.
- Credential lifecycle behavior: encrypted write, refresh, logout, local deletion, rotation/deletion proof, and absence from disallowed stores.
- Invocation success rate: successful authenticated non-interactive semantic invocations divided by attempted invocations after login.
- Schema-valid response rate: responses passing strict temporary spike-schema validation divided by successful invocations.
- Field precision: expected fields returned correctly divided by returned fields.
- Field recall: expected fields returned correctly divided by expected fixture fields.
- Work-experience grouping accuracy: employer/role/date groupings matching fixture expectations divided by expected groupings.
- Valid-evidence rate: accepted candidate values with supported source identifiers and source text match divided by accepted candidate values.
- Invented-field rate: returned fields not present in source text or accepted inference rules divided by returned fields.
- Unsupported-evidence rate: returned evidence identifiers missing from the deterministic source representation divided by evidence references.
- Turn latency: request start to complete structured response.
- Cancellation latency: cancellation request to terminal cancelled state.
- Restart recovery: successful post-restart initialization and authenticated invocation after a controlled restart.
- Authentication recovery: successful reconnect or failure classification after expired/revoked auth scenarios.
- Supportability risk: explicit classification of official documentation, official source-code evidence, OpenClaw/Hermes behavior, undocumented compatibility behavior, Nuvitae experimental results, and inference.

The final decision records pinned upstream revisions; OAuth and transport facts; supportability classification; broker topology recommendation or unresolved topology risk; token ownership and storage findings; invocation viability; structured output reliability; evidence grounding; semantic extraction quality or explicit unverified status; measured latency or explicit unverified status; failure and recovery behavior; security, licensing, compatibility, operational stability, documented-support risk, and GO, CONDITIONAL GO, or NO-GO. A NO-GO remains acceptable. Provider-independent work remains valid, deterministic fallback and manual entry remain valid, and production Codex implementation cannot start from the current evidence.

## No-Provider Behavior

When no provider is configured, disconnected, expired, unavailable, rate-limited, quota-exceeded, timed out, or returns invalid structured output, Nuvitae must not claim reliable full semantic parsing. The plan maps these states to retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, or manual entry. Upload validation, source deletion, retention, manual entry, and review of already-created supported drafts remain available without a provider. For the Community MVP, the existing `runLimitedDeterministicPartialFallback` orchestration and `ProviderRecoveryActions` UI MUST be wired into the worker/`ImportFlow` failure path so an accepted upload with a failing Codex provider offers "Continue with limited extraction", retry, reconnect, and manual entry instead of a silent `provider_unavailable` dead end.

## Community MVP Critical Path (Vertical Tranches)

Each tranche includes backend behavior, UI behavior, error and recovery states, responsive behavior, Docker validation, and end-to-end demonstration criteria. See `tasks.md` for the concrete task mapping (existing IDs preserved; new T212-T242 tasks added, plus spike convergence tasks T243-T249 mapped to Tranche 1 and the direct-OAuth spike sequence).

**Tranche 1 — Community setup and real Codex import.** Docker installation documented and reproducible; Codex OAuth connection works; connection status and recovery work; real semantic parsing wired through the one authoritative Codex path (gated on the T201/T203 conditions); bounded deterministic fallback wired; a real PDF/DOCX reaches review; confirmation does not lose untouched fields. Spike convergence tasks T243-T249 map to this tranche: T243/T244 complete (Campaign-B execution and T202 re-measurement), T245 accepted 2026-08-07 (lifecycle proof; unblocks T213-T215, which remain incomplete), T246 is the next live semantic gate, T247 closes the T208 bookkeeping dependency used by T246, T248 (real French PDF fixture proof) is complete 2026-08-07 and satisfies the real-French-PDF prerequisite for T246, and T249 (2026-08-07) completes the remaining T246 real-document corpus prerequisites offline without authorizing any live run.

**Tranche 2 — First credible resume and PDF.** Clean application shell; simplified review language; one structured-resume screen; one credible template; live preview; ATS-friendly PDF export; import-to-PDF end-to-end test.

**Tranche 3 — Usable visual editor.** Split-pane editor on desktop; tabbed editor/preview on mobile; manual editing; section reordering; visible save status; save and reopen; preview and export fidelity.

**Tranche 4 — Reversible Codex editing.** No more than five contextual AI actions; fact-preserving proposals; original/proposed comparison; accept; reject; regenerate; undo; job-description adaptation if retained in MVP.

**Tranche 5 — Community alpha readiness.** First-run onboarding; minimal dashboard; source privacy controls; polished loading, empty, success, and error states; documentation; privacy-safe metrics; controlled Community release checklist.

**Deferred from the critical path (see spec.md Deferred Capabilities)**: hosted managed-AI infrastructure, billing and subscriptions, Nuvitae-managed usage credits, provider marketplace, multiple production AI providers, enterprise controls, collaboration, exhaustive retention races, advanced analytics, horizontal scaling, many templates, complete localization, and exhaustive rare-format support. These are not deleted from history.

## Migration Impact

The existing persistence foundation remains valid. New persistence work is additive: provider runtime connection records, provider capability snapshots, semantic parse attempt records, Nuvitae extraction response version metadata, candidate evidence records, grounding validation status, provider failure state, and disconnect/revocation metadata. No migration should rewrite confirmed structured resume data created by earlier accepted flows. Normal Nuvitae persistence must not store raw provider access tokens, refresh tokens, provider auth files, or provider session material. Any future production broker credential store must be dedicated, encrypted, and outside resume-domain persistence unless credentials are explicitly encrypted and isolated by the broker boundary.

## Implementation Phases

The implementation is organized as vertical slices (tranches), not infrastructure batches. Each tranche is independently implementable and demoable. Historical phases remain preserved in the task history and dependency notes; the execution order below is the Community critical path.

1. Preserve and verify existing Docker, web, API, worker, persistence, private storage, parser, manual-entry, review, confirmation, retention, deletion, and Playwright foundations.
2. Complete the Codex direct-OAuth production wiring on the Community critical path: reuse the validated spike evidence (T196-T200) where it qualifies, finish the T201 semantic matrix, satisfy the T203 decision gate and the T164/T165 mandatory conditions, then implement the `CodexDirectProviderAdapter` + response converter behind `ResumeSemanticParserProvider`; add provider-neutral runtime connection state, broker-scoped credential lifecycle, token-blind application surfaces, revocation boundaries, and provider capability reporting.
3. Wire worker orchestration so the Codex provider is the one authoritative semantic parsing path and the bounded deterministic fallback plus `ProviderRecoveryActions` are integrated (no silent `provider_unavailable` dead end), then extend API/web contracts for provider disclosure, provider connection/reconnect/disconnect/status, provider failure states, manual fallback, and review of grounded candidates.
4. Correct confirmation semantics so all reviewed fields carry into the structured resume and exclusion is explicit only.
5. Build the Community application shell, lightweight design system, simplified review UX, one credible template, live preview, ATS-friendly PDF export, and the import-to-PDF end-to-end journey.
6. Build the visual editor (split-pane desktop, tabbed mobile, section reordering, visible save status), lightweight undo, save-and-reopen, and the minimal resume dashboard.
7. Build up to five reversible contextual Codex AI actions with before/after review, accept/reject/regenerate/undo, fact-preservation checks, and job-description adaptation if retained in MVP.
8. Add Community alpha readiness: first-run onboarding, source privacy controls, designed loading/empty/success/error states, documentation, privacy-safe metrics, and a controlled Community release checklist.
9. Run evaluations and tests for provider output quality, prompt injection, malformed output, invented facts, evidence quality, privacy-safe logging, timeout/quota/auth failures, accessibility, and end-to-end Playwright flows, plus the fact-preservation and fidelity regression gates.

## Dependency Rules

- Provider-independent contracts, validation, grounding, persistence, review, confirmation, recovery, and fallback work may continue independently.
- The Community product decision (2026-08-05) reclassifies direct Codex OAuth as the production primary AI path and MVP-critical, and the validated T196-T200 spike evidence is reusable for that path. The T201 semantic matrix is complete and T202 is measured. It still does not authorize production code: Codex-specific production adapter work remains blocked until the direct-OAuth spike records a GO or qualifying CONDITIONAL GO with its mandatory conditions satisfied (T203), and T164/T165 remain incomplete.
- T245 (credential lifecycle proof) is accepted as of 2026-08-07 and satisfies T203 re-evaluation trigger 1; T213-T215 are unblocked by T245 but remain incomplete. T246 (real-document live Codex semantic evaluation) is the next remaining live gate; its prerequisites T248 (real French PDF proof) and T247 (T208 bookkeeping closure) are satisfied, and it still requires explicit live execution authorization before any live run.
- Existing app-server production planning must not be implemented based on the completed T189-T195 result.
- Direct-OAuth production Codex integration work requires a GO or qualifying CONDITIONAL GO from the new spike; until then, Community-critical OAuth wiring tasks (connection UI, status, reconnect/disconnect, broker lifecycle integration, provider recovery) may proceed against the provider-neutral boundary and the validated broker evidence, while adapter implementation stays gated.
- The second spike does not implement production provider integration.
- No OAuth task is marked complete merely because Community now depends on it.

## Unresolved Technical Decisions Requiring Spike Validation

- Exact pinned upstream revisions, license obligations, and attribution obligations for OpenClaw, Hermes Agent, and relevant official OpenAI Codex documentation/source.
- Which OAuth behavior is officially documented, verified from official source, copied only as OpenClaw/Hermes behavior, undocumented compatibility behavior, experimentally verified in Nuvitae, or inference.
- Whether the direct ChatGPT Codex backend is officially documented for third-party use or must remain classified as compatibility-sensitive.
- Whether the broker topology should be a dedicated Docker service, isolated worker-side process, or another bounded infrastructure component after threat-model comparison.
- Whether OAuth Authorization Code with PKCE succeeds through a local loopback callback with valid state handling and account identity extraction.
- Whether encrypted token persistence, refresh, logout, deletion, and rotation can be proven without production credential persistence in the first auth spike.
- Whether Codex can be invoked non-interactively from the self-hosted Docker stack through the direct ChatGPT transport after broker login.
- How quota, rate-limit, unauthorized, expired-token, revoked-token, and network failures are exposed and mapped to user-facing recovery states.
- Whether Codex can reliably return strict structured output with stable evidence references from synthetic extracted text plus source identifiers.
- Whether latency, cancellation, and evidence quality are good enough for the 3-minute foreground import expectation.
- Community-specific: whether the Codex OAuth loopback-callback flow, proven only for local Docker Desktop with a same-host browser, can be made usable for Community self-hosters on remote hosts, VPS, NAS, or headless environments, and what the supported Community connection modes are.
- Community-specific: the T201 matrix is now closed (C04 under the corrected deterministic-enrichment contract, C05, and C06 all pass) and T245 is accepted (2026-08-07), but T203 remains NO-GO after the 2026-08-07 re-evaluation because live Codex semantic quality over real PDF/DOCX documents (T246), bounded-fallback wiring (T217), and non-technical onboarding validation remain unexecuted; until T203 records GO or a qualifying CONDITIONAL GO, T164/T165 remain blocked.
- Community-specific: whether one authoritative semantic path through Codex meets the Community product quality bar and whether invocation latency and usage stay within the self-hosted user's own Codex/ChatGPT subscription and the 3-minute import window.

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

**Container Structure Decision**: Preserve the Docker-first monorepo bootstrap before adding provider work. Planned and implemented artifacts include a pinned workspace image; multi-stage or distinct production images for the Next.js web app, NestJS API, and NestJS standalone worker; Docker build inputs for `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/extraction`, `packages/import-application`, `packages/persistence`, `packages/storage`, and `packages/test-fixtures`; a dedicated Playwright test image or stage in `docker/test/Dockerfile`; Compose services for PostgreSQL, Redis-compatible queue, a Docker-managed named `private-storage` volume mounted only into services that require private source/artifact access, Docker-managed pnpm store and `node_modules` volumes, bootstrap liveness/readiness health checks, non-root runtime users, entrypoints, and container-based lint, format, typecheck, unit/bootstrap test, provider-spike, and build commands. The direct-OAuth spike adds only bounded broker evaluation artifacts until a topology is selected: a dedicated Docker service, isolated worker-side process, or another infrastructure component must be threat-modeled before production selection. Phase 1 bootstrap validation does not include TypeORM migration lifecycle validation, database-aware NestJS health integration, or API/worker shared TypeORM DataSource validation; those belong to the later integrated persistence validation after TypeORM persistence wiring is implemented. Phase 1 must not introduce an additional local S3-compatible server; the managed-cloud S3-compatible adapter remains a later implementation boundary. Provider work must remain Docker-compatible and must not require host-side Node.js, provider CLIs, browser profiles, or credentials outside project-approved private storage.

**Migration Decision**: TypeORM migrations are versioned and run only through project-local tooling inside Docker after the shared persistence package, API TypeORM integration, and worker TypeORM integration are implemented. Integrated persistence validation uses commands such as `docker compose run --rm workspace pnpm db:migration:generate`, `docker compose run --rm workspace pnpm db:migration:create`, `docker compose run --rm workspace pnpm db:migration:run`, `docker compose run --rm workspace pnpm db:migration:revert`, and `docker compose run --rm workspace pnpm db:migration:show` against the Compose PostgreSQL service. `synchronize` must be false outside explicitly disposable test databases, and application startup must not silently mutate production or shared development schemas. Migration lifecycle validation is not part of Phase 1 bootstrap validation.

## Complexity Tracking

No constitutional violations or exceptions are required.

## Phase 0 Research

See [research.md](./research.md).

## Phase 1 Design

See [data-model.md](./data-model.md), [contracts/import-resume.md](./contracts/import-resume.md), and [quickstart.md](./quickstart.md).

## Post-Design Constitution Check

- **Non-technical UX**: PASS. Contracts expose plain-language states and user actions, with technical details kept behind service boundaries.
- **Import-first onboarding**: PASS. The first contract starts from resume creation and makes import the recommended path.
- **Structured source of truth**: PASS. The data model separates `ImportedDocument`, `DerivedExtractionArtifact`, `AIProviderRuntimeConnection`, `SemanticParseAttempt`, `NuvitaeExtractionResponse`, `ImportDraft`, and `StructuredResume`.
- **Deterministic rendering**: PASS. The Community MVP adds one credible template, live preview, and ATS-friendly PDF export through a single controlled renderer shared by preview and export, so generation is deterministic and preview↔export fidelity is structurally guaranteed (FR-037/FR-038); content changes regenerate the document through the controlled rendering engine.
- **AI reviewability and provenance**: PASS. `NuvitaeExtractionResponse`, `EvidenceRecord`, `ExtractedField.sourceStatus`, `classificationStatus`, `inferenceStatus`, `reviewStatus`, and `ImportWarning` force reviewable provenance and prevent ungrounded provider output from silently reaching confirmation.
- **Protected templates**: PASS. The Community MVP adds one credible template and a `ResumeTemplateChoice`; content and presentation remain separate, template choice never modifies resume content, AI content actions never modify template source or rendering components, and template changes remain product-development changes reviewed through the normal workflow.
- **Human and ATS readability**: PASS. Work experience roles, dates, sections, and explicit source provenance are modeled.
- **Security and privacy**: PASS. Ownership, retention, deletion, rate limiting, hostile document isolation, token-blind application surfaces, broker-scoped token ownership, revocation/deletion, provider capability verification, and log exclusions are in contracts and validation scenarios.
- **Provider independence and no-AI usability**: PASS. Contracts require the `ResumeSemanticParserProvider` boundary and provider-neutral schemas. For the Community MVP, direct Codex OAuth is the production primary adapter, but it remains an adapter behind the boundary and production implementation stays gated on the direct-OAuth decision-gate conditions (T203); no-provider/provider-failure recovery, limited deterministic partial extraction, and manual entry remain usable without claiming reliable full semantic parsing.
- **Accessibility and recovery**: PASS. UI contracts include accessible labels, live status announcements, keyboard operation, focus recovery, and recovery actions.
- **Quality gates**: PASS. Quickstart defines validation scenarios for the direct-OAuth Codex spike, provider-backed happy path, no-provider/provider-failure recovery, strict output validation, evidence grounding, invented-field checks, security, privacy, retention, and accessibility.
