import { Inject, Injectable } from "@nestjs/common";
import { requireOwnedResource } from "../auth/ownership.js";
import type { AuthenticatedUserContext } from "../auth/user-context.js";
import { API_MANUAL_RESUME_DRAFT_REPOSITORY } from "../persistence/api-persistence.module.js";
import type { ManualResumeDraftRepository } from "./manual-resume.repository.js";
import type { ManualResumeRequestIdGenerator } from "./manual-resume.ports.js";
import { MANUAL_RESUME_REQUEST_ID_GENERATOR } from "./manual-resume.tokens.js";
import { manualDraftResponse } from "./manual-resume.response.js";

@Injectable()
export class GetManualResumeDraftService {
  constructor(
    @Inject(API_MANUAL_RESUME_DRAFT_REPOSITORY)
    private readonly repository: ManualResumeDraftRepository,
    @Inject(MANUAL_RESUME_REQUEST_ID_GENERATOR)
    private readonly requestIdGenerator: ManualResumeRequestIdGenerator,
  ) {}

  async get(input: {
    readonly context: AuthenticatedUserContext;
    readonly draftId: string;
  }) {
    const draft = requireOwnedResource(
      input.context,
      await this.repository.findManualDraftByOwner(
        input.draftId,
        input.context.userId,
      ),
    );
    return manualDraftResponse({
      requestId: this.requestIdGenerator.nextRequestId(),
      draft,
      userMessage: "Your saved resume draft is ready.",
    });
  }
}
