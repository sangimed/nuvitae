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

/**
 * The one-owner invariant belongs to Community authentication infrastructure,
 * not to resume/import domain entities. The persisted UUID remains the opaque
 * owner ID consumed by the existing owner-scoped repositories.
 */
@Entity({ name: "community_instance_owner" })
@Check("ck_community_instance_owner_singleton", "installation_key = true")
@Unique("uq_community_instance_owner_owner", ["ownerUserId"])
export class CommunityInstanceOwnerEntity {
  @PrimaryColumn("boolean", { name: "installation_key" })
  installationKey!: boolean;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;
}

@Entity({ name: "community_auth_sessions" })
@Index("idx_community_auth_sessions_active", ["ownerUserId", "expiresAt"])
@Check("ck_community_auth_sessions_expiry", "expires_at > created_at")
export class CommunityAuthSessionEntity {
  /** SHA-256 of a random 256-bit browser session identifier, never the value. */
  @PrimaryColumn("char", {
    name: "session_hash",
    length: 64,
    primaryKeyConstraintName: "pk_community_auth_sessions",
  })
  sessionHash!: string;

  @Column("uuid", { name: "owner_user_id" })
  ownerUserId!: string;

  @ManyToOne(() => CommunityInstanceOwnerEntity, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({
    name: "owner_user_id",
    referencedColumnName: "ownerUserId",
    foreignKeyConstraintName: "fk_community_auth_sessions_owner",
  })
  owner!: CommunityInstanceOwnerEntity;

  @Column("timestamptz", { name: "created_at" })
  createdAt!: Date;

  @Column("timestamptz", { name: "expires_at" })
  expiresAt!: Date;

  @Column("timestamptz", { name: "revoked_at", nullable: true })
  revokedAt!: Date | null;
}

export const communityAuthPersistenceEntities = [
  CommunityInstanceOwnerEntity,
  CommunityAuthSessionEntity,
] as const;
