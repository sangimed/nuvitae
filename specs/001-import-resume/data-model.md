# Data Model: Import Existing Resume

## ImportedDocument

Represents the uploaded source file. It is distinct from the import draft and any structured resume.

**Fields**: `id`, `ownerUserId`, `visibleFilename`, `contentType`, `fileExtension`, `sizeBytes`, `renderedPageCount`, `detectedLanguage`, `storageKey`, `uploadStatus`, `validationStatus`, `processingStatus`, `deletionStatus`, `createdAt`, `retentionExpiresAt`, `deletedAt`.

**Relationships**: Owns zero or more `DerivedExtractionArtifact` records and at most one active `ImportDraft`. May create one `StructuredResume` after confirmation.

**Validation Rules**: Owner must be authenticated. File must be PDF or DOCX, 10 MB or smaller, 5 rendered pages or fewer, selectable text, and French, English, or bilingual French-English. Unsafe, unreadable, password-protected, corrupted, empty, image-only, unsupported, over-limit, or ambiguous mixed documents fail validation with recovery actions.

**State Transitions**: `pending_upload` -> `uploaded` -> `validating` -> `accepted` or `rejected`; accepted documents move through `processing`, `ready_for_review`, `timeout_partial`, `failed`, `cancelled`, `expired`, or `deleted`.

**Resource Limits**: Validation and processing are subject to 10 MB maximum file size, 5 rendered pages maximum, 3 minutes maximum foreground processing, 512 MiB maximum isolated parser-process memory, 1 active and 2 queued processing jobs per user, and 5 upload or processing-start attempts per rolling 10-minute window per authenticated user.

## DerivedExtractionArtifact

Temporary data capable of reconstructing the source content.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `artifactType`, `storageKey`, `containsSourceReconstructingData`, `createdAt`, `retentionExpiresAt`, `deletedAt`.

**Relationships**: Belongs to one `ImportedDocument`.

**Validation Rules**: Retention deadline must equal the original imported document retention deadline. Artifacts must not be visible to users except through safe review presentation while the source exists.

**State Transitions**: `created` -> `scheduled_for_deletion` -> `deleted`; deletion also occurs when the source is deleted, cancelled, or expired.

## ImportDraft

Review workspace containing extracted fields, warnings, and user corrections before structured resume creation.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `status`, `createdAt`, `lastReviewedAt`, `retentionExpiresAt`, `confirmedAt`, `discardedAt`, `expiredAt`.

**Relationships**: Belongs to one `ImportedDocument`; contains many `ExtractedField`, `ImportWarning`, and `UserCorrection` records; may create one `StructuredResume`.

**Validation Rules**: Draft creation requires at least one supported field explicitly extracted from source content with a source location. Inferred-only data must not create a draft. Draft can be resumed only by the owner before retention expiry.

**State Transitions**: `preparing` -> `review_required` -> `ready_to_confirm` -> `confirmed`; alternate states are `discarded`, `cancelled`, `expired`, and `source_deleted_limited_review`.

## TemporaryContactPreview

Temporary unsupported-language recovery view containing only explicitly detectable contact information.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `contactFields`, `unsupportedLanguageWarning`, `createdAt`, `retentionExpiresAt`, `confirmedForManualTransferAt`, `deletedAt`.

**Relationships**: Belongs to one `ImportedDocument`. May prefill a `ManualStructuredResumeDraft` only after explicit user confirmation.

**Validation Rules**: Exists only for documents outside French, English, or bilingual French-English. It is not an `ImportDraft`, does not satisfy the import-draft creation threshold, and must not contain semantic resume extraction beyond explicitly detectable contact fields. It follows the same deletion, retention, and logging restrictions as `DerivedExtractionArtifact`.

**State Transitions**: `created` -> `awaiting_user_confirmation` -> `transferred_to_manual_entry` or `discarded`; deletion also occurs when the source is deleted, cancelled, expired, or the retention deadline is reached.

## ExtractedField

Candidate resume value shown during review.

**Fields**: `id`, `importDraftId`, `section`, `fieldPath`, `value`, `normalizedValue`, `sourceStatus`, `sourceLocation`, `confidenceStatus`, `inferenceStatus`, `reviewStatus`, `warningId`, `createdAt`, `updatedAt`.

**Relationships**: Belongs to one `ImportDraft`; may be linked to one `ImportWarning`; may be superseded by `UserCorrection`.

**Validation Rules**: Supported sections are personal/contact information, professional headline, summary, work experience, education, skills, languages, projects, certifications, and professional links. Source location exists only while the source document exists. PDF source locations include page number and text-item geometry. DOCX source locations include package part plus paragraph/table/cell/run indexes and character offsets; rendered DOCX coordinates are not guaranteed. Semantic grouping, ambiguous date interpretation, section classification, and work-experience association by inference require review. Skills must not be inferred from titles, responsibilities, seniority, metrics, or relationships.

**State Transitions**: `unreviewed` -> `confirmed`, `edited`, `excluded`, or `intentionally_left`; all warnings must leave `unreviewed` before structured resume confirmation.

## ImportWarning

Plain-language issue requiring attention during review.

**Fields**: `id`, `importDraftId`, `warningType`, `section`, `fieldPath`, `message`, `severity`, `reviewStatus`, `createdAt`, `resolvedAt`.

**Relationships**: Belongs to one `ImportDraft`; may reference one or more `ExtractedField` records.

**Validation Rules**: Warning types include missing, ambiguous, conflicting, duplicate, low-confidence, unsupported, unsafe, incomplete, inferred, partial, mixed-content, and expired-source. Warnings must be identifiable by text and non-colour visual treatment.

**State Transitions**: `needs_review` -> `confirmed`, `edited`, `excluded`, or `intentionally_left`.

## WorkExperience

Structured employment group in the import draft and confirmed resume.

**Fields**: `id`, `employerName`, `employerLocation`, `roles`, `reviewStatus`, `inferenceStatus`.

**Relationships**: A `StructuredResume` or `ImportDraft` has zero or more work experiences. Each work experience contains one or more `WorkExperienceRole`.

**Validation Rules**: Multiple roles under the same employer are preserved as separate roles when explicit. Inferred grouping must be marked as needing review.

## WorkExperienceRole

Specific role within an employer.

**Fields**: `id`, `title`, `location`, `startDate`, `endDate`, `isOngoing`, `responsibilities`, `achievements`, `sourceStatus`, `reviewStatus`, `inferenceStatus`.

**Validation Rules**: Ongoing roles have no end date and display as "Present". Partial, ambiguous, overlapping, future-dated, inconsistent, or regional date interpretations require review. Achievements and responsibilities must come from source content or user input, not invention.

## StructuredResume

Confirmed structured resume data created from reviewed import fields.

**Fields**: `id`, `ownerUserId`, `sourceImportDraftId`, `provenanceLabel`, `confirmationStatus`, `createdAt`, `updatedAt`, `deletedAt`.

**Relationships**: Created from one confirmed `ImportDraft`. Contains confirmed personal information, contact information, headline, summary, work experiences, education, skills, languages, projects, certifications, links, and user-added content.

**Validation Rules**: Created only after explicit confirmation, all warnings are addressed, and at least one supported field is user-confirmed. After source deletion it may retain only minimal non-sensitive provenance such as "imported from initial resume" and "confirmed by user"; it must not retain raw snippets, page references, thumbnails, extracted raw text, embeddings, cached parsing output, or equivalent source-reconstructing data.

## ManualStructuredResumeDraft

Blank editable structured-resume draft created through manual entry.

**Fields**: `id`, `ownerUserId`, `source`, `status`, `createdAt`, `updatedAt`, `confirmedAt`, `deletedAt`.

**Relationships**: Contains editable personal information, contact information, headline, summary, work experiences, education, skills, languages, projects, certifications, and links using the same section-editing model as import review where appropriate. Does not belong to an `ImportedDocument` and does not create an import processing job.

**Validation Rules**: Created at `/resumes/new/manual` from initial resume creation or import recovery states. Manually entered fields are marked as `user_added`. Explicitly confirmed contact fields from a `TemporaryContactPreview` may prefill contact fields and must be marked as user-added after transfer.

## UserCorrection

User review action applied to a draft field or warning.

**Fields**: `id`, `importDraftId`, `targetType`, `targetId`, `action`, `previousValue`, `newValue`, `createdAt`, `createdByUserId`.

**Relationships**: Belongs to one `ImportDraft`; targets an `ExtractedField`, `ImportWarning`, section, or work-experience role.

**Validation Rules**: Actions include confirm, edit, remove, add, exclude, and intentionally leave. Corrections never modify the uploaded source document.

## DeletionJob

Lifecycle task for removing source and source-reconstructing artifacts.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `reason`, `status`, `scheduledAt`, `completedAt`, `verificationStatus`.

**Relationships**: Deletes one imported document and all related derived extraction artifacts. May also discard an unconfirmed import draft.

**Validation Rules**: Jobs are scheduled for cancellation, explicit source deletion, discard, expiry, or retention deadline. Confirmation does not restart or extend the retention deadline.

## ParserProcess

Isolated process used for PDF parsing, DOCX rendered-page validation, and DOCX text extraction.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `parserKind`, `status`, `startedAt`, `endedAt`, `memoryLimitMiB`, `timeoutSeconds`, `terminationReason`.

**Relationships**: Belongs to one `ImportedDocument` and may create `DerivedExtractionArtifact` records only after successful validation of parser output.

**Validation Rules**: Must enforce 512 MiB initial memory limit and 3-minute foreground timeout. On memory excess or timeout, the process is terminated, no review draft is created from abrupt partial output, and source-reconstructing artifacts for the failed attempt are cleaned up.
