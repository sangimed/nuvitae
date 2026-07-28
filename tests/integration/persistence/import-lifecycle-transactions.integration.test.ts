import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DerivedExtractionArtifactEntity,
  ImportedDocumentEntity,
  TypeOrmImportResumeRepository,
} from "@nuvitae/persistence";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";
import { ids, importDraft, importedDocument } from "./fixtures.js";

describe("import lifecycle transactions", () => {
  let database: IsolatedPersistenceTestDatabase;
  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("transactions");
  });
  afterAll(async () => database.cleanup());

  it("commits aggregate, draft, warning, and field using one EntityManager", async () => {
    const repository = new TypeOrmImportResumeRepository(database.dataSource);
    await repository.transaction(async (manager) => {
      await repository.createImportAggregate(
        {
          document: importedDocument(),
          artifacts: [
            {
              id: ids.artifact,
              importedDocumentId: ids.document,
              ownerUserId: ids.ownerA,
              artifactType: "page_reference",
              storageKey: "imports/synthetic/page-reference",
              containsSourceReconstructingData: true,
              deletionStatus: "not_scheduled",
              createdAt: new Date("2026-07-28T08:00:30.000Z"),
              retentionExpiresAt: new Date("2026-08-04T08:00:00.000Z"),
            },
          ],
        },
        manager,
      );
      await repository.saveDraft(importDraft(), manager);
    });

    const stored = await repository.findDraftByOwner(ids.draft, ids.ownerA);
    expect(stored?.fields).toHaveLength(1);
    expect(stored?.warnings).toHaveLength(1);
  });

  it("rolls back all parent and child records when a child insert fails", async () => {
    const document = importedDocument({
      id: "20000000-0000-4000-8000-000000000002",
    });
    await expect(
      database.dataSource.transaction(async (manager) => {
        await manager.save(
          ImportedDocumentEntity,
          Object.assign(new ImportedDocumentEntity(), {
            ...document,
            sizeBytes: String(document.sizeBytes),
            renderedPageCount: document.renderedPageCount ?? null,
            detectedLanguage: document.detectedLanguage ?? null,
            storageKey: document.storageKey ?? null,
            deletedAt: null,
          }),
        );
        await manager.insert(DerivedExtractionArtifactEntity, {
          id: "30000000-0000-4000-8000-000000000002",
          importedDocumentId: document.id,
          ownerUserId: ids.ownerB,
          artifactType: "thumbnail",
          storageKey: "invalid-owner-artifact",
          containsSourceReconstructingData: true,
          deletionStatus: "not_scheduled",
          createdAt: document.createdAt,
          retentionExpiresAt: document.retentionExpiresAt,
          deletedAt: null,
        });
      }),
    ).rejects.toBeDefined();
    expect(
      await database.dataSource.manager.countBy(ImportedDocumentEntity, {
        id: document.id,
      }),
    ).toBe(0);
  });

  it("rolls back a lifecycle constraint failure without partial draft state", async () => {
    const repository = new TypeOrmImportResumeRepository(database.dataSource);
    const document = importedDocument({
      id: "20000000-0000-4000-8000-000000000003",
    });
    await expect(
      repository.transaction(async (manager) => {
        await repository.createImportAggregate(
          { document, artifacts: [] },
          manager,
        );
        await manager.query(
          `INSERT INTO import_drafts
           (id, imported_document_id, owner_user_id, status, created_at, retention_expires_at)
           VALUES ($1, $2, $3, 'confirmed', $4, $5)`,
          [
            "40000000-0000-4000-8000-000000000003",
            document.id,
            ids.ownerA,
            document.createdAt,
            document.retentionExpiresAt,
          ],
        );
      }),
    ).rejects.toBeDefined();
    expect(
      await database.dataSource.manager.countBy(ImportedDocumentEntity, {
        id: document.id,
      }),
    ).toBe(0);
  });

  it("does not expose uncommitted writes outside the transaction", async () => {
    const document = importedDocument({
      id: "20000000-0000-4000-8000-000000000004",
    });
    await database.dataSource.transaction(async (manager) => {
      await manager.save(
        ImportedDocumentEntity,
        Object.assign(new ImportedDocumentEntity(), {
          ...document,
          sizeBytes: String(document.sizeBytes),
          renderedPageCount: document.renderedPageCount ?? null,
          detectedLanguage: document.detectedLanguage ?? null,
          storageKey: document.storageKey ?? null,
          deletedAt: null,
        }),
      );
      expect(
        await database.dataSource.manager.countBy(ImportedDocumentEntity, {
          id: document.id,
        }),
      ).toBe(0);
      expect(
        await manager.countBy(ImportedDocumentEntity, { id: document.id }),
      ).toBe(1);
    });
  });
});
