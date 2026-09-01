import { describe, expect, it, vi } from "vitest";
import type {
  ManualStructuredResumeDraft,
  StructuredResume,
} from "@nuvitae/domain";
import type { ResumeWorkspaceRepository } from "./resume-workspace.repository.js";
import {
  ResumeWorkspaceError,
  ResumeWorkspaceService,
} from "./resume-workspace.service.js";

const ownerUserId = "10000000-0000-4000-8000-000000000001";

describe("ResumeWorkspaceService", () => {
  it("lists only through owner-scoped repository methods and orders recent resumes first", async () => {
    const confirmed = fixtureConfirmedResume();
    const manual = fixtureManualDraft();
    const repository = fixtureRepository({
      listStructuredResumesByOwner: vi.fn().mockResolvedValue([confirmed]),
      listManualDraftsByOwner: vi.fn().mockResolvedValue([manual]),
    });

    const response = await new ResumeWorkspaceService(repository).list(
      ownerUserId,
    );

    expect(repository.listStructuredResumesByOwner).toHaveBeenCalledWith(
      ownerUserId,
    );
    expect(repository.listManualDraftsByOwner).toHaveBeenCalledWith(
      ownerUserId,
    );
    expect(response.resumes.map((item) => item.id)).toEqual([
      manual.id,
      confirmed.id,
    ]);
    expect(response.resumes.map((item) => item.editUrl)).toEqual([
      `/resumes/drafts/${manual.id}`,
      `/resumes/${confirmed.id}`,
    ]);
  });

  it("fails closed when an owner-scoped resume lookup finds nothing", async () => {
    const repository = fixtureRepository({
      findStructuredResumeByOwnerForUpdate: vi.fn().mockResolvedValue(null),
    });

    await expect(
      new ResumeWorkspaceService(repository).update({
        ownerUserId,
        resumeId: "30000000-0000-4000-8000-000000000001",
        expectedUpdatedAt: "2026-08-23T09:00:00.000Z",
        content: fixtureConfirmedResume().content,
      }),
    ).rejects.toEqual(
      new ResumeWorkspaceError(404, "not_found", "Resume not found."),
    );
    expect(
      repository.findStructuredResumeByOwnerForUpdate,
    ).toHaveBeenCalledWith("30000000-0000-4000-8000-000000000001", ownerUserId);
    expect(repository.replaceStructuredResume).not.toHaveBeenCalled();
  });
});

function fixtureRepository(
  overrides: Partial<ResumeWorkspaceRepository> = {},
): ResumeWorkspaceRepository {
  const repository: ResumeWorkspaceRepository = {
    transaction: async (work) => work(repository),
    listStructuredResumesByOwner: vi.fn().mockResolvedValue([]),
    listManualDraftsByOwner: vi.fn().mockResolvedValue([]),
    findStructuredResumeByOwner: vi.fn().mockResolvedValue(null),
    findStructuredResumeByOwnerForUpdate: vi.fn().mockResolvedValue(null),
    replaceStructuredResume: vi.fn(),
    ...overrides,
  };
  return repository;
}

function fixtureConfirmedResume(): StructuredResume {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    ownerUserId,
    provenanceLabel: "imported_from_initial_resume",
    confirmationStatus: "confirmed",
    content: {
      personal: [],
      contact: [],
      headline: {
        value: "Imported engineer",
        sourceStatus: "explicit_source",
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
    createdAt: new Date("2026-08-23T08:00:00.000Z"),
    updatedAt: new Date("2026-08-23T09:00:00.000Z"),
  };
}

function fixtureManualDraft(): ManualStructuredResumeDraft {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    ownerUserId,
    source: "manual_entry",
    status: "editing",
    content: {
      ...fixtureConfirmedResume().content,
      headline: {
        value: "Manual engineer",
        sourceStatus: "user_added",
        confidenceStatus: "not_applicable",
        inferenceStatus: "not_inferred",
      },
    },
    createdAt: new Date("2026-08-23T09:30:00.000Z"),
    updatedAt: new Date("2026-08-23T10:00:00.000Z"),
  };
}
