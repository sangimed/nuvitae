import type { MigrationInterface, QueryRunner } from "typeorm";

export class SemanticImportProcessingStates1722427200000 implements MigrationInterface {
  name = "SemanticImportProcessingStates1722427200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "imported_documents" DROP CONSTRAINT "ck_imported_documents_processing_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "imported_documents" ADD CONSTRAINT "ck_imported_documents_processing_status" CHECK ("processing_status" IN ('not_started', 'queued', 'processing', 'semantic_parsing_pending', 'semantic_parsing_running', 'provider_unavailable', 'semantic_response_invalid', 'semantic_validation_failed', 'ready_for_review', 'timeout_partial', 'failed', 'cancelled', 'expired'))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "imported_documents" DROP CONSTRAINT "ck_imported_documents_processing_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "imported_documents" ADD CONSTRAINT "ck_imported_documents_processing_status" CHECK ("processing_status" IN ('not_started', 'queued', 'processing', 'ready_for_review', 'timeout_partial', 'failed', 'cancelled', 'expired'))`,
    );
  }
}
