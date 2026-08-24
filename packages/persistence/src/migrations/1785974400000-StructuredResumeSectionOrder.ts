import type { MigrationInterface, QueryRunner } from "typeorm";

export class StructuredResumeSectionOrder1785974400000 implements MigrationInterface {
  name = "StructuredResumeSectionOrder1785974400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "structured_resumes" ADD "section_order" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "structured_resume_items" ADD "location_value" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "structured_resume_items" DROP COLUMN "location_value"`,
    );
    await queryRunner.query(
      `ALTER TABLE "structured_resumes" DROP COLUMN "section_order"`,
    );
  }
}
