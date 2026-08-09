import { Check, Column, Entity, Index, PrimaryColumn, Unique } from "typeorm";

@Entity({ name: "import_limit_attempts" })
@Index("idx_import_limit_attempts_owner_attempted", [
  "ownerUserId",
  "attemptedAt",
])
@Unique("uq_import_limit_attempts_id_owner", ["id", "ownerUserId"])
@Check(
  "ck_import_limit_attempts_state",
  "state IN ('reserved', 'queued', 'active', 'released')",
)
@Check(
  "ck_import_limit_attempts_import_id",
  "(state IN ('queued', 'active', 'released') AND import_id IS NOT NULL) OR state = 'reserved'",
)
export class ImportLimitAttemptEntity {
  @PrimaryColumn("uuid", {
    primaryKeyConstraintName: "pk_import_limit_attempts",
  })
  id!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("uuid", { name: "import_id", nullable: true })
  importId!: string | null;

  @Column("uuid", { name: "request_id", nullable: true })
  requestId!: string | null;

  @Column("varchar", { name: "state", length: 16 })
  state!: string;

  @Column("timestamptz", { name: "attempted_at" })
  attemptedAt!: Date;

  @Column("timestamptz", { name: "queued_at", nullable: true })
  queuedAt!: Date | null;

  @Column("timestamptz", { name: "active_at", nullable: true })
  activeAt!: Date | null;

  @Column("timestamptz", { name: "released_at", nullable: true })
  releasedAt!: Date | null;
}

export const importLimitAttemptPersistenceEntities = [ImportLimitAttemptEntity];
