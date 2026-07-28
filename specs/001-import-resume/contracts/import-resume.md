# Contract: Import Existing Resume

This contract describes the user-facing flow and service boundaries for the initial resume import feature. Exact transport paths may be implemented as REST, RPC, or framework actions, but the behavior and states below are required.

## UI Flow Contract

### Create Resume Entry

**Trigger**: Authenticated or unauthenticated user starts resume creation.

**Required Behavior**: Present import as the recommended path and manual entry as an available fallback. If the user is not authenticated and chooses upload, require sign-in before accepting the file.

### Upload Step

**Required Copy Topics**: Supported file types PDF and DOCX; French, English, bilingual French-English; selectable text required; 10 MB limit; 5 rendered page limit; 3-minute processing timeout; 7-day source/artifact retention; early source deletion option; manual fallback.

**Required Controls**: Choose file, continue manually, cancel import. All controls need accessible names and keyboard focus.

### Processing Step

**Visible States**: checking document, reading content, organizing resume sections, preparing review, timeout, failed, cancelled, retrying, deletion scheduled, deleted.

**Accessibility**: State changes must be announced to screen-reader users without exposing parser internals, provider names, prompts, JSON, YAML, or diagnostics.

### Review Step

**Required Sections**: Personal/contact information, headline, summary, work experience, education, skills, languages, projects, certifications, professional links.

**Required Actions**: Confirm, edit, remove, add, exclude, intentionally leave warning, retry, replace upload, delete source, discard import, continue manually, create structured resume.

**Blocking Rule**: Create structured resume is disabled or blocked until every warning is addressed and at least one supported field is user-confirmed.

### Confirmation Step

**Required Behavior**: Explain that Nuvitae will create structured resume data from the reviewed fields and that the uploaded document remains a separate temporary source. Confirmation requires an explicit user action.

### Source Deletion Step

**Required Behavior**: Deleting the source deletes all source-reconstructing artifacts and does not delete an already confirmed structured resume unless the user separately deletes it.

## Service Boundary Contract

### Start Import

**Input**: Authenticated user session, visible filename, content type, file size, upload stream.

**Output**: `ImportedDocument` id, initial upload status, retention expiry.

**Errors**: unauthenticated, rate limited, unsupported file type, size over 10 MB, unsafe upload, storage unavailable.

### Validate Document

**Input**: `ImportedDocument` id owned by user.

**Output**: validation status, rendered page count, selectable-text status, detected language, recovery actions.

**Errors**: not found, forbidden, password protected, unreadable, corrupted, empty, image-only, over 5 pages, unsupported language, unsafe content, ambiguous mixed document.

### Process Extraction

**Input**: accepted `ImportedDocument` id, optional AI assistance availability flag.

**Output**: processing state, partial/complete extraction summary, draft id when threshold is met, warnings, recovery actions.

**Rules**: Deterministic extraction runs first. Optional AI can only classify sections or flag ambiguity after deterministic extraction. Foreground processing times out after 3 minutes and returns threshold-qualified partial results when available.

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
