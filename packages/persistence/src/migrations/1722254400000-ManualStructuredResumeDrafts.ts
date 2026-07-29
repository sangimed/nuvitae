import type { MigrationInterface, QueryRunner } from "typeorm";

export class ManualStructuredResumeDrafts1722254400000 implements MigrationInterface {
  name = "ManualStructuredResumeDrafts1722254400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "manual_structured_resume_drafts" (
        "id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "source" varchar(64) NOT NULL,
        "status" varchar(32) NOT NULL,
        "creation_key" varchar(96) NOT NULL,
        "content" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL,
        "confirmed_at" timestamptz,
        "deleted_at" timestamptz,
        CONSTRAINT "pk_manual_structured_resume_drafts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_manual_drafts_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "uq_manual_drafts_owner_creation_key" UNIQUE ("owner_user_id", "creation_key"),
        CONSTRAINT "ck_manual_drafts_source" CHECK ("source" IN ('manual_entry', 'unsupported_language_contact_transfer')),
        CONSTRAINT "ck_manual_drafts_status" CHECK ("status" IN ('editing', 'confirmed', 'discarded')),
        CONSTRAINT "ck_manual_drafts_creation_key_shape" CHECK ("creation_key" ~ '^[A-Za-z0-9._:-]{16,96}$'),
        CONSTRAINT "ck_manual_drafts_timestamp_order" CHECK ("updated_at" >= "created_at"),
        CONSTRAINT "ck_manual_drafts_confirmation" CHECK (("status" = 'confirmed' AND "confirmed_at" IS NOT NULL) OR "status" <> 'confirmed')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_manual_drafts_owner_updated" ON "manual_structured_resume_drafts" ("owner_user_id", "updated_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_manual_drafts_owner_updated"`);
    await queryRunner.query(`DROP TABLE "manual_structured_resume_drafts"`);
  }
}
