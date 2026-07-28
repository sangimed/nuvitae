# Contract: Import Existing Resume

This contract describes the user-facing flow and service boundaries for the initial resume import feature. Exact transport paths may be implemented as REST, RPC, or framework actions, but the behavior and states below are required.

## UI Flow Contract

### Create Resume Entry

**Trigger**: Authenticated or unauthenticated user starts resume creation.

**Required Behavior**: Present import as the recommended path and manual entry as an available fallback. Manual entry routes to `/resumes/new/manual` and creates a blank editable structured-resume draft without creating an imported document or import job. If the user is not authenticated and chooses upload, require sign-in before accepting the file.

### Upload Step

**Required Copy Topics**: Supported file types PDF and DOCX; French, English, bilingual French-English; selectable text required; 10 MB limit; 5 rendered page limit; 3-minute processing timeout; 7-day source/artifact retention; early source deletion option; manual fallback.

**Required Controls**: Choose file, continue manually, cancel import. All controls need accessible names and keyboard focus.

### Manual Entry Step

**Route**: `/resumes/new/manual`

**Required Behavior**: Create a blank editable structured-resume draft, mark manually entered fields as user-added, and use the same section-editing components as import review where appropriate. This route must be reachable from initial resume creation and from unsupported-file, no-usable-extraction, timeout, processing-failure, expired-draft, and unsupported-language states.

**Import Boundary**: Manual entry does not create an `ImportedDocument`, `ImportDraft`, derived extraction artifact, or import processing job.

### Processing Step

**Visible States**: checking document, reading content, organizing resume sections, preparing review, timeout, failed, cancelled, retrying, deletion scheduled, deleted.

**Accessibility**: State changes must be announced to screen-reader users without exposing parser internals, provider names, prompts, JSON, YAML, or diagnostics.

### Review Step

**Required Sections**: Personal/contact information, headline, summary, work experience, education, skills, languages, projects, certifications, professional links.

**Required Actions**: Confirm, edit, remove, add, exclude, intentionally leave warning, retry, replace upload, delete source, discard import, continue manually, create structured resume.

**Blocking Rule**: Create structured resume is disabled or blocked until every warning is addressed and at least one supported field is user-confirmed.

### Unsupported-Language Contact Preview

**Required Behavior**: Documents outside French, English, or bilingual French-English do not create an import review draft. If explicitly detectable contact information is available, Nuvitae may show a temporary contact-only preview with a clear unsupported-language warning.

**Required Actions**: Confirm transfer to manual entry, discard contact preview, upload another file, continue manually without transfer.

**Rules**: Contact-only detection does not satisfy the import-draft creation threshold. Contact fields transfer to `/resumes/new/manual` only after explicit user confirmation and are marked as user-added. Temporary contact data follows the same deletion and logging restrictions as other extraction artifacts.

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

**Input**: accepted `ImportedDocument` id, optional AI assistance availability flag.

**Output**: processing state, partial/complete extraction summary, draft id when threshold is met, warnings, recovery actions.

**Rules**: Deterministic extraction runs first through concrete PDF and DOCX extraction adapters. PDF extraction must include page and text-item source-location provenance. DOCX extraction must include package part, paragraph/table/cell/run, and character-offset provenance. Optional AI can only classify sections or flag ambiguity after deterministic extraction. Foreground processing times out after 3 minutes and returns threshold-qualified partial results when available. A parser memory-limit breach terminates the isolated parser process, creates no review draft from abruptly terminated partial output, cleans up files and source-reconstructing artifacts for the failed attempt, and returns retry, replacement-upload, and manual-entry recovery actions.

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

**Output**: grouped sections, extracted fields, warnings, review statuses, source locations while source exists, retention expiry, available actions.

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

**Rules**: Retry respects rate limits and processing limits. Replacement upload does not extend the original document's retention; it creates a new imported document with its own retention deadline.

### Cancel or Discard Import

**Input**: authenticated user, import id or draft id, explicit cancellation/discard action.

**Output**: cancellation/discard state and deletion job id.

**Rules**: Processing stops where possible. Source and source-reconstructing artifacts are scheduled for deletion.

### Delete Source Document

**Input**: authenticated user, imported document id, explicit deletion action.

**Output**: deletion state and deletion verification status.

**Rules**: Deletes source file, extracted raw text, field source snippets, page references, thumbnails, temporary files, cached parsing results, future OCR outputs, embeddings if any, and equivalent source-reconstructing artifacts.

## Authorization Contract

Every import operation must verify that the authenticated user owns the imported document, draft, extracted fields, warnings, corrections, deletion job, and resulting structured resume. Forbidden responses must not reveal personal data from another user's import.

## Logging Contract

Logs may include event ids, status codes, timing, file size bucket, page count bucket, language category, and non-sensitive error categories. Logs must not include full resumes, raw extracted text, source snippets, uploaded documents, authentication tokens, provider credentials, prompts, or unnecessary personal data.
