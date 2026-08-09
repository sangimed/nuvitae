import { Check, Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

@Entity({ name: "ai_provider_runtime_connections" })
@Unique("uq_ai_provider_runtime_connections_id_owner", ["id", "ownerUserId"])
@Index(
  "uq_ai_provider_runtime_connections_active_provider",
  ["ownerUserId", "providerKind"],
  { unique: true, where: "deleted_at IS NULL" },
)
@Index("idx_ai_provider_runtime_connections_owner_status", [
  "ownerUserId",
  "connectionStatus",
])
@Index("idx_ai_provider_runtime_connections_owner_created", [
  "ownerUserId",
  "createdAt",
])
@Check(
  "ck_ai_provider_runtime_connections_connection_status",
  "connection_status IN ('not_configured', 'login_pending', 'connected', 'login_cancelled', 'disconnected', 'authentication_expired', 'authentication_revoked')",
)
@Check(
  "ck_ai_provider_runtime_connections_authentication_status",
  "authentication_status IN ('unauthenticated', 'pending', 'authenticated', 'expired', 'revoked', 'unknown')",
)
@Check(
  "ck_ai_provider_runtime_connections_availability_status",
  "availability_status IN ('available', 'unavailable', 'rate_limited', 'quota_exceeded', 'unsupported_capability', 'unknown')",
)
@Check(
  "ck_ai_provider_runtime_connections_session_ref",
  "session_ref IS NULL OR session_ref ~ '^[a-f0-9]{64}$'",
)
@Check(
  "ck_ai_provider_runtime_connections_no_raw_storage_paths",
  "accepts_raw_storage_paths IS NULL OR accepts_raw_storage_paths = false",
)
@Check(
  "ck_ai_provider_runtime_connections_no_credential_exposure",
  "exposes_credentials_to_domain IS NULL OR exposes_credentials_to_domain = false",
)
@Check(
  "ck_ai_provider_runtime_connections_no_physical_coordinates",
  "predicts_physical_coordinates IS NULL OR predicts_physical_coordinates = false",
)
@Check(
  "ck_ai_provider_runtime_connections_capability_limits",
  "(max_request_json_bytes IS NULL OR max_request_json_bytes > 0) AND (max_response_json_bytes IS NULL OR max_response_json_bytes > 0) AND (max_timeout_ms IS NULL OR max_timeout_ms > 0)",
)
@Check(
  "ck_ai_provider_runtime_connections_capability_coherent",
  "(capability_snapshot_at IS NOT NULL AND supported_document_formats IS NOT NULL AND supported_document_languages IS NOT NULL AND supports_non_interactive_parsing IS NOT NULL AND supports_structured_json IS NOT NULL AND supports_canonical_flattened_evidence IS NOT NULL AND accepts_normalized_transcript IS NOT NULL AND accepts_raw_storage_paths IS NOT NULL AND exposes_credentials_to_domain IS NOT NULL AND predicts_physical_coordinates IS NOT NULL AND max_request_json_bytes IS NOT NULL AND max_response_json_bytes IS NOT NULL AND max_timeout_ms IS NOT NULL) OR capability_snapshot_at IS NULL",
)
@Check(
  "ck_ai_provider_runtime_connections_lifecycle_timestamps",
  "(revoked_at IS NULL OR revoked_at >= created_at) AND (deleted_at IS NULL OR deleted_at >= created_at) AND (refreshed_at IS NULL OR connected_at IS NULL OR refreshed_at >= connected_at) AND (disconnected_at IS NULL OR connected_at IS NULL OR disconnected_at >= connected_at) AND (expires_at IS NULL OR connected_at IS NULL OR expires_at >= connected_at) AND (connected_at IS NULL OR login_started_at IS NULL OR connected_at >= login_started_at)",
)
@Check(
  "ck_ai_provider_runtime_connections_revocation_metadata",
  "(revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)",
)
@Check(
  "ck_ai_provider_runtime_connections_deletion_metadata",
  "(deleted_at IS NULL AND deletion_reason IS NULL) OR (deleted_at IS NOT NULL AND deletion_reason IS NOT NULL)",
)
@Check(
  "ck_ai_provider_runtime_connections_revocation_reason",
  "revocation_reason IS NULL OR revocation_reason IN ('user_revoked', 'provider_revoked', 'security', 'expired', 'replaced')",
)
@Check(
  "ck_ai_provider_runtime_connections_deletion_reason",
  "deletion_reason IS NULL OR deletion_reason IN ('user_deleted', 'replaced', 'cleanup')",
)
export class AIProviderRuntimeConnectionEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_ai_provider_runtime_connections",
  })
  id!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "provider_kind", length: 64 })
  providerKind!: string;

  @Column("varchar", { name: "display_name", length: 120, nullable: true })
  displayName!: string | null;

  @Column("varchar", { name: "connection_status", length: 32 })
  connectionStatus!: string;

  @Column("varchar", { name: "authentication_status", length: 32 })
  authenticationStatus!: string;

  @Column("varchar", { name: "availability_status", length: 32 })
  availabilityStatus!: string;

  @Column("varchar", { name: "session_ref", length: 64, nullable: true })
  sessionReference!: string | null;

  @Column("jsonb", { name: "supported_document_formats", nullable: true })
  supportedDocumentFormats!: string[] | null;

  @Column("jsonb", { name: "supported_document_languages", nullable: true })
  supportedDocumentLanguages!: string[] | null;

  @Column("boolean", {
    name: "supports_non_interactive_parsing",
    nullable: true,
  })
  supportsNonInteractiveParsing!: boolean | null;

  @Column("boolean", { name: "supports_structured_json", nullable: true })
  supportsStructuredJson!: boolean | null;

  @Column("boolean", {
    name: "supports_canonical_flattened_evidence",
    nullable: true,
  })
  supportsCanonicalFlattenedEvidence!: boolean | null;

  @Column("boolean", { name: "accepts_normalized_transcript", nullable: true })
  acceptsNormalizedTranscript!: boolean | null;

  @Column("boolean", { name: "accepts_raw_storage_paths", nullable: true })
  acceptsRawStoragePaths!: boolean | null;

  @Column("boolean", { name: "exposes_credentials_to_domain", nullable: true })
  exposesCredentialsToDomain!: boolean | null;

  @Column("boolean", { name: "predicts_physical_coordinates", nullable: true })
  predictsPhysicalCoordinates!: boolean | null;

  @Column("integer", { name: "max_request_json_bytes", nullable: true })
  maxRequestJsonBytes!: number | null;

  @Column("integer", { name: "max_response_json_bytes", nullable: true })
  maxResponseJsonBytes!: number | null;

  @Column("integer", { name: "max_timeout_ms", nullable: true })
  maxTimeoutMs!: number | null;

  @Column("timestamptz", { name: "capability_snapshot_at", nullable: true })
  capabilitySnapshotAt!: Date | null;

  @Column("timestamptz", { name: "last_checked_at", nullable: true })
  lastCheckedAt!: Date | null;

  @Column("timestamptz", { name: "login_started_at", nullable: true })
  loginStartedAt!: Date | null;

  @Column("timestamptz", { name: "connected_at", nullable: true })
  connectedAt!: Date | null;

  @Column("timestamptz", { name: "refreshed_at", nullable: true })
  refreshedAt!: Date | null;

  @Column("timestamptz", { name: "expires_at", nullable: true })
  expiresAt!: Date | null;

  @Column("timestamptz", { name: "disconnected_at", nullable: true })
  disconnectedAt!: Date | null;

  @Column("timestamptz", { name: "revoked_at", nullable: true })
  revokedAt!: Date | null;

  @Column("varchar", { name: "revocation_reason", length: 32, nullable: true })
  revocationReason!: string | null;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column("timestamptz", { name: "deleted_at", nullable: true })
  deletedAt!: Date | null;

  @Column("varchar", { name: "deletion_reason", length: 32, nullable: true })
  deletionReason!: string | null;
}
