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
import { NuvitaeExtractionResponseEntity } from "./nuvitae-extraction-response.entity.js";

@Entity({ name: "evidence_records" })
@Unique("uq_evidence_records_id_owner", ["id", "ownerUserId"])
@Unique("uq_evidence_records_grounding_reference", [
  "responseId",
  "ownerUserId",
  "candidateId",
  "line",
  "start",
  "end",
  "fragmentHash",
])
@Index("idx_evidence_records_owner_response", ["ownerUserId", "responseId"])
@Check("ck_evidence_records_retention", "retention_expires_at > created_at")
@Check("ck_evidence_records_line_positive", "line >= 1")
@Check("ck_evidence_records_start_non_negative", "start >= 0")
@Check("ck_evidence_records_end_after_start", '"end" > start')
@Check(
  "ck_evidence_records_fragment_hash_shape",
  "fragment_hash ~ '^[a-f0-9]{64}$'",
)
@Check(
  "ck_evidence_records_classification",
  "classification IN ('explicit', 'inferred')",
)
@Check(
  "ck_evidence_records_confidence",
  "confidence_status IN ('high', 'medium', 'low', 'not_applicable')",
)
@Check(
  "ck_evidence_records_validation_status",
  "validation_status IN ('valid', 'invalid', 'unusable')",
)
export class EvidenceRecordEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_evidence_records",
  })
  id!: string;

  @Column("uuid", { name: "response_id" })
  responseId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "candidate_id", length: 120 })
  candidateId!: string;

  @Column("integer")
  line!: number;

  @Column("integer")
  start!: number;

  @Column("integer")
  end!: number;

  @Column("varchar", { name: "fragment_hash", length: 64 })
  fragmentHash!: string;

  @Column("varchar", { name: "fragment_id", length: 120, nullable: true })
  fragmentId!: string | null;

  @Column("varchar", { length: 16 })
  classification!: string;

  @Column("varchar", { name: "confidence_status", length: 32 })
  confidenceStatus!: string;

  @Column("varchar", { name: "validation_status", length: 32 })
  validationStatus!: string;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column("timestamptz", { name: "retention_expires_at" })
  retentionExpiresAt!: Date;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @ManyToOne(() => NuvitaeExtractionResponseEntity, {
    onDelete: "CASCADE",
  })
  @JoinColumn([
    {
      name: "response_id",
      referencedColumnName: "id",
      foreignKeyConstraintName: "fk_evidence_records_owner_response",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  response!: NuvitaeExtractionResponseEntity;
}
