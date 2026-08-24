import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import type {
  DeletionVerificationSummary,
  ExtractedValue,
  ResumeDate,
  SourceLocation,
  StructuredResumeContent,
} from "@nuvitae/domain";

const timestampColumn = { type: "timestamptz" as const };

@Entity({ name: "imported_documents" })
@Unique("uq_imported_documents_id_owner", ["id", "ownerUserId"])
@Index("idx_imported_documents_owner_created", ["ownerUserId", "createdAt"])
@Index("idx_imported_documents_owner_status", [
  "ownerUserId",
  "processingStatus",
])
@Check("ck_imported_documents_size_positive", "size_bytes > 0")
@Check(
  "ck_imported_documents_page_count_positive",
  "rendered_page_count IS NULL OR rendered_page_count > 0",
)
@Check("ck_imported_documents_retention", "retention_expires_at > created_at")
@Check(
  "ck_imported_documents_deleted_at",
  "(deletion_status = 'deleted' AND deleted_at IS NOT NULL) OR deletion_status <> 'deleted'",
)
@Check(
  "ck_imported_documents_upload_status",
  "upload_status IN ('pending_upload', 'uploaded', 'cancelled')",
)
@Check(
  "ck_imported_documents_validation_status",
  "validation_status IN ('not_started', 'validating', 'accepted', 'rejected')",
)
@Check(
  "ck_imported_documents_processing_status",
  "processing_status IN ('not_started', 'queued', 'processing', 'semantic_parsing_pending', 'semantic_parsing_running', 'provider_unavailable', 'semantic_response_invalid', 'semantic_validation_failed', 'ready_for_review', 'timeout_partial', 'failed', 'cancelled', 'expired')",
)
@Check(
  "ck_imported_documents_deletion_status",
  "deletion_status IN ('not_scheduled', 'scheduled_for_deletion', 'deleting', 'deleted', 'failed')",
)
@Check(
  "ck_imported_documents_file_extension",
  "file_extension IN ('pdf', 'docx', 'unsupported')",
)
export class ImportedDocumentEntity {
  @PrimaryColumn("uuid", {
    name: "id",
    primaryKeyConstraintName: "pk_imported_documents",
  })
  id!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "visible_filename", length: 255 })
  visibleFilename!: string;

  @Column("varchar", { name: "content_type", length: 127 })
  contentType!: string;

  @Column("varchar", { name: "file_extension", length: 16 })
  fileExtension!: string;

  @Column("bigint", { name: "size_bytes" })
  sizeBytes!: string;

  @Column("integer", { name: "rendered_page_count", nullable: true })
  renderedPageCount!: number | null;

  @Column("varchar", { name: "detected_language", length: 64, nullable: true })
  detectedLanguage!: string | null;

  @Column("varchar", { name: "storage_key", length: 1024, nullable: true })
  storageKey!: string | null;

  @Column("varchar", { name: "upload_status", length: 32 })
  uploadStatus!: string;

  @Column("varchar", { name: "validation_status", length: 32 })
  validationStatus!: string;

  @Column("varchar", { name: "processing_status", length: 32 })
  processingStatus!: string;

  @Column("varchar", { name: "deletion_status", length: 32 })
  deletionStatus!: string;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({ ...timestampColumn, name: "deleted_at", nullable: true })
  deletedAt!: Date | null;
}

@Entity({ name: "derived_extraction_artifacts" })
@Unique("uq_derived_artifacts_id_owner", ["id", "ownerUserId"])
@Index("idx_derived_artifacts_owner_import", [
  "ownerUserId",
  "importedDocumentId",
])
@Unique("uq_derived_artifacts_owner_storage_key", ["ownerUserId", "storageKey"])
@Check("ck_derived_artifacts_retention", "retention_expires_at > created_at")
export class DerivedExtractionArtifactEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_derived_extraction_artifacts",
  })
  id!: string;

  @Column("uuid", { name: "imported_document_id" })
  importedDocumentId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "artifact_type", length: 64 })
  artifactType!: string;

  @Column("varchar", { name: "storage_key", length: 1024 })
  storageKey!: string;

  @Column("boolean", { name: "contains_source_reconstructing_data" })
  containsSourceReconstructingData!: boolean;

  @Column("varchar", { name: "deletion_status", length: 32 })
  deletionStatus!: string;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({ ...timestampColumn, name: "deleted_at", nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => ImportedDocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "imported_document_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_derived_artifacts_owner_document",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importedDocument!: ImportedDocumentEntity;
}

@Entity({ name: "import_drafts" })
@Unique("uq_import_drafts_id_owner", ["id", "ownerUserId"])
@Unique("uq_import_drafts_owner_document", [
  "ownerUserId",
  "importedDocumentId",
])
@Index("idx_import_drafts_owner_status", ["ownerUserId", "status"])
@Check("ck_import_drafts_retention", "retention_expires_at > created_at")
@Check("ck_import_drafts_review_revision", "review_revision >= 0")
@Check(
  "ck_import_drafts_status",
  "status IN ('preparing', 'review_required', 'ready_to_confirm', 'confirmed', 'discarded', 'cancelled', 'expired', 'source_deleted_limited_review')",
)
@Check(
  "ck_import_drafts_confirmation",
  "(status = 'confirmed' AND confirmed_at IS NOT NULL) OR status <> 'confirmed'",
)
export class ImportDraftEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_import_drafts" })
  id!: string;

  @Column("uuid", { name: "imported_document_id" })
  importedDocumentId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { length: 48 })
  status!: string;

  @Column("integer", { name: "review_revision" })
  reviewRevision!: number;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "last_reviewed_at", nullable: true })
  lastReviewedAt!: Date | null;

  @Column({ ...timestampColumn, name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({ ...timestampColumn, name: "confirmed_at", nullable: true })
  confirmedAt!: Date | null;

  @Column({ ...timestampColumn, name: "discarded_at", nullable: true })
  discardedAt!: Date | null;

  @Column({ ...timestampColumn, name: "expired_at", nullable: true })
  expiredAt!: Date | null;

  @ManyToOne(() => ImportedDocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "imported_document_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_import_drafts_owner_document",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importedDocument!: ImportedDocumentEntity;
}

@Entity({ name: "import_warnings" })
@Unique("uq_import_warnings_id_draft", ["id", "importDraftId"])
@Index("idx_import_warnings_draft_review", ["importDraftId", "reviewStatus"])
@Check(
  "ck_import_warnings_resolution",
  "(review_status = 'needs_review' AND resolved_at IS NULL) OR review_status <> 'needs_review'",
)
@Check(
  "ck_import_warnings_review_status",
  "review_status IN ('needs_review', 'confirmed', 'edited', 'excluded', 'intentionally_left')",
)
export class ImportWarningEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_import_warnings" })
  id!: string;

  @Column("uuid", { name: "import_draft_id" })
  importDraftId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "warning_type", length: 32 })
  warningType!: string;

  @Column("varchar", { length: 32 })
  section!: string;

  @Column("varchar", { name: "field_path", length: 512, nullable: true })
  fieldPath!: string | null;

  @Column("text")
  message!: string;

  @Column("varchar", { length: 32 })
  severity!: string;

  @Column("varchar", { name: "review_status", length: 32 })
  reviewStatus!: string;

  @Column("boolean", { name: "requires_resolution" })
  requiresResolution!: boolean;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "resolved_at", nullable: true })
  resolvedAt!: Date | null;

  @ManyToOne(() => ImportDraftEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "import_draft_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_import_warnings_owner_draft",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importDraft!: ImportDraftEntity;
}

@Entity({ name: "extracted_fields" })
@Unique("uq_extracted_fields_draft_path_order", [
  "importDraftId",
  "fieldPath",
  "position",
])
@Index("idx_extracted_fields_draft_section", ["importDraftId", "section"])
@Check("ck_extracted_fields_position", "position >= 0")
export class ExtractedFieldEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_extracted_fields" })
  id!: string;

  @Column("uuid", { name: "import_draft_id" })
  importDraftId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("integer")
  position!: number;

  @Column("varchar", { length: 32 })
  section!: string;

  @Column("varchar", { name: "field_path", length: 512 })
  fieldPath!: string;

  @Column("jsonb")
  value!: ExtractedValue;

  @Column("jsonb", { name: "normalized_value", nullable: true })
  normalizedValue!: ExtractedValue | null;

  @Column("varchar", { name: "source_status", length: 48 })
  sourceStatus!: string;

  @Column("jsonb", { name: "source_location", nullable: true })
  sourceLocation!: SourceLocation | null;

  @Column("varchar", { name: "confidence_status", length: 32 })
  confidenceStatus!: string;

  @Column("varchar", { name: "inference_status", length: 32 })
  inferenceStatus!: string;

  @Column("varchar", { name: "review_status", length: 32 })
  reviewStatus!: string;

  @Column("uuid", { name: "warning_id", nullable: true })
  warningId!: string | null;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "updated_at" })
  updatedAt!: Date;

  @ManyToOne(() => ImportDraftEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "import_draft_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_extracted_fields_owner_draft",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importDraft!: ImportDraftEntity;

  @ManyToOne(() => ImportWarningEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn([
    {
      name: "warning_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_extracted_fields_warning_draft",
    },
    { name: "import_draft_id", referencedColumnName: "importDraftId" },
  ])
  warning!: ImportWarningEntity | null;
}

@Entity({ name: "temporary_contact_previews" })
@Unique("uq_contact_previews_id_owner", ["id", "ownerUserId"])
@Unique("uq_contact_previews_owner_document", [
  "ownerUserId",
  "importedDocumentId",
])
@Check("ck_contact_previews_retention", "retention_expires_at > created_at")
@Check(
  "ck_contact_previews_status",
  "status IN ('created', 'awaiting_user_confirmation', 'transferred_to_manual_entry', 'discarded')",
)
export class TemporaryContactPreviewEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_temporary_contact_previews",
  })
  id!: string;

  @Column("uuid", { name: "imported_document_id" })
  importedDocumentId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { length: 48 })
  status!: string;

  @Column("varchar", { name: "warning_type", length: 32 })
  warningType!: string;

  @Column("text", { name: "warning_message" })
  warningMessage!: string;

  @Column("varchar", { name: "warning_severity", length: 32 })
  warningSeverity!: string;

  @Column("varchar", { name: "warning_review_status", length: 32 })
  warningReviewStatus!: string;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({
    ...timestampColumn,
    name: "confirmed_for_manual_transfer_at",
    nullable: true,
  })
  confirmedForManualTransferAt!: Date | null;

  @Column({ ...timestampColumn, name: "deleted_at", nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => ImportedDocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "imported_document_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_contact_previews_owner_document",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importedDocument!: ImportedDocumentEntity;
}

@Entity({ name: "temporary_contact_fields" })
@Unique("uq_temporary_contact_fields_order", [
  "temporaryContactPreviewId",
  "fieldPath",
  "position",
])
@Check("ck_temporary_contact_fields_position", "position >= 0")
export class TemporaryContactFieldEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_temporary_contact_fields",
  })
  id!: string;

  @Column("uuid", { name: "temporary_contact_preview_id" })
  temporaryContactPreviewId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("integer")
  position!: number;

  @Column("varchar", { name: "field_path", length: 512 })
  fieldPath!: string;

  @Column("jsonb")
  value!: ExtractedValue;

  @Column("jsonb", { name: "source_location" })
  sourceLocation!: SourceLocation;

  @Column("varchar", { name: "confidence_status", length: 32 })
  confidenceStatus!: string;

  @Column("varchar", { name: "review_status", length: 32 })
  reviewStatus!: string;

  @ManyToOne(() => TemporaryContactPreviewEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "temporary_contact_preview_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_temporary_contact_fields_owner_preview",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  temporaryContactPreview!: TemporaryContactPreviewEntity;
}

@Entity({ name: "user_corrections" })
@Index("idx_user_corrections_owner_draft", ["createdByUserId", "importDraftId"])
@Index("idx_user_corrections_owner_operation", ["createdByUserId", "id"])
export class UserCorrectionEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_user_corrections" })
  id!: string;

  @Column("uuid", { name: "import_draft_id" })
  importDraftId!: string;

  @Column("uuid", { name: "created_by_user_id" })
  createdByUserId!: string;

  @Column("varchar", { name: "target_type", length: 48 })
  targetType!: string;

  @Column("varchar", { name: "target_id", length: 512 })
  targetId!: string;

  @Column("varchar", { length: 32 })
  action!: string;

  @Column("jsonb", { name: "previous_value", nullable: true })
  previousValue!: ExtractedValue | null;

  @Column("jsonb", { name: "new_value", nullable: true })
  newValue!: ExtractedValue | null;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @ManyToOne(() => ImportDraftEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "import_draft_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_user_corrections_owner_draft",
    },
    { name: "created_by_user_id", referencedColumnName: "ownerUserId" },
  ])
  importDraft!: ImportDraftEntity;
}

@Entity({ name: "structured_resumes" })
@Unique("uq_structured_resumes_id_owner", ["id", "ownerUserId"])
@Unique("uq_structured_resumes_owner_source_draft", [
  "ownerUserId",
  "sourceImportDraftId",
])
@Index("idx_structured_resumes_owner_updated", ["ownerUserId", "updatedAt"])
export class StructuredResumeEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_structured_resumes" })
  id!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("uuid", { name: "source_import_draft_id", nullable: true })
  sourceImportDraftId!: string | null;

  @Column("varchar", { name: "provenance_label", length: 48 })
  provenanceLabel!: string;

  @Column("varchar", { name: "confirmation_status", length: 16 })
  confirmationStatus!: string;

  @Column("jsonb", { name: "section_order", nullable: true })
  sectionOrder!: StructuredResumeContent["sectionOrder"] | null;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "updated_at" })
  updatedAt!: Date;

  @Column({ ...timestampColumn, name: "deleted_at", nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => ImportDraftEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn([
    {
      name: "source_import_draft_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_structured_resumes_owner_draft",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  sourceImportDraft!: ImportDraftEntity | null;
}

@Entity({ name: "structured_resume_texts" })
@Unique("uq_structured_resume_texts_order", [
  "structuredResumeId",
  "section",
  "position",
])
@Check("ck_structured_resume_texts_position", "position >= 0")
export class StructuredResumeTextEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_structured_resume_texts",
  })
  id!: string;

  @Column("uuid", { name: "structured_resume_id" })
  structuredResumeId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { length: 32 })
  section!: string;

  @Column("integer")
  position!: number;

  @Column("text")
  value!: string;

  @Column("varchar", { name: "source_status", length: 48 })
  sourceStatus!: string;

  @Column("jsonb", { name: "source_location", nullable: true })
  sourceLocation!: SourceLocation | null;

  @Column("varchar", { name: "confidence_status", length: 32 })
  confidenceStatus!: string;

  @Column("varchar", { name: "inference_status", length: 32 })
  inferenceStatus!: string;

  @ManyToOne(() => StructuredResumeEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "structured_resume_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_structured_resume_texts_owner_resume",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  structuredResume!: StructuredResumeEntity;
}

@Entity({ name: "work_experiences" })
@Unique("uq_work_experiences_order", ["structuredResumeId", "position"])
@Unique("uq_work_experiences_id_resume", ["id", "structuredResumeId"])
@Check("ck_work_experiences_position", "position >= 0")
export class WorkExperienceEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_work_experiences" })
  id!: string;

  @Column("uuid", { name: "structured_resume_id" })
  structuredResumeId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("integer")
  position!: number;

  @Column("text", { name: "employer_name" })
  employerName!: string;

  @Column("text", { name: "employer_location", nullable: true })
  employerLocation!: string | null;

  @Column("varchar", { name: "review_status", length: 32 })
  reviewStatus!: string;

  @Column("varchar", { name: "inference_status", length: 32 })
  inferenceStatus!: string;

  @ManyToOne(() => StructuredResumeEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "structured_resume_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_work_experiences_owner_resume",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  structuredResume!: StructuredResumeEntity;
}

@Entity({ name: "work_experience_roles" })
@Unique("uq_work_roles_order", ["workExperienceId", "position"])
@Unique("uq_work_roles_id_resume", ["id", "structuredResumeId"])
@Check("ck_work_roles_position", "position >= 0")
@Check("ck_work_roles_ongoing_end_date", "NOT is_ongoing OR end_date IS NULL")
export class WorkExperienceRoleEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_work_experience_roles",
  })
  id!: string;

  @Column("uuid", { name: "work_experience_id" })
  workExperienceId!: string;

  @Column("uuid", { name: "structured_resume_id" })
  structuredResumeId!: string;

  @Column("integer")
  position!: number;

  @Column("text")
  title!: string;

  @Column("text", { nullable: true })
  location!: string | null;

  @Column("jsonb", { name: "start_date", nullable: true })
  startDate!: ResumeDate | null;

  @Column("jsonb", { name: "end_date", nullable: true })
  endDate!: ResumeDate | null;

  @Column("boolean", { name: "is_ongoing" })
  isOngoing!: boolean;

  @Column("varchar", { name: "source_status", length: 48 })
  sourceStatus!: string;

  @Column("varchar", { name: "review_status", length: 32 })
  reviewStatus!: string;

  @Column("varchar", { name: "inference_status", length: 32 })
  inferenceStatus!: string;

  @ManyToOne(() => WorkExperienceEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "work_experience_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_work_roles_experience_resume",
    },
    {
      name: "structured_resume_id",
      referencedColumnName: "structuredResumeId",
    },
  ])
  workExperience!: WorkExperienceEntity;
}

@Entity({ name: "work_role_details" })
@Unique("uq_work_role_details_order", ["workRoleId", "kind", "position"])
@Check("ck_work_role_details_position", "position >= 0")
@Check("ck_work_role_details_kind", "kind IN ('responsibility', 'achievement')")
export class WorkRoleDetailEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_work_role_details" })
  id!: string;

  @Column("uuid", { name: "work_role_id" })
  workRoleId!: string;

  @Column("uuid", { name: "structured_resume_id" })
  structuredResumeId!: string;

  @Column("varchar", { length: 24 })
  kind!: "responsibility" | "achievement";

  @Column("integer")
  position!: number;

  @Column("text")
  value!: string;

  @Column("varchar", { name: "source_status", length: 48 })
  sourceStatus!: string;

  @Column("jsonb", { name: "source_location", nullable: true })
  sourceLocation!: SourceLocation | null;

  @Column("varchar", { name: "confidence_status", length: 32 })
  confidenceStatus!: string;

  @Column("varchar", { name: "inference_status", length: 32 })
  inferenceStatus!: string;

  @ManyToOne(() => WorkExperienceRoleEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "work_role_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_work_role_details_role_resume",
    },
    {
      name: "structured_resume_id",
      referencedColumnName: "structuredResumeId",
    },
  ])
  workRole!: WorkExperienceRoleEntity;
}

export type StructuredItemSection =
  | "education"
  | "skill"
  | "language"
  | "project"
  | "project_link"
  | "certification"
  | "professional_link";

@Entity({ name: "structured_resume_items" })
@Unique("uq_structured_resume_items_order", [
  "structuredResumeId",
  "section",
  "parentItemId",
  "position",
])
@Index(
  "uq_structured_resume_items_root_order",
  ["structuredResumeId", "section", "position"],
  { unique: true, where: "parent_item_id IS NULL" },
)
@Unique("uq_structured_resume_items_id_resume", ["id", "structuredResumeId"])
@Check("ck_structured_resume_items_position", "position >= 0")
@Check(
  "ck_structured_resume_items_section",
  "section IN ('education', 'skill', 'language', 'project', 'project_link', 'certification', 'professional_link')",
)
export class StructuredResumeItemEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_structured_resume_items",
  })
  id!: string;

  @Column("uuid", { name: "structured_resume_id" })
  structuredResumeId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("uuid", { name: "parent_item_id", nullable: true })
  parentItemId!: string | null;

  @Column("varchar", { length: 32 })
  section!: StructuredItemSection;

  @Column("integer")
  position!: number;

  @Column("text", { name: "primary_value" })
  primaryValue!: string;

  @Column("text", { name: "secondary_value", nullable: true })
  secondaryValue!: string | null;

  @Column("text", { name: "tertiary_value", nullable: true })
  tertiaryValue!: string | null;

  @Column("text", { name: "location_value", nullable: true })
  locationValue!: string | null;

  @Column("text", { nullable: true })
  url!: string | null;

  @Column("jsonb", { name: "start_date", nullable: true })
  startDate!: ResumeDate | null;

  @Column("jsonb", { name: "end_date", nullable: true })
  endDate!: ResumeDate | null;

  @Column("varchar", { name: "review_status", length: 32 })
  reviewStatus!: string;

  @Column("varchar", { name: "source_status", length: 48 })
  sourceStatus!: string;

  @Column("jsonb", { name: "source_location", nullable: true })
  sourceLocation!: SourceLocation | null;

  @Column("varchar", { name: "confidence_status", length: 32 })
  confidenceStatus!: string;

  @Column("varchar", { name: "inference_status", length: 32 })
  inferenceStatus!: string;

  @ManyToOne(() => StructuredResumeEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "structured_resume_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_structured_resume_items_owner_resume",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  structuredResume!: StructuredResumeEntity;

  @ManyToOne(() => StructuredResumeItemEntity, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn([
    {
      name: "parent_item_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_structured_resume_items_parent",
    },
    {
      name: "structured_resume_id",
      referencedColumnName: "structuredResumeId",
    },
  ])
  parentItem!: StructuredResumeItemEntity | null;
}

@Entity({ name: "deletion_jobs" })
@Unique("uq_deletion_jobs_id_owner", ["id", "ownerUserId"])
@Unique("uq_deletion_jobs_owner_document_reason", [
  "ownerUserId",
  "importedDocumentId",
  "reason",
])
@Index("idx_deletion_jobs_status_scheduled", ["status", "scheduledAt"])
@Check(
  "ck_deletion_jobs_completion",
  "(status = 'completed' AND completed_at IS NOT NULL) OR status <> 'completed'",
)
@Check(
  "ck_deletion_jobs_status",
  "status IN ('scheduled', 'running', 'completed', 'failed')",
)
export class DeletionJobEntity {
  @PrimaryColumn("uuid", { primaryKeyConstraintName: "pk_deletion_jobs" })
  id!: string;

  @Column("uuid", { name: "imported_document_id" })
  importedDocumentId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { length: 48 })
  reason!: string;

  @Column("varchar", { length: 24 })
  status!: string;

  @Column("timestamptz", { name: "scheduled_at" })
  scheduledAt!: Date;

  @Column({ ...timestampColumn, name: "completed_at", nullable: true })
  completedAt!: Date | null;

  @Column("varchar", { name: "verification_status", length: 32 })
  verificationStatus!: string;

  @Column("jsonb", { name: "verification_summary", nullable: true })
  verificationSummary!: DeletionVerificationSummary | null;

  @ManyToOne(() => ImportedDocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "imported_document_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_deletion_jobs_owner_document",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importedDocument!: ImportedDocumentEntity;
}

@Entity({ name: "manual_structured_resume_drafts" })
@Unique("uq_manual_drafts_id_owner", ["id", "ownerUserId"])
@Unique("uq_manual_drafts_owner_creation_key", ["ownerUserId", "creationKey"])
@Index("idx_manual_drafts_owner_updated", ["ownerUserId", "updatedAt"])
@Check(
  "ck_manual_drafts_source",
  "source IN ('manual_entry', 'unsupported_language_contact_transfer')",
)
@Check(
  "ck_manual_drafts_status",
  "status IN ('editing', 'confirmed', 'discarded')",
)
@Check(
  "ck_manual_drafts_creation_key_shape",
  "creation_key ~ '^[A-Za-z0-9._:-]{16,96}$'",
)
@Check("ck_manual_drafts_timestamp_order", "updated_at >= created_at")
@Check(
  "ck_manual_drafts_confirmation",
  "(status = 'confirmed' AND confirmed_at IS NOT NULL) OR status <> 'confirmed'",
)
export class ManualStructuredResumeDraftEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_manual_structured_resume_drafts",
  })
  id!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { length: 64 })
  source!: string;

  @Column("varchar", { length: 32 })
  status!: string;

  @Column("varchar", { name: "creation_key", length: 96 })
  creationKey!: string;

  @Column("jsonb")
  content!: StructuredResumeContent;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column({ ...timestampColumn, name: "updated_at" })
  updatedAt!: Date;

  @Column({ ...timestampColumn, name: "confirmed_at", nullable: true })
  confirmedAt!: Date | null;

  @Column({ ...timestampColumn, name: "deleted_at", nullable: true })
  deletedAt!: Date | null;
}

export const persistenceEntities = [
  ImportedDocumentEntity,
  DerivedExtractionArtifactEntity,
  ImportDraftEntity,
  ImportWarningEntity,
  ExtractedFieldEntity,
  TemporaryContactPreviewEntity,
  TemporaryContactFieldEntity,
  UserCorrectionEntity,
  StructuredResumeEntity,
  StructuredResumeTextEntity,
  WorkExperienceEntity,
  WorkExperienceRoleEntity,
  WorkRoleDetailEntity,
  StructuredResumeItemEntity,
  DeletionJobEntity,
  ManualStructuredResumeDraftEntity,
] as const;
