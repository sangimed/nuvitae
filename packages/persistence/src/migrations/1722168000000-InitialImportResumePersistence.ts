import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialImportResumePersistence1722168000000 implements MigrationInterface {
  name = "InitialImportResumePersistence1722168000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "imported_documents" (
        "id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "visible_filename" varchar(255) NOT NULL,
        "content_type" varchar(127) NOT NULL,
        "file_extension" varchar(16) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "rendered_page_count" integer,
        "detected_language" varchar(64),
        "storage_key" varchar(1024),
        "upload_status" varchar(32) NOT NULL,
        "validation_status" varchar(32) NOT NULL,
        "processing_status" varchar(32) NOT NULL,
        "deletion_status" varchar(32) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "retention_expires_at" timestamptz NOT NULL,
        "deleted_at" timestamptz,
        CONSTRAINT "pk_imported_documents" PRIMARY KEY ("id"),
        CONSTRAINT "uq_imported_documents_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "ck_imported_documents_size_positive" CHECK ("size_bytes" > 0),
        CONSTRAINT "ck_imported_documents_page_count_positive" CHECK ("rendered_page_count" IS NULL OR "rendered_page_count" > 0),
        CONSTRAINT "ck_imported_documents_retention" CHECK ("retention_expires_at" > "created_at"),
        CONSTRAINT "ck_imported_documents_deleted_at" CHECK (("deletion_status" = 'deleted' AND "deleted_at" IS NOT NULL) OR "deletion_status" <> 'deleted'),
        CONSTRAINT "ck_imported_documents_upload_status" CHECK ("upload_status" IN ('pending_upload', 'uploaded', 'cancelled')),
        CONSTRAINT "ck_imported_documents_validation_status" CHECK ("validation_status" IN ('not_started', 'validating', 'accepted', 'rejected')),
        CONSTRAINT "ck_imported_documents_processing_status" CHECK ("processing_status" IN ('not_started', 'queued', 'processing', 'ready_for_review', 'timeout_partial', 'failed', 'cancelled', 'expired')),
        CONSTRAINT "ck_imported_documents_deletion_status" CHECK ("deletion_status" IN ('not_scheduled', 'scheduled_for_deletion', 'deleting', 'deleted', 'failed')),
        CONSTRAINT "ck_imported_documents_file_extension" CHECK ("file_extension" IN ('pdf', 'docx', 'unsupported'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_imported_documents_owner_created" ON "imported_documents" ("owner_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_imported_documents_owner_status" ON "imported_documents" ("owner_user_id", "processing_status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "derived_extraction_artifacts" (
        "id" uuid NOT NULL,
        "imported_document_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "artifact_type" varchar(64) NOT NULL,
        "storage_key" varchar(1024) NOT NULL,
        "contains_source_reconstructing_data" boolean NOT NULL,
        "deletion_status" varchar(32) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "retention_expires_at" timestamptz NOT NULL,
        "deleted_at" timestamptz,
        CONSTRAINT "pk_derived_extraction_artifacts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_derived_artifacts_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "uq_derived_artifacts_owner_storage_key" UNIQUE ("owner_user_id", "storage_key"),
        CONSTRAINT "ck_derived_artifacts_retention" CHECK ("retention_expires_at" > "created_at"),
        CONSTRAINT "fk_derived_artifacts_owner_document" FOREIGN KEY ("imported_document_id", "owner_user_id") REFERENCES "imported_documents" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_derived_artifacts_owner_import" ON "derived_extraction_artifacts" ("owner_user_id", "imported_document_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "import_drafts" (
        "id" uuid NOT NULL,
        "imported_document_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "status" varchar(48) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "last_reviewed_at" timestamptz,
        "retention_expires_at" timestamptz NOT NULL,
        "confirmed_at" timestamptz,
        "discarded_at" timestamptz,
        "expired_at" timestamptz,
        CONSTRAINT "pk_import_drafts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_import_drafts_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "uq_import_drafts_owner_document" UNIQUE ("owner_user_id", "imported_document_id"),
        CONSTRAINT "ck_import_drafts_retention" CHECK ("retention_expires_at" > "created_at"),
        CONSTRAINT "ck_import_drafts_status" CHECK ("status" IN ('preparing', 'review_required', 'ready_to_confirm', 'confirmed', 'discarded', 'cancelled', 'expired', 'source_deleted_limited_review')),
        CONSTRAINT "ck_import_drafts_confirmation" CHECK (("status" = 'confirmed' AND "confirmed_at" IS NOT NULL) OR "status" <> 'confirmed'),
        CONSTRAINT "fk_import_drafts_owner_document" FOREIGN KEY ("imported_document_id", "owner_user_id") REFERENCES "imported_documents" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_import_drafts_owner_status" ON "import_drafts" ("owner_user_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "import_warnings" (
        "id" uuid NOT NULL,
        "import_draft_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "warning_type" varchar(32) NOT NULL,
        "section" varchar(32) NOT NULL,
        "field_path" varchar(512),
        "message" text NOT NULL,
        "severity" varchar(32) NOT NULL,
        "review_status" varchar(32) NOT NULL,
        "requires_resolution" boolean NOT NULL,
        "created_at" timestamptz NOT NULL,
        "resolved_at" timestamptz,
        CONSTRAINT "pk_import_warnings" PRIMARY KEY ("id"),
        CONSTRAINT "uq_import_warnings_id_draft" UNIQUE ("id", "import_draft_id"),
        CONSTRAINT "ck_import_warnings_resolution" CHECK (("review_status" = 'needs_review' AND "resolved_at" IS NULL) OR "review_status" <> 'needs_review'),
        CONSTRAINT "ck_import_warnings_review_status" CHECK ("review_status" IN ('needs_review', 'confirmed', 'edited', 'excluded', 'intentionally_left')),
        CONSTRAINT "fk_import_warnings_owner_draft" FOREIGN KEY ("import_draft_id", "owner_user_id") REFERENCES "import_drafts" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_import_warnings_draft_review" ON "import_warnings" ("import_draft_id", "review_status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "extracted_fields" (
        "id" uuid NOT NULL,
        "import_draft_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "section" varchar(32) NOT NULL,
        "field_path" varchar(512) NOT NULL,
        "value" jsonb NOT NULL,
        "normalized_value" jsonb,
        "source_status" varchar(48) NOT NULL,
        "source_location" jsonb,
        "confidence_status" varchar(32) NOT NULL,
        "inference_status" varchar(32) NOT NULL,
        "review_status" varchar(32) NOT NULL,
        "warning_id" uuid,
        "created_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL,
        CONSTRAINT "pk_extracted_fields" PRIMARY KEY ("id"),
        CONSTRAINT "uq_extracted_fields_draft_path_order" UNIQUE ("import_draft_id", "field_path", "position"),
        CONSTRAINT "ck_extracted_fields_position" CHECK ("position" >= 0),
        CONSTRAINT "fk_extracted_fields_owner_draft" FOREIGN KEY ("import_draft_id", "owner_user_id") REFERENCES "import_drafts" ("id", "owner_user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_extracted_fields_warning_draft" FOREIGN KEY ("warning_id", "import_draft_id") REFERENCES "import_warnings" ("id", "import_draft_id") ON DELETE SET NULL ("warning_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_extracted_fields_draft_section" ON "extracted_fields" ("import_draft_id", "section")`,
    );

    await queryRunner.query(`
      CREATE TABLE "temporary_contact_previews" (
        "id" uuid NOT NULL,
        "imported_document_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "status" varchar(48) NOT NULL,
        "warning_type" varchar(32) NOT NULL,
        "warning_message" text NOT NULL,
        "warning_severity" varchar(32) NOT NULL,
        "warning_review_status" varchar(32) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "retention_expires_at" timestamptz NOT NULL,
        "confirmed_for_manual_transfer_at" timestamptz,
        "deleted_at" timestamptz,
        CONSTRAINT "pk_temporary_contact_previews" PRIMARY KEY ("id"),
        CONSTRAINT "uq_contact_previews_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "uq_contact_previews_owner_document" UNIQUE ("owner_user_id", "imported_document_id"),
        CONSTRAINT "ck_contact_previews_retention" CHECK ("retention_expires_at" > "created_at"),
        CONSTRAINT "ck_contact_previews_status" CHECK ("status" IN ('created', 'awaiting_user_confirmation', 'transferred_to_manual_entry', 'discarded')),
        CONSTRAINT "fk_contact_previews_owner_document" FOREIGN KEY ("imported_document_id", "owner_user_id") REFERENCES "imported_documents" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "temporary_contact_fields" (
        "id" uuid NOT NULL,
        "temporary_contact_preview_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "field_path" varchar(512) NOT NULL,
        "value" jsonb NOT NULL,
        "source_location" jsonb NOT NULL,
        "confidence_status" varchar(32) NOT NULL,
        "review_status" varchar(32) NOT NULL,
        CONSTRAINT "pk_temporary_contact_fields" PRIMARY KEY ("id"),
        CONSTRAINT "uq_temporary_contact_fields_order" UNIQUE ("temporary_contact_preview_id", "field_path", "position"),
        CONSTRAINT "ck_temporary_contact_fields_position" CHECK ("position" >= 0),
        CONSTRAINT "fk_temporary_contact_fields_owner_preview" FOREIGN KEY ("temporary_contact_preview_id", "owner_user_id") REFERENCES "temporary_contact_previews" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_corrections" (
        "id" uuid NOT NULL,
        "import_draft_id" uuid NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "target_type" varchar(48) NOT NULL,
        "target_id" varchar(512) NOT NULL,
        "action" varchar(32) NOT NULL,
        "previous_value" jsonb,
        "new_value" jsonb,
        "created_at" timestamptz NOT NULL,
        CONSTRAINT "pk_user_corrections" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_corrections_owner_draft" FOREIGN KEY ("import_draft_id", "created_by_user_id") REFERENCES "import_drafts" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_user_corrections_owner_draft" ON "user_corrections" ("created_by_user_id", "import_draft_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "structured_resumes" (
        "id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "source_import_draft_id" uuid,
        "provenance_label" varchar(48) NOT NULL,
        "confirmation_status" varchar(16) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "updated_at" timestamptz NOT NULL,
        "deleted_at" timestamptz,
        CONSTRAINT "pk_structured_resumes" PRIMARY KEY ("id"),
        CONSTRAINT "uq_structured_resumes_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "uq_structured_resumes_owner_source_draft" UNIQUE ("owner_user_id", "source_import_draft_id"),
        CONSTRAINT "fk_structured_resumes_owner_draft" FOREIGN KEY ("source_import_draft_id", "owner_user_id") REFERENCES "import_drafts" ("id", "owner_user_id") ON DELETE SET NULL ("source_import_draft_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_structured_resumes_owner_updated" ON "structured_resumes" ("owner_user_id", "updated_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "structured_resume_texts" (
        "id" uuid NOT NULL,
        "structured_resume_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "section" varchar(32) NOT NULL,
        "position" integer NOT NULL,
        "value" text NOT NULL,
        "source_status" varchar(48) NOT NULL,
        "source_location" jsonb,
        "confidence_status" varchar(32) NOT NULL,
        "inference_status" varchar(32) NOT NULL,
        CONSTRAINT "pk_structured_resume_texts" PRIMARY KEY ("id"),
        CONSTRAINT "uq_structured_resume_texts_order" UNIQUE ("structured_resume_id", "section", "position"),
        CONSTRAINT "ck_structured_resume_texts_position" CHECK ("position" >= 0),
        CONSTRAINT "fk_structured_resume_texts_owner_resume" FOREIGN KEY ("structured_resume_id", "owner_user_id") REFERENCES "structured_resumes" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "work_experiences" (
        "id" uuid NOT NULL,
        "structured_resume_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "employer_name" text NOT NULL,
        "employer_location" text,
        "review_status" varchar(32) NOT NULL,
        "inference_status" varchar(32) NOT NULL,
        CONSTRAINT "pk_work_experiences" PRIMARY KEY ("id"),
        CONSTRAINT "uq_work_experiences_order" UNIQUE ("structured_resume_id", "position"),
        CONSTRAINT "uq_work_experiences_id_resume" UNIQUE ("id", "structured_resume_id"),
        CONSTRAINT "ck_work_experiences_position" CHECK ("position" >= 0),
        CONSTRAINT "fk_work_experiences_owner_resume" FOREIGN KEY ("structured_resume_id", "owner_user_id") REFERENCES "structured_resumes" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "work_experience_roles" (
        "id" uuid NOT NULL,
        "work_experience_id" uuid NOT NULL,
        "structured_resume_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "title" text NOT NULL,
        "location" text,
        "start_date" jsonb,
        "end_date" jsonb,
        "is_ongoing" boolean NOT NULL,
        "source_status" varchar(48) NOT NULL,
        "review_status" varchar(32) NOT NULL,
        "inference_status" varchar(32) NOT NULL,
        CONSTRAINT "pk_work_experience_roles" PRIMARY KEY ("id"),
        CONSTRAINT "uq_work_roles_order" UNIQUE ("work_experience_id", "position"),
        CONSTRAINT "uq_work_roles_id_resume" UNIQUE ("id", "structured_resume_id"),
        CONSTRAINT "ck_work_roles_position" CHECK ("position" >= 0),
        CONSTRAINT "ck_work_roles_ongoing_end_date" CHECK (NOT "is_ongoing" OR "end_date" IS NULL),
        CONSTRAINT "fk_work_roles_experience_resume" FOREIGN KEY ("work_experience_id", "structured_resume_id") REFERENCES "work_experiences" ("id", "structured_resume_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "work_role_details" (
        "id" uuid NOT NULL,
        "work_role_id" uuid NOT NULL,
        "structured_resume_id" uuid NOT NULL,
        "kind" varchar(24) NOT NULL,
        "position" integer NOT NULL,
        "value" text NOT NULL,
        "source_status" varchar(48) NOT NULL,
        "source_location" jsonb,
        "confidence_status" varchar(32) NOT NULL,
        "inference_status" varchar(32) NOT NULL,
        CONSTRAINT "pk_work_role_details" PRIMARY KEY ("id"),
        CONSTRAINT "uq_work_role_details_order" UNIQUE ("work_role_id", "kind", "position"),
        CONSTRAINT "ck_work_role_details_position" CHECK ("position" >= 0),
        CONSTRAINT "ck_work_role_details_kind" CHECK ("kind" IN ('responsibility', 'achievement')),
        CONSTRAINT "fk_work_role_details_role_resume" FOREIGN KEY ("work_role_id", "structured_resume_id") REFERENCES "work_experience_roles" ("id", "structured_resume_id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "structured_resume_items" (
        "id" uuid NOT NULL,
        "structured_resume_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "parent_item_id" uuid,
        "section" varchar(32) NOT NULL,
        "position" integer NOT NULL,
        "primary_value" text NOT NULL,
        "secondary_value" text,
        "tertiary_value" text,
        "url" text,
        "start_date" jsonb,
        "end_date" jsonb,
        "review_status" varchar(32) NOT NULL,
        "source_status" varchar(48) NOT NULL,
        "source_location" jsonb,
        "confidence_status" varchar(32) NOT NULL,
        "inference_status" varchar(32) NOT NULL,
        CONSTRAINT "pk_structured_resume_items" PRIMARY KEY ("id"),
        CONSTRAINT "uq_structured_resume_items_id_resume" UNIQUE ("id", "structured_resume_id"),
        CONSTRAINT "uq_structured_resume_items_order" UNIQUE ("structured_resume_id", "section", "parent_item_id", "position"),
        CONSTRAINT "ck_structured_resume_items_position" CHECK ("position" >= 0),
        CONSTRAINT "ck_structured_resume_items_section" CHECK ("section" IN ('education', 'skill', 'language', 'project', 'project_link', 'certification', 'professional_link')),
        CONSTRAINT "fk_structured_resume_items_owner_resume" FOREIGN KEY ("structured_resume_id", "owner_user_id") REFERENCES "structured_resumes" ("id", "owner_user_id") ON DELETE CASCADE,
        CONSTRAINT "fk_structured_resume_items_parent" FOREIGN KEY ("parent_item_id", "structured_resume_id") REFERENCES "structured_resume_items" ("id", "structured_resume_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_structured_resume_items_root_order" ON "structured_resume_items" ("structured_resume_id", "section", "position") WHERE "parent_item_id" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "deletion_jobs" (
        "id" uuid NOT NULL,
        "imported_document_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "reason" varchar(48) NOT NULL,
        "status" varchar(24) NOT NULL,
        "scheduled_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "verification_status" varchar(32) NOT NULL,
        "verification_summary" jsonb,
        CONSTRAINT "pk_deletion_jobs" PRIMARY KEY ("id"),
        CONSTRAINT "uq_deletion_jobs_id_owner" UNIQUE ("id", "owner_user_id"),
        CONSTRAINT "uq_deletion_jobs_owner_document_reason" UNIQUE ("owner_user_id", "imported_document_id", "reason"),
        CONSTRAINT "ck_deletion_jobs_completion" CHECK (("status" = 'completed' AND "completed_at" IS NOT NULL) OR "status" <> 'completed'),
        CONSTRAINT "ck_deletion_jobs_status" CHECK ("status" IN ('scheduled', 'running', 'completed', 'failed')),
        CONSTRAINT "fk_deletion_jobs_owner_document" FOREIGN KEY ("imported_document_id", "owner_user_id") REFERENCES "imported_documents" ("id", "owner_user_id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_deletion_jobs_status_scheduled" ON "deletion_jobs" ("status", "scheduled_at")`,
    );

    await queryRunner.query(`
      CREATE FUNCTION "enforce_import_retention_match"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.retention_expires_at <> (
          SELECT retention_expires_at
          FROM imported_documents
          WHERE id = NEW.imported_document_id
            AND owner_user_id = NEW.owner_user_id
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'ck_import_retention_matches_document',
            MESSAGE = 'Import child retention must match its source document';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    for (const table of [
      "derived_extraction_artifacts",
      "import_drafts",
      "temporary_contact_previews",
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER "trg_${table}_retention_match"
        BEFORE INSERT OR UPDATE OF retention_expires_at, imported_document_id, owner_user_id
        ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION "enforce_import_retention_match"()
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "deletion_jobs"`);
    await queryRunner.query(`DROP TABLE "structured_resume_items"`);
    await queryRunner.query(`DROP TABLE "work_role_details"`);
    await queryRunner.query(`DROP TABLE "work_experience_roles"`);
    await queryRunner.query(`DROP TABLE "work_experiences"`);
    await queryRunner.query(`DROP TABLE "structured_resume_texts"`);
    await queryRunner.query(`DROP TABLE "structured_resumes"`);
    await queryRunner.query(`DROP TABLE "user_corrections"`);
    await queryRunner.query(`DROP TABLE "temporary_contact_fields"`);
    await queryRunner.query(`DROP TABLE "temporary_contact_previews"`);
    await queryRunner.query(`DROP TABLE "extracted_fields"`);
    await queryRunner.query(`DROP TABLE "import_warnings"`);
    await queryRunner.query(`DROP TABLE "import_drafts"`);
    await queryRunner.query(`DROP TABLE "derived_extraction_artifacts"`);
    await queryRunner.query(`DROP TABLE "imported_documents"`);
    await queryRunner.query(`DROP FUNCTION "enforce_import_retention_match"`);
  }
}
