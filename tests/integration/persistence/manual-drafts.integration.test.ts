import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createBlankManualStructuredResumeDraft,
  manualSourcedText,
  updateManualDraftContent,
} from "@nuvitae/domain";
import { TypeOrmImportResumeRepository } from "@nuvitae/persistence";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import {
  createIsolatedPersistenceTestDatabase,
  postgresErrorCode,
} from "./test-database.js";
import { ids } from "./fixtures.js";

const draftId = "70000000-0000-4000-8000-000000000001";

describe("manual structured resume draft persistence", () => {
  let database: IsolatedPersistenceTestDatabase;
  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("manual_drafts");
  });
  afterAll(async () => database.cleanup());

  it("creates, reloads, and updates owner-scoped manual drafts without import rows", async () => {
    const repository = new TypeOrmImportResumeRepository(database.dataSource);
    const draft = createBlankManualStructuredResumeDraft({
      id: draftId,
      ownerUserId: ids.ownerA,
      createdAt: new Date("2026-07-29T09:30:00.000Z"),
    });
    await repository.createManualDraft({
      draft,
      creationKey: "manual-key-0000001",
    });

    const byOwner = await repository.findManualDraftByOwner(
      draftId,
      ids.ownerA,
    );
    const wrongOwner = await repository.findManualDraftByOwner(
      draftId,
      ids.ownerB,
    );
    const byKey = await repository.findManualDraftByCreationKey(
      "manual-key-0000001",
      ids.ownerA,
    );
    expect(byOwner?.content.skills).toEqual([]);
    expect(wrongOwner).toBeNull();
    expect(byKey?.id).toBe(draftId);

    const saved = await repository.saveManualDraft(
      updateManualDraftContent(
        byOwner!,
        {
          ...byOwner!.content,
          skills: [
            {
              id: "80000000-0000-4000-8000-000000000001",
              name: manualSourcedText("Synthetic Skill"),
              reviewStatus: "edited",
            },
          ],
        },
        new Date("2026-07-29T09:35:00.000Z"),
      ),
    );
    expect(saved.content.skills[0]?.name.sourceStatus).toBe("user_added");
    expect(saved.content.skills[0]?.name).not.toHaveProperty("sourceLocation");

    const importRows = await database.dataSource.query<{ count: string }[]>(
      "SELECT COUNT(*)::text AS count FROM imported_documents",
    );
    const importDraftRows = await database.dataSource.query<
      { count: string }[]
    >("SELECT COUNT(*)::text AS count FROM import_drafts");
    const artifactRows = await database.dataSource.query<{ count: string }[]>(
      "SELECT COUNT(*)::text AS count FROM derived_extraction_artifacts",
    );
    const structuredRows = await database.dataSource.query<{ count: string }[]>(
      "SELECT COUNT(*)::text AS count FROM structured_resumes",
    );
    expect(importRows[0]?.count).toBe("0");
    expect(importDraftRows[0]?.count).toBe("0");
    expect(artifactRows[0]?.count).toBe("0");
    expect(structuredRows[0]?.count).toBe("0");
  });

  it("enforces owner plus creation-key idempotency and creation-key shape", async () => {
    const repository = new TypeOrmImportResumeRepository(database.dataSource);
    const draft = createBlankManualStructuredResumeDraft({
      id: "70000000-0000-4000-8000-000000000002",
      ownerUserId: ids.ownerB,
      createdAt: new Date("2026-07-29T10:00:00.000Z"),
    });
    await repository.createManualDraft({
      draft,
      creationKey: "manual-key-0000002",
    });
    await expect(
      repository.createManualDraft({
        draft: {
          ...draft,
          id: "70000000-0000-4000-8000-000000000003",
        },
        creationKey: "manual-key-0000002",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23505",
    );
    await expect(
      repository.createManualDraft({
        draft: {
          ...draft,
          id: "70000000-0000-4000-8000-000000000004",
        },
        creationKey: "bad key",
      }),
    ).rejects.toSatisfy(
      (error: unknown) => postgresErrorCode(error) === "23514",
    );
  });
});
