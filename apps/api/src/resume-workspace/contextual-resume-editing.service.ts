import { Inject, Injectable } from "@nestjs/common";
import {
  contextualResumeEditProposalResponseSchema,
  importResumeResponseSchemaVersion,
  type ContextualResumeEditAction,
  type ContextualResumeEditTarget,
} from "@nuvitae/contracts";
import type { StructuredResume } from "@nuvitae/domain";
import {
  validateFactPreservingEdit,
  type ContextualResumeEditProvider,
} from "@nuvitae/import-application";
import { randomUUID } from "node:crypto";
import { API_RESUME_WORKSPACE_REPOSITORY } from "../persistence/api-persistence.module.js";
import { API_CONTEXTUAL_RESUME_EDIT_PROVIDER } from "../provider-connections/ports/tokens.js";
import type { ResumeWorkspaceRepository } from "./resume-workspace.repository.js";

export type ContextualResumeEditingErrorCode =
  | "not_found"
  | "stale_update"
  | "target_unavailable"
  | "provider_not_configured"
  | "provider_unavailable"
  | "unsafe_proposal";

export class ContextualResumeEditingError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 503,
    readonly code: ContextualResumeEditingErrorCode,
    readonly userMessage: string,
  ) {
    super(code);
    this.name = "ContextualResumeEditingError";
  }
}

@Injectable()
export class ContextualResumeEditingService {
  constructor(
    @Inject(API_RESUME_WORKSPACE_REPOSITORY)
    private readonly resumes: ResumeWorkspaceRepository,
    @Inject(API_CONTEXTUAL_RESUME_EDIT_PROVIDER)
    private readonly provider: ContextualResumeEditProvider,
  ) {}

  async propose(input: {
    readonly ownerUserId: string;
    readonly resumeId: string;
    readonly expectedUpdatedAt: string;
    readonly action: ContextualResumeEditAction;
    readonly target: ContextualResumeEditTarget;
  }) {
    const resume = await this.resumes.findStructuredResumeByOwner(
      input.resumeId,
      input.ownerUserId,
    );
    if (resume === null) {
      throw new ContextualResumeEditingError(
        404,
        "not_found",
        "Resume not found.",
      );
    }
    if (resume.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new ContextualResumeEditingError(
        409,
        "stale_update",
        "Save or reload the current resume before using AI editing.",
      );
    }
    const before = resolveTargetText(resume, input.target);
    if (before === null || before.trim() === "") {
      throw new ContextualResumeEditingError(
        422,
        "target_unavailable",
        "Add and save content before asking AI to edit it.",
      );
    }

    const result = await this.provider.propose(
      { action: input.action, currentText: before },
      { ownerUserId: input.ownerUserId, timeoutMs: 30_000 },
    );
    if (!result.ok) throw providerError(result.error.code);
    const grounded = validateFactPreservingEdit(before, result.proposedText);
    if (!grounded.ok) {
      throw new ContextualResumeEditingError(
        422,
        "unsafe_proposal",
        "The proposal was blocked because it could change or add facts.",
      );
    }
    return contextualResumeEditProposalResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId: randomUUID(),
      status: "contextual_resume_edit_proposal",
      proposalId: randomUUID(),
      action: input.action,
      target: input.target,
      before,
      after: grounded.proposedText,
      generatedAt: new Date().toISOString(),
      userMessage: "Review the proposal before accepting it.",
    });
  }
}

export function resolveTargetText(
  resume: StructuredResume,
  target: ContextualResumeEditTarget,
): string | null {
  if (target.kind === "summary") return resume.content.summary?.value ?? null;
  if (target.kind === "project_description") {
    return (
      resume.content.projects.find((project) => project.id === target.projectId)
        ?.description?.value ?? null
    );
  }
  const role = resume.content.workExperiences
    .find((experience) => experience.id === target.experienceId)
    ?.roles.find((candidate) => candidate.id === target.roleId);
  const values =
    target.kind === "work_responsibility"
      ? role?.responsibilities
      : role?.achievements;
  return values?.[target.itemIndex]?.value ?? null;
}

function providerError(code: string): ContextualResumeEditingError {
  if (code === "not_configured") {
    return new ContextualResumeEditingError(
      503,
      "provider_not_configured",
      "Connect an AI provider before using AI editing.",
    );
  }
  return new ContextualResumeEditingError(
    503,
    "provider_unavailable",
    "AI editing is temporarily unavailable. Your resume was not changed.",
  );
}
