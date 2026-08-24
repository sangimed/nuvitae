import { Inject, Injectable } from "@nestjs/common";
import {
  confirmedStructuredResumeReadResponseSchema,
  importResumeResponseSchemaVersion,
  resumeWorkspaceListResponseSchema,
  type ResumeWorkspaceItem,
} from "@nuvitae/contracts";
import {
  updateConfirmedStructuredResumeContent,
  type ManualStructuredResumeDraft,
  type StructuredResume,
  type StructuredResumeContent,
} from "@nuvitae/domain";
import { randomUUID } from "node:crypto";
import { API_RESUME_WORKSPACE_REPOSITORY } from "../persistence/api-persistence.module.js";
import { toConfirmedContent } from "../import-resume/use-cases/confirm-structured-resume.js";
import type { ResumeWorkspaceRepository } from "./resume-workspace.repository.js";

export class ResumeWorkspaceError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: "validation_failed" | "not_found" | "stale_update",
    readonly userMessage: string,
  ) {
    super(code);
    this.name = "ResumeWorkspaceError";
  }
}

@Injectable()
export class ResumeWorkspaceService {
  constructor(
    @Inject(API_RESUME_WORKSPACE_REPOSITORY)
    private readonly resumes: ResumeWorkspaceRepository,
  ) {}

  async list(ownerUserId: string) {
    const [confirmed, manual] = await Promise.all([
      this.resumes.listStructuredResumesByOwner(ownerUserId),
      this.resumes.listManualDraftsByOwner(ownerUserId),
    ]);
    const items = [
      ...confirmed.map(confirmedItem),
      ...manual.map(manualItem),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return resumeWorkspaceListResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId: randomUUID(),
      status: "resume_workspace",
      resumes: items,
    });
  }

  async update(input: {
    readonly ownerUserId: string;
    readonly resumeId: string;
    readonly expectedUpdatedAt: string;
    readonly content: StructuredResumeContent;
  }) {
    const saved = await this.resumes.transaction(async (repository) => {
      const current = await repository.findStructuredResumeByOwnerForUpdate(
        input.resumeId,
        input.ownerUserId,
      );
      if (current === null) {
        throw new ResumeWorkspaceError(404, "not_found", "Resume not found.");
      }
      if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ResumeWorkspaceError(
          409,
          "stale_update",
          "This resume changed in another tab. Reload before saving.",
        );
      }
      const now = new Date();
      const updatedAt =
        now.getTime() > current.updatedAt.getTime()
          ? now
          : new Date(current.updatedAt.getTime() + 1);
      return repository.replaceStructuredResume(
        updateConfirmedStructuredResumeContent(
          current,
          input.content,
          updatedAt,
        ),
        current.updatedAt,
      );
    });
    return confirmedStructuredResumeReadResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId: randomUUID(),
      status: "confirmed_structured_resume",
      structuredResumeId: saved.id,
      confirmationStatus: "confirmed",
      provenanceLabel: "imported_from_initial_resume",
      content: toConfirmedContent(saved),
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
      sourceAvailability: "source_availability_unknown",
      userMessage: "Your resume was saved.",
    });
  }
}

function confirmedItem(resume: StructuredResume): ResumeWorkspaceItem {
  return {
    id: resume.id,
    kind: "confirmed_resume",
    title: resumeTitle(resume.content),
    updatedAt: resume.updatedAt.toISOString(),
    editUrl: `/resumes/${resume.id}`,
    provenanceLabel: "imported_from_initial_resume",
  };
}

function manualItem(draft: ManualStructuredResumeDraft): ResumeWorkspaceItem {
  return {
    id: draft.id,
    kind: "manual_draft",
    title: resumeTitle(draft.content),
    updatedAt: draft.updatedAt.toISOString(),
    editUrl: `/resumes/drafts/${draft.id}`,
    provenanceLabel: "manual_entry",
  };
}

function resumeTitle(content: StructuredResumeContent): string {
  return (
    content.headline?.value.trim() ||
    content.personal.find((item) => item.value.trim() !== "")?.value.trim() ||
    "Untitled resume"
  );
}
