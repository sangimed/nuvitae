export type ImportId = string;
export type UserId = string;
export type ArtifactId = string;
export type ImportDraftId = string;
export type FieldId = string;
export type WarningId = string;
export type StructuredResumeId = string;
export type DeletionJobId = string;

export type SupportedDocumentFormat = "pdf" | "docx";
export type DocumentFormat = SupportedDocumentFormat | "unsupported";
export type SupportedLanguage =
  "english" | "french" | "bilingual_french_english";
export type DetectedLanguage = SupportedLanguage | "unsupported" | "unknown";

export type UploadStatus = "pending_upload" | "uploaded" | "cancelled";
export type ValidationStatus =
  "not_started" | "validating" | "accepted" | "rejected";
export type ProcessingStatus =
  | "not_started"
  | "queued"
  | "processing"
  | "ready_for_review"
  | "timeout_partial"
  | "failed"
  | "cancelled"
  | "expired";

export type ImportDraftStatus =
  | "preparing"
  | "review_required"
  | "ready_to_confirm"
  | "confirmed"
  | "discarded"
  | "cancelled"
  | "expired"
  | "source_deleted_limited_review";

export type ArtifactType =
  | "uploaded_source"
  | "extracted_raw_text"
  | "field_source_snippet"
  | "page_reference"
  | "thumbnail"
  | "temporary_file"
  | "cached_parser_output"
  | "future_ocr_output"
  | "embedding"
  | "temporary_contact_preview"
  | "equivalent_source_reconstructing_artifact";

export type SourceDeletionStatus =
  | "not_scheduled"
  | "scheduled_for_deletion"
  | "deleting"
  | "deleted"
  | "failed";

export type DeletionReason =
  | "user_deleted_source"
  | "user_cancelled_import"
  | "user_discarded_import"
  | "draft_expired"
  | "retention_deadline";

export type DeletionJobStatus =
  "scheduled" | "running" | "completed" | "failed";
export type DeletionVerificationStatus =
  "not_started" | "verified" | "partially_failed" | "failed";
export type DeletedArtifactVerification =
  "removed" | "already_absent" | "failed";

export type RecoverableFailureCategory =
  | "unsupported_format"
  | "unsupported_language"
  | "empty_document"
  | "malformed_document"
  | "corrupted_document"
  | "password_protected"
  | "encrypted_document"
  | "image_only_or_scanned"
  | "no_selectable_text"
  | "oversized_file"
  | "over_page_limit"
  | "unsafe_content"
  | "ambiguous_mixed_content"
  | "no_supported_field"
  | "processing_timeout"
  | "parser_memory_limit"
  | "resource_limit"
  | "cancelled"
  | "unexpected_failure";

export type ResumeSection =
  | "personal"
  | "contact"
  | "headline"
  | "summary"
  | "work_experience"
  | "education"
  | "skills"
  | "languages"
  | "projects"
  | "certifications"
  | "professional_links";

export type FieldSourceStatus =
  | "explicit_source"
  | "inferred"
  | "user_added"
  | "user_edited"
  | "source_deleted_minimal_provenance";

export type InferenceStatus =
  "not_inferred" | "inferred_needs_review" | "confirmed_inference";
export type ConfidenceCategory = "high" | "medium" | "low" | "not_applicable";
export type FieldReviewStatus =
  "unreviewed" | "confirmed" | "edited" | "excluded" | "intentionally_left";
export type WarningReviewState =
  "needs_review" | "confirmed" | "edited" | "excluded" | "intentionally_left";

export type WarningType =
  | "missing"
  | "ambiguous"
  | "conflicting"
  | "duplicate"
  | "low_confidence"
  | "unsupported"
  | "unsafe"
  | "incomplete"
  | "inferred"
  | "partial"
  | "mixed_content"
  | "expired_source";

export type WarningSeverity = "info" | "needs_attention" | "blocking";

export interface PdfBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly unit: "pdf_point";
}

export interface PdfSourceLocation {
  readonly kind: "pdf";
  readonly pageNumber: number;
  readonly textItemIndex: number;
  readonly boundingBox: PdfBoundingBox;
}

export interface DocxSourceLocation {
  readonly kind: "docx";
  readonly packagePart: string;
  readonly paragraphIndex: number;
  readonly tableIndex?: number;
  readonly rowIndex?: number;
  readonly cellIndex?: number;
  readonly runIndex: number;
  readonly characterOffsetStart: number;
  readonly characterOffsetEnd: number;
}

export interface MinimalImportProvenance {
  readonly kind: "minimal";
  readonly label: "imported_from_initial_resume";
  readonly confirmedByUser: boolean;
  readonly sourceDeletedAt?: Date;
}

export type SourceLocation =
  PdfSourceLocation | DocxSourceLocation | MinimalImportProvenance;

export type ExtractedValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "text_list"; readonly values: readonly string[] }
  | { readonly kind: "date"; readonly value: ResumeDate }
  | {
      readonly kind: "date_range";
      readonly startDate?: ResumeDate;
      readonly endDate?: ResumeDate;
      readonly isOngoing: boolean;
    }
  | { readonly kind: "link"; readonly label?: string; readonly url: string }
  | {
      readonly kind: "language";
      readonly name: string;
      readonly proficiency?: string;
    };

export interface ResumeDate {
  readonly year: number;
  readonly month?: number;
  readonly precision: "year" | "month" | "day";
  readonly originalText?: string;
}

export interface ImportedDocument {
  readonly id: ImportId;
  readonly ownerUserId: UserId;
  readonly visibleFilename: string;
  readonly contentType: string;
  readonly fileExtension: DocumentFormat;
  readonly sizeBytes: number;
  readonly renderedPageCount?: number;
  readonly detectedLanguage?: DetectedLanguage;
  readonly storageKey?: string;
  readonly uploadStatus: UploadStatus;
  readonly validationStatus: ValidationStatus;
  readonly processingStatus: ProcessingStatus;
  readonly deletionStatus: SourceDeletionStatus;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface DerivedExtractionArtifact {
  readonly id: ArtifactId;
  readonly importedDocumentId: ImportId;
  readonly ownerUserId: UserId;
  readonly artifactType: ArtifactType;
  readonly storageKey: string;
  readonly containsSourceReconstructingData: boolean;
  readonly deletionStatus: SourceDeletionStatus;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface ExtractedField {
  readonly id: FieldId;
  readonly importDraftId: ImportDraftId;
  readonly section: ResumeSection;
  readonly fieldPath: string;
  readonly value: ExtractedValue;
  readonly normalizedValue?: ExtractedValue;
  readonly sourceStatus: FieldSourceStatus;
  readonly sourceLocation?: SourceLocation;
  readonly confidenceStatus: ConfidenceCategory;
  readonly inferenceStatus: InferenceStatus;
  readonly reviewStatus: FieldReviewStatus;
  readonly warningId?: WarningId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ImportWarning {
  readonly id: WarningId;
  readonly importDraftId: ImportDraftId;
  readonly warningType: WarningType;
  readonly section: ResumeSection;
  readonly fieldPath?: string;
  readonly message: string;
  readonly severity: WarningSeverity;
  readonly reviewStatus: WarningReviewState;
  readonly requiresResolution: boolean;
  readonly createdAt: Date;
  readonly resolvedAt?: Date;
}

export interface ImportDraft {
  readonly id: ImportDraftId;
  readonly importedDocumentId: ImportId;
  readonly ownerUserId: UserId;
  readonly status: ImportDraftStatus;
  readonly reviewRevision: number;
  readonly fields: readonly ExtractedField[];
  readonly warnings: readonly ImportWarning[];
  readonly createdAt: Date;
  readonly lastReviewedAt?: Date;
  readonly retentionExpiresAt: Date;
  readonly confirmedAt?: Date;
  readonly discardedAt?: Date;
  readonly expiredAt?: Date;
}

export interface TemporaryContactPreview {
  readonly id: string;
  readonly importedDocumentId: ImportId;
  readonly ownerUserId: UserId;
  readonly contactFields: readonly ExtractedField[];
  readonly unsupportedLanguageWarning: ImportWarning;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly status:
    | "created"
    | "awaiting_user_confirmation"
    | "transferred_to_manual_entry"
    | "discarded";
  readonly confirmedForManualTransferAt?: Date;
  readonly deletedAt?: Date;
}

export interface WorkExperienceRole {
  readonly id: string;
  readonly title: string;
  readonly location?: string;
  readonly startDate?: ResumeDate;
  readonly endDate?: ResumeDate;
  readonly isOngoing: boolean;
  readonly responsibilities: readonly SourcedText[];
  readonly achievements: readonly SourcedText[];
  readonly sourceStatus: FieldSourceStatus;
  readonly reviewStatus: FieldReviewStatus;
  readonly inferenceStatus: InferenceStatus;
}

export interface WorkExperience {
  readonly id: string;
  readonly employerName: string;
  readonly employerLocation?: string;
  readonly roles: readonly WorkExperienceRole[];
  readonly reviewStatus: FieldReviewStatus;
  readonly inferenceStatus: InferenceStatus;
}

export interface Education {
  readonly id: string;
  readonly institution: SourcedText;
  readonly credential?: SourcedText;
  readonly fieldOfStudy?: SourcedText;
  readonly location?: SourcedText;
  readonly startDate?: ResumeDate;
  readonly endDate?: ResumeDate;
  readonly reviewStatus: FieldReviewStatus;
}

export interface Skill {
  readonly id: string;
  readonly name: SourcedText;
  readonly category?: string;
  readonly reviewStatus: FieldReviewStatus;
}

export interface LanguageSkill {
  readonly id: string;
  readonly name: SourcedText;
  readonly proficiency?: SourcedText;
  readonly reviewStatus: FieldReviewStatus;
}

export interface Project {
  readonly id: string;
  readonly name: SourcedText;
  readonly description?: SourcedText;
  readonly links: readonly ProfessionalLink[];
  readonly reviewStatus: FieldReviewStatus;
}

export interface Certification {
  readonly id: string;
  readonly name: SourcedText;
  readonly issuer?: SourcedText;
  readonly issuedAt?: ResumeDate;
  readonly expiresAt?: ResumeDate;
  readonly reviewStatus: FieldReviewStatus;
}

export interface ProfessionalLink {
  readonly id: string;
  readonly label?: string;
  readonly url: SourcedText;
  readonly reviewStatus: FieldReviewStatus;
}

export interface SourcedText {
  readonly value: string;
  readonly sourceStatus: FieldSourceStatus;
  readonly sourceLocation?: SourceLocation;
  readonly confidenceStatus: ConfidenceCategory;
  readonly inferenceStatus: InferenceStatus;
}

export interface StructuredResumeContent {
  readonly personal: readonly SourcedText[];
  readonly contact: readonly SourcedText[];
  readonly headline?: SourcedText;
  readonly summary?: SourcedText;
  readonly workExperiences: readonly WorkExperience[];
  readonly education: readonly Education[];
  readonly skills: readonly Skill[];
  readonly languages: readonly LanguageSkill[];
  readonly projects: readonly Project[];
  readonly certifications: readonly Certification[];
  readonly professionalLinks: readonly ProfessionalLink[];
}

export interface StructuredResume {
  readonly id: StructuredResumeId;
  readonly ownerUserId: UserId;
  readonly sourceImportDraftId?: ImportDraftId;
  readonly provenanceLabel: "imported_from_initial_resume" | "manual_entry";
  readonly confirmationStatus: "confirmed";
  readonly content: StructuredResumeContent;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date;
}

export interface ManualStructuredResumeDraft {
  readonly id: string;
  readonly ownerUserId: UserId;
  readonly source: "manual_entry" | "unsupported_language_contact_transfer";
  readonly status: "editing" | "confirmed" | "discarded";
  readonly content: StructuredResumeContent;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly confirmedAt?: Date;
  readonly deletedAt?: Date;
}

export interface UserCorrection {
  readonly id: string;
  readonly importDraftId: ImportDraftId;
  readonly targetType:
    "extracted_field" | "import_warning" | "section" | "work_experience_role";
  readonly targetId: string;
  readonly action:
    "confirm" | "edit" | "remove" | "add" | "exclude" | "intentionally_leave";
  readonly previousValue?: ExtractedValue;
  readonly newValue?: ExtractedValue;
  readonly createdAt: Date;
  readonly createdByUserId: UserId;
}

export interface DeletionVerificationSummary {
  readonly sourceDocument: DeletedArtifactVerification;
  readonly extractedRawText: DeletedArtifactVerification;
  readonly fieldSourceSnippets: DeletedArtifactVerification;
  readonly pageReferences: DeletedArtifactVerification;
  readonly thumbnails: DeletedArtifactVerification;
  readonly temporaryFiles: DeletedArtifactVerification;
  readonly cachedParserOutputs: DeletedArtifactVerification;
  readonly futureOcrOutputs: DeletedArtifactVerification;
  readonly embeddings: DeletedArtifactVerification;
  readonly equivalentArtifacts: DeletedArtifactVerification;
}

export interface DeletionJob {
  readonly id: DeletionJobId;
  readonly importedDocumentId: ImportId;
  readonly ownerUserId: UserId;
  readonly reason: DeletionReason;
  readonly status: DeletionJobStatus;
  readonly scheduledAt: Date;
  readonly completedAt?: Date;
  readonly verificationStatus: DeletionVerificationStatus;
  readonly verificationSummary?: DeletionVerificationSummary;
}
