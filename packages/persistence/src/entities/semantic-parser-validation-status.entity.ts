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

const validationStatusValue =
  "('passed', 'failed', 'requires_review', 'not_run')";

@Entity({ name: "semantic_parser_validation_statuses" })
@Unique("uq_semantic_parser_validation_statuses_id_owner", [
  "id",
  "ownerUserId",
])
@Unique("uq_semantic_parser_validation_statuses_attempt", [
  "semanticParseAttemptId",
])
@Check(
  "ck_semantic_parser_validation_statuses_retention",
  "retention_expires_at > created_at",
)
@Check(
  "ck_semantic_parser_validation_statuses_schema",
  `schema_status IN ${validationStatusValue}`,
)
@Check(
  "ck_semantic_parser_validation_statuses_grounding",
  `grounding_status IN ${validationStatusValue}`,
)
@Check(
  "ck_semantic_parser_validation_statuses_absence",
  `absence_status IN ${validationStatusValue}`,
)
@Check(
  "ck_semantic_parser_validation_statuses_no_invention",
  `no_invention_status IN ${validationStatusValue}`,
)
@Check(
  "ck_semantic_parser_validation_statuses_conflict",
  `conflict_status IN ${validationStatusValue}`,
)
@Check(
  "ck_semantic_parser_validation_statuses_acceptance",
  "acceptance_status IN ('accepted', 'rejected', 'requires_review')",
)
export class SemanticParserValidationStatusEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_semantic_parser_validation_statuses",
  })
  id!: string;

  @Column("uuid", { name: "semantic_parse_attempt_id" })
  semanticParseAttemptId!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("varchar", { name: "schema_status", length: 32 })
  schemaStatus!: string;

  @Column("varchar", { name: "grounding_status", length: 32 })
  groundingStatus!: string;

  @Column("varchar", { name: "absence_status", length: 32 })
  absenceStatus!: string;

  @Column("varchar", { name: "no_invention_status", length: 32 })
  noInventionStatus!: string;

  @Column("varchar", { name: "conflict_status", length: 32 })
  conflictStatus!: string;

  @Column("varchar", { name: "acceptance_status", length: 32 })
  acceptanceStatus!: string;

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
        "fk_semantic_parser_validation_statuses_owner_attempt",
    },
    { name: "owner_user_id", referencedColumnName: "ownerUserId" },
  ])
  semanticParseAttempt!: SemanticParseAttemptEntity;
}
