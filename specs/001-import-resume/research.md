# Research: Import Existing Resume

## Decision: Build the feature in a Nuvitae-owned TypeScript full-stack architecture

**Rationale**: The accepted foundation ADR selects a Nuvitae-owned hybrid architecture: Reactive Resume and Resuml are references, while Nuvitae owns the application shell, domain, import pipeline, persistence, AI boundary, and user experience. A TypeScript monorepo keeps domain types shared across web, API, workers, extraction adapters, and tests while matching the evaluated reference ecosystem.

**Alternatives considered**: Forking Reactive Resume was rejected because its PDF/DOCX import requires AI and creates resumes immediately. Using Resuml as the application foundation was rejected because its inspected repository is CLI/package/MCP-oriented and YAML-centered. A polyglot first implementation was rejected because this repository has no source yet and the first feature needs tight domain/API/UI contract alignment.

## Decision: Use Next.js App Router for the web application

**Rationale**: `apps/web` uses Next.js App Router, React, strict TypeScript, and the `src/app` convention so product routes can be planned as `app/**/page.tsx`. This gives the initial application a concrete React framework, allows server-side rendering for public and application-shell pages, and still supports client components for the visual resume editor where interactivity requires them.

**Alternatives considered**: A generic React entrypoint at `apps/web/src/main.tsx` was rejected because it conflicts with the App Router bootstrap. Vite was rejected as the product web framework for this application stack, though it may be referenced only as a rejected alternative.

## Decision: Use NestJS REST API and a separate NestJS standalone worker

**Rationale**: `apps/api` uses NestJS with the default Express platform, REST-first controllers, and NestJS OpenAPI generation. Controllers stay thin and use-case logic is placed behind providers/services. `apps/worker` is a separate NestJS standalone application that uses BullMQ with the Compose-managed Redis-compatible service and does not expose the main product HTTP API.

**Alternatives considered**: A generic Node API service with `apps/api/src/server.ts` was rejected because the bootstrap must target NestJS. GraphQL was rejected for this feature bootstrap because the API is REST-first. Next.js route handlers containing Nuvitae business logic were rejected because Next.js must not become a second business backend.

## Decision: Add shared contracts and TypeORM persistence packages

**Rationale**: `packages/contracts` uses Zod runtime schemas shared by web, API, worker, and tests. PostgreSQL remains the primary database, while TypeORM, `@nestjs/typeorm`, the PostgreSQL `pg` driver, TypeORM migrations, and the Data Mapper pattern live behind shared `packages/persistence` so API and worker can share one persistence package and compatible configuration model. TypeORM has mature direct NestJS integration, repositories and data sources can be injected through standard NestJS dependency-injection patterns, and it supports PostgreSQL transactions, migrations, repositories, and QueryBuilder. The project owner already has production experience with NestJS, TypeORM, and PostgreSQL, so choosing the better-integrated and already-mastered technology reduces implementation and operational risk. Transport and persistence mappings are explicit, `synchronize` is false for non-disposable environments, and versioned migrations are required for production and shared development.

**Alternatives considered**:

1. TypeORM - selected for this project because it is the best fit for the accepted NestJS API and worker stack, shared API/worker persistence, explicit repositories, transactions, QueryBuilder, and the team's existing production experience.
2. Drizzle - rejected for now. Its lower-level SQL-like API is useful, but it does not currently justify additional NestJS integration work for this project.
3. Prisma - rejected for now. Its generated client and separate schema language would add a new workflow without a sufficiently strong benefit for this project.

Persistence schemas owned only by `apps/api/src/db` were rejected where worker access is required. Letting the domain package depend on Zod transport schemas, TypeORM, BullMQ, Next.js, NestJS, PostgreSQL drivers, or database decorators was rejected because the domain must remain framework-independent.

## Decision: Use a container-only development, build, test, and runtime workflow

**Rationale**: Docker is the only supported environment for installing and executing Nuvitae application dependencies. This gives the project reproducible dependency resolution, host independence, dependency isolation, parser security, CI parity, and easier self-hosting. It also keeps Windows with WSL 2, Linux, and macOS on one documented workflow without assuming a developer-specific home directory.

The development workspace image contains pinned Node.js, Corepack, pnpm, and shared development tools. PostgreSQL, the Redis-compatible queue, and local private object storage run as Compose services. LibreOffice headless and parser dependencies run only in the worker image or an isolated parser image. Playwright browsers run in a dedicated test image or test stage. Source is mounted into `/workspace` inside development containers, while dependency caches, pnpm store, and `node_modules` use Docker-managed volumes.

**Alternatives considered**: Host-side Node.js/pnpm installation was rejected because it makes behavior depend on developer machines and creates a second workflow that can drift from CI. Host-side PostgreSQL, Redis, LibreOffice, and Playwright installation was rejected because it increases setup burden and weakens parser/browser isolation. A remote-only development environment was rejected for the initial plan because local self-hosted development remains a project requirement.

**Trade-offs**: Cold image builds can be slower than host installs. File watching under Docker Desktop can require polling or WSL 2 filesystem placement. Docker-managed caches and volumes need reset and cleanup guidance. Images require version pinning and maintenance. Windows support depends on correctly configured WSL 2 integration.

## Decision: Preserve deterministic physical extraction as provider-ready source preparation

**Rationale**: The amended specification makes AI-assisted semantic parsing the primary semantic extraction path whenever a usable provider is connected, but deterministic processing still owns validation, safety, parser isolation, storage, schema validation, evidence validation, provenance, no-invention enforcement, review, confirmation, retention, and deletion. Existing PDF.js and DOCX adapters remain necessary to validate supported files, enforce page/selectable-text limits, prepare source text and locations, and provide evidence anchors that provider output can be grounded against.

**Alternatives considered**: Replacing deterministic validation/source preparation with provider-only file interpretation was rejected because uploaded documents are untrusted and evidence must be validated before review. Returning to deterministic semantic reconstruction as the primary path was rejected because it conflicts with the amended spec. OCR-first extraction was rejected for the initial release because selectable text is required and scanned/image-only documents are out of scope.

## Decision: Use PDF.js (`pdfjs-dist`) for concrete text-based PDF extraction

**Rationale**: PDF.js is the best initial PDF adapter because it is actively maintained by Mozilla, is Apache-2.0 licensed, exposes page count through loaded document metadata, and exposes text items per page through `getTextContent()` with transform coordinates suitable for page and source-location provenance. It supports text-based PDF extraction without executing PDF-embedded JavaScript as application behavior. The adapter must run in an isolated parser process with 512 MiB memory enforcement and a 3-minute foreground timeout, because PDF files are untrusted and malformed inputs may still trigger parser bugs or resource exhaustion.

**Alternatives considered**: `pdf-parse` was rejected for the primary adapter because it is a convenience wrapper and does not provide the same direct control over page-level text-item coordinates and parser lifecycle. Poppler command-line utilities were rejected as the first default because they add native deployment complexity and inconsistent hosting requirements, though they may remain a diagnostic comparison tool. OCR libraries were rejected because scanned/image-only import is out of scope for the initial release.

**Maintenance status**: Active upstream project maintained by Mozilla and distributed as `pdfjs-dist`.

**License**: Apache-2.0.

**Security implications**: Treat every PDF as hostile, parse only in an isolated process, disable application execution of embedded actions, ignore document-internal instructions, terminate on timeout or memory excess, and never create a review draft from abruptly terminated partial parser output.

**Page and source-position capabilities**: Page count is available from the loaded document. Text extraction is per page, with text items carrying transform/geometry data that can be mapped to page number, bounding box, and source-location references while the source exists.

**Evidence reviewed**: npm metadata for `pdfjs-dist` confirms current publication, Mozilla/PDF.js repository linkage, and Apache-2.0 license; Mozilla PDF.js API documentation covers the library API surface.

## Decision: Use an Office Open XML DOCX adapter plus isolated LibreOffice rendered-page validation

**Rationale**: DOCX has no reliable intrinsic rendered page count, so the initial DOCX pipeline uses isolated LibreOffice headless conversion to PDF for rendered-page-count validation, then counts the rendered PDF pages using the PDF adapter. Text extraction uses a concrete Office Open XML adapter built with `yauzl` for safe ZIP entry access and `fast-xml-parser` for WordprocessingML parsing. This keeps deterministic text extraction inspectable and lets the adapter preserve source-location provenance as package part, paragraph index, table/cell index where applicable, run index, and character offsets. The provenance is not a rendered coordinate, but it is sufficient to show source traceability during review while artifacts exist.

**Alternatives considered**: Mammoth was rejected for the primary extraction adapter because it is optimized for semantic HTML conversion and does not expose enough low-level source-location provenance for review fields. `docx-preview` was rejected because it is browser-rendering oriented and not a server-side validation/extraction primitive. Relying on DOCX metadata page counts was rejected because metadata may be absent or stale. Converting DOCX to PDF and extracting all text from the PDF was rejected as the primary text path because it can lose WordprocessingML structure that helps map sections, tables, and runs.

**Maintenance status**: `yauzl` is a stable, low-churn npm package with broad ecosystem use; `fast-xml-parser` is actively maintained with current releases; LibreOffice is a mature, actively maintained office suite. In this feature, LibreOffice is used only inside the isolated parser process for DOCX rendered-page-count validation.

**License**: `yauzl` is MIT licensed, `fast-xml-parser` is MIT licensed, and LibreOffice is MPL-2.0 licensed.

**Security implications**: DOCX files are ZIP containers and may contain macros, embedded objects, external links, zip bombs, or malformed XML. The adapter must inspect only allowed Office Open XML parts, reject or ignore macros and active content, prevent external resource access, cap decompressed entry sizes, run page rendering in the isolated parser process, enforce 512 MiB memory and timeout limits, and clean up temporary converted PDFs and extracted artifacts after failures.

**Page and source-position capabilities**: Rendered page count is validated by converting DOCX to PDF in isolation and counting the rendered PDF pages. DOCX text source locations are captured from WordprocessingML part names plus paragraph/table/cell/run indexes and character offsets; rendered page coordinates are not guaranteed for DOCX text extraction and must not be promised in review copy.

**Evidence reviewed**: npm metadata for `yauzl` confirms active publication, MIT license, async ZIP parsing, filename validation, and memory-control design goals. npm/Snyk metadata for `fast-xml-parser` confirms active maintenance, MIT license, and current package health. LibreOffice license documentation confirms MPL-2.0 licensing.

## Decision: Use a provider-independent AI semantic parser as the primary semantic mapping path

**Rationale**: Semantic understanding, grouping, and resume reconstruction are now provider-backed when a usable provider is connected. A `ResumeSemanticParserProvider` boundary keeps Codex, OpenAI, ChatGPT, Claude, Ollama, provider SDKs, provider-native JSON, prompts, transport details, credentials, and model choices out of the import domain. Provider adapters return only a versioned Nuvitae extraction response containing candidate values, relationships, warnings, evidence, explicit/inferred classification, and confidence categories. Strict Zod validation, grounding validation, and no-invention checks run before candidates reach review.

**Alternatives considered**: Provider-specific domain fields were rejected because they would lock the import model to one AI vendor. Allowing provider-native JSON into the domain was rejected because malformed or provider-shaped output would weaken schema ownership. Disallowing AI entirely was rejected because the amended spec makes AI-first semantic parsing the initial self-hosted product direction.

## Decision: Treat T189-T195 as a scoped historical app-server NO-GO

**Rationale**: The completed T189-T195 spike rejected only the tested `codex app-server` 0.146.0 ChatGPT-managed authentication candidate. Keeping that result scoped preserves the factual findings while preventing the decision from becoming a global rejection of Codex, direct OAuth, future Codex versions, or the provider-independent AI-first architecture.

**Alternatives considered**: Treating T195 as a permanent Codex NO-GO was rejected because the corrected specification preserves Codex as a candidate first self-hosted provider through a distinct direct-OAuth compatibility spike. Reopening or weakening T189-T195 was rejected because its app-server findings remain complete and historically valid.

## Decision: Plan the first self-hosted provider candidate as a direct-OAuth Codex compatibility spike

**Rationale**: Current OpenClaw and Hermes Agent implementations demonstrate a materially different architecture than the rejected app-server candidate: a provider-independent caller, a dedicated OAuth/provider broker, OAuth Authorization Code with PKCE, broker-owned access/refresh tokens, and direct Codex ChatGPT transport. Nuvitae will evaluate that architecture as `Nuvitae worker -> ResumeSemanticParserProvider -> CodexDirectProviderAdapter -> isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT transport`. This remains a spike only; no production Codex implementation is authorized before a GO or qualifying CONDITIONAL GO.

**Alternatives considered**: Treating Codex as a permanent domain dependency was rejected by the provider-independence requirement. Building production code directly from OpenClaw or Hermes was rejected until exact upstream revisions, licenses, and attribution obligations are audited. Reusing the failed app-server path was rejected for this candidate because T195 already scoped that path as NO-GO. Using a Nuvitae-managed commercial provider, API-key substitution, local-model work, or hosted provider selection first was rejected or deferred because those are outside this feature's corrected scope.

## Decision: Require upstream, licensing, and supportability audit before direct-OAuth implementation

**Rationale**: The direct-OAuth path depends on behavior observed in OpenClaw and Hermes plus official OpenAI Codex documentation/source where relevant. The spike must pin exact upstream commit SHAs and record exact OAuth flow, client identifier, authorization endpoint, token endpoint, callback behavior, PKCE and state handling, requested scopes, originator parameters, token refresh, credential storage, logout behavior, Codex transport/base URL, required request headers, account identity extraction, license obligations, attribution obligations, and OpenClaw/Hermes differences. It must classify each fact as officially documented OpenAI behavior, behavior verified from official source code, behavior used by OpenClaw/Hermes, undocumented compatibility behavior, experimentally verified Nuvitae behavior, or inference.

**Alternatives considered**: Copying upstream code before license review was rejected. Treating OpenClaw/Hermes success as proof of an officially stable third-party API was rejected. Treating the direct ChatGPT Codex backend as supported by default was rejected; it remains undocumented or compatibility-sensitive unless official OpenAI sources explicitly document it for third-party use.

## Decision: Use a dedicated Codex OAuth broker as the only credential-owning component

**Rationale**: The resume-import domain, web app, browser storage, API controllers, regular worker jobs, database domain entities, semantic extraction contracts, logs, and diagnostics must remain token-blind. A dedicated infrastructure-level `CodexOAuthBroker` may own encrypted access and refresh tokens when the integration requires them. The broker owns PKCE verifier/challenge generation, OAuth state generation/validation, loopback callback handling, authorization-code exchange, encrypted credential storage, access-token refresh, logout/local deletion, privacy-safe connection status, direct Codex provider requests, and provider-neutral results.

**Alternatives considered**: Letting normal API controllers or worker jobs handle provider tokens was rejected because it violates the corrected token boundary. Keeping Nuvitae entirely token-blind including infrastructure was rejected because the direct-OAuth candidate requires a credential-owning broker. Choosing broker topology prematurely was rejected; the spike must threat-model a dedicated Docker service, isolated worker-side process, and other bounded infrastructure component before a production choice.

## Decision: Evaluate credential storage without production persistence in the first auth spike

**Rationale**: The spike must evaluate a dedicated encrypted credential store, master encryption key supplied as a Docker secret or environment secret, authenticated encryption, restrictive filesystem permissions, one credential namespace per Nuvitae owner, atomic writes, rotation and deletion, no plaintext credentials in PostgreSQL unless explicitly encrypted, and no credentials in image layers, logs, fixtures, Git, browser storage, queue payloads, or backups without documented encryption. The first auth spike proves lifecycle properties with bounded test credentials/state but does not implement production credential persistence.

**Alternatives considered**: Storing plaintext provider tokens in PostgreSQL, queue payloads, browser storage, logs, fixtures, or Git was rejected. Implementing a production credential vault during the first authentication proof was rejected because the spike must first prove supportability and threat-model the broker topology.

## Decision: Evaluate direct Codex backend invocation only after upstream audit and OAuth proof

**Rationale**: The spike may evaluate the ChatGPT Codex backend used by the audited open-source implementations, but only after exact upstream request-shape audit and successful OAuth proof. Invocation must fail closed with host/path allowlists, no arbitrary base URL, no redirects to unapproved hosts, bounded response size, timeout and cancellation, rate-limit handling, token refresh only for authorized failure categories, and synthetic prompts before any resume content. The direct backend remains undocumented or compatibility-sensitive unless official OpenAI sources explicitly document it for third-party use.

**Alternatives considered**: Calling arbitrary upstream URLs was rejected. Sending resume content before synthetic invocation succeeds was rejected. Treating OpenClaw/Hermes request shapes as production-ready was rejected until supportability, licensing, compatibility, and operational stability are reviewed.

## Decision: Run semantic validation only after authentication and minimal invocation succeed

**Rationale**: Structured resume parsing evidence is meaningful only after OAuth and minimal direct Codex invocation work. The semantic phase evaluates Nuvitae-owned structured output, schema validity, source evidence, grounding, no invention, French, English, bilingual, single-column, and multi-column synthetic fixtures, latency, cancellation, and quota behavior.

**Alternatives considered**: Estimating semantic quality from general Codex capability was rejected. Running semantic parsing before authentication and invocation are proven was rejected because it would blur blocked prerequisites with extraction quality.

## Decision: Model provider failure as first-class recovery states

**Rationale**: The product must not claim reliable full semantic parsing when no usable provider is available. Provider state and parse attempts must distinguish not configured, disconnected, expired authentication, provider unavailable, rate-limited, subscription/quota exceeded, timeout, malformed output, unsupported capability, and invalid evidence. Each state maps to retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, or manual entry.

**Alternatives considered**: Collapsing provider failures into a generic processing failure was rejected because users need actionable recovery. Blocking the entire import flow when a provider is unavailable was rejected because manual entry, upload validation, deletion, retention, and limited deterministic fallback must remain usable.

## Decision: Model import as temporary owned artifacts plus a review draft

**Rationale**: The source document, derived extraction artifacts, and import draft have the same initiating user and original-upload retention deadline. Keeping them separate from the confirmed structured resume allows early source deletion, expiry, cancellation, and privacy guarantees without deleting the user's confirmed resume.

**Alternatives considered**: Storing source snippets directly on the structured resume was rejected because source-reconstructing artifacts must be deleted after source deletion. Creating the structured resume immediately and marking it unverified was rejected because the spec requires explicit confirmation after review.

## Decision: Use private object storage for files and PostgreSQL for domain state

**Rationale**: Uploaded resumes and derived artifacts are sensitive binary/text data with deletion deadlines, while import state, warnings, review decisions, structured resume fields, and audit events require relational ownership and lifecycle constraints. Private object keys scoped by user/import simplify authorization and deletion verification.

**Alternatives considered**: Database-only file storage was rejected because it complicates binary retention and cleanup. Public or guessable object URLs were rejected because imported resumes contain sensitive personal data. Local filesystem-only storage was rejected as the default plan because managed cloud and self-hosted deployments both need explicit private storage semantics.

## Decision: Use background processing with persisted progress and retry/cancel semantics

**Rationale**: Validation, page counting, language detection, provider-ready source preparation, AI semantic parsing, timeout, cancellation, and deletion are long-running or failure-prone. Persisted progress lets users resume before expiry, handles connectivity loss, and supports the 3-minute foreground timeout with partial threshold-qualified results.

**Alternatives considered**: Synchronous request-only processing was rejected because it is brittle for large uploads, timeouts, and browser disconnects. Stateless client-only processing was rejected because source documents require authenticated access, retention, deletion, and hostile-document isolation.

## Decision: Create review drafts only from grounded supported candidates

**Rationale**: A draft requires at least one supported candidate associated with required document evidence. This preserves factual integrity and prevents inferred-only or ungrounded provider output from becoming a review draft. Missing, ambiguous, duplicate, conflicting, low-confidence, semantically grouped, inferred, invalid-provider-output, and ungrounded fields become warnings requiring user action or are rejected as unusable.

**Alternatives considered**: Allowing inferred-only or evidence-free drafts was rejected because the spec forbids it. Silently accepting provider output without grounding validation was rejected because it would violate no-invention and provenance requirements. Dropping all partial extractions was rejected because the spec requires threshold-qualified partial results and recoverable paths.

## Decision: Make accessibility a contract, not a later polish task

**Rationale**: Import is the primary onboarding path and must meet WCAG 2.2 AA expectations. The design must include accessible names, keyboard operation, live progress announcements, non-colour warning identification, error-summary focus, and focus restoration after dialogs.

**Alternatives considered**: Deferring accessibility to implementation was rejected because the constitution treats accessible core flows as release gates.

## Decision: Validate with fixture suites and lifecycle/security scenarios

**Rationale**: The riskiest behavior is not only extraction accuracy; it includes provider authentication, non-interactive invocation, strict output shape, evidence quality, invented-field rate, authorization, parser safety, source deletion, expiry, logging, rate limits, quota/subscription failures, timeout recovery, warning resolution, and accessible review. Fixtures must cover English, French, bilingual, one-column, multi-column, unsupported, hostile, partial, mixed-content, no-supported-field, and malformed documents.

**Alternatives considered**: Happy-path-only upload tests were rejected because they would miss release-blocking privacy, safety, failure, and accessibility requirements.
