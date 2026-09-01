import { describe, expect, it, vi } from "vitest";
import type { StructuredResume } from "@nuvitae/domain";
import {
  createPrivacySafeSemanticProviderError,
  type ContextualResumeEditProvider,
} from "@nuvitae/import-application";
import type { ResumeWorkspaceRepository } from "./resume-workspace.repository.js";
import {
  ContextualResumeEditingError,
  ContextualResumeEditingService,
  resolveTargetText,
} from "./contextual-resume-editing.service.js";

const ownerUserId = "10000000-0000-4000-8000-000000000001";
const resumeId = "30000000-0000-4000-8000-000000000001";

describe("ContextualResumeEditingService", () => {
  it("returns a review-only grounded proposal without writing the resume", async () => {
    const resume = fixtureResume();
    const provider = fixtureProvider({
      propose: vi.fn().mockResolvedValue({
        ok: true,
        proposedText: "Managed platform reliability.",
      }),
    });
    const repository = fixtureRepository(resume);

    const response = await new ContextualResumeEditingService(
      repository,
      provider,
    ).propose({
      ownerUserId,
      resumeId,
      expectedUpdatedAt: resume.updatedAt.toISOString(),
      action: "make_concise",
      target: { kind: "summary" },
    });

    expect(response.before).toBe(
      "Was responsible for managing platform reliability.",
    );
    expect(response.after).toBe("Managed platform reliability.");
    expect(provider.propose).toHaveBeenCalledWith(
      {
        action: "make_concise",
        currentText: "Was responsible for managing platform reliability.",
      },
      { ownerUserId, timeoutMs: 30_000 },
    );
    expect(repository.replaceStructuredResume).not.toHaveBeenCalled();
  });

  it("blocks a provider proposal that adds an unsupported metric", async () => {
    const resume = fixtureResume();
    const repository = fixtureRepository(resume);
    const service = new ContextualResumeEditingService(
      repository,
      fixtureProvider({
        propose: vi.fn().mockResolvedValue({
          ok: true,
          proposedText:
            "Was responsible for managing platform reliability by 40 percent.",
        }),
      }),
    );

    await expect(
      service.propose({
        ownerUserId,
        resumeId,
        expectedUpdatedAt: resume.updatedAt.toISOString(),
        action: "strengthen_impact",
        target: { kind: "summary" },
      }),
    ).rejects.toEqual(
      new ContextualResumeEditingError(
        422,
        "unsafe_proposal",
        "The proposal was blocked because it could change or add facts.",
      ),
    );
    expect(repository.replaceStructuredResume).not.toHaveBeenCalled();
  });

  it("leaves content untouched when the provider fails", async () => {
    const resume = fixtureResume();
    const repository = fixtureRepository(resume);
    const service = new ContextualResumeEditingService(
      repository,
      fixtureProvider({
        propose: vi.fn().mockResolvedValue({
          ok: false,
          error: createPrivacySafeSemanticProviderError("provider_unavailable"),
        }),
      }),
    );

    await expect(
      service.propose({
        ownerUserId,
        resumeId,
        expectedUpdatedAt: resume.updatedAt.toISOString(),
        action: "fix_grammar",
        target: { kind: "summary" },
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
    expect(repository.replaceStructuredResume).not.toHaveBeenCalled();
  });

  it("resolves only the identified work bullet", () => {
    const resume = fixtureResume();
    expect(
      resolveTargetText(resume, {
        kind: "work_achievement",
        experienceId: "40000000-0000-4000-8000-000000000001",
        roleId: "50000000-0000-4000-8000-000000000001",
        itemIndex: 0,
      }),
    ).toBe("Reduced latency by 20%.");
  });
});

function fixtureProvider(
  overrides: Partial<ContextualResumeEditProvider> = {},
): ContextualResumeEditProvider {
  return {
    providerKind: "test",
    propose: vi.fn(),
    ...overrides,
  };
}

function fixtureRepository(
  resume: StructuredResume,
): ResumeWorkspaceRepository {
  const repository: ResumeWorkspaceRepository = {
    transaction: async (work) => work(repository),
    listStructuredResumesByOwner: vi.fn().mockResolvedValue([]),
    listManualDraftsByOwner: vi.fn().mockResolvedValue([]),
    findStructuredResumeByOwner: vi.fn().mockResolvedValue(resume),
    findStructuredResumeByOwnerForUpdate: vi.fn().mockResolvedValue(resume),
    replaceStructuredResume: vi.fn(),
  };
  return repository;
}

function fixtureResume(): StructuredResume {
  const text = (value: string) => ({
    value,
    sourceStatus: "explicit_source" as const,
    confidenceStatus: "high" as const,
    inferenceStatus: "not_inferred" as const,
  });
  return {
    id: resumeId,
    ownerUserId,
    provenanceLabel: "imported_from_initial_resume",
    confirmationStatus: "confirmed",
    content: {
      personal: [],
      contact: [],
      summary: text("Was responsible for managing platform reliability."),
      workExperiences: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          employerName: "Acme",
          roles: [
            {
              id: "50000000-0000-4000-8000-000000000001",
              title: "Engineer",
              isOngoing: true,
              responsibilities: [text("Managed platform reliability.")],
              achievements: [text("Reduced latency by 20%.")],
              sourceStatus: "explicit_source",
              reviewStatus: "confirmed",
              inferenceStatus: "not_inferred",
            },
          ],
          reviewStatus: "confirmed",
          inferenceStatus: "not_inferred",
        },
      ],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    createdAt: new Date("2026-08-30T08:00:00.000Z"),
    updatedAt: new Date("2026-08-30T09:00:00.000Z"),
  };
}
