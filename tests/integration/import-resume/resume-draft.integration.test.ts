import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DeletionJob, ExtractedField, ImportDraft } from "@nuvitae/domain";
import {
  DeletionJobEntity,
  DerivedExtractionArtifactEntity,
  ImportDraftEntity,
  ImportedDocumentEntity,
  TypeOrmImportResumeRepository,
  type DataSource,
} from "@nuvitae/persistence";
import { ConfirmStructuredResumeService } from "../../../apps/api/src/services/import-resume/confirm-structured-resume.js";
import type { IsolatedPersistenceTestDatabase } from "../persistence/test-database.js";
import { createIsolatedPersistenceTestDatabase } from "../persistence/test-database.js";
import { ids, importDraft, importedDocument } from "../persistence/fixtures.js";

const now = new Date("2026-07-29T09:00:00.000Z");
const retention = new Date("2026-08-04T08:00:00.000Z");
const expiredRetention = new Date("2026-07-28T09:00:00.000Z");

describe("resume or discard draft PostgreSQL integration", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmImportResumeRepository;
  let confirmService: ConfirmStructuredResumeService;
  let generatedId = 1;
  let requestId = 1;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("us3_draft");
    repository = new TypeOrmImportResumeRepository(database.dataSource);
    confirmService = new ConfirmStructuredResumeService(
      repository,
      repository,
      { now: () => now },
      {
        nextId: () =>
          `70000000-0000-4000-8000-${String(generatedId++).padStart(12, "0")}`,
      },
      {
        nextRequestId: () =>
          `90000000-0000-4000-8000-${String(requestId++).padStart(12, "0")}`,
      },
      { emit: () => undefined },
    );
  });

  beforeEach(async () => {
    generatedId = 1;
    requestId = 1;
    await truncateImportResumeTables(database.dataSource);
  });

  afterAll(async () => {
    if (database !== undefined) await database.cleanup();
  });

  it("allows the owner to resume unconfirmed drafts before expiry", async () => {
    await seedImportDraft(importDraft({ retentionExpiresAt: retention }));
    await expectResumeVisibility(ids.ownerA, {
      visible: true,
      status: "review_required",
      reviewRevision: 0,
    });

    await truncateImportResumeTables(database.dataSource);
    await seedImportDraft(
      importDraft({
        status: "ready_to_confirm",
        reviewRevision: 3,
        warnings: [],
        fields: [
          {
            ...withoutWarning(importDraft().fields[0]!),
            reviewStatus: "confirmed",
            confidenceStatus: "high",
          },
        ],
        retentionExpiresAt: retention,
      }),
    );

    await expectResumeVisibility(ids.ownerA, {
      visible: true,
      status: "ready_to_confirm",
      reviewRevision: 3,
    });
  });

  it("does not reopen expired, discarded, wrong-owner, or confirmed drafts for review", async () => {
    await seedImportDraft(
      importDraft({
        status: "expired",
        retentionExpiresAt: expiredRetention,
        expiredAt: expiredRetention,
      }),
    );
    await expectResumeVisibility(ids.ownerA, {
      visible: false,
      status: "expired",
    });

    await truncateImportResumeTables(database.dataSource);
    await seedImportDraft(
      importDraft({
        status: "discarded",
        discardedAt: now,
        retentionExpiresAt: retention,
      }),
    );
    await expectResumeVisibility(ids.ownerA, {
      visible: false,
      status: "discarded",
    });

    await expectResumeVisibility(ids.ownerB, {
      visible: false,
      status: undefined,
    });

    await truncateImportResumeTables(database.dataSource);
    await seedImportDraft(
      importDraft({
        status: "confirmed",
        confirmedAt: now,
        retentionExpiresAt: retention,
      }),
    );
    await expectResumeVisibility(ids.ownerA, {
      visible: false,
      status: "confirmed",
    });
  });

  it("updates the real draft row and schedules exactly one deletion job without deleting source rows", async () => {
    await seedImportDraft(
      importDraft({
        status: "ready_to_confirm",
        reviewRevision: 4,
        retentionExpiresAt: retention,
      }),
    );

    const result = await discard({
      expectedReviewRevision: 4,
      operationId: "80000000-0000-4000-8000-000000000001",
    });

    expect(result).toMatchObject({
      ok: true,
      response: { status: "import_discarded" },
    });
    if (!result.ok) return;
    // The deletion job id is server-generated so a client-supplied operation
    // id can never collide with or reparent another user's deletion row.
    expect(result.response.deletionJobId).not.toBe(
      "80000000-0000-4000-8000-000000000001",
    );
    expect(result.response.deletionJobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const draft = await database.dataSource.manager.findOneByOrFail(
      ImportDraftEntity,
      { id: ids.draft },
    );
    expect(draft.status).toBe("discarded");
    expect(draft.discardedAt).toEqual(now);
    expect(draft.retentionExpiresAt).toEqual(retention);
    await expect(
      database.dataSource.manager.count(DeletionJobEntity),
    ).resolves.toBe(1);
    await expect(
      database.dataSource.manager.count(ImportedDocumentEntity),
    ).resolves.toBe(1);
    await expect(
      database.dataSource.manager.count(DerivedExtractionArtifactEntity),
    ).resolves.toBe(1);
    const source = await database.dataSource.manager.findOneByOrFail(
      ImportedDocumentEntity,
      { id: ids.document },
    );
    const artifact = await database.dataSource.manager.findOneByOrFail(
      DerivedExtractionArtifactEntity,
      { id: ids.artifact },
    );
    expect(source.deletionStatus).toBe("not_scheduled");
    expect(source.deletedAt).toBeNull();
    expect(artifact.deletionStatus).toBe("not_scheduled");
    expect(artifact.deletedAt).toBeNull();
  });

  it("does not create a duplicate deletion job on repeated discard", async () => {
    await seedImportDraft(
      importDraft({
        status: "ready_to_confirm",
        reviewRevision: 4,
        retentionExpiresAt: retention,
      }),
    );

    const first = await discard({
      expectedReviewRevision: 4,
      operationId: "80000000-0000-4000-8000-000000000001",
    });
    const second = await discard({
      expectedReviewRevision: 4,
      operationId: "80000000-0000-4000-8000-000000000002",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.response.deletionJobId).toBe(first.response.deletionJobId);
    await expect(
      database.dataSource.manager.count(DeletionJobEntity),
    ).resolves.toBe(1);
  });

  it("rejects expired discard without scheduling cleanup", async () => {
    await seedImportDraft(
      importDraft({
        status: "ready_to_confirm",
        reviewRevision: 4,
        retentionExpiresAt: expiredRetention,
      }),
    );

    const result = await discard({
      expectedReviewRevision: 4,
      operationId: "80000000-0000-4000-8000-000000000003",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 410,
      code: "expired",
    });
    await expect(
      database.dataSource.manager.count(DeletionJobEntity),
    ).resolves.toBe(0);
  });

  it("rolls stale discard back completely", async () => {
    const draft = importDraft({
      status: "ready_to_confirm",
      reviewRevision: 4,
      retentionExpiresAt: retention,
    });
    await seedImportDraft(draft);
    await database.dataSource.manager.update(
      ImportDraftEntity,
      { id: draft.id, ownerUserId: draft.ownerUserId },
      { reviewRevision: 5 },
    );

    await expect(
      repository.transaction((manager) =>
        repository.discardDraftAndScheduleDeletion(
          {
            draft,
            job: deletionJob("80000000-0000-4000-8000-000000000004"),
            discardedAt: now,
          },
          manager,
        ),
      ),
    ).rejects.toThrow("stale_review_revision");

    const stored = await database.dataSource.manager.findOneByOrFail(
      ImportDraftEntity,
      { id: ids.draft },
    );
    expect(stored.status).toBe("ready_to_confirm");
    expect(stored.reviewRevision).toBe(5);
    expect(stored.discardedAt).toBeNull();
    await expect(
      database.dataSource.manager.count(DeletionJobEntity),
    ).resolves.toBe(0);
  });

  async function seedImportDraft(draft: ImportDraft): Promise<void> {
    await repository.transaction(async (manager) => {
      await repository.createImportAggregate(
        {
          document: importedDocument({
            retentionExpiresAt: draft.retentionExpiresAt,
          }),
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
              retentionExpiresAt: draft.retentionExpiresAt,
            },
          ],
        },
        manager,
      );
      await repository.saveDraft(draft, manager);
    });
  }

  async function readDraft(ownerUserId: string) {
    return repository.findReviewDraftByImportAndOwner(
      ids.document,
      ownerUserId,
    );
  }

  async function expectResumeVisibility(
    ownerUserId: string,
    expected:
      | {
          readonly visible: true;
          readonly status: "review_required" | "ready_to_confirm";
          readonly reviewRevision: number;
        }
      | {
          readonly visible: false;
          readonly status: ImportDraft["status"] | undefined;
        },
  ): Promise<void> {
    const draft = await readDraft(ownerUserId);
    if (expected.visible) {
      expect(draft).toMatchObject({
        status: expected.status,
        reviewRevision: expected.reviewRevision,
      });
      expect(draft?.retentionExpiresAt.getTime()).toBeGreaterThan(
        now.getTime(),
      );
      return;
    }
    if (draft === null) {
      expect(expected.status).toBeUndefined();
      return;
    }
    expect(draft.status).toBe(expected.status);
    expect(draft.status === "review_required").toBe(false);
    expect(draft.status === "ready_to_confirm").toBe(false);
  }

  async function discard(input: {
    readonly expectedReviewRevision: number;
    readonly operationId: string;
  }) {
    return confirmService.discard({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: { ...input, explicitDiscard: true },
      requestId: "90000000-0000-4000-8000-000000000202",
    });
  }
});

async function truncateImportResumeTables(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query(
    `TRUNCATE
      deletion_jobs,
      structured_resume_items,
      work_role_details,
      work_experience_roles,
      work_experiences,
      structured_resume_texts,
      structured_resumes,
      user_corrections,
      extracted_fields,
      import_warnings,
      import_drafts,
      derived_extraction_artifacts,
      imported_documents
    RESTART IDENTITY CASCADE`,
  );
}

function deletionJob(id: string): DeletionJob {
  return {
    id,
    importedDocumentId: ids.document,
    ownerUserId: ids.ownerA,
    reason: "user_discarded_import",
    status: "scheduled",
    scheduledAt: now,
    verificationStatus: "not_started",
  };
}

function withoutWarning<T extends ExtractedField>(
  value: T,
): Omit<T, "warningId"> {
  const { warningId, ...next } = value;
  void warningId;
  return next as Omit<T, "warningId">;
}
