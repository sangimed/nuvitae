import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StructuredResume } from "@nuvitae/domain";
import { TypeOrmImportResumeRepository } from "@nuvitae/persistence";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";
import { ids } from "./fixtures.js";

describe("resume workspace persistence", () => {
  let database!: IsolatedPersistenceTestDatabase;
  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("resume_workspace");
  });
  afterAll(async () => database?.cleanup());

  it("lists by owner and atomically replaces editable confirmed content", async () => {
    const repository = new TypeOrmImportResumeRepository(database.dataSource);
    const resume = fixtureResume();
    await repository.saveStructuredResume(resume);

    expect(await repository.listStructuredResumesByOwner(ids.ownerB)).toEqual(
      [],
    );
    expect(
      (await repository.listStructuredResumesByOwner(ids.ownerA)).map(
        (item) => item.id,
      ),
    ).toEqual([resume.id]);

    const saved = await repository.transaction(async (manager) => {
      const locked = await repository.findStructuredResumeByOwnerForUpdate(
        resume.id,
        ids.ownerA,
        manager,
      );
      expect(locked).not.toBeNull();
      return repository.replaceStructuredResume(
        {
          ...locked!,
          content: {
            ...locked!.content,
            sectionOrder: [
              "summary",
              "basics",
              "workExperiences",
              "education",
              "projects",
              "skills",
              "certifications",
              "languages",
              "professionalLinks",
            ],
            headline: {
              value: "Staff Engineer",
              sourceStatus: "user_edited",
              confidenceStatus: "not_applicable",
              inferenceStatus: "not_inferred",
            },
          },
          updatedAt: new Date("2026-08-20T10:00:00.000Z"),
        },
        locked!.updatedAt,
        manager,
      );
    });

    expect(saved.content.headline?.value).toBe("Staff Engineer");
    expect(saved.content.headline?.sourceStatus).toBe("user_edited");
    expect(saved.content.sectionOrder?.[0]).toBe("summary");
    expect(
      await repository.findStructuredResumeByOwner(resume.id, ids.ownerB),
    ).toBeNull();
  });
});

function fixtureResume(): StructuredResume {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    ownerUserId: ids.ownerA,
    provenanceLabel: "imported_from_initial_resume",
    confirmationStatus: "confirmed",
    content: {
      personal: [],
      contact: [],
      headline: {
        value: "Engineer",
        sourceStatus: "explicit_source",
        sourceLocation: {
          kind: "minimal",
          label: "imported_from_initial_resume",
          confirmedByUser: true,
        },
        confidenceStatus: "high",
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
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    updatedAt: new Date("2026-08-20T09:00:00.000Z"),
  };
}
