# Contract: Import Existing Resume

This contract describes the user-facing flow and service boundaries for the initial resume import feature. Product API transport is REST-first through the dedicated NestJS API, with OpenAPI generated from the NestJS integration. Next.js route handlers must not contain Nuvitae business logic or replace the dedicated API. The behavior and states below are required.

## UI Flow Contract

### Create Resume Entry

**Trigger**: Authenticated or unauthenticated user starts resume creation.

**Required Behavior**: Present import as the recommended path and manual entry as an available fallback. Manual entry routes to `/resumes/new/manual` and creates a blank editable structured-resume draft without creating an imported document or import job. If the user is not authenticated and chooses upload, require the normal Community owner session before accepting the file. Community V1 is one installation = one owner, but that owner is still established through a production-safe `VerifiedPrincipal` boundary, not a client-selected ID or local-play identity.

### Upload Step

**Required Copy Topics**: Supported file types PDF and DOCX; French, English, bilingual French-English; selectable text required; 10 MB limit; 5 rendered page limit; configured AI provider use for semantic parsing; resume content sent to the configured AI provider when provider-backed parsing is used; 3-minute processing timeout; 7-day source/artifact retention; early source deletion option; manual fallback.

**Required Controls**: Choose file, continue manually, cancel import. All controls need accessible names and keyboard focus.

### Manual Entry Step

**Route**: `/resumes/new/manual`

**Required Behavior**: Create a blank editable structured-resume draft, mark manually entered fields as user-added, and use the same section-editing components as import review where appropriate. This route must be reachable from initial resume creation and from unsupported-file, no-usable-extraction, timeout, processing-failure, expired-draft, unsupported-language, no-provider, provider-unavailable, provider-rate-limited, provider-unauthenticated, and provider-quota-exceeded states.

**Import Boundary**: Manual entry does not create an `ImportedDocument`, `ImportDraft`, derived extraction artifact, or import processing job.

### Processing Step

**Visible States**: checking document, reading content, connecting provider, organizing resume sections, validating evidence, preparing review, timeout, provider unavailable, provider authentication expired, provider quota exceeded, invalid provider output, failed, cancelled, retrying, deletion scheduled, deleted.

**Accessibility**: State changes must be announced to screen-reader users without exposing parser internals, model names, prompts, JSON, YAML, credentials, session details, provider configuration, or diagnostics.

### Review Step

**Required Sections**: Personal/contact information, headline, summary, work experience, education, skills, languages, projects, certifications, professional links.

**Required Actions**: Confirm, edit, remove, add, exclude, intentionally leave warning, retry, replace upload, delete source, discard import, continue manually, create structured resume.

**Blocking Rule**: Create structured resume is disabled or blocked until every warning is addressed and at least one supported field is user-confirmed.

### Unsupported-Language Contact Preview

**Required Behavior**: Documents outside French, English, or bilingual French-English do not create an import review draft. If explicitly detectable contact information is available, Nuvitae may show a temporary contact-only preview with a clear unsupported-language warning.

**Required Actions**: Confirm transfer to manual entry, discard contact preview, upload another file, continue manually without transfer.

**Rules**: Contact-only detection is limited to deterministic name, email address, phone number, location, and professional-link detection and does not satisfy the import-draft creation threshold. Contact fields transfer to `/resumes/new/manual` only after explicit user confirmation and are marked as user-added. Temporary contact data follows the same deletion and logging restrictions as other extraction artifacts.

### AI Provider Connection

**Required Behavior**: Community users connect their own Codex access through a browser OAuth flow from the normal UI, verify the connection works, and manage it (reconnect, disconnect) with plain-language status and recovery. Direct Codex OAuth is the production primary AI path for the Community MVP and part of onboarding; production Codex adapter behavior remains gated on the direct-OAuth compatibility spike recording a GO or qualifying CONDITIONAL GO with its mandatory conditions satisfied, and no OAuth task is marked complete merely because Community depends on it.

**Required States**: not configured, login pending, connected, login cancelled, disconnected, authentication expired, authentication revoked, provider unavailable, rate limited, quota exceeded, unsupported capability.

**Required Operations**: provider-neutral connection status, login initiation, login progress, login completion, login cancellation where supported, logout, reconnect, local credential deletion, expired or revoked authentication handling, quota state, and provider availability state.

**Required Plain-Language UX**: The normal UI exposes only plain actions — "Connect Codex", "Reconnect Codex", "Codex is ready", "Codex connection expired", and "Disconnect". OAuth implementation details, authorization URLs, tokens, account identifiers, app-server details, provider-runtime vocabulary, and model internals are never shown in the normal UI.

**Rules**: The standard import flow does not expose provider configuration details, prompts, model names, credentials, session material, provider-native JSON, tokens, auth files, OAuth endpoint paths, backend routes, headers, or SDK details. For the Codex direct-OAuth candidate, only the isolated `CodexOAuthBroker` may own encrypted access and refresh tokens. The web application, browser storage, import domain, API controllers, regular worker jobs, database domain entities, semantic extraction contracts, logs, diagnostics, ordinary API responses, and import review remain token-blind. Connection state stores only a broker-owned opaque credential reference, never credential material.

### Codex Direct-OAuth Broker Validation Boundary

**Required Behavior**: The direct-OAuth spike validates the architecture `Nuvitae worker -> ResumeSemanticParserProvider -> CodexDirectProviderAdapter -> isolated CodexOAuthBroker -> OpenAI-hosted OAuth -> direct Codex ChatGPT transport` before production Codex adapter implementation.

**Required Scope**: Validate the mandated spike order: upstream and licensing audit; security and token-ownership design; OAuth login proof; token persistence, refresh, logout, and deletion proof; minimal direct Codex backend invocation with synthetic input; structured resume parsing with synthetic fixtures; security, quality, failure, and compatibility evaluation; and final GO, CONDITIONAL GO, or NO-GO.

**Upstream Audit Rules**: Pin and inspect exact upstream revisions of OpenClaw, Hermes Agent, and official OpenAI Codex documentation/source where relevant. Record exact commit SHAs, OAuth flow, client identifier, authorization endpoint, token endpoint, callback behavior, PKCE and state handling, requested scopes, originator parameters, token refresh, credential storage, logout behavior, Codex transport and base URL, required request headers, account identity extraction, license and attribution obligations, and differences between OpenClaw and Hermes. Do not copy upstream code before license review.

**Supportability Rules**: Classify each behavior as officially documented OpenAI behavior, behavior verified from official source code, behavior used by OpenClaw or Hermes, undocumented compatibility behavior, experimentally verified Nuvitae behavior, or inference. Treat the direct ChatGPT Codex backend as undocumented or compatibility-sensitive unless an official source explicitly documents it for third-party use.

**Broker Rules**: The broker generates PKCE verifier/challenge, generates and validates OAuth state, hosts a loopback callback, exchanges authorization codes, stores access and refresh tokens encrypted at rest, refreshes access tokens, provides logout and local deletion, provides privacy-safe connection status, executes Codex provider requests, and returns only provider-neutral results. The spike must compare dedicated Docker service, isolated worker-side process, and other bounded infrastructure options before selecting a production topology.

**Credential Storage Rules**: Evaluate a dedicated encrypted credential store, master encryption key supplied as a Docker secret or environment secret, authenticated encryption, restrictive filesystem permissions, one credential namespace per Nuvitae owner, atomic writes, rotation and deletion, no plaintext credentials in PostgreSQL unless explicitly encrypted, and no credentials in image layers, logs, fixtures, Git, browser storage, queue payloads, or backups without documented encryption. The first auth spike must not implement production credential persistence.

**Invocation Rules**: Direct Codex backend invocation requires exact upstream request-shape audit, fail-closed host and path allowlist, no arbitrary base URL, no redirects to unapproved hosts, bounded response size, timeout and cancellation, rate-limit handling, token refresh on authorized failure categories only, synthetic prompts before any resume content, and no production integration until supportability and stability are reviewed.

### Confirmation Step

**Required Behavior**: Explain that Nuvitae will create structured resume data from the reviewed fields and that the uploaded document remains a separate temporary source. Confirmation requires an explicit user action.

### Source Deletion Step

**Required Behavior**: Deleting the source deletes all source-reconstructing artifacts and does not delete an already confirmed structured resume unless the user separately deletes it.

## Service Boundary Contract

### Start Import

**Input**: Authenticated user session, visible filename, content type, file size, upload stream.

**Output**: `ImportedDocument` id, initial upload status, retention expiry.

**Errors**: unauthenticated, rate limited, active job limit reached, queued job limit reached, unsupported file type, size over 10 MB, unsafe upload, storage unavailable.

**Limit Behavior**: Rate and concurrency rejections use an appropriate response such as HTTP 429, include `Retry-After` where applicable, and include a plain-language recovery message.

### Document Understanding Layer (future boundary)

**Status**: Proposed / spike required / not implemented. This boundary is not a
runtime contract for the current V1 path and does not authorize a Docling
dependency, parser replacement, routing, or multimodal provider call.

**Conceptual Input**: A validated, born-digital PDF or DOCX plus import-scoped
ownership and resource limits.

**Conceptual Output**: A canonical `NuvitaeDocument` containing Nuvitae-owned
document metadata, pages, stable blocks/fragments, reading order, optional
bounding boxes, sections, tables, optional style signals, retained assets,
source provenance, and bounded engine/version/configuration quality metadata.

**Rules**: The import domain must not depend on `DoclingDocument`, PyMuPDF
dictionaries, Azure `analyzeResult`, Unstructured elements, Apryse JSON, Google
DocumentLayout output, Adobe extraction JSON, or any other parser-native
schema. Canonical block/fragment IDs and provenance are owned by Nuvitae. The
active V1 PDF.js/OOXML/LibreOffice stack remains supported and is the only
current runtime path; it may later be adapted behind this boundary after the
controlled Current Extractor versus Docling benchmark.

**Representation Distinction**: `NuvitaeDocument` is a canonical runtime/document
representation. It is not structured resume state and does not define
persistence. Source-reconstructing inputs and temporary artifacts remain under
the existing retention and deletion contract.

### Validate Document

**Input**: `ImportedDocument` id owned by user.

**Output**: validation status, rendered page count, selectable-text status, detected language, recovery actions.

**Errors**: not found, forbidden, password protected, unreadable, corrupted, empty, image-only, over 5 pages, unsupported language, unsafe content, ambiguous mixed document.

**Rules**: PDF page count and selectable-text validation use the PDF adapter. DOCX rendered-page validation uses isolated headless LibreOffice conversion to PDF followed by PDF page counting. Unsupported-language validation may produce only a temporary contact-only preview and never an import review draft.

### Process Extraction

**Input**: accepted `ImportedDocument` id, provider connection state, provider capability snapshot, and provider-ready source representation.

**Output**: processing state, partial/complete extraction summary, draft id when threshold is met, provider failure state if any, warnings, recovery actions.

**Rules**: The active V1 path performs deterministic validation and source preparation through the concrete PDF.js and DOCX extraction adapters before semantic parsing. PDF extraction includes page and text-item source-location provenance. DOCX extraction includes package part, paragraph/table/cell/run, and character-offset provenance, with isolated LibreOffice used only for rendered-page-count validation. A future path may normalize the validated input through the proposed Document Understanding Layer into `NuvitaeDocument`; that migration is not scheduled by this contract. When a usable AI provider is connected, semantic parsing runs through `ResumeSemanticParserProvider` as the primary semantic mapping and grouping path. The worker submits only a controlled extraction request. Foreground processing times out after 3 minutes and returns threshold-qualified partial results when available. A parser memory-limit breach terminates the isolated parser process, creates no review draft from abruptly terminated partial output, cleans up files and source-reconstructing artifacts for the failed attempt, and returns retry, replacement-upload, provider recovery where applicable, and manual-entry recovery actions.

### Validate Semantic Parser Output

**Input**: provider response from a `ResumeSemanticParserProvider` adapter.

**Output**: versioned Nuvitae extraction response, accepted candidate fields and relationships, rejected/unusable candidates, grounding results, warnings.

**Rules**: Provider adapters translate provider-native output into a versioned Nuvitae-owned response before the import domain consumes it. The active V1 contract retains flattened transcript coordinates and deterministic native provenance. The `nuvitae.semantic-extraction.v2` response provides semantic values, logical grouping, and bounded `sourceRefs` containing Nuvitae-owned fragment/block ids plus exact quote hints; Nuvitae resolves and verifies those hints and reconstructs canonical evidence, identity, and policy metadata. A V2 scalar normally uses one ref. Multiple ordered refs are accepted only when optional Nuvitae-owned source-continuation metadata proves every consecutive boundary, refs are edge-aligned and non-overlapping, and the scalar exactly equals deterministic reconstruction using only a zero-character or one-normalized-space join. Strict validation rejects malformed output, unknown fields, invalid relationships, unsupported values, provider-native schema leakage, invalid confidence/classification metadata, and missing required source references. Ungrounded or invented values are rejected or marked unusable; they are never silently accepted. Group-level refs and guessed joins, punctuation, dehyphenation, or characters remain unsupported.

For semantic scalars, the provider must identify and return the complete source
concept rather than a shorter grounded prefix, token, simplification, or
abbreviation chosen to make evidence easier. If the complete concept cannot be
represented by the advertised source-reference contract, the provider omits
the atom and canonical required-group semantics apply. Nuvitae deterministically
verifies exact grounding, ordered continuation, and provenance; it does not use
fuzzy similarity, dictionaries, field-specific title patterns, or semantic
guessing to decide whether a grounded scalar is conceptually complete.

Semantic V2 long-form fields are Summary, Work responsibilities, Work
achievements, and project descriptions. Their refs must prove the exact
submitted textual value; they do not prove semantic completeness merely by
covering an extraction fragment. A candidate may select all or a strict
substring of one fragment. Ordered non-overlapping refs within one fragment
canonicalize equivalently to a single ref for the same region only when omitted
gaps are normalization-safe whitespace, reconstructed canonical text is
identical, and provenance identifies the same source region/content. Crossing
fragments requires authoritative consecutive order, boundary-aligned refs, and
source-owned `continuationToNext` proof for every crossed boundary. Nuvitae does
not append unrelated following text or expand across an unsupported boundary.
Duplicate, overlapping, reordered, invalid, insufficient, non-unique,
partially grounding, or invented evidence remains a field-level failure.

Grounding and semantic completeness are separate decisions. Completeness is
`proven_complete` only when deterministic evidence actually proves the full
semantic boundary, `unknown` when submitted text and unique provenance are
grounded but the semantic boundary is not provable, and `proven_incomplete`
only when deterministic evidence positively proves omission. Fragment, line,
paragraph, page, punctuation, provider assertion, and confidence are not
semantic-boundary proof. Under the current source model, otherwise grounded
long-form values are completeness `unknown`, retain semantic provenance and a
field-bound warning, use `inferred_needs_review`, and cannot activate without
explicit confirmation. Partial grounding of the submitted value,
`value_not_grounded`, invented text, invalid refs, non-unique provenance, and
positively proven semantic omission remain rejected or unusable. Completeness
unknown is not rejection. Absence of evidence of truncation is not evidence of
completeness; extraction boundary is not semantic boundary.

This semantic-completeness invariant applies across supported field types even
though T259 investigates only the long-form evidence boundary. It does not
reopen or extend completed T258 scalar behavior.

### Provider Failure Recovery

**Input**: provider connection state, provider failure reason, import id or draft id.

**Output**: plain-language recovery state and available actions.

**Rules**: No configured provider, disconnected provider, expired authentication, provider unavailable, rate limit, quota/subscription limit, timeout, unsupported capability, and invalid structured output must not claim reliable full semantic parsing. Recovery actions include retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, replacement upload, and manual entry.

### Enforce Processing Limits

**Input**: authenticated user, upload or processing-start request, current active/queued job counts, rolling 10-minute attempt history, deployment limit configuration.

**Output**: allowed operation or rejected operation with recovery message.

**Rules**: Initial limits are 10 MB file size, 5 rendered pages, 3 minutes foreground processing, 512 MiB parser-process memory, 1 active processing job per user, 2 queued processing jobs per user, and 5 upload or processing-start attempts per rolling 10-minute window. Limits are configurable but cannot be disabled in production. Rejections use an appropriate rate-limit response such as HTTP 429 where applicable and include `Retry-After` where applicable.

### Create Manual Structured Resume Draft

**Input**: authenticated user, optional explicitly confirmed temporary contact fields.

**Output**: manual structured-resume draft id and editable section state.

**Rules**: Creates no imported document, import draft, derived extraction artifact, or import processing job. Fields entered manually or transferred from a confirmed contact-only preview are marked as user-added.

### Read Import Draft

**Input**: authenticated user, import draft id.

**Output**: grouped sections, verified extracted candidate fields, eligible grounded review-required candidate fields, warnings, review statuses, evidence/source locations while source exists, confidence categories, explicit-versus-inferred classification, retention expiry, available actions. Rejected or unusable provider values are not candidate fields and their text is not exposed as a suggestion.

**Errors**: not found, forbidden, expired, source deleted with no resumable draft, no supported field extracted.

### Update Review

**Input**: authenticated user, import draft id, target field/warning/section, action, optional edited value.

**Output**: updated review state and remaining warnings.

**Rules**: Actions are confirm, edit, remove, add, exclude, and intentionally leave. A grounded review-required candidate remains inactive until an explicit user confirm or edit action; ignoring, excluding, or intentionally leaving it must not activate it. Updating review never changes the uploaded source document. Audit state must distinguish the provider proposal, canonical evidence, and user action.

### Confirm Structured Resume

**Input**: authenticated user, import draft id, explicit confirmation token/action.

**Output**: structured resume id, confirmation status, provenance label.

**Errors**: forbidden, expired, unresolved warnings, no user-confirmed supported field, source unsafe/deleted state prevents confirmation, concurrent confirmation conflict.

**Rules**: Every reviewed field is carried into the structured resume. A field is dropped only when the user explicitly excluded it; confirming a subset of fields must never silently discard the remaining reviewed fields (FR-034). The response reports which sections were carried over and which were explicitly excluded so the UI can show a plain-language confirmation summary.

### Retry or Replace Upload

**Input**: authenticated user, import id or draft id, retry/replacement action.

**Output**: new processing state or new imported document id.

**Rules**: Retry respects rate limits and processing limits. Replacement upload does not extend the original document's retention; it creates a new imported document with its own retention deadline. Re-uploading the same file or materially identical source content counts as a separate attempt, receives its own retention deadline, and must not merge drafts or share source-reconstructing artifacts with prior imports.

### Cancel or Discard Import

**Input**: authenticated user, import id or draft id, explicit cancellation/discard action.

**Output**: cancellation/discard state and deletion job id.

**Rules**: Processing stops where possible. Source and source-reconstructing artifacts are scheduled for deletion.

### Delete Source Document

**Input**: authenticated user, imported document id, explicit deletion action.

**Output**: deletion state and deletion verification status.

**Rules**: Deletes source file, extracted raw text, field source snippets, page references, thumbnails, temporary files, cached parsing results, future OCR outputs, embeddings if any, and equivalent source-reconstructing artifacts.

### Disconnect Provider

**Input**: authenticated user, provider connection id, explicit disconnect or revoke action.

**Output**: provider-neutral runtime connection state and broker-owned logout, disconnect, local revocation, or credential-deletion status.

**Rules**: Disconnecting, revoking, or deleting local provider credentials must not delete uploaded resumes, import drafts, structured resumes, or source-retention records. Future semantic parsing requires reconnecting or choosing another provider. Nuvitae records only provider-neutral connection state. Raw provider tokens may be owned only by the broker and must not be exposed to or persisted by ordinary API responses, browser storage, import-domain objects, normal worker job payloads, semantic extraction contracts, logs, or diagnostics.

### Source-Deleted Review

**Input**: authenticated user, import draft id whose source artifacts are deleted before confirmation.

**Output**: limited review state, current warning statuses, minimal non-sensitive provenance, and available discard or manual-entry actions.

**Rules**: The response must not include raw snippets, page references, thumbnails, extracted raw text, cached parsing output, or source-location previews. Confirmation remains blocked unless every warning can still be addressed without source artifacts and at least one supported field is user-confirmed.

### Deletion Idempotency

**Input**: authenticated user, import id, draft id, or deletion job id for cancellation, discard, source deletion, expiry, or retention cleanup.

**Output**: current deletion state and verification summary.

**Rules**: Repeated deletion, cancellation, discard, expiry, or retention actions return the current state, do not recreate artifacts, do not extend retention, and do not delete a separately confirmed structured resume.

## Community MVP Contract Additions

These service boundaries add the Community MVP surface (Codex connection, visual editing, live preview, ATS PDF export, reversible AI editing, save/reopen, and safe confirmation). All responses are plain public responses: they expose no tokens, model identifiers, provider-runtime state, queues, workers, internal schemas, prompts, or provider configuration.

### Begin Codex OAuth

**Input**: authenticated user, explicit "Connect Codex" or "Reconnect Codex" action.

**Output**: provider-neutral connection state (`login_pending`), an opaque login reference, and the user-facing authorization URL to open in the browser (the URL is returned only to the server-rendered/top-level context that presents it; it must never be persisted in domain entities, logs, or evidence).

**Errors**: already connected, connection limit, broker unavailable, unsupported capability.

**Rules**: Starts browser OAuth Authorization Code with PKCE through the isolated broker. The response contains no client identifier, endpoints, scopes, PKCE, state, or token material.

### Codex OAuth Callback Completion

**Input**: the loopback callback event handled by the broker, plus the opaque login reference from Begin Codex OAuth.

**Output**: provider-neutral connection state (`connected` or `login_cancelled`, `auth_expired`, `unavailable`), connection status for the UI.

**Errors**: state mismatch, authorization declined, exchange failure, callback timeout.

**Rules**: The broker validates state, exchanges the authorization code, and persists encrypted credentials. For Community, state must be unguessable, one-time, expiring, and resolved server-side to the owner who initiated the connection; the cross-site return to `http://localhost:1455/auth/callback` must not depend incorrectly on the normal `SameSite=Strict` Community session cookie being resent. The callback must not accept a browser-selected owner or Local Play identity, and a callback failure must leave the connection recoverable. The application records only provider-neutral connection state and a broker-owned credential reference. No authorization code, access token, refresh token, or account identifier appears in any application response, log, or diagnostic. Normal protected APIs remain owner-authenticated; any narrowly scoped cookie behavior required for the callback must not weaken them.

### Codex Connection Status

**Input**: authenticated user, optional connection id.

**Output**: provider-neutral status category and plain-language label ("Codex is ready", "Codex connection expired", "Not connected", "Disconnected", "Provider unavailable", "Rate limited", "Quota exceeded").

**Rules**: Read-only and privacy-safe. It exposes no expiry timestamps beyond the coarse status category where useful for the "expired" label, and no token or account details.

### Reconnect Codex

**Input**: authenticated user, explicit "Reconnect Codex" action.

**Output**: a new `login_pending` state and a fresh opaque login reference; on success, `connected` with a refreshed broker credential reference.

**Rules**: Reauthorization replaces the broker credential reference. Existing resumes, drafts, and structured resumes are unaffected.

### Disconnect Codex

**Input**: authenticated user, explicit "Disconnect" action.

**Output**: `disconnected` state and broker logout/local credential-deletion status.

**Rules**: Does not delete uploaded resumes, import drafts, structured resumes, or source-retention records (FR-031b). Future AI parsing and editing require reconnect.

### Semantic Import (Codex Path)

**Input**: accepted imported document, active Codex connection, provider capability snapshot, and the active V1 transcript/source fragments or a future canonical `NuvitaeDocument` projection.

**Output**: processing state, partial/complete extraction summary, draft id when the threshold is met, provider failure state if any, warnings, recovery actions.

**Rules**: Codex direct OAuth is the one authoritative semantic parsing path behind `ResumeSemanticParserProvider` (FR-032). When the provider is unavailable, disconnected, expired, rate-limited, quota-exceeded, or returns invalid output, the bounded deterministic fallback and provider-recovery actions are offered so accepted uploads never silently dead-end at `provider_unavailable` (FR-033).

### AI Proposal Generation

**Input**: authenticated user, structured resume id, selected field or section scope, one of up to five AI actions.

**Output**: an `AIChangeProposal` with `proposed` status, original and proposed values, and a privacy-safe proposal reference.

**Errors**: not connected, authentication expired, provider unavailable, quota exceeded, action unsupported, fact-preservation rejection, invalid scope.

**Rules**: The proposal is generated through the Codex provider path with the grounded source content and a no-invented-facts instruction; a post-check rejects proposals that add new names, dates, companies, metrics, or unsupported facts. Nothing is written until accepted. The response exposes no prompts, model identifiers, tokens, or provider-runtime state.

### Accept / Reject / Regenerate AI Proposal

**Input**: authenticated user, proposal reference, action (`accept`, `reject`, `regenerate`).

**Output**: updated proposal status (`accepted`, `rejected`, `superseded`) and, on accept, the updated resume value plus a save status; on regenerate, a new `proposed` proposal that supersedes the previous one.

**Rules**: Accept applies the proposed value through the same transaction boundary as manual edits with the same save/conflict semantics. Reject discards without modifying content. Regenerate produces a new variant and never silently applies either variant.

### Undo Edit

**Input**: authenticated user, structured resume id, optional undo target (last saved state).

**Output**: resume restored to the last saved state, save status, and an undo confirmation.

**Rules**: Lightweight undo covers AI and manual edits; undo returns to the last saved state without data loss (FR-040). Full version history is deferred.

### Editor Read / Update Resume

**Input**: authenticated user, structured resume id; update payload contains edited sections, reordered sections, or a title change.

**Output**: current editable structured resume state and save status (`saving`, `saved`, `save_error`, `stale_conflict`).

**Errors**: not found, forbidden, stale conflict, invalid content.

**Rules**: The response is the plain structured resume content; it contains no source snippets (after source deletion), no tokens, and no provider material. Updates go through optimistic local state with a stale-conflict guard and a visible save indicator. localStorage is not the source of truth.

### Preview Resume

**Input**: authenticated user, structured resume id, template id.

**Output**: a preview render (HTML snapshot or server-rendered markup) of the resume in the chosen template.

**Rules**: Preview uses the same template renderer as PDF export so preview↔export fidelity is structurally guaranteed (FR-037, FR-038).

### Export ATS-Friendly PDF

**Input**: authenticated user, structured resume id, template id.

**Output**: export job status and, on success, a downloadable ATS-friendly PDF plus a `ResumeExportRecord` reference.

**Errors**: forbidden, template unavailable, export failure, rate limited.

**Rules**: The PDF is generated from the same renderer as preview, is ATS-friendly (single column, standard fonts, semantic order), and the record stores only export metadata, never resume content or provider material.

### Confirm Structured Resume (Community carry-over)

**Input**: authenticated user, import draft id, explicit confirmation action.

**Output**: structured resume id, confirmation status, provenance label, and a plain-language summary of carried-over and explicitly excluded sections.

**Rules**: All reviewed fields carry into the structured resume; only explicitly excluded fields are dropped (FR-034). See the Confirm Structured Resume contract above.

## Authorization Contract

Every import operation must verify that the authenticated principal owns the imported document, draft, extracted fields, warnings, corrections, deletion job, and resulting structured resume. Community V1's single owner does not weaken this requirement: repositories remain owner-scoped and headers, query parameters, and bodies cannot select or override owner identity. Forbidden responses must not reveal personal data from another user's import. Future multi-user deployment support relies on this unchanged opaque-owner boundary.

## Logging Contract

Logs may include event ids, status codes, timing, file size bucket, page count bucket, language category, provider category, provider state category, and non-sensitive error categories. Logs must not include full resumes, raw extracted text, source snippets, uploaded documents, authentication tokens, provider credentials, provider session material, prompts, raw provider payloads, technical parser internals, or unnecessary personal data.
