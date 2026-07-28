# Quickstart: Import Existing Resume Validation

This guide defines end-to-end validation scenarios for the import feature. It assumes implementation tasks will create the web app, API service, worker, storage, database, and fixture packages described in [plan.md](./plan.md).

## Prerequisites

- Local app stack with web, API, worker, PostgreSQL, queue/rate-limit backend, and private object storage.
- Test users `user-a` and `user-b`.
- Resume fixtures for supported PDF, supported DOCX, French, English, bilingual French-English, partial extraction, unsupported language, oversized file, over-page-limit file, password-protected file, image-only/scanned file, corrupted file, hostile active-content file, mixed-content file, and no-supported-field file.

## Validation Scenarios

### 1. Happy Path Import

1. Sign in as `user-a`.
2. Start resume creation.
3. Verify import is presented as the recommended path and manual entry is available.
4. Upload a supported selectable-text PDF or DOCX under 10 MB and 5 rendered pages.
5. Verify plain-language progress states appear and are announced.
6. Verify review opens with grouped resume sections.
7. Confirm or edit every warning.
8. Confirm structured resume creation.

**Expected Outcome**: A structured resume is created only after explicit confirmation. Confirmed fields are marked with review/provenance status. The source document remains a separate temporary artifact with the original 7-day expiry.

### 2. Authentication Gate

1. Sign out.
2. Start resume creation and choose import.
3. Attempt to upload a file.

**Expected Outcome**: The app requires sign-in before accepting the file and does not create an imported document.

### 3. Partial Extraction and Timeout

1. Sign in as `user-a`.
2. Upload a fixture that can produce at least one explicitly sourced field but cannot complete all sections within the processing limit.
3. Let processing reach the 3-minute foreground timeout.

**Expected Outcome**: The app shows threshold-qualified partial results, identifies missing or unprocessed sections, and offers retry, replacement upload, manual entry, and deletion/discard actions.

### 4. Validation Failures

Run the upload flow with unsupported, empty, corrupted, unreadable, password-protected, image-only, oversized, over-page-limit, and unsupported-language fixtures.

**Expected Outcome**: Each failure gives a non-technical reason and recovery actions. No review draft is created unless at least one supported field is explicitly sourced. Focus moves to an error summary.

### 5. Review Warning Resolution

1. Upload a fixture with duplicate contact data, ambiguous dates, conflicting employers, missing education fields, and inferred work-experience grouping.
2. Verify every uncertain, missing, duplicate, conflicting, inferred, and low-confidence item is marked as needing review.
3. Attempt confirmation before resolving warnings.
4. Resolve each warning by confirming, editing, excluding, or intentionally leaving it.

**Expected Outcome**: Confirmation is blocked until all warnings are addressed. After resolution, confirmation succeeds only if at least one supported field is user-confirmed.

### 6. Multiple Roles and Ongoing Role

1. Upload a fixture with one employer and multiple explicit roles.
2. Include an ongoing role with no end date.

**Expected Outcome**: Roles remain separate under the same employer. The ongoing role stores no end date and displays as "Present".

### 7. No-AI Operation

1. Disable optional AI assistance.
2. Upload a supported fixture with deterministic fields.

**Expected Outcome**: The user can complete review and create a structured resume from deterministic extraction alone.

### 8. Hostile Document Safety

1. Upload fixtures containing macros, scripts, active objects, unsafe links, hidden text, and prompt-injection instructions.
2. Verify validation/extraction handles them as untrusted document content.

**Expected Outcome**: No active content executes. Document instructions are not treated as application or AI instructions. Logs do not contain raw source content or unnecessary personal data.

### 9. Authorization Isolation

1. As `user-a`, upload a supported resume and reach review.
2. As `user-b`, attempt to access, resume, update, confirm, cancel, or delete `user-a`'s import resources.

**Expected Outcome**: Every cross-user action is denied without exposing `user-a`'s personal data.

### 10. Source Deletion and Retention

1. Create a structured resume from an import.
2. Delete the source document before the 7-day deadline.
3. Inspect the structured resume.
4. Run the retention job for an import older than 7 days.

**Expected Outcome**: Source document and all source-reconstructing artifacts are deleted. The structured resume remains available and contains only minimal non-sensitive provenance. Confirmation does not extend the original retention deadline.

### 11. Accessibility Pass

Complete upload, validation failure, processing, timeout, review, warning resolution, confirmation, cancellation, retry, and source deletion with keyboard-only navigation and screen-reader checks.

**Expected Outcome**: All controls have accessible names, focus is visible, status changes are announced, warnings do not rely on colour alone, error summaries receive focus, and dialogs restore focus logically.

## Required Test Groups

- Domain unit tests for state transitions, warning resolution, confirmation blocking, source deletion, and retention.
- Extraction fixture tests for supported languages, formats, partial results, selectable-text requirements, no-supported-field failures, and hostile documents.
- API/contract tests for authorization, rate limits, validation failures, retry, cancellation, deletion, and confirmation.
- Worker integration tests for timeout, cancellation, deletion verification, and expired drafts.
- Accessibility tests for labels, keyboard operation, live regions, error focus, dialog focus restoration, and non-colour warning treatment.
- Logging/security tests proving raw resumes, source snippets, uploaded files, credentials, prompts, tokens, and unnecessary personal data are not logged.
