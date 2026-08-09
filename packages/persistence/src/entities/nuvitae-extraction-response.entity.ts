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
import { SemanticParseAttemptEntity } from "./semantic-parse-attempt.entity.js";

@Entity({ name: "nuvitae_extraction_responses" })
@Unique("uq_nuvitae_extraction_responses_id_owner", ["id", "ownerUserId"])
@Unique("uq_nuvitae_extraction_responses_attempt", ["semanticParseAttemptId"])
@Index("idx_nuvitae_extraction_responses_owner_attempt", [
  "ownerUserId",
  "semanticParseAttemptId",
])
@Check(
  "ck_nuvitae_extraction_responses_retention",
  "retention_expires_at > created_at",
)
@Check(
  "ck_nuvitae_extraction_responses_schema_version",
  "schema_version = 'nuvitae.semantic-extraction.v1'",
)
@Check(
  "ck_nuvitae_extraction_responses_validation_status",
  "validation_status IN ('accepted', 'rejected', 'requires_review')",
)
export class NuvitaeExtractionResponseEntity {
  @PrimaryColumn("uuid", {
    name: "id",
    primaryKeyConstraintName: "pk_nuvitae_extraction_responses",
  })
  id!: string;

  @Column("uuid", { name: "semantic_parse_attempt_id" })
  semanticParseAttemptId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "schema_version", length: 64 })
  schemaVersion!: string;

  @Column("varchar", { name: "validation_status", length: 32 })
  validationStatus!: string;

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
      foreignKeyConstraintName: "fk_nuvitae_extraction_responses_owner_attempt",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  semanticParseAttempt!: SemanticParseAttemptEntity;
}
