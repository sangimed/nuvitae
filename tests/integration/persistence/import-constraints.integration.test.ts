import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ImportDraftEntity,
  ImportedDocumentEntity,
  StructuredResumeEntity,
  WorkExperienceEntity,
  WorkExperienceRoleEntity,
  createTypeOrmOptions,
} from "@nuvitae/persistence";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import {
  createIsolatedPersistenceTestDatabase,
  postgresErrorCode,
} from "./test-database.js";
import { ids, importedDocument } from "./fixtures.js";

function documentRow(
  id: string = ids.document,
  ownerUserId: string = ids.ownerA,
) {
  const document = importedDocument({ id, ownerUserId });
  return Object.assign(new ImportedDocumentEntity(), {
    ...document,
    sizeBytes: String(document.sizeBytes),
    renderedPageCount: document.renderedPageCount ?? null,
    detectedLanguage: document.detectedLanguage ?? null,
    storageKey: document.storageKey ?? null,
    deletedAt: null,
  });
}

describe("PostgreSQL import persistence constraints", () => {
  let database: IsolatedPersistenceTestDatabase;
  beforeEach(async () => {
    database = await createIsolatedPersistenceTestDatabase("constraints");
  });
  afterEach(async () => database.cleanup());

  async function seedDocumentAndDraft(): Promise<void> {
    await database.dataSource.manager.save(
      ImportedDocumentEntity,
      documentRow(),
    );
    await database.dataSource.manager.insert(ImportDraftEntity, {
      id: ids.draft,
      importedDocumentId: ids.document,
      ownerUserId: ids.ownerA,
      status: "review_required",
      createdAt: new Date("2026-07-28T08:01:00Z"),
      lastReviewedAt: null,
      retentionExpiresAt: new Date("2026-08-04T08:00:00Z"),
      confirmedAt: null,
      discardedAt: null,
      expiredAt: null,
    });
  }

  it("enforces primary keys and ownership-aware uniqueness", async () => {
    await database.dataSource.manager.save(
      ImportedDocumentEntity,
      documentRow(),
    );
    await expect(
      database.dataSource.manager.insert(ImportedDocumentEntity, documentRow()),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );

    await database.dataSource.manager.insert(ImportDraftEntity, {
      id: ids.draft,
      importedDocumentId: ids.document,
      ownerUserId: ids.ownerA,
      status: "review_required",
      createdAt: new Date("2026-07-28T08:01:00Z"),
      lastReviewedAt: null,
      retentionExpiresAt: new Date("2026-08-04T08:00:00Z"),
      confirmedAt: null,
      discardedAt: null,
      expiredAt: null,
    });
    await expect(
      database.dataSource.manager.insert(ImportDraftEntity, {
        id: "40000000-0000-4000-8000-000000000002",
        importedDocumentId: ids.document,
        ownerUserId: ids.ownerA,
        status: "review_required",
        createdAt: new Date("2026-07-28T08:02:00Z"),
        retentionExpiresAt: new Date("2026-08-04T08:00:00Z"),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );
  });

  it("enforces foreign keys, required fields, retention, and owner linkage", async () => {
    await seedDocumentAndDraft();
    await expect(
      database.dataSource.manager.query(
        `INSERT INTO derived_extraction_artifacts
         (id, imported_document_id, owner_user_id, artifact_type, storage_key,
          contains_source_reconstructing_data, deletion_status, created_at, retention_expires_at)
         VALUES ($1, $2, $3, 'thumbnail', 'missing-parent', true, 'not_scheduled', $4, $5)`,
        [
          "30000000-0000-4000-8000-000000000010",
          "20000000-0000-4000-8000-000000000099",
          ids.ownerA,
          new Date("2026-07-28T08:00:00Z"),
          new Date("2026-08-04T08:00:00Z"),
        ],
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );

    await expect(
      database.dataSource.manager.query(
        `INSERT INTO imported_documents
         (id, owner_user_id, visible_filename, content_type, file_extension, size_bytes,
          upload_status, validation_status, processing_status, deletion_status,
          created_at, retention_expires_at)
         VALUES ($1, $2, NULL, 'application/pdf', 'pdf', 1, 'uploaded', 'accepted',
                 'ready_for_review', 'not_scheduled', $3, $4)`,
        [
          "20000000-0000-4000-8000-000000000010",
          ids.ownerA,
          new Date("2026-07-28T08:00:00Z"),
          new Date("2026-08-04T08:00:00Z"),
        ],
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23502",
    );

    await expect(
      database.dataSource.manager
        .save(
          ImportedDocumentEntity,
          documentRow("20000000-0000-4000-8000-000000000011"),
        )
        .then(async () =>
          database.dataSource.manager.query(
            `UPDATE imported_documents SET retention_expires_at = created_at WHERE id = $1`,
            ["20000000-0000-4000-8000-000000000011"],
          ),
        ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.query(
        `INSERT INTO derived_extraction_artifacts
         (id, imported_document_id, owner_user_id, artifact_type, storage_key,
          contains_source_reconstructing_data, deletion_status, created_at, retention_expires_at)
         VALUES ($1, $2, $3, 'thumbnail', 'wrong-retention', true, 'not_scheduled', $4, $5)`,
        [
          "30000000-0000-4000-8000-000000000011",
          ids.document,
          ids.ownerA,
          new Date("2026-07-28T08:00:00Z"),
          new Date("2026-08-03T08:00:00Z"),
        ],
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );

    await expect(
      database.dataSource.manager.query(
        `INSERT INTO deletion_jobs
         (id, imported_document_id, owner_user_id, reason, status, scheduled_at, verification_status)
         VALUES ($1, $2, $3, 'retention_deadline', 'scheduled', $4, 'not_started')`,
        [
          "70000000-0000-4000-8000-000000000001",
          ids.document,
          ids.ownerB,
          new Date("2026-08-04T08:00:00Z"),
        ],
      ),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );
  });

  it("enforces ordered child uniqueness and ongoing-role end dates", async () => {
    await seedDocumentAndDraft();
    await database.dataSource.manager.insert(StructuredResumeEntity, {
      id: "80000000-0000-4000-8000-000000000001",
      ownerUserId: ids.ownerA,
      sourceImportDraftId: ids.draft,
      provenanceLabel: "imported_from_initial_resume",
      confirmationStatus: "confirmed",
      createdAt: new Date("2026-07-28T09:00:00Z"),
      updatedAt: new Date("2026-07-28T09:00:00Z"),
      deletedAt: null,
    });
    await database.dataSource.manager.insert(WorkExperienceEntity, {
      id: "81000000-0000-4000-8000-000000000001",
      structuredResumeId: "80000000-0000-4000-8000-000000000001",
      ownerUserId: ids.ownerA,
      position: 0,
      employerName: "Synthetic Employer",
      employerLocation: null,
      reviewStatus: "confirmed",
      inferenceStatus: "not_inferred",
    });
    await database.dataSource.manager.insert(WorkExperienceRoleEntity, {
      id: "82000000-0000-4000-8000-000000000001",
      workExperienceId: "81000000-0000-4000-8000-000000000001",
      structuredResumeId: "80000000-0000-4000-8000-000000000001",
      position: 0,
      title: "Engineer",
      location: null,
      startDate: null,
      endDate: null,
      isOngoing: false,
      sourceStatus: "explicit_source",
      reviewStatus: "confirmed",
      inferenceStatus: "not_inferred",
    });
    await expect(
      database.dataSource.manager.insert(WorkExperienceRoleEntity, {
        id: "82000000-0000-4000-8000-000000000002",
        workExperienceId: "81000000-0000-4000-8000-000000000001",
        structuredResumeId: "80000000-0000-4000-8000-000000000001",
        position: 0,
        title: "Senior Engineer",
        isOngoing: false,
        sourceStatus: "explicit_source",
        reviewStatus: "confirmed",
        inferenceStatus: "not_inferred",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );
    await expect(
      database.dataSource.manager.insert(WorkExperienceRoleEntity, {
        id: "82000000-0000-4000-8000-000000000003",
        workExperienceId: "81000000-0000-4000-8000-000000000001",
        structuredResumeId: "80000000-0000-4000-8000-000000000001",
        position: 1,
        title: "Current Engineer",
        endDate: { year: 2026, precision: "year" },
        isOngoing: true,
        sourceStatus: "explicit_source",
        reviewStatus: "confirmed",
        inferenceStatus: "not_inferred",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );
  });

  it("rejects a structured resume linked to another owner's draft", async () => {
    await seedDocumentAndDraft();
    await expect(
      database.dataSource.manager.insert(StructuredResumeEntity, {
        id: "80000000-0000-4000-8000-000000000002",
        ownerUserId: ids.ownerB,
        sourceImportDraftId: ids.draft,
        provenanceLabel: "imported_from_initial_resume",
        confirmationStatus: "confirmed",
        createdAt: new Date("2026-07-28T09:00:00Z"),
        updatedAt: new Date("2026-07-28T09:00:00Z"),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23503",
    );
  });

  it("cascades source-owned children but preserves confirmed resume facts", async () => {
    await seedDocumentAndDraft();
    await database.dataSource.manager.insert(StructuredResumeEntity, {
      id: "80000000-0000-4000-8000-000000000001",
      ownerUserId: ids.ownerA,
      sourceImportDraftId: ids.draft,
      provenanceLabel: "imported_from_initial_resume",
      confirmationStatus: "confirmed",
      createdAt: new Date("2026-07-28T09:00:00Z"),
      updatedAt: new Date("2026-07-28T09:00:00Z"),
      deletedAt: null,
    });
    await database.dataSource.manager.delete(ImportedDocumentEntity, {
      id: ids.document,
      ownerUserId: ids.ownerA,
    });
    expect(await database.dataSource.manager.count(ImportDraftEntity)).toBe(0);
    const resume = await database.dataSource.manager.findOneByOrFail(
      StructuredResumeEntity,
      { id: "80000000-0000-4000-8000-000000000001" },
    );
    expect(resume.sourceImportDraftId).toBeNull();
  });

  it("keeps synchronize disabled and initialization does not create schema", async () => {
    const isolated = await createIsolatedPersistenceTestDatabase(
      "no_synchronize",
      {
        migrate: false,
      },
    );
    try {
      expect(
        createTypeOrmOptions({
          host: "postgres",
          port: 5432,
          username: "nuvitae",
          password: "synthetic",
          database: "nuvitae_test",
          ssl: false,
          logging: false,
          poolMax: 2,
          connectionTimeoutMs: 5_000,
          statementTimeoutMs: 30_000,
        }).synchronize,
      ).toBe(false);
      const result = await isolated.dataSource.query<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 'imported_documents'`,
        [isolated.schema],
      );
      expect(result).toHaveLength(0);
    } finally {
      await isolated.cleanup();
    }
  });
});
