import type { MigrationInterface, QueryRunner } from "typeorm";

export class CommunityInstanceAuth1785888000000 implements MigrationInterface {
  name = "CommunityInstanceAuth1785888000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "community_instance_owner" ("installation_key" boolean NOT NULL, "owner_user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_community_instance_owner_owner" UNIQUE ("owner_user_id"), CONSTRAINT "ck_community_instance_owner_singleton" CHECK (installation_key = true), CONSTRAINT "pk_community_instance_owner" PRIMARY KEY ("installation_key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "community_auth_sessions" ("session_hash" character(64) NOT NULL, "owner_user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "ck_community_auth_sessions_expiry" CHECK (expires_at > created_at), CONSTRAINT "pk_community_auth_sessions" PRIMARY KEY ("session_hash"), CONSTRAINT "fk_community_auth_sessions_owner" FOREIGN KEY ("owner_user_id") REFERENCES "community_instance_owner"("owner_user_id") ON DELETE RESTRICT ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_community_auth_sessions_active" ON "community_auth_sessions" ("owner_user_id", "expires_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "community_auth_sessions"`);
    await queryRunner.query(`DROP TABLE "community_instance_owner"`);
  }
}
