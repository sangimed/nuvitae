# Research: Import Existing Resume

## Current status reconciliation (2026-08-08)

This is the canonical cross-artifact status summary for the direct-OAuth and
Community onboarding work. Evidence paths below are read-only references; this
reconciliation does not reopen T246 or change the T203 decision. T213 and T214
are complete at the entrypoint/callback/status boundaries; T215 remains
incomplete.

| Task | Canonical title                                                             | Status                                     | Dependency/blocker                                                                                                                                     | Evidence                                                                                                                     | Document disagreement                                               |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| T203 | Record direct-OAuth GO/CONDITIONAL GO/NO-GO decision                        | COMPLETE (decision recorded: NO-GO)        | T246 qualification failed; onboarding is `FAIL_AUTOMATED_FEASIBILITY`; moderated human validation and live connection/import evidence are not complete | `docs/research/codex-direct-oauth-go-no-go.md`, `docs/research/codex-direct-oauth-onboarding-feasibility.md`                 | Historical 2026-08-05/06 snapshots are labeled and superseded.      |
| T213 | Implement the Codex connection screen and executable “Connect Codex” action | COMPLETE (2026-08-08)                      | T162/T163 and the broker login boundary; entrypoint and browser handoff are implemented, while callback/status remain T214 scope                       | `specs/001-import-resume/tasks.md` T213; `tests/browser/import-resume/onboarding-feasibility.spec.ts`; focused web/API tests | None in current sections.                                           |
| T214 | Implement OAuth callback handling and provider-neutral connection-state UI  | COMPLETE (2026-08-08)                      | T213; callback completion, encrypted session persistence, owner-bound status projection, and ready/expired/disconnected UI are implemented; T215 mutations remain separate | `specs/001-import-resume/tasks.md` T214; focused API/web/security tests; onboarding feasibility record | None in current sections. |
| T215 | Implement reconnect/disconnect, local credential deletion, and recovery     | INCOMPLETE                                 | T214; production operations and data-preserving recovery flow are absent                                                                               | `specs/001-import-resume/tasks.md` T215; onboarding feasibility record                                                       | None in current sections.                                           |
| T217 | Wire bounded deterministic fallback and provider-neutral recovery           | COMPLETE                                   | T188; no T203/T246 blocker remains for this fallback scope                                                                                             | `specs/001-import-resume/tasks.md` T217; `docs/research/codex-direct-oauth-go-no-go.md`                                      | Historical partial-wiring wording is labeled/superseded.            |
| T246 | Execute and qualify real-document semantic matrix                           | COMPLETE (qualification finalized: FAILED) | Terminal C01/C04 semantic failures; all C01-C08 consumed; no retry or reopening                                                                        | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-aggregate.json`                                                  | Historical preparation states are labeled; no current disagreement. |
| T248 | Prove the canonical real French PDF fixture                                 | COMPLETE                                   | No remaining dependency; satisfies the T246 French-PDF prerequisite                                                                                    | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t248-french-pdf.json`                                                 | None in current sections.                                           |
| T249 | Complete the T246 real-document corpus offline                              | COMPLETE                                   | No remaining dependency; does not authorize new live work                                                                                              | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-corpus-offline.json`                                             | Historical NOT_AUTHORIZED wording is scoped to T249 preparation.    |
| T164 | Implement the production Codex direct-OAuth adapter                         | BLOCKED                                    | T203 remains NO-GO; also requires the accepted OAuth, lifecycle, invocation, semantic, and security gates                                              | `specs/001-import-resume/tasks.md` T164; T203 decision                                                                       | None in current sections.                                           |
| T165 | Implement the direct-OAuth response converter                               | BLOCKED                                    | T203 remains NO-GO and T164/provider adapter prerequisites are incomplete                                                                              | `specs/001-import-resume/tasks.md` T165; T203 decision                                                                       | None in current sections.                                           |

The single current T203 blocker list is therefore:

1. T246 semantic qualification is finalized as FAILED: C01 FAIL, C02 PASS,
   C03 PASS, C04 FAIL, C05 PASS, C06 PASS, C07 PASS, C08 PASS.
2. T215 reconnect/disconnect/credential-deletion and provider-unavailable
   recovery operations remain incomplete. T213 supplies the production
   entrypoint/browser handoff and T214 supplies callback completion, encrypted
   session persistence, provider-neutral status, and ready/expired/disconnected
   UI states.
3. Moderated human onboarding/usability validation has not been performed and
   remains required by SC-001, SC-003, SC-004, and SC-009.

T217 is resolved and is not a current T203 blocker. T248 and T249 are complete
prerequisites and are not blockers. T164/T165 remain blocked by the NO-GO.

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

---

# Community MVP Research Update (2026-08-05)

The approved strategic direction is product-first: Nuvitae Community is the first MVP. The decisions below supersede the earlier architecture-first/hardening-first assumptions in this research file only where noted; earlier decisions remain valid except as amended.

## Decision: Ship Nuvitae Community as the first MVP (product-first, not architecture-first)

**Rationale**: The import→review→confirm journey is implemented and tested, but no real user can complete it today: production wiring registers no AI provider, so uploads terminate at `provider_unavailable`. The highest-value next move is one decisive vertical slice that makes the product promise real for a real user — not continued hardening. Community (self-hosted, Docker-first, free, user's own Codex access) proves the complete AI-powered resume experience with minimal business risk before a hosted commercial edition is built.

**Alternatives considered**: A private hosted alpha with managed AI was rejected as the first release because it builds hosted infrastructure before the product promise is proven, and a hardening-first continuation was rejected because it does not produce a usable product. The hosted commercial edition remains the later product, not the MVP.

## Decision: Make direct Codex OAuth the production primary AI path for the Community MVP

**Rationale**: Community is powered by the user's own Codex access. Direct Codex OAuth (browser Authorization Code with PKCE through a dedicated broker) is the only path that lets a self-hoster use their existing ChatGPT subscription without pasting API keys, and the T196-T200 spike proved the essential mechanics in a bounded local mode. Codex OAuth is therefore MVP-critical and part of onboarding, not paused or optional.

**Alternatives considered**: Managed hosted AI as the first provider path was rejected because it is the deferred commercial product. API-key onboarding as the primary journey was rejected because it is not viable for non-technical users and contradicts the Community promise. A provider marketplace before the Codex journey works was rejected as over-generalization.

## Decision: Do not make API-key onboarding the primary Community journey

**Rationale**: The Community promise is that a non-technical user can install Nuvitae, connect their own Codex, and create a resume. Requiring users to locate and paste API keys, subscriptions, or provider credentials is a developer-oriented onboarding that fails the target user.

**Alternatives considered**: API-key provider onboarding remains a possible advanced/self-host option later but is not on the Community critical path.

## Decision: Reuse the validated direct-OAuth spike evidence where it qualifies, preserving its honest limits

**Rationale**: The T196-T200 spike is substantial reusable evidence for the Community path: T196 pinned upstream audit, T197 security design and broker topology, T198 browser OAuth login proof, T199 encrypted credential lifecycle (persistence, refresh, single-flight, logout, deletion), and T200 minimal direct invocation (HTTP 200 with valid SSE and the `NUVITAE_T200_OK` marker). These prove the OAuth mechanics and broker credential boundary in the supported local Docker Desktop, same-host-browser mode.

The accepted direct-OAuth evidence set now also includes the T245 lifecycle
proof (accepted 2026-08-07; aggregate
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t245-lifecycle.json`):
fresh browser OAuth login, callback completion,
`connection_status_after_callback: connected`, encrypted persistence without
plaintext, restart recovery, successful invocation after restart (T200, exact
HTTP 200), live refresh with rotation, explicit reconnect, disconnect and
credential removal, and deterministic invalid-grant recovery (9/9 mandatory
criteria; 8 live-observed, 1 deterministic-only; provider-side revocation not
exercised and not required). T245 satisfies T203 re-evaluation trigger 1 and
unblocks T213-T215 Community connection-UI qualification. T213 is complete for
the entrypoint/browser handoff boundary; T214 is now complete for callback,
status, and ready-state presentation, while T215 remains incomplete.

**Gaps that remain before production Community use (preserved honestly)**:

- T201 is complete: C01-C03 passed canonical live validation; C04-B03 (corrected T208 deterministic-enrichment contract), C05-B01, and C06-B01 passed canonical live validation; C03 B01/B02 and C04 B01/B02 remain immutable failed historical attempts (C04 B01 failed under its original physical-coordinate contract; C04 B02 failed at credential recovery). T246 is finalized as FAILED / qualification not passed: C01 and C04 are semantic recall failures, while C02, C03, C05, C06, C07, and C08 pass. This result remains unchanged and is not converted by T217.
- T202 (evaluation) was re-measured offline from the accepted evidence on 2026-08-06 (T244) and is recorded as MEASURED in `docs/research/codex-direct-oauth-evaluation.md` with a sanitized aggregate (`codex-direct-oauth-t202-metrics.json`): every evidence-supported metric passes; latency, cancellation, and quota behavior remain explicitly unmeasured. T217 bounded-fallback production wiring completed on 2026-08-08: one application-owned primary call, one local deterministic fallback execution, no hidden provider retry, closed failure classification, atomic/idempotent draft persistence, safe terminal failure, and provider-neutral UI/status recovery. T214 callback/status/ready-state wiring is complete; the T203 gate remains NO-GO for production adapter implementation because finalized T246 qualification failed and onboarding is separately measured as `FAIL_AUTOMATED_FEASIBILITY` due to incomplete T215 recovery, missing live provider/import evidence, and pending moderated human validation. Re-evaluation triggers are defined in `docs/research/codex-direct-oauth-go-no-go.md`. No production GO exists.
- The loopback OAuth callback is proven only for a local Docker host with a same-host browser. Remote, VPS, NAS, and headless self-hosting onboarding is unproven and is a significant open product question for the Docker-first Community distribution.
- The direct `chatgpt.com/backend-api/codex` transport is undocumented or compatibility-sensitive for third-party use; upstream changes may break compatibility.
- No task is marked complete merely because Community depends on it, and the Community product decision does not authorize production adapter code (T164/T165 remain blocked).

## Decision: Keep one authoritative semantic parsing path; do not over-generalize providers before the Codex Community journey works

**Rationale**: The Community MVP must have exactly one production semantic path — the validated Codex direct-OAuth adapter behind `ResumeSemanticParserProvider` — plus a bounded deterministic fallback. Adding local models, OpenAI-compatible endpoints, a marketplace, or multiple production providers before the Codex journey works multiplies risk without Community value.

**Alternatives considered**: A provider abstraction remains (the import domain depends only on the Nuvitae-owned boundary), but it is a boundary, not a mandate to ship many adapters in the MVP.

## Decision: Defer hosted managed AI to a later commercial edition

**Rationale**: Hosted managed AI is the commercial product's differentiator and a large infrastructure investment. Building it into the Community MVP makes the free self-hosted product depend on commercial infrastructure and delays the product promise. It is explicitly deferred and must not be added to the Community critical path.

**Alternatives considered**: Running Community on hosted managed AI was rejected as a dependency inversion.

## Decision: Treat visual maturity as necessary for valid product testing

**Rationale**: A developer-looking prototype (bare status cards, raw enum text, 92-button review screens, no shell, no preview) cannot validate the Community product promise with non-technical users. The MVP must meet a FlowCV-calibre UI/UX standard (coherent shell, modern typography and spacing, clear navigation, designed states, preview/export fidelity, responsive behavior) before usability testing is meaningful. The T093/T097 non-technical-UX regressions and usability protocol depend on this.

**Alternatives considered**: Shipping the functional prototype and polishing later was rejected because the usability evidence would be invalid and the product would fail the non-technical promise.

## Decision: Use vertical slices instead of hardening-first sequencing

**Rationale**: The previous task graph front-loaded deep US4/US6 hardening and a provider spike before any usable product existed. Community replaces that sequencing with five demoable vertical tranches (setup + real Codex import → credible resume + PDF → visual editor → reversible Codex editing → alpha readiness), each with backend, UI, recovery, responsive, Docker, and end-to-end demonstration criteria. Hardening tasks remain preserved but are deferred or scheduled after the visible product works.

**Alternatives considered**: A hardening-first sequence was rejected because it produces no testable product for a non-technical user and delays the exact moment when the product promise becomes real.

## Decision: Complete the T246 real-document corpus offline before any live authorization

This decision records the offline-preparation state before the later T246 live
campaign. Its `T246 remains incomplete` wording is historical; the current
aggregate is finalized as FAILED and is governed by the reconciliation at the
top of this document.

**Rationale**: T246 (live real-document Codex semantic evaluation) requires
deterministic extraction transcripts and provenance as the Codex input for
eight scenario categories. Before any live authorization, the missing five
mandatory real-document fixtures were completed fully offline (T249,
2026-08-07): a bilingual PDF, a partial/sparse DOCX, a structurally ambiguous
multi-column PDF, a prompt-instruction-like DOCX, and a malformed PDF
recovery case, each with a deterministic generator, a pinned corpus
transcript, expected semantic JSON, and a fail-closed manifest. Formats were
chosen to exercise distinct production behavior per the canonical contract:
PDF for bilingual classification and multi-column interleaving, DOCX for
sparse absence semantics and prompt-instruction isolation, and PDF for the
malformed recovery case. The dedicated T246 authorization registry,
validator, offline-safe runner, and incomplete aggregator are implemented
with every entry NOT_AUTHORIZED. C08 is a recovery-only case: it consumes
zero Codex requests, so the exact future request budget is 7 semantic cases
plus 1 non-semantic recovery case (total maximum future Codex requests: 7).
No live execution, OAuth, provider, network, or credential access was
performed, T246 remains incomplete, and T203 remains NO-GO.

**Alternatives considered**: Running T246 against the synthetic T201 corpus
or authorizing live requests before the real-document corpus was pinned was
rejected because it would not measure real PDF/DOCX semantic quality and
would bypass the mandatory fail-closed hash verification. Committing opaque
manually-created binaries without reproducible generators was rejected
because the repository convention requires deterministic generator sources
for every fixture.
