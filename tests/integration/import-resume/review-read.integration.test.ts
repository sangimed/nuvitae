import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExtractedField, ImportDraft } from "@nuvitae/domain";
import {
  TypeOrmImportResumeRepository,
  type DataSource,
} from "@nuvitae/persistence";
import { ReadImportDraftService } from "../../../apps/api/src/services/import-resume/read-draft.js";
import type { IsolatedPersistenceTestDatabase } from "../persistence/test-database.js";
import { createIsolatedPersistenceTestDatabase } from "../persistence/test-database.js";
import { ids, importDraft, importedDocument } from "../persistence/fixtures.js";

const requestId = "90000000-0000-4000-8000-000000000301";

describe("review read partial-date PostgreSQL integration", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmImportResumeRepository;
  let readService: ReadImportDraftService;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("review_read");
    repository = new TypeOrmImportResumeRepository(database.dataSource);
    readService = new ReadImportDraftService(
      repository,
      { nextRequestId: () => requestId },
      { emit: () => undefined },
    );
  });

  afterAll(async () => {
    if (database !== undefined) await database.cleanup();
  });

  it("reads a persisted work-experience start/end pair with present endDate", async () => {
    const draft = importDraft({
      fields: [
        dateRangeField({
          value: {
            kind: "date_range",
            startDate: {
              year: 2020,
              month: 2,
              precision: "month",
              originalText: "February 2020",
            },
            endDate: { precision: "present", originalText: "Current" },
            isOngoing: true,
          },
        }),
      ],
      warnings: [],
    });
    await seed(draft);

    const result = await readService.read({
      importId: ids.document,
      ownerUserId: ids.ownerA,
      requestId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const field = result.response.sections.find(
      (section) => section.section === "work_experience",
    )?.fields[0];
    expect(field?.value).toEqual({
      kind: "date_range",
      startDate: {
        year: 2020,
        month: 2,
        precision: "month",
        originalText: "February 2020",
      },
      endDate: { precision: "present", originalText: "Current" },
      isOngoing: true,
    });
  });

  it("rejects malformed persisted partial-date data instead of serializing it", async () => {
    const malformed = importDraft({
      id: "40000000-0000-4000-8000-000000000002",
      fields: [
        dateRangeField({
          id: "60000000-0000-4000-8000-000000000002",
          importDraftId: "40000000-0000-4000-8000-000000000002",
          value: {
            kind: "date_range",
            startDate: { year: 2020, precision: "year" },
            endDate: { precision: "present", year: 2020 },
            isOngoing: true,
          } as never,
        }),
      ],
      warnings: [],
    });
    await seed(malformed);

    await expect(
      readService.read({
        importId: ids.document,
        ownerUserId: ids.ownerA,
        requestId,
      }),
    ).rejects.toThrow();
  });

  async function seed(draft: ImportDraft): Promise<void> {
    await truncateImportResumeTables(database.dataSource);
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
              retentionExpiresAt: draft.retentionExpiresAt,
            },
          ],
        },
        manager,
      );
      await repository.saveDraft(draft, manager);
    });
  }
});

async function truncateImportResumeTables(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query(`
    TRUNCATE
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
    RESTART IDENTITY CASCADE
  `);
}

function dateRangeField(
  overrides: Partial<ExtractedField> = {},
): ExtractedField {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    importDraftId: ids.draft,
    section: "work_experience",
    fieldPath: "work_experience.0.roles.0.date_range",
    value: {
      kind: "date_range",
      startDate: { year: 2020, precision: "year" },
      endDate: { precision: "present", originalText: "Present" },
      isOngoing: true,
    },
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
    reviewStatus: "unreviewed",
    createdAt: new Date("2026-07-28T08:01:00.000Z"),
    updatedAt: new Date("2026-07-28T08:01:00.000Z"),
    ...overrides,
  };
}
