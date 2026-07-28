# Research: Import Existing Resume

## Decision: Build the feature in a Nuvitae-owned TypeScript full-stack architecture

**Rationale**: The accepted foundation ADR selects a Nuvitae-owned hybrid architecture: Reactive Resume and Resuml are references, while Nuvitae owns the application shell, domain, import pipeline, persistence, AI boundary, and user experience. A TypeScript monorepo keeps domain types shared across web, API, workers, extraction adapters, and tests while matching the evaluated reference ecosystem.

**Alternatives considered**: Forking Reactive Resume was rejected because its PDF/DOCX import requires AI and creates resumes immediately. Using Resuml as the application foundation was rejected because its inspected repository is CLI/package/MCP-oriented and YAML-centered. A polyglot first implementation was rejected because this repository has no source yet and the first feature needs tight domain/API/UI contract alignment.

## Decision: Use deterministic extraction as the required first pass

**Rationale**: The specification and constitution require import review to work without AI whenever at least one supported field can be explicitly sourced. Deterministic extraction provides auditable source locations, supports no-AI usability, and prevents uploaded document text from becoming application or AI instructions.

**Alternatives considered**: AI-first extraction was rejected because it creates provider dependence, weakens provenance, and conflicts with the accepted spec. Manual-only entry was rejected because import-first onboarding is a core product requirement. OCR-first extraction was rejected for the initial release because selectable text is required and scanned/image-only documents are out of scope.

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

## Decision: Treat optional AI as a provider-independent classifier after deterministic extraction

**Rationale**: Optional AI may help classify sections and flag ambiguity, but must never replace deterministic extraction, invent facts, bypass review, or be required for confirmation. An adapter boundary keeps provider prompts, model choices, credentials, and transport details out of the domain model and user flow.

**Alternatives considered**: Provider-specific domain fields were rejected because they would lock the import model to one AI vendor. Disallowing AI entirely was rejected because the spec permits optional AI assistance for classification and ambiguity warnings.

## Decision: Model import as temporary owned artifacts plus a review draft

**Rationale**: The source document, derived extraction artifacts, and import draft have the same initiating user and original-upload retention deadline. Keeping them separate from the confirmed structured resume allows early source deletion, expiry, cancellation, and privacy guarantees without deleting the user's confirmed resume.

**Alternatives considered**: Storing source snippets directly on the structured resume was rejected because source-reconstructing artifacts must be deleted after source deletion. Creating the structured resume immediately and marking it unverified was rejected because the spec requires explicit confirmation after review.

## Decision: Use private object storage for files and PostgreSQL for domain state

**Rationale**: Uploaded resumes and derived artifacts are sensitive binary/text data with deletion deadlines, while import state, warnings, review decisions, structured resume fields, and audit events require relational ownership and lifecycle constraints. Private object keys scoped by user/import simplify authorization and deletion verification.

**Alternatives considered**: Database-only file storage was rejected because it complicates binary retention and cleanup. Public or guessable object URLs were rejected because imported resumes contain sensitive personal data. Local filesystem-only storage was rejected as the default plan because managed cloud and self-hosted deployments both need explicit private storage semantics.

## Decision: Use background processing with persisted progress and retry/cancel semantics

**Rationale**: Validation, page counting, language detection, extraction, optional classification, timeout, cancellation, and deletion are long-running or failure-prone. Persisted progress lets users resume before expiry, handles connectivity loss, and supports the 3-minute foreground timeout with partial threshold-qualified results.

**Alternatives considered**: Synchronous request-only processing was rejected because it is brittle for large uploads, timeouts, and browser disconnects. Stateless client-only processing was rejected because source documents require authenticated access, retention, deletion, and hostile-document isolation.

## Decision: Create review drafts only from explicitly sourced supported fields

**Rationale**: A draft requires at least one supported field associated with explicit document content and a source location. This preserves factual integrity and prevents inferred-only drafts. Missing, ambiguous, duplicate, conflicting, low-confidence, semantically grouped, and inferred fields become warnings requiring user action.

**Alternatives considered**: Allowing inferred-only drafts was rejected because the spec forbids it. Dropping all partial extractions was rejected because the spec requires threshold-qualified partial results and recoverable paths.

## Decision: Make accessibility a contract, not a later polish task

**Rationale**: Import is the primary onboarding path and must meet WCAG 2.2 AA expectations. The design must include accessible names, keyboard operation, live progress announcements, non-colour warning identification, error-summary focus, and focus restoration after dialogs.

**Alternatives considered**: Deferring accessibility to implementation was rejected because the constitution treats accessible core flows as release gates.

## Decision: Validate with fixture suites and lifecycle/security scenarios

**Rationale**: The riskiest behavior is not only extraction accuracy; it includes authorization, parser safety, source deletion, expiry, logging, rate limits, timeout recovery, warning resolution, and accessible review. Fixtures must cover English, French, bilingual, unsupported, hostile, partial, mixed-content, no-supported-field, and malformed documents.

**Alternatives considered**: Happy-path-only upload tests were rejected because they would miss release-blocking privacy, safety, failure, and accessibility requirements.
