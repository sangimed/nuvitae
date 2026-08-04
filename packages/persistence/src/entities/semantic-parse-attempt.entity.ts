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
import { AIProviderRuntimeConnectionEntity } from "./ai-provider-runtime-connection.entity.js";
import { ImportedDocumentEntity } from "./import-resume.entities.js";

@Entity({ name: "semantic_parse_attempts" })
@Unique("uq_semantic_parse_attempts_id_owner", ["id", "ownerUserId"])
@Unique("uq_semantic_parse_attempts_processing_run", [
  "importedDocumentId",
  "ownerUserId",
  "providerKind",
  "startedAt",
])
@Index("idx_semantic_parse_attempts_owner_import", [
  "ownerUserId",
  "importedDocumentId",
])
@Index("idx_semantic_parse_attempts_owner_started", [
  "ownerUserId",
  "startedAt",
])
@Check(
  "ck_semantic_parse_attempts_retention",
  "retention_expires_at > created_at",
)
@Check(
  "ck_semantic_parse_attempts_status",
  "status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'malformed_output', 'invalid_evidence', 'provider_unavailable', 'auth_expired', 'rate_limited', 'quota_exceeded', 'cancelled')",
)
@Check(
  "ck_semantic_parse_attempts_input_representation",
  "input_representation IN ('normalized_transcript_flattened_fragments', 'plain_text')",
)
@Check("ck_semantic_parse_attempts_timeout_positive", "timeout_seconds > 0")
@Check(
  "ck_semantic_parse_attempts_latency_non_negative",
  "latency_ms IS NULL OR latency_ms >= 0",
)
@Check(
  "ck_semantic_parse_attempts_timestamp_order",
  "ended_at IS NULL OR ended_at >= started_at",
)
@Check(
  "ck_semantic_parse_attempts_supportability",
  "supportability_classification IS NULL OR supportability_classification IN ('officially_documented', 'verified_official_source', 'openclaw_or_hermes_behavior', 'undocumented_compatibility', 'experimentally_verified', 'inference')",
)
@Check(
  "ck_semantic_parse_attempts_response_schema_version",
  "response_schema_version IS NULL OR response_schema_version = 'nuvitae.semantic-extraction.v1'",
)
@Check(
  "ck_semantic_parse_attempts_validation_status",
  "(grounding_validation_status IS NULL OR grounding_validation_status IN ('passed', 'failed', 'requires_review', 'not_run')) AND (no_invention_validation_status IS NULL OR no_invention_validation_status IN ('passed', 'failed', 'requires_review', 'not_run'))",
)
export class SemanticParseAttemptEntity {
  @PrimaryColumn("uuid", {
    name: "id",
    primaryKeyConstraintName: "pk_semantic_parse_attempts",
  })
  id!: string;

  @Column("uuid", { name: "imported_document_id" })
  importedDocumentId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("uuid", {
    name: "provider_runtime_connection_id",
    nullable: true,
  })
  providerRuntimeConnectionId!: string | null;

  @Column("varchar", { name: "provider_kind", length: 64 })
  providerKind!: string;

  @Column("varchar", { name: "input_representation", length: 64 })
  inputRepresentation!: string;

  @Column("varchar", { length: 32 })
  status!: string;

  @Column("timestamptz", { name: "started_at" })
  startedAt!: Date;

  @Column({ name: "ended_at", type: "timestamptz", nullable: true })
  endedAt!: Date | null;

  @Column("integer", { name: "timeout_seconds" })
  timeoutSeconds!: number;

  @Column("varchar", { name: "failure_reason", length: 64, nullable: true })
  failureReason!: string | null;

  @Column("varchar", {
    name: "supportability_classification",
    length: 64,
    nullable: true,
  })
  supportabilityClassification!: string | null;

  @Column("varchar", {
    name: "response_schema_version",
    length: 64,
    nullable: true,
  })
  responseSchemaVersion!: string | null;

  @Column("varchar", {
    name: "grounding_validation_status",
    length: 32,
    nullable: true,
  })
  groundingValidationStatus!: string | null;

  @Column("varchar", {
    name: "no_invention_validation_status",
    length: 32,
    nullable: true,
  })
  noInventionValidationStatus!: string | null;

  @Column("integer", { name: "latency_ms", nullable: true })
  latencyMs!: number | null;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column("timestamptz", { name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => ImportedDocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "imported_document_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_semantic_parse_attempts_owner_document",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  importedDocument!: ImportedDocumentEntity;

  @ManyToOne(() => AIProviderRuntimeConnectionEntity, {
    onDelete: "NO ACTION",
    nullable: true,
  })
  @JoinColumn([
    {
      name: "provider_runtime_connection_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_semantic_parse_attempts_owner_connection",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  providerRuntimeConnection!: AIProviderRuntimeConnectionEntity | null;
}
