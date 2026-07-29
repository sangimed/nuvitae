import type { MigrationInterface, QueryRunner } from "typeorm";

export class ImportDraftReviewRevision1722340800000 implements MigrationInterface {
  name = "ImportDraftReviewRevision1722340800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "import_drafts"
      ADD COLUMN "review_revision" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "import_drafts"
      ADD CONSTRAINT "ck_import_drafts_review_revision"
      CHECK ("review_revision" >= 0)
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_corrections_owner_operation"
      ON "user_corrections" ("created_by_user_id", "id")
    `);
    await queryRunner.query(`
      ALTER TABLE "import_drafts"
      ALTER COLUMN "review_revision" DROP DEFAULT
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "idx_user_corrections_owner_operation"`,
    );
    await queryRunner.query(`
      ALTER TABLE "import_drafts"
      DROP CONSTRAINT "ck_import_drafts_review_revision"
    `);
    await queryRunner.query(`
      ALTER TABLE "import_drafts"
      DROP COLUMN "review_revision"
    `);
  }
}
