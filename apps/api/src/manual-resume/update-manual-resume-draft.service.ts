import { Inject, Injectable } from "@nestjs/common";
import { requireOwnedResource } from "../auth/ownership.js";
import type { AuthenticatedUserContext } from "../auth/user-context.js";
import {
  ManualDraftValidationError,
  updateManualDraftContent,
} from "@nuvitae/domain";
import type { StructuredResumeContent } from "@nuvitae/domain";
import type {
  ManualResumeDraftRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import {
  API_MANUAL_RESUME_DRAFT_REPOSITORY,
  API_PERSISTENCE_TRANSACTION_RUNNER,
} from "../persistence/api-persistence.module.js";
import { ManualResumeHttpError } from "./manual-resume.errors.js";
import type {
  ManualResumeClock,
  ManualResumeRequestIdGenerator,
} from "./manual-resume.ports.js";
import {
  MANUAL_RESUME_CLOCK,
  MANUAL_RESUME_REQUEST_ID_GENERATOR,
} from "./manual-resume.tokens.js";
import { manualDraftResponse } from "./manual-resume.response.js";

@Injectable()
export class UpdateManualResumeDraftService {
  constructor(
    @Inject(API_MANUAL_RESUME_DRAFT_REPOSITORY)
    private readonly repository: ManualResumeDraftRepository,
    @Inject(API_PERSISTENCE_TRANSACTION_RUNNER)
    private readonly transactionRunner: PersistenceTransactionRunner,
    @Inject(MANUAL_RESUME_CLOCK)
    private readonly clock: ManualResumeClock,
    @Inject(MANUAL_RESUME_REQUEST_ID_GENERATOR)
    private readonly requestIdGenerator: ManualResumeRequestIdGenerator,
  ) {}

  async update(input: {
    readonly context: AuthenticatedUserContext;
    readonly draftId: string;
    readonly expectedUpdatedAt: string;
    readonly content: StructuredResumeContent;
  }) {
    const draft = await this.transactionRunner.transaction(async (manager) => {
      const current = requireOwnedResource(
        input.context,
        await this.repository.findManualDraftByOwner(
          input.draftId,
          input.context.userId,
          manager,
        ),
      );
      if (current.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new ManualResumeHttpError(
          409,
          "stale_update",
          "This draft changed in another tab. Reload before saving.",
        );
      }
      try {
        return await this.repository.saveManualDraft(
          updateManualDraftContent(current, input.content, this.clock.now()),
          manager,
        );
      } catch (error) {
        if (error instanceof ManualDraftValidationError) {
          throw new ManualResumeHttpError(
            400,
            "validation_failed",
            "Fix the highlighted fields before saving.",
            error.issues,
          );
        }
        throw error;
      }
    });

    return manualDraftResponse({
      requestId: this.requestIdGenerator.nextRequestId(),
      draft,
      userMessage: "Your resume draft was saved.",
    });
  }
}
