# Contract: Import Existing Resume

This contract describes the user-facing flow and service boundaries for the initial resume import feature. Product API transport is REST-first through the dedicated NestJS API, with OpenAPI generated from the NestJS integration. Next.js route handlers must not contain Nuvitae business logic or replace the dedicated API. The behavior and states below are required.

## UI Flow Contract

### Create Resume Entry

**Trigger**: Authenticated or unauthenticated user starts resume creation.

**Required Behavior**: Present import as the recommended path and manual entry as an available fallback. Manual entry routes to `/resumes/new/manual` and creates a blank editable structured-resume draft without creating an imported document or import job. If the user is not authenticated and chooses upload, require sign-in before accepting the file.

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

**Required Behavior**: Self-hosted users can connect, inspect availability, disconnect, and reconnect the configured semantic parser provider. Codex through the official `codex app-server` runtime is the candidate first self-hosted provider, but production Codex adapter behavior remains blocked until the second validation records a GO or qualifying CONDITIONAL GO.

**Required States**: not configured, login pending, connected, login cancelled, disconnected, authentication expired, authentication revoked, provider unavailable, rate limited, quota exceeded, unsupported capability.

**Required Operations**: connection status, login initiation, login progress, login completion, login cancellation where supported, logout, reconnect, expired or revoked authentication handling, quota state, and provider availability state.

**Rules**: The standard import flow does not expose provider configuration details, prompts, model names, credentials, session material, provider-native JSON, tokens, auth files, or SDK details. For the Codex candidate, the official Codex runtime owns ChatGPT authentication, credential persistence, token refresh, refresh-token rotation, authentication expiry, session recovery, and logout. Nuvitae remains token-blind and must not read provider auth files, parse provider auth files, persist access tokens, persist refresh tokens, refresh tokens directly, expose tokens in logs/API responses/events/database records, or implement provider OAuth endpoints.

### Codex App-Server Validation Boundary

**Required Behavior**: The second spike validates the official `codex app-server` path before production Codex adapter implementation. It uses generated protocol artifacts from the installed Codex version and records supported, beta, experimental, deprecated, and unsupported operations before any request or response shape is treated as implementable.

**Required Scope**: Validate JSON-RPC over stdio initialization, explicit Nuvitae client metadata, request/response correlation, streaming notifications, timeouts, cancellation, graceful shutdown, crash detection, bounded restart behavior, Docker startup, authentication status inspection, official login/logout/reconnect behavior, token-blindness, non-interactive invocation after login, isolation, prompt-injection handling, structured semantic extraction, evidence grounding, malformed output, quota/rate/auth failures, latency, and extraction quality.

**Isolation Rules**: The spike uses a dedicated Docker runtime with private Codex state, an empty ephemeral working directory, no Nuvitae repository mount, no private import-storage mount, no PostgreSQL or Valkey access, no host Codex configuration or credential inheritance, no user MCP servers or plugins, no unrelated environment variables, bounded CPU/memory/process/temp-storage limits, controlled stdout/stderr, privacy-safe logging, and cleanup after execution. Shell, file-editing, web, plugin, MCP, and other non-parsing capabilities must not be claimed disabled until the spike verifies they are disabled, excluded, restricted, or sufficiently neutralized.

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

### Validate Document

**Input**: `ImportedDocument` id owned by user.

**Output**: validation status, rendered page count, selectable-text status, detected language, recovery actions.

**Errors**: not found, forbidden, password protected, unreadable, corrupted, empty, image-only, over 5 pages, unsupported language, unsafe content, ambiguous mixed document.

**Rules**: PDF page count and selectable-text validation use the PDF adapter. DOCX rendered-page validation uses isolated headless LibreOffice conversion to PDF followed by PDF page counting. Unsupported-language validation may produce only a temporary contact-only preview and never an import review draft.

### Process Extraction

**Input**: accepted `ImportedDocument` id, provider connection state, provider capability snapshot, and provider-ready source representation.

**Output**: processing state, partial/complete extraction summary, draft id when threshold is met, provider failure state if any, warnings, recovery actions.

**Rules**: Deterministic validation and source preparation run through concrete PDF and DOCX extraction adapters before semantic parsing. PDF extraction must include page and text-item source-location provenance. DOCX extraction must include package part, paragraph/table/cell/run, and character-offset provenance. When a usable AI provider is connected, semantic parsing runs through `ResumeSemanticParserProvider` as the primary semantic mapping and grouping path. The worker submits only a controlled extraction request. Foreground processing times out after 3 minutes and returns threshold-qualified partial results when available. A parser memory-limit breach terminates the isolated parser process, creates no review draft from abruptly terminated partial output, cleans up files and source-reconstructing artifacts for the failed attempt, and returns retry, replacement-upload, provider recovery where applicable, and manual-entry recovery actions.

### Validate Semantic Parser Output

**Input**: provider response from a `ResumeSemanticParserProvider` adapter.

**Output**: versioned Nuvitae extraction response, accepted candidate fields and relationships, rejected/unusable candidates, grounding results, warnings.

**Rules**: Provider adapters translate provider-native output into a versioned Nuvitae-owned response before the import domain consumes it. Strict Zod validation rejects malformed output, unknown fields, invalid relationships, unsupported values, provider-native schema leakage, invalid confidence categories, and missing required fields. Evidence grounding validation requires source page or document location, exact source text or source fragment identifier, explicit-versus-inferred classification, and confidence category for every AI-produced candidate. Ungrounded or invented values are rejected or marked unusable; they are never silently accepted.

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

**Output**: grouped sections, extracted candidate fields, warnings, review statuses, evidence/source locations while source exists, confidence categories, explicit-versus-inferred classification, retention expiry, available actions.

**Errors**: not found, forbidden, expired, source deleted with no resumable draft, no supported field extracted.

### Update Review

**Input**: authenticated user, import draft id, target field/warning/section, action, optional edited value.

**Output**: updated review state and remaining warnings.

**Rules**: Actions are confirm, edit, remove, add, exclude, and intentionally leave. Updating review never changes the uploaded source document.

### Confirm Structured Resume

**Input**: authenticated user, import draft id, explicit confirmation token/action.

**Output**: structured resume id, confirmation status, provenance label.

**Errors**: forbidden, expired, unresolved warnings, no user-confirmed supported field, source unsafe/deleted state prevents confirmation, concurrent confirmation conflict.

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

**Output**: provider runtime connection state and provider-owned logout or disconnect status.

**Rules**: Disconnecting or revoking a provider must not delete uploaded resumes, import drafts, structured resumes, or source-retention records. Future semantic parsing requires reconnecting or choosing another provider. Nuvitae records only provider-neutral connection state and must not expose or persist raw provider tokens or auth files.

### Source-Deleted Review

**Input**: authenticated user, import draft id whose source artifacts are deleted before confirmation.

**Output**: limited review state, current warning statuses, minimal non-sensitive provenance, and available discard or manual-entry actions.

**Rules**: The response must not include raw snippets, page references, thumbnails, extracted raw text, cached parsing output, or source-location previews. Confirmation remains blocked unless every warning can still be addressed without source artifacts and at least one supported field is user-confirmed.

### Deletion Idempotency

**Input**: authenticated user, import id, draft id, or deletion job id for cancellation, discard, source deletion, expiry, or retention cleanup.

**Output**: current deletion state and verification summary.

**Rules**: Repeated deletion, cancellation, discard, expiry, or retention actions return the current state, do not recreate artifacts, do not extend retention, and do not delete a separately confirmed structured resume.

## Authorization Contract

Every import operation must verify that the authenticated user owns the imported document, draft, extracted fields, warnings, corrections, deletion job, and resulting structured resume. Forbidden responses must not reveal personal data from another user's import.

## Logging Contract

Logs may include event ids, status codes, timing, file size bucket, page count bucket, language category, provider category, provider state category, and non-sensitive error categories. Logs must not include full resumes, raw extracted text, source snippets, uploaded documents, authentication tokens, provider credentials, provider session material, prompts, raw provider payloads, technical parser internals, or unnecessary personal data.
