# Research: Import Existing Resume

## Decision: Build the feature in a Nuvitae-owned TypeScript full-stack architecture

**Rationale**: The accepted foundation ADR selects a Nuvitae-owned hybrid architecture: Reactive Resume and Resuml are references, while Nuvitae owns the application shell, domain, import pipeline, persistence, AI boundary, and user experience. A TypeScript monorepo keeps domain types shared across web, API, workers, extraction adapters, and tests while matching the evaluated reference ecosystem.

**Alternatives considered**: Forking Reactive Resume was rejected because its PDF/DOCX import requires AI and creates resumes immediately. Using Resuml as the application foundation was rejected because its inspected repository is CLI/package/MCP-oriented and YAML-centered. A polyglot first implementation was rejected because this repository has no source yet and the first feature needs tight domain/API/UI contract alignment.

## Decision: Use deterministic extraction as the required first pass

**Rationale**: The specification and constitution require import review to work without AI whenever at least one supported field can be explicitly sourced. Deterministic extraction provides auditable source locations, supports no-AI usability, and prevents uploaded document text from becoming application or AI instructions.

**Alternatives considered**: AI-first extraction was rejected because it creates provider dependence, weakens provenance, and conflicts with the accepted spec. Manual-only entry was rejected because import-first onboarding is a core product requirement. OCR-first extraction was rejected for the initial release because selectable text is required and scanned/image-only documents are out of scope.

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
