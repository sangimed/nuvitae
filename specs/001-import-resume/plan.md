# Implementation Plan: Import Existing Resume

**Branch**: `001-import-resume` | **Date**: 2026-07-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-import-resume/spec.md`

## Summary

Build Nuvitae's import-first onboarding feature for authenticated users who upload an existing PDF or DOCX resume. The feature validates the document deterministically, prepares a provider-ready source representation from physical PDF.js/DOCX extraction, uses a provider-independent AI semantic parser as the primary semantic mapping path whenever a usable provider is connected, creates a temporary review draft only from candidate values with required document evidence, flags uncertainty for review, and creates structured resume data only after explicit user confirmation. Source documents, provider-ready source artifacts, and source-reconstructing artifacts remain separate from the structured resume and are deleted no later than 7 days after the original upload.

The repository now contains implemented foundations for the Nuvitae-owned full-stack architecture. This plan preserves those foundations and extends them with the provider-independent AI semantic parsing boundary required by the amended specification, consistent with the accepted hybrid foundation ADR and [ADR 0002](../../docs/adr/0002-container-only-development.md).

The implementation plan adopts a container-only workflow for development, build, test, database, queue, parsing, migration, and runtime commands. This is required for reproducibility, host independence, dependency isolation, parser security, CI parity, and easier self-hosting across Windows with WSL 2, Linux, and macOS.

## Technical Context

**Language/Version**: TypeScript on pinned Node.js 20+ executed only inside Docker images for web, API, workers, domain packages, and extraction orchestration.

**Primary Dependencies**: Next.js App Router, React, and strict TypeScript for `apps/web`; NestJS with the default Express platform for the REST-first `apps/api`; NestJS standalone application plus BullMQ for `apps/worker`; Zod runtime schemas in `packages/contracts`; TypeORM with `@nestjs/typeorm`, the PostgreSQL `pg` driver, TypeORM migrations, and the Data Mapper pattern in shared `packages/persistence`; PostgreSQL for relational domain state; private object storage for source documents and derived artifacts; Redis-compatible queue/rate-limit backend for processing jobs; PDF.js (`pdfjs-dist`) for deterministic PDF page counting and text extraction with page and coordinate provenance; a DOCX adapter using `yauzl` plus `fast-xml-parser` for Office Open XML text extraction with package/paragraph/run provenance; isolated LibreOffice headless conversion to PDF only for DOCX rendered-page-count validation; provider-independent `ResumeSemanticParserProvider` boundary with provider capability discovery, connection state, strict Zod validation for a versioned Nuvitae extraction response, evidence grounding validation, no-invention checks, warning generation, and provider failure mapping; a second bounded Codex app-server validation spike using the official Codex-managed application runtime as the candidate first self-hosted provider. All application dependencies are installed and executed in containers.

**Storage**: PostgreSQL for users, imported documents, import drafts, warnings, extracted fields, structured resumes, deletion jobs, and audit events. PostgreSQL runs as a Compose service in development and test. Phase 1 uses a Docker-managed named volume as the local private storage implementation for uploaded files and temporary source-reconstructing artifacts, with keys scoped by user/import and retention deadline. The named private-storage volume is mounted only into services that require private source/artifact access. A managed-cloud S3-compatible storage adapter remains a later implementation boundary and is not introduced during bootstrap. The Redis-compatible queue/rate-limit backend runs as a Compose service.

**Testing**: Unit tests for domain validation, extraction mapping, provider boundary behavior, schema validation, grounding validation, and no-invention checks; integration tests for upload validation, provider connection state, processing state transitions, authorization, retention, deletion, and confirmation; contract tests for API/UI flows; fixture-based extraction and semantic parser tests for English, French, bilingual, one-column, multi-column, hostile, unsupported, partial, malformed-provider-output, quota/auth failure, and timeout cases; accessibility checks for keyboard, screen-reader state announcements, focus, labels, and non-colour warnings. Lint, format, typecheck, unit, integration, browser, accessibility, fixture, parser, provider-spike, migration, and build checks run through Docker Compose, with Playwright browsers supplied by a dedicated test image or test stage.

**Target Platform**: Web application with server-side API and background worker suitable for self-hosted and managed cloud deployments.

**Project Type**: Full-stack web application plus background processing service.

**Performance Goals**: Accepted uploads either reach review or a recoverable timeout/provider-failure state within 3 minutes. Supported documents are limited to 10 MB and 5 rendered pages. At least 90% of supported uploads processed with a connected usable AI provider and containing one supported field with required document evidence produce a reviewable partial or complete extraction.

**Constraints**: Authentication required before upload; PDF/DOCX only; French, English, and bilingual French-English only; selectable text required; AI-assisted semantic parsing is the primary semantic extraction path whenever a usable provider is connected; deterministic processing remains responsible for document validation, safety, parser isolation, storage, schema validation, evidence validation, provenance, no-invention enforcement, review, confirmation, and retention; no structured resume creation from inferred-only data, evidence-free candidates, invalid provider output, or abruptly terminated partial parser output; all warnings must be addressed before confirmation; source and source-reconstructing artifacts deleted within 7 days of original upload; source deletion does not delete confirmed structured resumes; raw source content, provider payloads, credentials, session material, prompts, and full resumes must not be logged. The import domain must not depend directly on Codex, OpenAI, ChatGPT, Claude, Ollama, provider-native JSON, or provider SDKs. Developers must not install or execute Node.js, npm, pnpm, PostgreSQL, Redis, LibreOffice, Playwright browsers, PDF/DOCX libraries, linters, formatters, compilers, or test runners on the host for Nuvitae work.

**AI Provider Runtime Constraints**: Provider invocation must be non-interactive from the worker, Docker-compatible, session-isolated per authenticated user/self-hosted installation, and restricted to semantic parsing only. Provider execution must not expose shell, code execution, file editing, repository access, or arbitrary tool use for resume parsing unless the second spike verifies that those capabilities are disabled, excluded, restricted, or sufficiently neutralized by runtime configuration, absent mounts, empty workspaces, permissions, and sandboxing. The official Codex runtime owns ChatGPT authentication, credential persistence, access-token refresh, refresh-token rotation, authentication expiry, session recovery, and logout. Nuvitae remains token-blind and must not read Codex auth files, parse Codex auth files, persist access tokens, persist refresh tokens, refresh tokens directly, expose tokens in logs/API responses/events/database records, or implement OpenAI OAuth endpoints. Provider states include connected, not configured, login pending, login cancelled, disconnected, authentication expired, authentication revoked, unavailable, rate limited, subscription/quota exceeded, timeout, malformed output, and unsupported capability. Failures map to retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, or manual entry.

**Initial Configurable Resource Limits**: Maximum uploaded file size 10 MB; maximum rendered length 5 pages; maximum foreground processing duration 3 minutes; maximum parser-process memory 512 MiB; maximum per user 1 active processing job and 2 queued processing jobs; maximum 5 upload or processing-start attempts per rolling 10-minute window per authenticated user. Limits must be configurable by environment but must not be disabled in production. Rate or concurrency limit responses reject the operation, return a rate-limit response such as HTTP 429, include `Retry-After` where applicable, and show a plain-language recovery message. Parser memory and timeout enforcement terminate the isolated parser process, clean up files and source-reconstructing artifacts for the failed attempt, and offer retry, replacement upload, and manual-entry recovery. Memory-limit breaches must not create an import review draft from partial output produced before termination.

**Container Workflow**: The only supported host prerequisites are Docker, Git, GitHub CLI, and the chosen coding agent. Development uses a pinned `workspace` image with Node.js, Corepack, pnpm, and shared developer tools. Source code is mounted into `/workspace` inside development containers, while dependency caches, pnpm store, and `node_modules` live in Docker-managed volumes. Production uses separate non-root web, API, and worker images or stages. LibreOffice headless and parser dependencies run only in the worker image or an isolated parser image. Development and CI use the same Dockerfiles and Compose definitions wherever practical. Known trade-offs are slower cold builds, Docker Desktop file-watch behavior, cache and volume management, image maintenance, and WSL 2 integration considerations.

**Scale/Scope**: First product feature for resume creation onboarding. Scope covers upload, validation, processing, AI-first semantic parsing through a provider boundary, review, confirmation, cancellation, retry, source deletion, expiry, and a real manual-entry route at `/resumes/new/manual`. It excludes training a Nuvitae-owned model, selecting the hosted commercial AI provider, OCR, job-description adaptation, AI rewriting, templates, final PDF generation, ATS scoring, cover letters, job tracking, payment/subscription product implementation, and automatic applications.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Non-technical UX**: PASS. The user flow is visual, guided, and excludes JSON, YAML, prompts, model names, parser internals, credentials, session details, and provider configuration. It includes plain-language disclosure that resume content is sent to the configured AI provider when provider-backed semantic parsing is used.
- **Import-first onboarding**: PASS. Import is the primary create-resume path while manual entry remains available.
- **Structured source of truth**: PASS. Imported content enters an import draft; structured resume data is created only after explicit confirmation. Uploaded source files stay distinct and immutable.
- **Deterministic rendering**: PASS. This feature does not generate final documents or change rendering. It preserves structured section relationships needed by later deterministic rendering.
- **AI reviewability and provenance**: PASS. Provider-backed semantic parsing produces only versioned, strictly validated candidate values, relationships, evidence, confidence categories, and warnings. Every AI-produced value remains unconfirmed and requires user review before structured resume creation.
- **Protected templates**: PASS. Template source, template configuration, PDFs, and rendering components are out of scope.
- **Human and ATS readability**: PASS. The plan preserves structured role, employer, date, location, education, skill, language, project, certification, and link relationships for later rendering.
- **Security and privacy**: PASS. Authorization, upload validation, hostile document handling, private storage, isolation, rate limits, logging limits, retention, and deletion are first-class design requirements.
- **Provider independence and no-AI usability**: PASS. Semantic parsing is expressed through `ResumeSemanticParserProvider` and a Nuvitae-owned extraction schema. Codex remains only the candidate first self-hosted provider through the official app-server runtime, with production adapter work blocked until a second GO or qualifying CONDITIONAL GO; no provider SDK or provider-native JSON enters the domain. Without a usable provider, upload, validation, retry, deletion, manual entry, and limited deterministic partial extraction where available remain usable, but the product does not claim reliable full semantic parsing.
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

The first self-hosted provider candidate is Codex through the official `codex app-server` runtime. It must use the user's existing ChatGPT/Codex subscription only through official app-server authentication support, must run non-interactively from Docker after login, and must remain outside the import domain. Future hosted commercial provider selection is out of scope and must not assume reuse of user ChatGPT subscription credentials.

## Codex App-Server Validation Plan

The completed T139-T145 spike remains historical and complete. Its NO-GO applies only to the evaluated approach: direct production use of `codex exec`, direct reuse or copying of Codex CLI credential files, Nuvitae directly reading, storing, refreshing, or manipulating ChatGPT access and refresh tokens, and Nuvitae reproducing the ChatGPT/Codex OAuth flow itself. It is not a general NO-GO for Codex subscription integration.

The corrected candidate architecture is:

```text
Nuvitae worker
→ provider-independent ResumeSemanticParserProvider boundary
→ CodexAppServerProviderAdapter
→ official codex app-server runtime
→ ChatGPT subscription authentication managed by Codex
```

Codex-specific concepts stay outside the import domain. The import domain consumes only the Nuvitae-owned provider-independent semantic extraction response.

The second spike validates the official app-server path before any production Codex adapter work. Initial candidate transport is JSON-RPC over stdio with one managed Codex app-server process per isolated runtime instance, explicit initialization with Nuvitae client metadata, request identifiers and response correlation, streaming notification handling, timeout handling, cancellation, graceful shutdown, crash detection, and bounded restart behavior. Do not rely on the experimental WebSocket transport. Do not hardcode RPC request or response structures from assumptions.

The spike must detect the installed Codex version, generate TypeScript or JSON Schema protocol artifacts from that exact installed version, derive supported methods and payload shapes from those artifacts, classify stable, beta, experimental, deprecated, and unsupported operations, and record compatibility risks between Codex versions.

Authentication validation must prove that the official Codex runtime owns ChatGPT authentication, credential persistence, access-token refresh, refresh-token rotation, authentication expiry, session recovery, and logout. Nuvitae remains token-blind: no Codex auth-file reads or parsing, no access-token or refresh-token persistence, no direct token refresh, no token exposure in logs/API responses/events/database records, and no Nuvitae-owned OpenAI OAuth endpoint implementation. Provider-facing operations planned at the neutral boundary are connection status, login initiation, login progress, login completion, login cancellation where supported, logout, reconnect, expired or revoked authentication, quota state, and provider availability state.

### T191 Authentication Amendment

T191 has experimentally verified that generated Codex 0.146.0 app-server
protocol artifacts expose `chatgptDeviceCode`, but
`account/login/start` with `type: chatgptDeviceCode` is rejected before a
verification URL or user code is issued. The controlled diagnostic also found
that official CLI device authentication failed before code issuance, a basic
DNS, TCP, TLS, or CA outage was not demonstrated, and enabling device-code
authorization did not change the app-server result. These results preserve
device-code authentication as experimentally blocked for the tested
account/runtime combination. They do not create a general Codex integration
NO-GO, and repeated device-code retries are no longer justified for this spike.

Browser callback forwarding is the final bounded authentication candidate for
T191. The candidate must use the official Codex-managed browser login by
calling `account/login/start` with `type: chatgpt`. Codex must generate the
authorization URL and own PKCE, OAuth state, callback validation, token
exchange, credential persistence, refresh, and logout. Nuvitae must never
receive or handle access tokens or refresh tokens. This candidate solves only
the Docker localhost callback boundary.

The ephemeral login-only topology to verify is:

```text
Host browser
→ http://localhost:1455 or http://localhost:1457
→ Docker port published only on host loopback
→ callback relay inside the trusted Codex runtime boundary
→ Codex callback listener on 127.0.0.1:1455 or 127.0.0.1:1457
```

Candidate port mappings may be equivalent to host `127.0.0.1:1455` forwarding
to runtime relay port `2455`, and host `127.0.0.1:1457` forwarding to runtime
relay port `2457`. The relay then forwards runtime port `2455` to
`127.0.0.1:1455`, and runtime port `2457` to `127.0.0.1:1457`. Treat these
mappings as experimental candidates, not validated behavior.

The callback relay belongs to the trusted Codex runtime boundary, not the
Nuvitae import domain. It must perform raw TCP forwarding only, must not
terminate OAuth, must not parse callback query parameters, must not log callback
payloads, must not persist HTTP requests, must not receive or expose Codex
credential files, and must be enabled only while a login is pending. It must be
stopped after login completion or cancellation. Published ports must bind only
to host loopback; LAN and public-interface bindings are disallowed. The runtime
must not mount the Docker socket, host home, or host Codex state.

The T191 harness must derive the callback port from the official `authUrl`
returned by app-server, accept only localhost callback URLs, accept only the
expected pinned-runtime ports `1455` or `1457`, and fail closed for any
unexpected hostname, scheme, path, or port. Committed evidence must never log
authorization URL query parameters. Use the official hosted login success page
option when the pinned generated protocol supports it, while still treating the
local callback as mandatory.

T191 decision criteria are amended as follows:

1. Device-code authentication remains experimentally blocked for the tested
   account/runtime combination.
2. Browser callback forwarding is the final bounded authentication candidate
   for T191.
3. A successful browser-flow result must still demonstrate authenticated
   `account/read`, no raw credentials exposed through RPC, inaccessible Codex
   credential state from the Nuvitae identity, persistence across container
   recreation, cancellation, authenticated logout, unauthenticated state after
   restart, and final reauthentication for T192.
4. If the official browser flow also fails after the callback relay is proven
   reachable, T191 remains incomplete and the Codex subscription candidate must
   move toward a blocked or conditional decision.

Do not add API-key authentication as a substitute for the subscription-backed
product requirement. Do not accept copying `auth.json` or another Codex
credential cache. Do not add direct OAuth implementation.

Runtime isolation for the spike uses a dedicated Docker runtime for Codex app-server with a dedicated Codex runtime image or bounded runtime layer, private persistent Codex state volume, empty ephemeral working directory, no Nuvitae repository mount, no Nuvitae private import-storage mount, no PostgreSQL access, no Valkey access, no host Codex configuration inheritance, no host credential inheritance, no user-defined MCP servers, no user-installed Codex plugins, no unrelated environment variables, explicit CPU limit, explicit memory limit, process limit, execution timeout, controlled stdout/stderr, privacy-safe logging, bounded temporary storage, and cleanup after execution.

The spike must experimentally determine whether Codex shell, file-editing, web, plugin, MCP, or other tool capabilities can be disabled, excluded, restricted, or sufficiently neutralized through empty workspaces, permissions, sandboxing, absent mounts, and runtime configuration. Do not claim these capabilities are disabled until verified.

Initial semantic parsing input is deterministically extracted resume text, stable page identifiers, stable block identifiers, stable line or fragment identifiers, and compact layout hints where required. The second spike uses only synthetic anonymous fixtures. It must not mount original PDF or DOCX documents into the Codex runtime during the initial spike, though deterministic text may be prepared from synthetic PDF and DOCX fixtures while preserving source identifiers required for evidence validation.

The spike uses a temporary spike-only structured output schema covering personal and contact information, professional summary, work experiences, education, skills, languages, source evidence references, explicit versus inferred values, and confidence categories. This temporary schema does not replace the planned production provider-independent Nuvitae response contract. Validation covers strict JSON parsing, schema validity, unknown fields, missing required fields, malformed output, unsupported evidence identifiers, values not present in source text, inferred values incorrectly represented as explicit, duplicate entries, work-experience grouping, and invented content. The adapter boundary converts validated provider output into the Nuvitae-owned response before the import application layer receives it.

The bounded validation scenarios are:

1. Codex installation and startup in Docker.
2. Installed version detection.
3. Protocol schema generation from the installed version.
4. JSON-RPC initialization over stdio.
5. Explicit Nuvitae client identification.
6. Authentication status inspection.
7. ChatGPT login using the final T191 official browser-flow candidate,
   `account/login/start` with `type: chatgpt`, after preserving the
   experimentally blocked device-code evidence for the tested account/runtime
   combination.
8. Login cancellation where supported.
9. Logout.
10. Authentication persistence across container restart.
11. Expired or revoked authentication behavior.
12. Confirmation that Nuvitae remains token-blind.
13. Non-interactive invocation after login.
14. Ephemeral thread creation where supported.
15. Empty isolated workspace behavior.
16. Permissions and sandbox behavior.
17. Confirmation that host MCP servers and plugins are not inherited.
18. Structured semantic extraction from synthetic source text.
19. Evidence grounding.
20. No-invention behavior.
21. Malformed-output handling.
22. Timeout handling.
23. Turn cancellation.
24. App-server crash handling.
25. App-server restart behavior.
26. Unsupported model behavior.
27. Network-unavailable behavior.
28. Authentication failure.
29. Quota exhaustion or rate limiting where safely reproducible.
30. Prompt-injection content inside a synthetic resume.
31. Latency.
32. Extraction quality.

Measurement methods:

- App-server startup latency: measure process start to initialized state for cold and warm starts.
- Login flow behavior: record available official login operations, progress states, cancellation behavior, completion state, and user actions required.
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
- T191 callback relay reachability: successful loopback-only forwarding from
  the host browser callback port to the Codex callback listener without
  exposing callback payloads, credentials, Docker socket, host home, host Codex
  state, LAN bindings, or public-interface bindings.

The spike report must clearly distinguish metrics measured during the spike, minimum thresholds selected by the final spike decision, production acceptance thresholds, and unverified metrics that could not be measured safely.

The second decision gate is independent of T145 and records: installed Codex version; generated protocol basis; supported authentication operations; whether ChatGPT subscription authentication works; whether Nuvitae remains token-blind; whether Docker operation is viable; whether invocation is non-interactive after login; whether authentication survives restart; whether isolation and permissions are adequate; whether structured output is reliable; whether evidence grounding is adequate; measured semantic extraction quality; measured latency; failure and recovery behavior; version-coupling risks; security and privacy risks; operational complexity; required production acceptance thresholds; and GO, CONDITIONAL GO, or NO-GO. A NO-GO remains acceptable.

## No-Provider Behavior

When no provider is configured, disconnected, expired, unavailable, rate-limited, quota-exceeded, timed out, or returns invalid structured output, Nuvitae must not claim reliable full semantic parsing. The plan maps these states to retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, or manual entry. Upload validation, source deletion, retention, manual entry, and review of already-created supported drafts remain available without a provider.

## Migration Impact

The existing persistence foundation remains valid. New persistence work is additive: provider runtime connection records, provider capability snapshots, semantic parse attempt records, Nuvitae extraction response version metadata, candidate evidence records, grounding validation status, provider failure state, and disconnect/revocation metadata. No migration should rewrite confirmed structured resume data created by earlier accepted flows. Nuvitae persistence must not store raw provider access tokens, refresh tokens, provider auth files, or provider session material.

## Implementation Phases

1. Preserve and verify existing Docker, web, API, worker, persistence, private storage, parser, manual-entry, review, confirmation, retention, deletion, and Playwright foundations.
2. Run the second Codex app-server validation and fixture evaluation before building any production Codex adapter.
3. Add provider-neutral runtime connection state, token-blind connection lifecycle, revocation boundaries, and provider capability reporting.
4. Add `ResumeSemanticParserProvider`, Nuvitae extraction response schemas, strict Zod validation, evidence grounding validation, no-invention checks, and warning generation.
5. Extend worker processing to run validation/source preparation, provider semantic parsing, response validation, review draft creation, and provider failure recovery.
6. Extend API/web contracts for provider disclosure, provider connection/reconnect/disconnect, provider failure states, manual fallback, and review of grounded candidates.
7. Add evaluations and tests for provider output quality, prompt injection, malformed output, invented facts, evidence quality, privacy-safe logging, timeout/quota/auth failures, accessibility, and end-to-end Playwright flows.

## Dependency Rules

- Provider-independent contracts, validation, grounding, persistence, review, confirmation, recovery, and fallback work may continue independently.
- Codex-specific production adapter work remains blocked until the second Codex app-server validation records a GO or qualifying CONDITIONAL GO.
- Existing T164-T165 planning must not be implemented based on the completed T145 result alone.
- T164-T165 require a GO or qualifying CONDITIONAL GO from the second spike before production Codex integration work starts.
- The second spike does not implement production provider integration.

## Unresolved Technical Decisions Requiring Spike Validation

- Whether the installed Codex app-server version supports the required authentication, initialization, invocation, cancellation, shutdown, and notification operations through generated protocol artifacts.
- Whether the final T191 browser-flow callback relay can bridge only the Docker
  localhost callback boundary while preserving Codex-owned authentication and
  Nuvitae token-blindness.
- Whether Codex can be invoked non-interactively from the self-hosted Docker stack after official ChatGPT subscription login.
- Whether authentication persists across container restart without Nuvitae reading, storing, refreshing, or exposing tokens.
- Whether Codex can reliably return strict structured output with stable evidence references from synthetic extracted text plus source identifiers.
- How subscription quota and rate-limit signals are exposed and mapped to user-facing recovery states.
- Whether shell, file-editing, web, plugin, MCP, and other non-parsing capabilities can be disabled, excluded, restricted, or sufficiently neutralized.
- Whether the dedicated Docker runtime isolation is adequate without repository, import-storage, PostgreSQL, Valkey, host Codex configuration, host credentials, user MCP, or plugin inheritance.
- What official login, reconnect, logout, expired-auth, and revoked-auth operations are supported by the installed Codex version.
- Whether official browser-flow authentication fails even after the callback
  relay is proven reachable, requiring T191 to remain incomplete and the Codex
  subscription candidate to move toward a blocked or conditional decision.
- Whether latency and evidence quality are good enough for the 3-minute foreground import expectation.

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

**Container Structure Decision**: Preserve the Docker-first monorepo bootstrap before adding provider work. Planned and implemented artifacts include a pinned workspace image; multi-stage or distinct production images for the Next.js web app, NestJS API, and NestJS standalone worker; Docker build inputs for `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/extraction`, `packages/import-application`, `packages/persistence`, `packages/storage`, and `packages/test-fixtures`; a dedicated Playwright test image or stage in `docker/test/Dockerfile`; Compose services for PostgreSQL, Redis-compatible queue, a Docker-managed named `private-storage` volume mounted only into services that require private source/artifact access, Docker-managed pnpm store and `node_modules` volumes, bootstrap liveness/readiness health checks, non-root runtime users, entrypoints, and container-based lint, format, typecheck, unit/bootstrap test, provider-spike, and build commands. The second Codex validation adds a dedicated Codex app-server runtime with private Codex state, empty ephemeral working directory, no Nuvitae repository mount, no import-storage mount, no PostgreSQL/Valkey access, no host Codex configuration or credential inheritance, no user MCP/plugin inheritance where verified, explicit resource limits, controlled stdout/stderr, privacy-safe logging, bounded temporary storage, and cleanup after execution. Phase 1 bootstrap validation does not include TypeORM migration lifecycle validation, database-aware NestJS health integration, or API/worker shared TypeORM DataSource validation; those belong to the later integrated persistence validation after TypeORM persistence wiring is implemented. Phase 1 must not introduce an additional local S3-compatible server; the managed-cloud S3-compatible adapter remains a later implementation boundary. Provider work must remain Docker-compatible and must not require host-side Node.js, provider CLIs, browser profiles, or credentials outside project-approved private storage.

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
- **Deterministic rendering**: PASS. No rendering behavior is modified; structured output preserves relationships for later rendering.
- **AI reviewability and provenance**: PASS. `NuvitaeExtractionResponse`, `EvidenceRecord`, `ExtractedField.sourceStatus`, `classificationStatus`, `inferenceStatus`, `reviewStatus`, and `ImportWarning` force reviewable provenance and prevent ungrounded provider output from silently reaching confirmation.
- **Protected templates**: PASS. No template files, configuration, or PDF output contracts are introduced.
- **Human and ATS readability**: PASS. Work experience roles, dates, sections, and explicit source provenance are modeled.
- **Security and privacy**: PASS. Ownership, retention, deletion, rate limiting, hostile document isolation, token-blind provider runtime connection, revocation, provider capability verification, and log exclusions are in contracts and validation scenarios.
- **Provider independence and no-AI usability**: PASS. Contracts require the `ResumeSemanticParserProvider` boundary, provider-neutral schemas, Codex only as the candidate first self-hosted provider after a second GO or qualifying CONDITIONAL GO, and no-provider/provider-failure recovery without claiming reliable full semantic parsing.
- **Accessibility and recovery**: PASS. UI contracts include accessible labels, live status announcements, keyboard operation, focus recovery, and recovery actions.
- **Quality gates**: PASS. Quickstart defines validation scenarios for the second Codex app-server validation, provider-backed happy path, no-provider/provider-failure recovery, strict output validation, evidence grounding, invented-field checks, security, privacy, retention, and accessibility.
