import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from "typeorm";
import { SemanticParseAttemptEntity } from "./semantic-parse-attempt.entity.js";

@Entity({ name: "provider_capability_snapshots" })
@Unique("uq_provider_capability_snapshots_id_owner", ["id", "ownerUserId"])
@Unique("uq_provider_capability_snapshots_attempt", ["semanticParseAttemptId"])
@Check(
  "ck_provider_capability_snapshots_retention",
  "retention_expires_at > created_at",
)
@Check(
  "ck_provider_capability_snapshots_no_raw_storage_paths",
  "accepts_raw_storage_paths = false",
)
@Check(
  "ck_provider_capability_snapshots_no_credential_exposure",
  "exposes_credentials_to_domain = false",
)
@Check(
  "ck_provider_capability_snapshots_no_physical_coordinates",
  "predicts_physical_coordinates = false",
)
@Check(
  "ck_provider_capability_snapshots_limits_positive",
  "max_request_json_bytes > 0 AND max_response_json_bytes > 0 AND max_timeout_ms > 0",
)
export class ProviderCapabilitySnapshotEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_provider_capability_snapshots",
  })
  id!: string;

  @Column("uuid", { name: "semantic_parse_attempt_id" })
  semanticParseAttemptId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "provider_kind", length: 64 })
  providerKind!: string;

  @Column("jsonb", { name: "supported_document_formats" })
  supportedDocumentFormats!: string[];

  @Column("jsonb", { name: "supported_document_languages" })
  supportedDocumentLanguages!: string[];

  @Column("boolean", { name: "supports_non_interactive_parsing" })
  supportsNonInteractiveParsing!: boolean;

  @Column("boolean", { name: "supports_structured_json" })
  supportsStructuredJson!: boolean;

  @Column("boolean", { name: "supports_canonical_flattened_evidence" })
  supportsCanonicalFlattenedEvidence!: boolean;

  @Column("boolean", { name: "accepts_normalized_transcript" })
  acceptsNormalizedTranscript!: boolean;

  @Column("boolean", { name: "accepts_raw_storage_paths" })
  acceptsRawStoragePaths!: boolean;

  @Column("boolean", { name: "exposes_credentials_to_domain" })
  exposesCredentialsToDomain!: boolean;

  @Column("boolean", { name: "predicts_physical_coordinates" })
  predictsPhysicalCoordinates!: boolean;

  @Column("integer", { name: "max_request_json_bytes" })
  maxRequestJsonBytes!: number;

  @Column("integer", { name: "max_response_json_bytes" })
  maxResponseJsonBytes!: number;

  @Column("integer", { name: "max_timeout_ms" })
  maxTimeoutMs!: number;

  @Column("timestamptz", { name: "snapshot_at" })
  snapshotAt!: Date;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column("timestamptz", { name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => SemanticParseAttemptEntity, { onDelete: "CASCADE" })
  @JoinColumn([
    {
      name: "semantic_parse_attempt_id",
      referencedColumnName: "id",
      foreignKeyConstraintName:
        "fk_provider_capability_snapshots_owner_attempt",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  semanticParseAttempt!: SemanticParseAttemptEntity;
}
