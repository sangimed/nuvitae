# Data Model: Import Existing Resume

This document describes business/domain concepts and lifecycle rules. It does
not define TypeORM entities, database decorators, or persistence-only fields.
Persistence concerns belong behind `packages/persistence`, where TypeORM
entities, database tables, repositories, migrations, and explicit mappers are
planned separately from domain concepts. TypeORM entities are persistence models,
not business-domain entities, and rows must be mapped explicitly before entering
the domain layer.

## Proposed NuvitaeDocument runtime representation

`NuvitaeDocument` is a future, import-scoped canonical document representation
produced by the proposed provider-neutral Document Understanding Layer. It is
not a TypeORM entity, persistence schema, or confirmed resume model. Its
purpose is to normalize different document engines into Nuvitae-owned content,
structure, and provenance that can support both the active V1 semantic path and
future document-aware or multimodal semantic paths.

The minimum conceptual scope is:

| Area                           | Canonical responsibility                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Document identity and metadata | Import-scoped document id; source format; MIME type; detected language; bounded engine/version/configuration metadata.                   |
| Pages                          | Stable page identity and number; width/height or other dimensions when available.                                                        |
| Blocks/fragments               | Stable Nuvitae-owned block id; text; block type; reading order; page reference when available; optional bounding box; source provenance. |
| Sections                       | Hierarchy and grouping of headings or logical document regions.                                                                          |
| Tables                         | Rows, columns, cells, and spans where the source engine can support them without inventing structure.                                    |
| Styles                         | Optional deterministic signals such as heading/list/emphasis style; never required for semantic acceptance.                              |
| Assets                         | Figures or images retained for a qualified document-aware path when allowed by retention and privacy policy.                             |
| Provenance                     | Mapping from canonical blocks/content back to source document locations, including native PDF/DOCX locations where available.            |
| Extraction metadata            | Engine, engine version, configuration fingerprint, and bounded quality/diagnostic indicators; no raw provider payloads.                  |

Canonical block and fragment identifiers are generated and owned by Nuvitae.
They are the only source-reference identifiers exposed to the semantic-provider
boundary. A provider may return a bounded `sourceRefs` hint containing a
Nuvitae-owned block/fragment id and exact quote; Nuvitae verifies the quote and
reconstructs authoritative evidence, offsets, hashes, and native provenance.
Parser-native identifiers and schemas never become domain concepts.

The representations remain distinct:

- **Canonical runtime/document representation**: `NuvitaeDocument`, retained
  only as long as the import workflow and approved future capabilities require.
- **Source-reconstructing temporary artifacts**: uploaded files, raw extraction
  output, rendered pages, cached parser output, and equivalent data subject to
  the existing ownership, deletion, and seven-day retention rules.
- **Structured resume domain state**: reviewed and explicitly confirmed resume
  fields. It is not a copy of `NuvitaeDocument` and must survive source deletion
  without raw source reconstruction.

The current PDF.js/OOXML extraction stack is the active V1 implementation and
may later implement this conceptual boundary. That migration is not selected,
scheduled, or designed here. Docling is only the first candidate for the
controlled benchmark described in the dedicated research record.

## ImportedDocument

Represents the uploaded source file. It is distinct from the import draft and any structured resume.

**Fields**: `id`, `ownerUserId`, `visibleFilename`, `contentType`, `fileExtension`, `sizeBytes`, `renderedPageCount`, `detectedLanguage`, `storageKey`, `uploadStatus`, `validationStatus`, `processingStatus`, `deletionStatus`, `createdAt`, `retentionExpiresAt`, `deletedAt`.

**Relationships**: Owns zero or more `DerivedExtractionArtifact` records and at most one active `ImportDraft`. May create one `StructuredResume` after confirmation.

**Validation Rules**: Owner must be authenticated. File must be PDF or DOCX, 10 MB or smaller, 5 rendered pages or fewer, selectable text, and French, English, or bilingual French-English. Unsafe, unreadable, password-protected, corrupted, empty, image-only, unsupported, over-limit, or ambiguous mixed documents fail validation with recovery actions.

**State Transitions**: `pending_upload` -> `uploaded` -> `validating` -> `accepted` or `rejected`; accepted documents move through `processing`, `ready_for_review`, `timeout_partial`, `failed`, `cancelled`, `expired`, `deletion_scheduled`, or `deleted`. Repeated deletion, cancellation, discard, expiry, or retention actions are idempotent and return the current lifecycle state without recreating source-reconstructing artifacts.

**Resource Limits**: Validation and processing are subject to 10 MB maximum file size, 5 rendered pages maximum, 3 minutes maximum foreground processing, 512 MiB maximum isolated parser-process memory, 1 active and 2 queued processing jobs per user, and 5 upload or processing-start attempts per rolling 10-minute window per authenticated user.

**Repeated Upload Rule**: Re-uploading the same file or materially identical source content creates a separate `ImportedDocument`, counts against the initiating user's rolling attempt and concurrency limits, and receives an independent `retentionExpiresAt` based on that upload. Duplicate uploads do not merge drafts, share source-reconstructing artifacts, or extend another import's retention.

## DerivedExtractionArtifact

Temporary data capable of reconstructing the source content.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `artifactType`, `storageKey`, `containsSourceReconstructingData`, `createdAt`, `retentionExpiresAt`, `deletedAt`.

**Relationships**: Belongs to one `ImportedDocument`.

**Validation Rules**: Retention deadline must equal the original imported document retention deadline. Artifacts must not be visible to users except through safe review presentation while the source exists.

**State Transitions**: `created` -> `scheduled_for_deletion` -> `deleted`; deletion also occurs when the source is deleted, cancelled, or expired.

## ImportDraft

Review workspace containing extracted fields, warnings, and user corrections before structured resume creation.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `semanticParseAttemptId`, `status`, `createdAt`, `lastReviewedAt`, `retentionExpiresAt`, `confirmedAt`, `discardedAt`, `expiredAt`.

**Relationships**: Belongs to one `ImportedDocument`; may be produced by one successful `SemanticParseAttempt`; contains many `ExtractedField`, `ImportWarning`, and `UserCorrection` records; may create one `StructuredResume`.

**Validation Rules**: Draft creation requires at least one supported candidate with required document evidence. Inferred-only or ungrounded provider output must not create a draft. Draft can be resumed only by the owner before retention expiry. If source artifacts are deleted before confirmation, review may show saved field values, user corrections, warning states, and minimal non-sensitive provenance, but must not show raw snippets, page references, thumbnails, extracted raw text, or source-location previews. Confirmation is allowed only when every warning remains addressable without source artifacts and at least one supported field is user-confirmed; otherwise the user must discard or continue manually.

**State Transitions**: `preparing` -> `review_required` -> `ready_to_confirm` -> `confirmed`; alternate states are `discarded`, `cancelled`, `expired`, and `source_deleted_limited_review`.

## TemporaryContactPreview

Temporary unsupported-language recovery view containing only explicitly detectable contact information.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `contactFields`, `unsupportedLanguageWarning`, `createdAt`, `retentionExpiresAt`, `confirmedForManualTransferAt`, `deletedAt`.

**Relationships**: Belongs to one `ImportedDocument`. May prefill a `ManualStructuredResumeDraft` only after explicit user confirmation.

**Validation Rules**: Exists only for documents outside French, English, or bilingual French-English. It is not an `ImportDraft`, does not satisfy the import-draft creation threshold, and must not contain semantic resume extraction beyond explicitly detectable contact fields. It follows the same deletion, retention, and logging restrictions as `DerivedExtractionArtifact`.

**State Transitions**: `created` -> `awaiting_user_confirmation` -> `transferred_to_manual_entry` or `discarded`; deletion also occurs when the source is deleted, cancelled, expired, or the retention deadline is reached.

## AIProviderRuntimeConnection

Represents a user's configured AI provider runtime connection for a self-hosted installation.

**Fields**: `id`, `ownerUserId`, `providerKind`, `displayName`, `connectionStatus`, `capabilityState`, `authenticationStatus`, `availabilityStatus`, `credentialReferenceId`, `loginStartedAt`, `connectedAt`, `disconnectedAt`, `logoutAt`, `revokedAt`, `expiresAt`, `lastCheckedAt`, `reconnectRequestedAt`.

**Relationships**: Owned by one user. May be referenced by many `SemanticParseAttempt` records. For the Codex direct-OAuth candidate, provider-neutral connection state may correspond to broker-owned credential state, but no raw provider credentials, access tokens, refresh tokens, provider auth files, or provider session material are exposed to the import domain, web application, browser storage, API controllers, regular worker jobs, semantic extraction contracts, logs, diagnostics, ordinary API responses, or import review. `credentialReferenceId` is a broker-owned opaque reference (for example a broker credential namespace or envelope identifier) used to bind connection state to broker-managed credentials; it is a reference, never the credential material itself, and the broker remains the only component that can resolve it to encrypted credentials.

**Validation Rules**: Initial provider kind is `codex_direct` for the candidate self-hosted Codex adapter. Connection status values include `not_configured`, `login_pending`, `connected`, `login_cancelled`, `disconnected`, `auth_expired`, `auth_revoked`, `unavailable`, `rate_limited`, `quota_exceeded`, and `unsupported_capability`. Normal Nuvitae application surfaces remain token-blind. For Codex direct OAuth, login, encrypted credential persistence, refresh, expiry, recovery, logout, local revocation, and deletion are owned only by the isolated `CodexOAuthBroker`, not by the resume-import domain or ordinary workers.

**State Transitions**: `not_configured` -> `login_pending` -> `connected` or `login_cancelled`; `connected` -> `auth_expired`, `auth_revoked`, `unavailable`, `rate_limited`, `quota_exceeded`, `disconnected`, or `revoked`; recoverable states may return to `login_pending` or `connected` after reconnect or retry. `connected` may transition to `disconnected` after user logout/disconnect without deleting uploaded resumes, import drafts, structured resumes, or source-retention records. Reconnect starts a new `login_pending` cycle and reauthorization replaces the broker credential reference; a successful reconnect returns to `connected` with a fresh `connectedAt` and `expiresAt`, and `auth_expired` returns to `login_pending` for browser reauthorization. The user-visible plain actions map as follows: "Connect Codex" starts `login_pending`; "Codex is ready" is `connected`; "Codex connection expired" is `auth_expired` or `auth_revoked`; "Reconnect Codex" restarts `login_pending`; "Disconnect" transitions to `disconnected` and requests broker logout/local credential deletion.

## CodexOAuthBroker

Infrastructure-level component for the Codex direct-OAuth candidate. It is not a resume-domain entity.

**Contract Fields**: `providerKind`, `ownerNamespace`, `connectionStatus`, `accountIdentityStatus`, `credentialState`, `startLogin()`, `handleLoopbackCallback()`, `inspectConnection()`, `refreshIfAllowed()`, `invokeCodex()`, `logout()`, `deleteLocalCredentials()`.

**Relationships**: Owns the Codex credential namespace for one Nuvitae owner. It may update provider-neutral `AIProviderRuntimeConnection` state and may be referenced by `CodexDirectProviderAdapter`. It must not expose raw tokens, authorization codes, credential files, backend URLs, headers, provider-native responses, or provider-native errors to `ImportDraft`, `SemanticParseAttempt`, `NuvitaeExtractionResponse`, regular job payloads, domain objects, browser storage, ordinary API responses, logs, or diagnostics.

**Validation Rules**: The broker generates PKCE verifier/challenge, generates and validates OAuth state, hosts a local loopback callback, exchanges authorization codes, stores access and refresh tokens encrypted at rest, refreshes access tokens only for authorized failure categories, provides logout and local deletion, executes Codex provider requests behind fail-closed host/path allowlists, rejects redirects to unapproved hosts, bounds response size, enforces timeout/cancellation, and returns only provider-neutral results. It uses a dedicated encrypted credential store with a master key supplied as a Docker secret or environment secret, authenticated encryption, restrictive filesystem permissions, one credential namespace per Nuvitae owner, atomic writes, rotation and deletion semantics, no plaintext credentials in PostgreSQL unless explicitly encrypted, and no credentials in image layers, logs, fixtures, Git, browser storage, queue payloads, or backups without documented encryption.

**Spike-Only Decision Rule**: The first auth spike evaluates broker topology and credential lifecycle but must not implement production credential persistence. The topology decision remains open until a threat-model comparison covers a dedicated Docker service, isolated worker-side process, and any other bounded infrastructure component.

## SemanticParseAttempt

One provider-backed semantic parsing attempt for an accepted import.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `providerRuntimeConnectionId`, `providerKind`, `inputRepresentation`, `status`, `startedAt`, `endedAt`, `timeoutSeconds`, `failureReason`, `supportabilityClassification`, `responseSchemaVersion`, `groundingValidationStatus`, `noInventionValidationStatus`, `latencyMs`.

**Relationships**: Belongs to one `ImportedDocument`; may use one `AIProviderRuntimeConnection`; may produce one `NuvitaeExtractionResponse` and one `ImportDraft`; may create `ImportWarning` records for provider failures or invalid candidates.

**Validation Rules**: Status values include `queued`, `running`, `succeeded`, `failed`, `timed_out`, `malformed_output`, `invalid_evidence`, `provider_unavailable`, `auth_expired`, `rate_limited`, `quota_exceeded`, `cancelled`. Provider failures must map to retry, reconnect, choose another configured provider, limited deterministic partial extraction where available, or manual entry. A failed attempt must not create a review draft from invalid output. Codex direct-OAuth spike attempts must classify relevant provider behavior as officially documented OpenAI behavior, behavior verified from official source code, behavior used by OpenClaw or Hermes, undocumented compatibility behavior, experimentally verified Nuvitae behavior, or inference.

## NuvitaeExtractionResponse

Versioned, provider-neutral structured output accepted from a provider adapter only after translation from provider-native output.

**Fields**: `id`, `semanticParseAttemptId`, `schemaVersion`, `candidateSections`, `candidateRelationships`, `candidateWarnings`, `evidenceRecords`, `validationStatus`, `createdAt`.

**Relationships**: Belongs to one `SemanticParseAttempt`; creates `ExtractedField`, `WorkExperience`, and `ImportWarning` records only after strict schema, grounding, and no-invention validation.

**Validation Rules**: Unknown fields, invalid relationships, unsupported values, provider-native schema leakage, malformed output, missing evidence, invented facts, and invalid confidence or classification categories fail safely or become explicit review warnings. The future `nuvitae.semantic-extraction.v2` response contains semantic values, logical grouping, and bounded Nuvitae-owned `sourceRefs`; it does not contain parser-native document identifiers, application candidate IDs, canonical evidence coordinates, hashes, or provider-owned confidence/classification metadata. Provider-native JSON must not enter the import domain directly.

## EvidenceRecord

Grounding reference for an AI-produced candidate value or relationship.

**Fields**: `id`, `responseId`, `candidateId`, `documentLocation`, `sourceTextOrFragmentId`, `classification`, `confidenceStatus`, `validationStatus`.

**Relationships**: Belongs to one `NuvitaeExtractionResponse`; may be referenced by one or more `ExtractedField` or relationship candidates.

**Validation Rules**: This is a Nuvitae-owned canonical evidence record created after source-reference resolution; `candidateId` is generated by Nuvitae and is never trusted from provider output. Classification values identify whether the candidate is explicit or inferred. Confidence values are `high`, `medium`, `low`, and `not_applicable`. Missing or invalid evidence rejects the candidate or marks it unusable; unsupported evidence must not be silently accepted.

For Semantic V2 scalar values, one evidence record remains the normal case. A
scalar may produce multiple ordered evidence records only when Nuvitae's source
registry proves a continuation between every consecutive extraction fragment,
the refs touch each shared fragment boundary, and exact deterministic
reconstruction succeeds. Continuation metadata is source-owned proof, not
provider evidence; it never creates synthetic offsets or hashes. Group objects
do not own evidence records.

## ExtractedField

Candidate resume value shown during review.

**Fields**: `id`, `importDraftId`, `semanticParseAttemptId`, `evidenceRecordId`, `section`, `fieldPath`, `value`, `normalizedValue`, `sourceStatus`, `sourceLocation`, `sourceFragmentId`, `confidenceStatus`, `classificationStatus`, `inferenceStatus`, `reviewStatus`, `warningId`, `createdAt`, `updatedAt`.

**Relationships**: Belongs to one `ImportDraft`; may be linked to one `ImportWarning`; may be superseded by `UserCorrection`.

**Validation Rules**: Supported sections are personal/contact information, professional headline, summary, work experience, education, skills, languages, projects, certifications, and professional links. Source location exists only while the source document exists. PDF source locations include page number and text-item geometry. DOCX source locations include package part plus paragraph/table/cell/run indexes and character offsets; rendered DOCX coordinates are not guaranteed. Confidence status values are `high`, `medium`, `low`, and `not_applicable`; low confidence means extraction can associate a value with document evidence but cannot reliably classify the field, date meaning, section, role association, semantic grouping, duplicate, or conflict without review. Classification status records explicit versus inferred. Semantic grouping, ambiguous date interpretation, section classification, and work-experience association by inference require review. Skills must not be inferred from titles, responsibilities, seniority, metrics, or relationships.

**State Transitions**: `unreviewed` -> `confirmed`, `edited`, `excluded`, or `intentionally_left`; all warnings must leave `unreviewed` before structured resume confirmation.

## ImportWarning

Plain-language issue requiring attention during review.

**Fields**: `id`, `importDraftId`, `warningType`, `section`, `fieldPath`, `message`, `severity`, `reviewStatus`, `createdAt`, `resolvedAt`.

**Relationships**: Belongs to one `ImportDraft`; may reference one or more `ExtractedField` records.

**Validation Rules**: Warning types include missing, ambiguous, conflicting, duplicate, low-confidence, unsupported, unsafe, incomplete, inferred, partial, mixed-content, expired-source, no-provider, provider-unavailable, provider-auth-expired, provider-rate-limited, provider-quota-exceeded, provider-timeout, malformed-provider-output, invalid-evidence, ungrounded-candidate, and invented-fact. Warnings must be identifiable by text and non-colour visual treatment.

**State Transitions**: `needs_review` -> `confirmed`, `edited`, `excluded`, or `intentionally_left`.

## WorkExperience

Structured employment group in the import draft and confirmed resume.

**Fields**: `id`, `employerName`, `employerLocation`, `roles`, `reviewStatus`, `classificationStatus`, `inferenceStatus`, `evidenceRecordIds`.

**Relationships**: A `StructuredResume` or `ImportDraft` has zero or more work experiences. Each work experience contains one or more `WorkExperienceRole`.

**Validation Rules**: Multiple roles under the same employer are preserved as separate roles when explicit in document evidence. Inferred grouping must be marked as needing review.

## WorkExperienceRole

Specific role within an employer.

**Fields**: `id`, `title`, `location`, `startDate`, `endDate`, `isOngoing`, `responsibilities`, `achievements`, `sourceStatus`, `reviewStatus`, `inferenceStatus`.

**Validation Rules**: Ongoing roles have no end date and display as "Present". Partial, ambiguous, overlapping, future-dated, inconsistent, or regional date interpretations require review. Achievements and responsibilities must come from source content or user input, not invention.

## StructuredResume

Confirmed structured resume data created from reviewed import fields. In the Community MVP it is the editable source of truth (FR-035).

**Fields**: `id`, `ownerUserId`, `sourceImportDraftId`, `provenanceLabel`, `confirmationStatus`, `title`, `editingState`, `lastSavedAt`, `createdAt`, `updatedAt`, `deletedAt`.

**Relationships**: Created from one confirmed `ImportDraft`. Contains confirmed personal information, contact information, headline, summary, work experiences, education, skills, languages, projects, certifications, links, and user-added content. Has at most one active `ResumeTemplateChoice`. May have `ResumeEditSnapshot` records for lightweight undo, `AIChangeProposal` records for reviewed AI edits, and `ResumeExportRecord` records for PDF exports.

**Validation Rules**: Created only after explicit confirmation, all warnings are addressed, and at least one supported field is user-confirmed. `editingState` tracks save status (`unsaved`, `saving`, `saved`, `save_error`, `stale_conflict`) and `lastSavedAt` records the last persisted save so the editor can show "Saving… / Saved / Error — retry" and stale-conflict behavior without localStorage as source of truth. After source deletion it may retain only minimal non-sensitive provenance such as "imported from initial resume" and "confirmed by user"; it must not retain raw snippets, page references, thumbnails, extracted raw text, embeddings, cached parsing output, or equivalent source-reconstructing data.

## ResumeTemplateChoice

The template applied to a structured resume for preview and export.

**Fields**: `id`, `structuredResumeId`, `templateId`, `templateVersion`, `chosenAt`, `lastAppliedAt`.

**Relationships**: Belongs to one `StructuredResume`.

**Validation Rules**: At least one credible template (`templateId`) MUST be available in the Community MVP (FR-036). Changing `templateId` MUST NOT modify resume content; content and presentation remain separate. The renderer used for preview and PDF export consumes the same `templateId`/`templateVersion` so preview↔export fidelity is structurally guaranteed.

## AIChangeProposal

A reversible, reviewable AI-editing proposal on a resume field or section.

**Fields**: `id`, `structuredResumeId`, `ownerUserId`, `aiActionId`, `targetType`, `targetId`, `scope`, `originalValue`, `proposedValue`, `proposalStatus`, `createdAt`, `resolvedAt`, `replacedByProposalId`, `invocationReferenceId`.

**Relationships**: Belongs to one `StructuredResume`; may be superseded by another proposal (regenerate); may be produced through the Codex provider path referenced by an `AIProviderRuntimeConnection`.

**Validation Rules**: `proposalStatus` values are `proposed`, `accepted`, `rejected`, `superseded`, and `expired`. Nothing is applied to the resume until the user explicitly accepts (`accepted`). `rejected` and `superseded` proposals must not modify content. `originalValue` is the last saved value and `proposedValue` the AI variant, enabling before/after review. Fact preservation (FR-041) is enforced before a proposal is offered and re-checked on accept; proposals that add new names, dates, companies, metrics, or other unsupported facts are rejected. `invocationReferenceId` links to a privacy-safe invocation record and never contains prompts, tokens, provider-runtime state, or raw provider payloads.

## ResumeEditSnapshot

Lightweight undo record for manual and AI edits.

**Fields**: `id`, `structuredResumeId`, `ownerUserId`, `snapshotType`, `reason`, `payload`, `createdAt`.

**Relationships**: Belongs to one `StructuredResume`.

**Validation Rules**: The Community MVP requires lightweight undo only: a snapshot of the last saved state (and optionally the current state) is kept so an AI change or manual edit can be undone to the last saved version (FR-040). Full version history is deferred. `payload` stores only structured resume content with the same no-raw-source-snippet restrictions as the resume itself; it must not contain raw source snippets, tokens, or provider material.

## ResumeExportRecord

Metadata for a PDF export of a structured resume.

**Fields**: `id`, `structuredResumeId`, `ownerUserId`, `templateId`, `templateVersion`, `format`, `status`, `startedAt`, `completedAt`, `byteSizeBytes`, `failureReason`.

**Relationships**: Belongs to one `StructuredResume`; rendered from the same template renderer used for preview.

**Validation Rules**: `format` is `ats_pdf` in the Community MVP (FR-038). `status` values are `queued`, `generating`, `succeeded`, and `failed`. Export is deterministic and re-renderable from the same template and content version; preview and export share one renderer so fidelity is structurally guaranteed. `failureReason` uses plain privacy-safe categories and never exposes provider or rendering internals.

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

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `reason`, `status`, `scheduledAt`, `completedAt`, `verificationStatus`, `verificationSummary`.

**Relationships**: Deletes one imported document and all related derived extraction artifacts. May also discard an unconfirmed import draft.

**Validation Rules**: Jobs are scheduled for cancellation, explicit source deletion, discard, expiry, or retention deadline. Confirmation does not restart or extend the retention deadline. Jobs are idempotent; repeated scheduling or execution records the current state and must not recreate artifacts. Verification records each source-reconstructing artifact category as removed, already absent, or failed before the 7-day deadline.

## ParserProcess

Isolated process used for PDF parsing, DOCX rendered-page validation, DOCX text extraction, and provider-ready source representation preparation.

**Fields**: `id`, `importedDocumentId`, `ownerUserId`, `parserKind`, `status`, `startedAt`, `endedAt`, `memoryLimitMiB`, `timeoutSeconds`, `terminationReason`.

**Relationships**: Belongs to one `ImportedDocument` and may create `DerivedExtractionArtifact` records only after successful validation of parser output.

**Validation Rules**: Must enforce 512 MiB initial memory limit and 3-minute foreground timeout. On memory excess or timeout, the process is terminated, no review draft is created from abrupt partial output, and source-reconstructing artifacts for the failed attempt are cleaned up.

## ResumeSemanticParserProvider

Application boundary implemented by provider adapters, not a persisted domain entity.

**Contract Fields**: `providerKind`, `capabilities`, `connectionState`, `inspectConnection()`, `startLogin()`, `observeLogin()`, `cancelLogin()`, `completeLogin()`, `logout()`, `reconnect()`, `parse(request)`.

**Validation Rules**: The import domain depends only on this boundary and the versioned Nuvitae extraction response. Adapters must not expose provider SDKs, provider-native JSON, prompts, credentials, auth files, access tokens, refresh tokens, backend routes, required headers, or session material to the domain. For the Community MVP, `CodexDirectProviderAdapter` behind an isolated `CodexOAuthBroker` is the production primary semantic path and the one authoritative parsing path; production Codex adapter implementation still remains blocked until the direct-OAuth compatibility spike records a GO or qualifying CONDITIONAL GO and its mandatory conditions (T164/T165) are satisfied. The provider abstraction remains a boundary, not a mandate to ship multiple production adapters in the MVP.
