import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StructuredResume } from "@nuvitae/domain";
import { SourceDeletionService } from "@nuvitae/import-application";
import {
  TypeOrmImportResumeRepository,
  TypeOrmSourceDeletionRepository,
} from "@nuvitae/persistence";
import {
  generatePrivateImportStorageKey,
  LocalPrivateImportStorage,
  PrivateImportStorageError,
} from "@nuvitae/storage";
import {
  createIsolatedPersistenceTestDatabase,
  type IsolatedPersistenceTestDatabase,
} from "./test-database.js";
import { ids, importDraft, importedDocument } from "./fixtures.js";

const resumeId = "70000000-0000-4000-8000-000000000001";
const deletedAt = new Date("2026-08-01T09:00:00.000Z");

describe("source deletion PostgreSQL and private-storage integration", () => {
  let database: IsolatedPersistenceTestDatabase;
  let storageRoot: string;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("source_deletion");
    storageRoot = await mkdtemp(join(tmpdir(), "nuvitae-source-deletion-"));
  });

  afterAll(async () => {
    if (database !== undefined) await database.cleanup();
  });

  it("removes source bytes and reconstructing artifacts while preserving and reducing the resume", async () => {
    const storage = await LocalPrivateImportStorage.create({
      root: storageRoot,
      signingSecret: randomBytes(32),
      maxSignedReferenceTtlSeconds: 60,
    });
    const sourceKey = generatePrivateImportStorageKey({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      objectKind: "source",
    });
    const artifactKey = generatePrivateImportStorageKey({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      objectKind: "artifact",
    });
    await storage.writeObject(sourceKey, Buffer.from("private source"));
    await storage.writeObject(artifactKey, Buffer.from("reconstructing text"));

    const imports = new TypeOrmImportResumeRepository(database.dataSource);
    await imports.createImportAggregate({
      document: importedDocument({ storageKey: sourceKey }),
      artifacts: [
        {
          id: ids.artifact,
          importedDocumentId: ids.document,
          ownerUserId: ids.ownerA,
          artifactType: "extracted_raw_text",
          storageKey: artifactKey,
          containsSourceReconstructingData: true,
          deletionStatus: "not_scheduled",
          createdAt: new Date("2026-07-28T08:00:00.000Z"),
          retentionExpiresAt: new Date("2026-08-04T08:00:00.000Z"),
        },
      ],
    });
    await imports.saveDraft(importDraft());
    await imports.saveStructuredResume(structuredResume());

    const repository = new TypeOrmSourceDeletionRepository(database.dataSource);
    const service = new SourceDeletionService(repository, storage);

    await expect(
      service.delete({
        importId: ids.document,
        ownerUserId: ids.ownerB,
        now: deletedAt,
      }),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(storage.readObject(sourceKey)).resolves.toEqual(
      Buffer.from("private source"),
    );

    await expect(
      service.delete({
        importId: ids.document,
        ownerUserId: ids.ownerA,
        now: deletedAt,
      }),
    ).resolves.toEqual({ kind: "deleted", deletedAt });
    await expectMissing(storage.readObject(sourceKey));
    await expectMissing(storage.readObject(artifactKey));

    const aggregate = await imports.findImportByOwner(ids.document, ids.ownerA);
    expect(aggregate?.document).toMatchObject({
      deletionStatus: "deleted",
      deletedAt,
    });
    expect(aggregate?.document.storageKey).toBeUndefined();
    expect(aggregate?.artifacts[0]).toMatchObject({
      deletionStatus: "deleted",
      deletedAt,
    });

    const resume = await imports.findStructuredResumeByOwner(
      resumeId,
      ids.ownerA,
    );
    expect(resume?.content.headline?.value).toBe("Imported headline");
    expect(resume?.content.headline?.sourceStatus).toBe(
      "source_deleted_minimal_provenance",
    );
    expect(resume?.content.headline?.sourceLocation).toMatchObject({
      kind: "minimal",
      label: "imported_from_initial_resume",
    });
    expect(resume?.content.summary?.value).toBe("User-edited summary");
    expect(resume?.content.summary?.sourceStatus).toBe("user_edited");
    expect(resume?.content.summary?.sourceLocation).toMatchObject({
      kind: "minimal",
      label: "imported_from_initial_resume",
    });

    await expect(
      service.delete({
        importId: ids.document,
        ownerUserId: ids.ownerA,
        now: new Date("2026-08-02T09:00:00.000Z"),
      }),
    ).resolves.toEqual({ kind: "deleted", deletedAt });
  });
});

async function expectMissing(read: Promise<Uint8Array>): Promise<void> {
  await expect(read).rejects.toMatchObject({
    code: "STORAGE_OBJECT_NOT_FOUND",
  } satisfies Partial<PrivateImportStorageError>);
}

function structuredResume(): StructuredResume {
  const createdAt = new Date("2026-07-29T09:00:00.000Z");
  return {
    id: resumeId,
    ownerUserId: ids.ownerA,
    sourceImportDraftId: ids.draft,
    provenanceLabel: "imported_from_initial_resume",
    confirmationStatus: "confirmed",
    content: {
      personal: [],
      contact: [],
      headline: {
        value: "Imported headline",
        sourceStatus: "explicit_source",
        sourceLocation: {
          kind: "pdf",
          pageNumber: 1,
          textItemIndex: 0,
          boundingBox: {
            x: 1,
            y: 2,
            width: 3,
            height: 4,
            unit: "pdf_point",
          },
        },
        confidenceStatus: "high",
        inferenceStatus: "not_inferred",
      },
      summary: {
        value: "User-edited summary",
        sourceStatus: "user_edited",
        sourceLocation: {
          kind: "pdf",
          pageNumber: 1,
          textItemIndex: 1,
          boundingBox: {
            x: 5,
            y: 6,
            width: 7,
            height: 8,
            unit: "pdf_point",
          },
        },
        confidenceStatus: "not_applicable",
        inferenceStatus: "not_inferred",
      },
      workExperiences: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    createdAt,
    updatedAt: createdAt,
  };
}
