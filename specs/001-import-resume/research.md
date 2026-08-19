# Research: Import Existing Resume

## Current status reconciliation (2026-08-09)

This is the canonical cross-artifact status summary for the direct-OAuth and
Community onboarding work. Evidence paths below are read-only references; this
reconciliation does not reopen T246 or change the T203 decision. T213 and T214
are complete at the entrypoint/callback/status boundaries; T215 is complete
for local lifecycle recovery and mocked browser validation. T216 is complete
for production semantic-provider wiring and offline/local preflight; this does
not claim live OAuth or provider-import evidence. T217 and T218 are complete.
T258 subsequently completed its separately scoped Community integration proof
on Attempt #3; this does not qualify Codex globally or alter T203/T246.

The transversal semantic-provider boundary redesign is recorded in
[`docs/research/semantic-provider-boundary-redesign-2026-08-09.md`](../../docs/research/semantic-provider-boundary-redesign-2026-08-09.md).
It recommends an explicit `nuvitae.semantic-extraction.v2` response boundary,
deterministic Nuvitae canonicalization, and field-level fail-closed acceptance
inside a valid response envelope. This is an offline architecture decision;
it does not authorize a live retry, reopen T246, or activate Grounded
Multimodal Import V2.

### Candidate identity correction (offline, 2026-08-09)

The latest real import (`51364b5a-18ff-4282-9831-7c9b30df3a5`) proved transport
end-to-end — HTTP 2xx, SSE completion, EOF, and JSON parsing — but semantic
validation rejected `candidateId` types in education, skills, and languages.
The flattened-evidence blocker was therefore resolved enough to reach schema
validation; the current blocker was a candidate-ID ownership mismatch.

`candidateId` is an internal Nuvitae correlation key, not source information.
The provider contract strips the legacy field before strict semantic validation,
so omission, explicit `null`, wrong types, and arbitrary strings cannot reject
or influence otherwise valid facts; the prompt explicitly says not to return
it. The application mapper generates
`candidate-{importId}-{structuralPath}` IDs, keeps them unique and stable for
the import review lifecycle, and never uses provider strings as application
identity. Evidence grounding, no-invention, T217 budgets, T246 status, and V2
scope are unchanged. The live counts (1 education, 4 skills, 2 languages)
match the smoke fixture and are structural recall encouragement only, not
accepted real-provider recall. Exactly one separately authorized future smoke
is warranted after this offline correction.

The post-V1 architecture hypothesis **Grounded Multimodal Import (V2)** is
recorded separately in
[`docs/research/grounded-multimodal-import-v2.md`](../../docs/research/grounded-multimodal-import-v2.md).
It is **PROPOSED / POST-V1 SPIKE / NOT IMPLEMENTED** and does not change this
feature's V1 execution plan, T203, T246, or T217. V1 remains **Grounded Text
Import**; the core principle for any future V2 work is **“LLM for
understanding. Nuvitae for proof.”**

| Task | Canonical title                                                             | Status                                     | Dependency/blocker                                                                                                                                                         | Evidence                                                                                                                                                | Document disagreement                                                        |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| T203 | Record direct-OAuth GO/CONDITIONAL GO/NO-GO decision                        | COMPLETE (decision recorded: NO-GO)        | T246 qualification failed; deterministic/local onboarding feasibility passes, while moderated human validation and live connection/import evidence are not complete        | `docs/research/codex-direct-oauth-go-no-go.md`, `docs/research/codex-direct-oauth-onboarding-feasibility.md`                                            | Historical 2026-08-05/06 snapshots are labeled and superseded.               |
| T213 | Implement the Codex connection screen and executable “Connect Codex” action | COMPLETE (2026-08-08)                      | T162/T163 and the broker login boundary; entrypoint and browser handoff are implemented, while callback/status remain T214 scope                                           | `specs/001-import-resume/tasks.md` T213; `tests/browser/import-resume/onboarding-feasibility.spec.ts`; focused web/API tests                            | None in current sections.                                                    |
| T214 | Implement OAuth callback handling and provider-neutral connection-state UI  | COMPLETE (2026-08-08)                      | T213; callback completion, encrypted session persistence, owner-bound status projection, and ready/expired/disconnected UI are implemented; T215 mutations remain separate | `specs/001-import-resume/tasks.md` T214; focused API/web/security tests; onboarding feasibility record                                                  | None in current sections.                                                    |
| T215 | Implement reconnect/disconnect, local credential deletion, and recovery     | COMPLETE (2026-08-08)                      | T214; offline/local lifecycle operations are implemented and validated; live production OAuth/import proof and moderated human validation remain separate blockers         | `specs/001-import-resume/tasks.md` T215; provider connection/service, persistence/security, web, and onboarding tests                                   | None in current sections.                                                    |
| T216 | Wire the production Codex semantic provider behind the parser boundary      | COMPLETE (2026-08-08)                      | Worker resolves the owner-bound ready connection and encrypted session per job; live OAuth/import proof remains pending                                                    | `specs/001-import-resume/tasks.md` T216; T216 adapter/transport/worker tests; `docs/research/codex-direct-oauth-t216-production-wiring-2026-08-08.json` | Historical T203/T164/T165 blocker wording is superseded for wiring only.     |
| T217 | Wire bounded deterministic fallback and provider-neutral recovery           | COMPLETE                                   | T188; no T203/T246 blocker remains for this fallback scope                                                                                                                 | `specs/001-import-resume/tasks.md` T217; `docs/research/codex-direct-oauth-go-no-go.md`                                                                 | Historical partial-wiring wording is labeled/superseded.                     |
| T218 | Preserve every reviewed confirmation field under FR-034                     | COMPLETE (2026-08-09)                      | Mapper and regression coverage preserve reviewed fields, including education degree/institution/year; explicit exclusion remains the only removal path                     | `specs/001-import-resume/tasks.md` T218; `specs/001-import-resume/spec.md` FR-034; mapper and confirmation regressions                                  | None in current sections.                                                    |
| T246 | Execute and qualify real-document semantic matrix                           | COMPLETE (qualification finalized: FAILED) | Terminal C01/C04 semantic failures; all C01-C08 consumed; no retry or reopening                                                                                            | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-aggregate.json`                                                                             | Historical preparation states are labeled; no current disagreement.          |
| T248 | Prove the canonical real French PDF fixture                                 | COMPLETE                                   | No remaining dependency; satisfies the T246 French-PDF prerequisite                                                                                                        | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t248-french-pdf.json`                                                                            | None in current sections.                                                    |
| T249 | Complete the T246 real-document corpus offline                              | COMPLETE                                   | No remaining dependency; does not authorize new live work                                                                                                                  | `spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-corpus-offline.json`                                                                        | Historical NOT_AUTHORIZED wording is scoped to T249 preparation.             |
| T164 | Implement the production Codex direct-OAuth adapter                         | HISTORICAL SCOPE SATISFIED BY T216 WIRING  | The thin production adapter and invocation boundary are implemented under T216; the T203 decision still prevents claiming qualified live production behavior               | `specs/001-import-resume/tasks.md` T164; T216 implementation/evidence; T203 decision                                                                    | Task checkbox intentionally unchanged; T216 is the current completion scope. |
| T165 | Implement the direct-OAuth response converter                               | HISTORICAL SCOPE SATISFIED BY T216 WIRING  | Canonical response validation/mapping is implemented under T216; the T203 decision still prevents claiming qualified live production behavior                              | `specs/001-import-resume/tasks.md` T165; T216 implementation/evidence; T203 decision                                                                    | Task checkbox intentionally unchanged; T216 is the current completion scope. |

The single current T203 blocker list is therefore:

1. T246 semantic qualification is finalized as FAILED: C01 FAIL, C02 PASS,
   C03 PASS, C04 FAIL, C05 PASS, C06 PASS, C07 PASS, C08 PASS.
2. The supported real production OAuth/import flow has not been exercised in
   the T213-T215 application path; no live provider proof is claimed.
3. Moderated human onboarding/usability validation has not been performed and
   remains required by SC-001, SC-003, SC-004, and SC-009.

T217 is resolved and is not a current T203 blocker. T248 and T249 are complete
prerequisites and are not blockers. T216 is complete and the previous missing
production-provider-registration blocker is resolved. The remaining T203
blockers are only the finalized T246 qualification failure, the unperformed
real production OAuth/import proof, and moderated human onboarding validation.

The document-extraction reconciliation is recorded in the dedicated
[`Document Understanding Layer evaluation`](../../docs/research/document-understanding-layer-2026-08-09.md)
research record. It is **PROPOSED / SPIKE REQUIRED / NOT IMPLEMENTED** and does
not change the current status table above.

## Architecture reconciliation: document understanding is a future boundary

The current V1 truth is unchanged: `packages/extraction` owns deterministic
PDF.js/pdfjs-dist selectable-text extraction and page/text-item provenance for
PDF, Office Open XML extraction using `yauzl` and `fast-xml-parser` for DOCX,
and isolated LibreOffice rendering only for DOCX rendered-page-count
validation. The stack is active, supported, and test-covered. It remains
required until a replacement decision is made.

The research conclusion is that this physical extraction stack must not be
treated as the assumed long-term document-understanding architecture. The
harder future problem is document structure: reading order, sections and
headings, lists, tables, spatial grouping, styles, figures/assets, bounding
boxes, and provenance. A provider-neutral boundary is therefore proposed:

```text
validated born-digital PDF/DOCX
→ DocumentUnderstandingProvider (proposed; not implemented)
→ canonical NuvitaeDocument
→ ResumeSemanticParserProvider
→ nuvitae.semantic-extraction.v2
→ Nuvitae canonicalization / grounding / identity / review
```

`NuvitaeDocument` is a canonical runtime/document representation, not a
persistence design. It is expected to normalize document metadata, pages,
stable Nuvitae-owned blocks/fragments, reading order, optional bounding boxes,
sections, tables, optional style signals, retained assets, source provenance,
and bounded engine/version/configuration quality metadata. It is distinct from
source-reconstructing temporary artifacts and from structured resume domain
state.

The import and semantic domains must not depend on `DoclingDocument`, PyMuPDF
dictionaries, Azure `analyzeResult`, Unstructured elements, Apryse JSON,
Google DocumentLayout output, Adobe extraction JSON, or equivalent
parser-native schemas. The current PDF.js/OOXML stack may later become one
implementation behind the proposed boundary, but no migration is scheduled
before the controlled benchmark.

The semantic-provider redesign remains compatible with this boundary. A future
provider receives Nuvitae-owned fragment/block references and returns semantic
values plus bounded `sourceRefs`; Nuvitae resolves the references, verifies
quotes and values, reconstructs exact evidence, derives application identity,
and applies fail-closed acceptance. The governing principle remains
**“LLM for understanding. Nuvitae for proof.”**

## Decision: Keep the current physical extractor active for V1, without making it the long-term engine decision

The existing PDF.js, OOXML, and LibreOffice decisions remain the active V1
implementation record. They continue to own deterministic validation,
selectable-text checks, rendered-page limits, native source provenance, parser
isolation, and the V1 transcript/fragments used for grounding. They are not
deprecated and are not removed from the plan or task history.

Their architectural status is now explicitly bounded: they are one current
implementation of the physical/document-understanding responsibility, not a
commitment that Nuvitae will retain this parser model indefinitely. The future
canonical contract is `NuvitaeDocument`, and the first replacement hypothesis
must be tested before any migration or routing decision.

## Decision: Benchmark the current extractor against Docling first

Docling is the first candidate worth benchmarking because it offers PDF and
DOCX support, structured document output, layout and reading-order
reconstruction, bounding boxes/provenance, local or self-hosted execution,
and provider-independent structured output. This is a benchmark hypothesis
only. Docling has not been benchmarked against the Nuvitae corpus and is not
selected as the production engine.

The initial spike is intentionally limited to the current extractor versus
Docling. It must answer whether Docling can replace or substantially simplify
custom physical extraction/layout reconstruction while preserving the
canonical grounding contract. The spike is non-blocking for V1, does not
install dependencies or change runtime code in this reconciliation, and may
conclude that Nuvitae should keep the current extractor, replace most
extraction, use Docling only for complex layouts, retain the current fast path
with a richer path, or benchmark another candidate.

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

## Decision (V1 active implementation): Preserve deterministic physical extraction as provider-ready source preparation

**Rationale**: The amended specification makes AI-assisted semantic parsing the primary semantic extraction path whenever a usable provider is connected, but deterministic processing still owns validation, safety, parser isolation, storage, schema validation, evidence validation, provenance, no-invention enforcement, review, confirmation, retention, and deletion. Existing PDF.js and DOCX adapters remain necessary for V1 to validate supported files, enforce page/selectable-text limits, prepare source text and locations, and provide evidence anchors that provider output can be grounded against. This decision does not select the current physical extraction stack as the long-term document-understanding engine; that question is delegated to the controlled benchmark.

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

## Decision: Community V1 is one installation = one owner, with real authentication (2026-08-18)

**Rationale**: The bounded T212 runtime audit found that the production-shaped
Compose runtime cannot establish an authenticated principal: `AppModule` only
loads `LocalPlayRuntimeModule` when `NUVITAE_LOCAL_PLAY_MODE=true`, while that
development-only module supplies import/provider runtime wiring and a fixed
verified development principal. `VerifiedPrincipalGuard` correctly protects
import, manual-resume, and provider-connection APIs, but no production
credential-verifying adapter currently attaches a principal. The plan was
therefore contradictory: it required authenticated, owner-scoped Community
flows and a usable self-hosted installation without scheduling the mechanism
that creates the Community owner. Local-play cannot be promoted because it is
non-production, has a fixed identity, and would turn an internal development
convenience into implicit production trust.

Community V1 deliberately limits product scope to one self-hosted installation
and one owner. The smallest safe implementation is a replaceable
`CommunitySingleOwnerAuthAdapter` at runtime infrastructure: establish a
stable opaque owner at installation/first-run, authenticate it server-side,
and issue a bounded session that produces `VerifiedPrincipal`. This avoids a
premature signup, multi-user account, email/password, recovery, social-login,
or external-IdP system, while still requiring real credentials, fail-closed
validation, session expiry/invalidation, and protected APIs. Network locality
alone is not authentication. The adapter must also wire normal production API,
worker, queue, persistence, and private-storage configuration rather than
depending on local-play.

Existing resource ownership remains unchanged: services receive a real opaque
`ownerUserId`; repositories stay owner-scoped; and authorization compares a
resource owner to the authenticated principal. This is deliberately compatible
with V2, where a `MultiUserAuthAdapter` may replace the V1 adapter for multiple
users, hosted identity, passwordless/OIDC options, recovery, administration,
or later teams/organizations without rewriting resume/import/provider domain
logic. Reconsider the V1 model when multiple people share a self-hosted
instance, when hosted or multi-tenant deployment begins, or when organization
requirements arise.

**Alternatives considered**: Treating every request as the owner was rejected
because it removes authentication. Reusing the local-play fixed principal was
rejected because it is explicitly development-only. Building full multi-user
authentication now was rejected because it is not required for the V1 product
promise and would delay the missing production boundary. The roadmap repair was
T257 before T212. T257 completed on 2026-08-18 with deterministic, host-side
smoke, and manual-browser validation; T212 subsequently completed its
installation/onboarding scope. T258 is now the next Tranche-1 closure task.

## Community localhost cookie and OAuth callback limitation and Tranche-1 closure (2026-08-18)

Community V1's supported browser URL is `http://localhost:3000` on the same
machine as Docker. Modern browsers treat localhost and loopback origins as
potentially trustworthy for Secure cookies, so the production
`NUVITAE_COMMUNITY_COOKIE_SECURE=true` session setting remains required for
that local path. This exception does not support plain-HTTP LAN or public
deployment; any remote Community deployment requires HTTPS and is outside T212.

The existing direct OAuth callback returns from a cross-site authorization
origin to `http://localhost:1455/auth/callback`, while the Community session
cookie is `SameSite=Strict` and the callback is authenticated. The cookie may
therefore be absent from that callback. This is a Community-runtime
compatibility concern, not an HTTPS blocker and not a T212 authentication/OAuth
redesign. T212 correctly neither weakened SameSite nor claimed OAuth completion
validation.

This exposed a roadmap contradiction: every explicitly listed Tranche-1
implementation task (T257, T212, and T213-T218) is complete, while the stated
Tranche-1 outcome still requires a real owner → Connect Codex → cross-site
callback → ready → real PDF/DOCX import → review journey that has not been
proven after the new Community owner/session boundary. T258 is therefore the
smallest explicit Tranche-1 closure task. It must first resolve callback
compatibility without blindly changing SameSite, then pass deterministic
owner-bound one-time-state/security tests and one bounded, no-retry real
Community smoke. This smoke is not T246, model qualification, or a T203
re-evaluation: T246 remains finalized FAILED and immutable, and T203 remains
NO-GO. T235 stays in Tranche 5 as the later full-MVP install-to-PDF/release
demonstration; using it as a Tranche-1 prerequisite would be circular because
it depends on Tranches 1-5.

### T258 consumed live attempt and offline quality diagnosis (2026-08-18)

The single authorized T258 Community smoke is consumed. Production owner
authentication passed, the real browser OAuth callback completed without the
`SameSite=Strict` Community session cookie, pending server-side state resolved
the initiating owner, and the connection reached ready. The callback fix in
`f671ecc` is therefore live-proven and remains isolated. The browser returned
to the home page after callback rather than directly to the import screen; this
is recorded as a minor UX observation only, not expanded into T258 scope.

Exactly one upload and one primary provider invocation were used. The provider
returned HTTP 2xx, SSE began, `response.completed` and normal EOF were observed,
canonicalization completed, `v2_partial_acceptance` persisted a draft, and
review became available. No transport failure, second invocation, or
deterministic fallback was observed. The result is nevertheless an immutable
`QUALITY FAIL`: meaningful Work and Education structure was not usable, and
headline was rejected. The opaque import id is
`c8b06e96-3024-4f8c-a52a-3dc9e03f005b`; no source filename or resume content is
recorded here.

Privacy-safe runtime diagnostics identify the structural cause. Scalar atoms
for headline, all four work-role title anchors, and education institution,
degree, and field-of-study fields carried multiple otherwise well-shaped
`sourceRefs`. The canonicalizer correctly classified these as
`ambiguous_source_refs`; it then removed each role whose required title was
ineligible, removed employer groups with no eligible role, and removed an
education group when its required institution was ineligible. The V2 schema
uses a bounded source-reference array because long-form fields may span
fragments, but the generated provider instructions did not state clearly that
ordinary scalar atoms require exactly one reference. They also used “at least
one” language for contact. The faulty layer is therefore the provider
contract/prompt guidance, not extraction, transport, parsing, source-registry
resolution, canonicalization, group validation, draft mapping, OAuth, or the
recent callback change.

The offline correction makes source-reference ownership explicit: every scalar
atom has exactly one direct reference; only summary, work responsibilities,
work achievements, and project descriptions may use multiple ordered refs when
the complete value genuinely spans fragments; group objects never own refs.
Fail-closed canonical validation is unchanged. Synthetic repeated-text Work and
Education coverage reproduces the consumed response shape and proves malformed
anchors reject only the affected group while valid sibling groups survive.
T258 remains unchecked, Tranche 1 remains incomplete, T219 remains blocked,
T203 remains NO-GO, and no live retry is authorized by this record.

### T258 generic split-scalar evidence correction (2026-08-18)

The anti-overfitting audit supersedes the prompt-only diagnosis above without
rewriting its historical checkpoint. Semantic V2 atoms already permit one to
eight source refs, PDF.js text items and DOCX runs are intentionally granular,
and a legitimate scalar can cross those extraction boundaries. Requiring one
ref for every non-long-form scalar therefore leaves some grounded values
unrepresentable; this is generic and is not specific to a provider, fixture,
resume section, count, or source offset.

The selected design is ordered multi-ref scalar reconstruction gated by a
Nuvitae-owned continuation edge on the source fragment preceding each boundary.
The existing atom and canonical evidence arrays already distinguish one-ref
from multi-ref evidence, so a second composite atom shape would add an
externally meaningful representation without adding proof. Pre-parser fragment
coalescing was rejected because it would hide the original evidence boundary
and could merge PDF columns/tables/wrapped lines or DOCX paragraphs/cells.

For an accepted split scalar, refs must resolve uniquely, use distinct
consecutive fragments in source order, touch the end/start of every shared
boundary, and cross only an explicit `continuationToNext` edge. `none` inserts
no character; `space` inserts exactly one normalized space. The submitted
value, after the existing NFKC and whitespace normalization, must equal that
reconstruction, and typed date/link/language validation still applies. Unknown,
malformed, duplicate, overlapping, reordered, non-consecutive, edge-skipping,
or unsupported-boundary refs fail closed. Group-level refs remain unsupported,
and existing required-group plus sibling-survival semantics are unchanged.

DOCX continuation is permitted only for contiguous runs in the same package
part, paragraph, and table cell, with matching character offsets; the join is
derived from the extracted run text. PDF continuation is deliberately
conservative: same page, adjacent item/reading order, `hasEOL=false`, aligned
baseline, non-overlapping left-to-right geometry, and at most a half-line-height
gap. Extracted boundary whitespace wins; otherwise a touching boundary yields
no separator and a small positive gap yields one normalized space. Cross-line
wraps, columns, ordinary table gaps, and page changes are rejected. Punctuation
and hyphens are preserved exactly. No dehyphenation or other guessed character
transformation is supported. Style/font boundaries alone neither authorize nor
invalidate a join.

This is a bounded correction within `nuvitae.semantic-extraction.v2`, not a new
response-contract version: the source-ref array cardinality and provider atom
shape do not change, and existing one-ref output remains valid. The
provider-neutral parse request gains optional Nuvitae-owned continuation
metadata so providers can emit only sequences the canonicalizer can prove.
Long-form reconstruction remains unchanged. The first T258 live smoke remains
a consumed `QUALITY FAIL`; there is no second authorized attempt. T258 remains
unchecked, Tranche 1 remains incomplete, T219 remains blocked, T203 remains
NO-GO, and T246 remains finalized FAILED and immutable.

The existing sanitized Semantic V2, realistic, anonymous PDF/DOCX, French,
T246 corpus, sparse/ambiguity, prompt-instruction, worker, mapper, confirmation,
and long-form suites retain their prior classifications. The only intended
acceptance delta is synthetic scalars whose ordered refs cross explicit safe
continuation edges; the corresponding reordered, unrelated, repeated-location,
duplicate, overlapping, wrap, hyphenation, and extra-ref cases remain rejected.
Provider request-size evidence changed only because the corrected instructions
are longer; fragment/response counts and semantic classification did not
change.

### T258 second consumed live attempt and semantic-completeness correction (2026-08-19)

The second bounded T258 Community import attempt is consumed and classified
`QUALITY FAIL`. It reused the already live-proven owner OAuth connection, used
exactly one upload and exactly one primary provider invocation, received HTTP
2xx plus SSE, first semantic output, `response.completed`, and normal EOF, then
completed canonicalization as `v2_partial_acceptance`, persisted a draft, and
reached review. No second invocation or deterministic fallback was observed.
Privacy-safe timings were approximately 613 ms from upload to provider start,
2.58 s to response headers, 12.85 s to first semantic output, and 56.59 s total
provider time. Review contained 63 active draft fields and five warnings.
Work and Education group retention materially improved over Attempt #1, but
important role-title, institution, credential, and headline scalars were
materially incomplete and Summary was rejected. No private value is recorded.

The offline structural trace used only the retained source, persisted review
shape, and privacy-safe runtime diagnostics. The source produced 165 non-empty
provider fragments. Affected active Work title values had 6-9 characters and
affected institution values had 10 characters; repeated short values resolved
to one or more exact fragments. The provider therefore submitted shortened
values with evidence proving only those shortened values. Canonicalization did
not truncate them: it accepted the exact grounded provider value, the V2 draft
mapper copied that candidate value unchanged, persistence retained it unchanged,
and the review projection exposed the persisted value unchanged.

For the affected inline Work/Education concepts, the full source text occupied
multiple same-page, same-baseline, left-to-right PDF text items. Consecutive
non-empty words were commonly separated by a PDF.js whitespace-only item with
zero height and no EOL. Request normalization correctly omitted those empty
items, but continuation discovery still required the surviving items' original
`itemIndex` and `readingOrder` to differ by exactly one. It therefore advertised
no continuation edge even though the intervening source items were empty and
the existing baseline/gap gates passed. This was an extraction/provenance
boundary defect, not a canonical grounding defect. The correction permits a
continuation across one or more intervening items only when every intervening
item normalizes empty, physical item and reading order remain contiguous, page
and inline geometry remain valid, and no intervening item carries EOL. DOCX
receives the equivalent same-part/paragraph/cell and contiguous-offset rule for
whitespace-only runs. Non-empty gaps, wraps, columns, table-scale gaps, page
changes, vertical transitions, reordered items, and unsupported joins remain
closed.

Headline is structurally different in this consumed attempt. Its accepted
55-character value exactly equalled one complete extraction fragment and had
no canonical or mapper truncation. The remaining source concept crossed a real
line transition with EOL and a baseline change, so no continuation chain was
advertised and this correction intentionally does not manufacture one. The
provider nevertheless returned the grounded partial fragment. The generic
provider invariant is therefore: identify the complete semantic concept first;
never shorten, simplify, abbreviate, or select only a prefix/token merely to
obtain easier evidence; if the complete concept cannot be represented by the
advertised refs, omit the atom and let canonical required-group semantics fail
closed. Nuvitae continues to validate only exact grounding and provenance. It
does not add fuzzy completeness scoring, dictionaries, title/institution
patterns, or semantic self-validation.

Summary failed independently. Attempt #2's first rejected path was
`sections.summary`; privacy-safe diagnostics classified the response as
`other_schema_violation`/`invalid_source_ref_shape`, and canonical validation
reported `value_not_grounded`. The long-form reconstruction algorithm and
long-form instruction text had not changed between Attempts #1 and #2; the
provider emitted a Summary value/ref combination that did not reconstruct
exactly. The adjacent new scalar-continuation paragraph did not explicitly say
that it excluded long-form fields, however, so the instruction partition was
unnecessarily ambiguous. The correction makes the separation explicit:
Summary, responsibilities, achievements, and project descriptions retain their
existing ordered long-form refs, do not require `continuationToNext`, and remain
subject to exact whitespace-normalized reconstruction. No long-form acceptance
rule or grounding validator is relaxed.

The synthetic regression matrix is privacy-free: (A) complete single-fragment
title; (B) complete continuation-proven multi-fragment title; (C) grounded
short prefix, accepted as provenance-valid by deterministic code but explicitly
forbidden by the provider contract; (D) multi-fragment institution; (E)
multi-fragment degree/credential; (F) long headline across proven fragments;
(G) unsupported boundary rejected/omitted rather than shortened; (H) repeated
text and redundant/alternative refs fail closed; (I) ordered long-form Summary;
and (J) multiple Work/Education groups with mixed single/split scalars and
sibling survival. The intended classification delta is limited to safe chains
previously interrupted only by normalized-empty physical items/runs. T258
remains unchecked, Tranche 1 remains incomplete, T219 remains blocked, T203
remains NO-GO, and T246 remains finalized FAILED and immutable. No third live
attempt is authorized by this record.

### T258 third consumed live attempt and Tranche-1 completion (2026-08-19)

The third bounded T258 Community import attempt is consumed and classified
`PASS`. It reused the already live-proven persisted Codex connection, so no
additional OAuth was performed. Exactly one upload and exactly one primary
provider invocation occurred. Upload persistence, queue enqueue, worker start,
PDF validation, extraction, normalization, and provider start completed. The
provider returned HTTP 2xx; SSE began; first semantic output,
`response.completed`, and normal EOF were observed across 2,730 frames. No
transport failure, second provider invocation, or deterministic fallback was
observed. Canonicalization completed as `v2_partial_acceptance`, the draft was
persisted, and review became available. The opaque import id is
`36265543-febb-42ee-a9b3-b9e92236c219`.

Privacy-safe approximate timings were 574 ms from upload to provider start,
1.51 s from provider start to headers, 13.33 s from provider start to first
semantic output, 62.32 s total provider time, and 62.99 s from upload to the
persisted draft. These observations describe one bounded integration attempt
and are not a benchmark.

Review contained 57 active draft fields and one warning. Manual comparison to
the source established a materially usable and grounded result: expected
contact fields were preserved; all four major Work groups retained employer
anchors, complete meaningful role titles, locations, date ranges, and material
responsibilities/achievements; all three major Education groups retained full
institution and credential values, locations, and dates; meaningful skills and
both source languages were retained. No material invention was observed. No
private resume value, source filename, or source offset is recorded.

The result is not perfect. `sections.summary` was the first rejected path,
classified as `other_schema_violation` with `value_not_grounded`, so Summary is
not active. Some optional headline/professional-link projection is incomplete.
These remain visible non-blocking limitations, and no 100% field-fidelity claim
is made.

Attempt #3 satisfies T258 because its gate is one supported Community owner,
the live-proven Codex connection, one real upload, one primary semantic
invocation, and a usable grounded review. Attempts #1 and #2 remain immutable
consumed `QUALITY FAIL` evidence. T246 remains finalized FAILED and immutable;
Attempt #3 is not qualification evidence. T203 remains NO-GO. With T257, T212,
T213-T218, and T258 complete, Tranche 1 is complete. T219 is the exact next
unblocked canonical task, but it has not started.

### Post-T258 long-form evidence stability and review-eligibility follow-up (2026-08-20)

T258 remains complete and Attempt #3 remains a PASS. It closed the Community
integration gate with a persisted owner-scoped Codex connection, one upload,
one primary invocation, and a usable grounded review. The same bounded result
also exposed a non-blocking limitation worth separating into generic Tranche-2
work: the source contained genuine extractible long-form presentation,
Attempt #3 rejected `sections.summary` as `value_not_grounded`, an earlier
consumed attempt on the same source had accepted Summary, and deterministic
long-form regression coverage remained green. No private source value,
filename, layout, offset, identity, employer, school, contact datum, or other
PII is retained in this follow-up.

The evidence supports investigation, not a Summary-specific relaxation. The
active Semantic V2 contract classifies Summary, Work responsibilities, Work
achievements, and project descriptions as long-form. Provider-selected refs can
span multiple fragments without scalar continuation metadata, while Nuvitae
currently accepts their whitespace-normalized ordered quote concatenation. T259
must determine which alternative legitimate evidence shapes, if any, prove the
same complete value and can be canonicalized consistently without guessing.
Incomplete, missing-intermediate, reordered where order is authoritative,
repeated-location ambiguous, invalid, unsupported, or invented evidence remains
fail-closed. The task must not broaden scalar evidence behavior addressed by
T258.

The domain audit also shows a meaningful distinction between evidence validity
and semantic certainty. Existing concepts include response-level
`accepted`/`rejected`/`requires_review`, evidence-level
`valid`/`invalid`/`unusable`, explicit-versus-inferred classification,
`inferred_needs_review`, warnings, provenance, and explicit user review actions.
However, current Semantic V2 candidates are projected as explicit,
high-confidence, and `not_inferred`, and the extraction-draft builder filters
inferred candidates. T259 must determine whether the existing concepts can
safely retain fully grounded text with unresolved semantic classification,
grouping, or a genuinely ambiguous source boundary, or whether a new state is
necessary. It must not conflate low model confidence with eligibility.

The durable boundary is three-way: verified candidates have complete valid
evidence and resolved semantics; grounded review-required candidates may exist
only when the complete candidate text and provenance are deterministically
proven, no deterministic evidence establishes material truncation of the
claimed semantic concept, and a truthfully representable classification,
grouping, or genuine boundary ambiguity remains. Unsafe candidates contain or
depend on ungrounded, partial, invented, invalid, or non-uniquely attributable
content, or are grounded provider prefixes/subsets that deterministic evidence
proves materially omit part of the claimed concept. They remain rejected or
unusable. Existing deterministic evidence rules may reconstruct the complete
value only when they prove it without guessing; otherwise recovery is
source-assisted or manual. Review-required candidates never auto-activate and
retain an auditable separation between provider proposal, evidence, and user
confirmation. Unsafe provider text is not laundered into a suggestion with a
warning badge. `value_not_grounded` is therefore not automatically reviewable,
and the historical Attempt #3 Summary remains on the unsafe side under current
evidence.

This is a generic product/domain invariant: fully grounded is necessary but not
sufficient for review-required eligibility when deterministic evidence proves
material omission. It does not reopen T258's completed scalar implementation;
T259 remains the bounded long-form investigation. Genuine source-boundary
ambiguity is distinct from known truncation and may be investigated without
pre-selecting an implementation state.

T259 uses independently constructed sanitized sources and deterministic offline
provider-response variants, including metamorphic changes to fragment identity,
unrelated fragments, valid evidence representation, required-evidence removal,
ref order, redundancy, partial coverage, malformed refs, grounded semantic
ambiguity, and a grounded prefix/subset of a deterministically identifiable
complete semantic concept. Tests must distinguish (1) a longer submitted value
whose refs prove only part from (2) a materially shortened submitted value whose
own characters are all grounded; both remain unsafe unless existing evidence
rules deterministically prove a complete reconstruction. It must not optimize
against the private T258 source, its Summary, layout, fragment count, offsets,
FlowCV, live response wording, or any exact source text. Fuzzy matching,
semantic similarity, another LLM as judge,
arbitrary or neighboring refs without deterministic provenance/layout proof,
guessed sentences, invented coordinates/hashes/grouping, disabled grounding or
ambiguity checks, and confidence-as-evidence are prohibited.

This follow-up is not a T246 retry, replacement consumed arm, qualification
run, benchmark, provider comparison, or T203 re-evaluation. T246 remains
complete with qualification FAILED and immutable; T203 remains NO-GO. T259 is
parallelizable with T220-T222, required before T236 and Tranche-2 completion,
and does not reopen Tranche 1.

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
the entrypoint/browser handoff boundary; T214 is complete for callback, status,
and ready-state presentation; and T215 is complete for local lifecycle recovery.

**Gaps that remain before production Community use (preserved honestly)**:

- T201 is complete: C01-C03 passed canonical live validation; C04-B03 (corrected T208 deterministic-enrichment contract), C05-B01, and C06-B01 passed canonical live validation; C03 B01/B02 and C04 B01/B02 remain immutable failed historical attempts (C04 B01 failed under its original physical-coordinate contract; C04 B02 failed at credential recovery). T246 is finalized as FAILED / qualification not passed: C01 and C04 are semantic recall failures, while C02, C03, C05, C06, C07, and C08 pass. This result remains unchanged and is not converted by T217.
- T202 (evaluation) was re-measured offline from the accepted evidence on 2026-08-06 (T244) and is recorded as MEASURED in `docs/research/codex-direct-oauth-evaluation.md` with a sanitized aggregate (`codex-direct-oauth-t202-metrics.json`): every evidence-supported metric passes; latency, cancellation, and quota behavior remain explicitly unmeasured. T216 production semantic-provider wiring and T217 bounded-fallback production wiring completed on 2026-08-08: one application-owned primary call, one local deterministic fallback execution, no hidden provider retry, closed failure classification, atomic/idempotent draft persistence, safe terminal failure, and provider-neutral UI/status recovery. T213-T216 local connection/onboarding/provider-wiring coverage is complete; the T203 gate remains NO-GO because finalized T246 qualification failed, live provider/import evidence is missing, and moderated human validation is pending. Re-evaluation triggers are defined in `docs/research/codex-direct-oauth-go-no-go.md`. No production GO exists.
- The loopback OAuth callback is proven only for a local Docker host with a same-host browser. Remote, VPS, NAS, and headless self-hosting onboarding is unproven and is a significant open product question for the Docker-first Community distribution.
- The direct `chatgpt.com/backend-api/codex` transport is undocumented or compatibility-sensitive for third-party use; upstream changes may break compatibility.
- T216 is the explicitly authorized current wiring scope and is complete offline/local; this does not claim live qualification or change the T203 NO-GO.

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

## Issue #25 Sol/low vs Terra/low benchmark conclusion (2026-08-15)

The bounded confirmatory comparison was intentionally stopped after Arm B
failed its predefined quality gate. Arm A (Sol/low) passed with provider total
49,593 ms, first semantic output 9,510 ms, generation 40,083 ms, 64/64 active
and grounded fields, and no rejected fields, warnings, or invented values.
Arm B (Terra/low) completed at the transport level but failed the grounding /
evidence gate: provider total 50,780 ms, first semantic output 15,548 ms,
generation 35,229 ms, 64/64 active and grounded fields, two rejected fields,
two warnings, and `v2_partial_acceptance` caused by two ambiguous
language-proficiency evidence candidates. Arm B used no fallback and remains
an immutable quality-failed sample.

Arm B was +1,187 ms (+2.393%) in provider total, +6,038 ms (+63.491%) to first
semantic output, and -4,854 ms (-12.11%) in generation versus Arm A. The
earlier bounded Terra advantage was not reproduced. Sol/low remains the
selected default candidate; Terra/low is not selected based on the available
evidence. This is not a claim that Terra is universally slower or lower
quality, only that the hypothesized stable advantage was not confirmed.

The four-arm sequence was conditional on preceding arms remaining valid, so
the Arm B gate failure ended the sequence. Arms C and D are not missing
samples: neither was authorized or executed. Terra must not be rerun, and no
prompt, evidence-rule, threshold, schema, evaluator, or model-configuration
tuning followed by another benchmark is authorized for issue #25. No further
live provider call is justified. The incremental SSE transport correction
remains independently valid and must not be reverted. The two
language-proficiency rejections may be tracked as a separate product-quality
observation without reopening this benchmark.

Canonical evidence remains immutable in
`docs/research/import-resume-issue-25-arm-a-sol-low-20260815.json`,
`docs/research/import-resume-issue-25-arm-b-terra-low-20260815.json`, and the
conclusion record
`docs/research/import-resume-issue-25-conclusion-20260815.md`.
