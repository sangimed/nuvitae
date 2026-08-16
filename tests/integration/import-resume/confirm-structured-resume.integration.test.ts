import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ExtractedField, ImportDraft } from "@nuvitae/domain";
import {
  DerivedExtractionArtifactEntity,
  ImportDraftEntity,
  ImportedDocumentEntity,
  StructuredResumeEntity,
  StructuredResumeItemEntity,
  StructuredResumeTextEntity,
  TypeOrmImportResumeRepository,
  type DataSource,
} from "@nuvitae/persistence";
import { ConfirmStructuredResumeService } from "../../../apps/api/src/services/import-resume/confirm-structured-resume.js";
import type { IsolatedPersistenceTestDatabase } from "../persistence/test-database.js";
import { createIsolatedPersistenceTestDatabase } from "../persistence/test-database.js";
import { ids, importDraft, importedDocument } from "../persistence/fixtures.js";

const now = new Date("2026-07-29T09:00:00.000Z");
const retention = new Date("2026-08-04T08:00:00.000Z");

describe("confirm structured resume PostgreSQL integration", () => {
  let database: IsolatedPersistenceTestDatabase;
  let repository: TypeOrmImportResumeRepository;
  let service: ConfirmStructuredResumeService;
  let generatedId = 1;
  let requestId = 1;

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("us3_confirm");
    repository = new TypeOrmImportResumeRepository(database.dataSource);
    service = new ConfirmStructuredResumeService(
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

  it("blocks unresolved warnings without creating structured resume rows", async () => {
    await seedImportDraft(importDraft());

    const result = await service.confirm({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: confirmBody(0, "80000000-0000-4000-8000-000000000101"),
      requestId: "90000000-0000-4000-8000-000000000101",
    });

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      code: "unresolved_warnings",
    });
    await expectStructuredCounts({ roots: 0, texts: 0, items: 0 });
    await expectDraftRetentionUnchanged(ids.draft, {
      status: "review_required",
      retentionExpiresAt: retention,
      confirmedAt: null,
    });
  });

  it("creates exactly one structured resume with persisted confirmed content and child rows", async () => {
    await seedImportDraft(readyDraft());

    const result = await service.confirm({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: confirmBody(4, "80000000-0000-4000-8000-000000000102"),
      requestId: "90000000-0000-4000-8000-000000000102",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.structuredResumeId).toBe(
      "70000000-0000-4000-8000-000000000001",
    );
    expect(result.response.sourceRetentionExpiresAt).toBe(
      retention.toISOString(),
    );

    await expectStructuredCounts({ roots: 1, texts: 1, items: 1 });
    const stored = await repository.findStructuredResumeByOwner(
      result.response.structuredResumeId,
      ids.ownerA,
    );
    expect(stored?.content.headline?.value).toBe("Synthetic headline");
    expect(stored?.content.skills[0]?.name.value).toBe("TypeScript");
    expect(stored?.content.skills[0]?.name.sourceStatus).toBe("user_edited");
    await expectDraftRetentionUnchanged(ids.draft, {
      status: "confirmed",
      retentionExpiresAt: retention,
      confirmedAt: now,
    });
    await expectSourceAndArtifactRetentionUnchanged();
  });

  it("retains valid unreviewed Work Experience and Education fields on confirmation", async () => {
    const base = withoutWarning(importDraft().fields[0]!);
    await seedImportDraft(
      importDraft({
        status: "ready_to_confirm",
        reviewRevision: 0,
        warnings: [],
        retentionExpiresAt: retention,
        fields: [
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000011",
            section: "contact",
            fieldPath: "contact.email",
            value: { kind: "text", value: "jane@example.invalid" },
            reviewStatus: "confirmed",
          },
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000012",
            section: "contact",
            fieldPath: "contact.phone",
            value: { kind: "text", value: "+33 1 23 45 67 89" },
            reviewStatus: "unreviewed",
          },
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000013",
            section: "personal",
            fieldPath: "personal.full_name",
            value: { kind: "text", value: "Jane Example" },
            reviewStatus: "unreviewed",
          },
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000014",
            section: "work_experience",
            fieldPath: "work_experience.0.employer",
            value: { kind: "text", value: "Example Employer" },
            reviewStatus: "unreviewed",
          },
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000015",
            section: "work_experience",
            fieldPath: "work_experience.0.roles.0.title",
            value: { kind: "text", value: "Platform Engineer" },
            reviewStatus: "unreviewed",
          },
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000016",
            section: "education",
            fieldPath: "education.0.institution",
            value: { kind: "text", value: "Example University" },
            reviewStatus: "unreviewed",
          },
          {
            ...base,
            id: "60000000-0000-4000-8000-000000000017",
            section: "education",
            fieldPath: "education.0.credential",
            value: { kind: "text", value: "MSc Systems Engineering" },
            reviewStatus: "unreviewed",
          },
        ],
      }),
    );

    const result = await service.confirm({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: confirmBody(0, "80000000-0000-4000-8000-000000000109"),
      requestId: "90000000-0000-4000-8000-000000000109",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await repository.findStructuredResumeByOwner(
      result.response.structuredResumeId,
      ids.ownerA,
    );
    expect(stored?.content.contact.map((item) => item.value)).toEqual([
      "jane@example.invalid",
      "+33 1 23 45 67 89",
    ]);
    expect(stored?.content.personal.map((item) => item.value)).toEqual([
      "Jane Example",
    ]);
    expect(stored?.content.workExperiences[0]).toMatchObject({
      employerName: "Example Employer",
      roles: [{ title: "Platform Engineer" }],
    });
    expect(stored?.content.education[0]).toMatchObject({
      institution: { value: "Example University" },
      credential: { value: "MSc Systems Engineering" },
    });
  });

  it("returns the existing resume on retry without duplicate root or child rows", async () => {
    await seedImportDraft(readyDraft());

    const first = await service.confirm({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: confirmBody(4, "80000000-0000-4000-8000-000000000103"),
      requestId: "90000000-0000-4000-8000-000000000103",
    });
    const retry = await service.confirm({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: confirmBody(4, "80000000-0000-4000-8000-000000000104"),
      requestId: "90000000-0000-4000-8000-000000000104",
    });

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.response.structuredResumeId).toBe(
      first.response.structuredResumeId,
    );
    await expectStructuredCounts({ roots: 1, texts: 1, items: 1 });
  });

  it("serializes concurrent confirmation without duplicate root or child rows", async () => {
    await seedImportDraft(readyDraft());

    const [left, right] = await Promise.all([
      service.confirm({
        ownerUserId: ids.ownerA,
        importId: ids.document,
        body: confirmBody(4, "80000000-0000-4000-8000-000000000105"),
        requestId: "90000000-0000-4000-8000-000000000105",
      }),
      service.confirm({
        ownerUserId: ids.ownerA,
        importId: ids.document,
        body: confirmBody(4, "80000000-0000-4000-8000-000000000106"),
        requestId: "90000000-0000-4000-8000-000000000106",
      }),
    ]);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(right.response.structuredResumeId).toBe(
      left.response.structuredResumeId,
    );
    await expectStructuredCounts({ roots: 1, texts: 1, items: 1 });
  });

  it("stale and wrong-owner attempts create no structured resume rows", async () => {
    await seedImportDraft(readyDraft());

    const stale = await service.confirm({
      ownerUserId: ids.ownerA,
      importId: ids.document,
      body: confirmBody(3, "80000000-0000-4000-8000-000000000107"),
      requestId: "90000000-0000-4000-8000-000000000107",
    });
    const wrongOwner = await service.confirm({
      ownerUserId: ids.ownerB,
      importId: ids.document,
      body: confirmBody(4, "80000000-0000-4000-8000-000000000108"),
      requestId: "90000000-0000-4000-8000-000000000108",
    });

    expect(stale).toMatchObject({
      ok: false,
      status: 409,
      code: "stale_review",
    });
    expect(wrongOwner).toMatchObject({
      ok: false,
      status: 404,
      code: "not_found",
    });
    await expectStructuredCounts({ roots: 0, texts: 0, items: 0 });
    await expectDraftRetentionUnchanged(ids.draft, {
      status: "ready_to_confirm",
      retentionExpiresAt: retention,
      confirmedAt: null,
    });
  });

  it("rolls back partial structured resume rows when the draft update is stale", async () => {
    const draft = readyDraft();
    await seedImportDraft(draft);
    const mapped = await createDetachedStructuredResume(draft);
    await database.dataSource.manager.update(
      ImportDraftEntity,
      { id: draft.id, ownerUserId: draft.ownerUserId },
      { reviewRevision: 5 },
    );

    await expect(
      repository.transaction((manager) =>
        repository.confirmDraftAndCreateStructuredResume(
          { draft, resume: mapped, confirmedAt: now },
          manager,
        ),
      ),
    ).rejects.toThrow("stale_review_revision");

    await expectStructuredCounts({ roots: 0, texts: 0, items: 0 });
    await expectDraftRetentionUnchanged(ids.draft, {
      status: "ready_to_confirm",
      retentionExpiresAt: retention,
      confirmedAt: null,
    });
  });

  async function seedImportDraft(draft: ImportDraft): Promise<void> {
    await repository.transaction(async (manager) => {
      await repository.createImportAggregate(
        {
          document: importedDocument({
            retentionExpiresAt: retention,
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
              retentionExpiresAt: retention,
            },
          ],
        },
        manager,
      );
      await repository.saveDraft(draft, manager);
    });
  }

  async function expectStructuredCounts(expected: {
    readonly roots: number;
    readonly texts: number;
    readonly items: number;
  }): Promise<void> {
    await expect(
      database.dataSource.manager.count(StructuredResumeEntity),
    ).resolves.toBe(expected.roots);
    await expect(
      database.dataSource.manager.count(StructuredResumeTextEntity),
    ).resolves.toBe(expected.texts);
    await expect(
      database.dataSource.manager.count(StructuredResumeItemEntity),
    ).resolves.toBe(expected.items);
  }

  async function expectDraftRetentionUnchanged(
    draftId: string,
    expected: {
      readonly status: string;
      readonly retentionExpiresAt: Date;
      readonly confirmedAt: Date | null;
    },
  ): Promise<void> {
    const stored = await database.dataSource.manager.findOneByOrFail(
      ImportDraftEntity,
      { id: draftId },
    );
    expect(stored.status).toBe(expected.status);
    expect(stored.retentionExpiresAt).toEqual(expected.retentionExpiresAt);
    expect(stored.confirmedAt).toEqual(expected.confirmedAt);
  }

  async function expectSourceAndArtifactRetentionUnchanged(): Promise<void> {
    const source = await database.dataSource.manager.findOneByOrFail(
      ImportedDocumentEntity,
      { id: ids.document },
    );
    const artifact = await database.dataSource.manager.findOneByOrFail(
      DerivedExtractionArtifactEntity,
      { id: ids.artifact },
    );
    expect(source.retentionExpiresAt).toEqual(retention);
    expect(source.deletionStatus).toBe("not_scheduled");
    expect(source.storageKey).toBe("imports/synthetic/source");
    expect(artifact.retentionExpiresAt).toEqual(retention);
    expect(artifact.deletionStatus).toBe("not_scheduled");
    expect(artifact.storageKey).toBe("imports/synthetic/page-reference");
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

function readyDraft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  const headline = withoutWarning(importDraft().fields[0]!);
  const skill = withoutWarning(importDraft().fields[0]!);
  return importDraft({
    status: "ready_to_confirm",
    reviewRevision: 4,
    fields: [
      {
        ...headline,
        reviewStatus: "confirmed",
        confidenceStatus: "high",
      },
      {
        ...skill,
        id: "60000000-0000-4000-8000-000000000002",
        section: "skills",
        fieldPath: "skills",
        value: { kind: "text_list", values: ["TypeScript"] },
        sourceStatus: "user_edited",
        confidenceStatus: "not_applicable",
        inferenceStatus: "not_inferred",
        reviewStatus: "edited",
      },
      {
        ...withoutWarning(importDraft().fields[0]!),
        id: "60000000-0000-4000-8000-000000000003",
        reviewStatus: "excluded",
      },
    ],
    warnings: [],
    retentionExpiresAt: retention,
    ...overrides,
  });
}

async function createDetachedStructuredResume(draft: ImportDraft) {
  const { mapReviewedImportDraftToStructuredResume } =
    await import("@nuvitae/domain");
  const mapped = mapReviewedImportDraftToStructuredResume({
    draft,
    corrections: [],
    structuredResumeId: "70000000-0000-4000-8000-000000000099",
    childIds: childIds("71000000-0000-4000-8000"),
    confirmedAt: now,
    now,
  });
  expect(mapped.ok).toBe(true);
  if (!mapped.ok) throw new Error("fixture_not_mappable");
  return mapped.resume;
}

function childIds(prefix: string) {
  let next = 1;
  const id = () => `${prefix}-${String(next++).padStart(12, "0")}`;
  return {
    textItemId: id,
    workExperienceId: id,
    workRoleId: id,
    sectionItemId: id,
    linkId: id,
  };
}

function confirmBody(expectedReviewRevision: number, operationId: string) {
  return {
    operationId,
    expectedReviewRevision,
    explicitConfirmation: true,
  };
}

function withoutWarning<T extends ExtractedField>(
  value: T,
): Omit<T, "warningId"> {
  const { warningId, ...next } = value;
  void warningId;
  return next as Omit<T, "warningId">;
}
