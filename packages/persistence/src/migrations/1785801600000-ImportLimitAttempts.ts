import type { MigrationInterface, QueryRunner } from "typeorm";

export class ImportLimitAttempts1785801600000 implements MigrationInterface {
  name = "ImportLimitAttempts1785801600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "import_limit_attempts" ("id" uuid NOT NULL, "owner_user_id" uuid NOT NULL, "import_id" uuid, "request_id" uuid, "state" character varying(16) NOT NULL, "attempted_at" TIMESTAMP WITH TIME ZONE NOT NULL, "queued_at" TIMESTAMP WITH TIME ZONE, "active_at" TIMESTAMP WITH TIME ZONE, "released_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "uq_import_limit_attempts_id_owner" UNIQUE ("id", "owner_user_id"), CONSTRAINT "ck_import_limit_attempts_state" CHECK (state IN ('reserved', 'queued', 'active', 'released')), CONSTRAINT "ck_import_limit_attempts_import_id" CHECK ((state IN ('queued', 'active', 'released') AND import_id IS NOT NULL) OR state = 'reserved'), CONSTRAINT "pk_import_limit_attempts" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_import_limit_attempts_owner_attempted" ON "import_limit_attempts" ("owner_user_id", "attempted_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "import_limit_attempts"`);
  }
}
