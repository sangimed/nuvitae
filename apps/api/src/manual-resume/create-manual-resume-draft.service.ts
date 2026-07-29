import { Inject, Injectable } from "@nestjs/common";
import {
  createBlankManualStructuredResumeDraft,
  validateManualContent,
} from "@nuvitae/domain";
import type {
  ManualResumeDraftRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import {
  API_MANUAL_RESUME_DRAFT_REPOSITORY,
  API_PERSISTENCE_TRANSACTION_RUNNER,
} from "../persistence/api-persistence.module.js";
import type {
  ManualResumeClock,
  ManualResumeIdGenerator,
  ManualResumeRequestIdGenerator,
} from "./manual-resume.ports.js";
import {
  MANUAL_RESUME_CLOCK,
  MANUAL_RESUME_ID_GENERATOR,
  MANUAL_RESUME_REQUEST_ID_GENERATOR,
} from "./manual-resume.tokens.js";
import { manualDraftResponse } from "./manual-resume.response.js";

@Injectable()
export class CreateManualResumeDraftService {
  constructor(
    @Inject(API_MANUAL_RESUME_DRAFT_REPOSITORY)
    private readonly repository: ManualResumeDraftRepository,
    @Inject(API_PERSISTENCE_TRANSACTION_RUNNER)
    private readonly transactionRunner: PersistenceTransactionRunner,
    @Inject(MANUAL_RESUME_CLOCK)
    private readonly clock: ManualResumeClock,
    @Inject(MANUAL_RESUME_ID_GENERATOR)
    private readonly idGenerator: ManualResumeIdGenerator,
    @Inject(MANUAL_RESUME_REQUEST_ID_GENERATOR)
    private readonly requestIdGenerator: ManualResumeRequestIdGenerator,
  ) {}

  async create(input: {
    readonly ownerUserId: string;
    readonly creationKey: string;
  }) {
    const draft = await this.transactionRunner.transaction(async (manager) => {
      const existing = await this.repository.findManualDraftByCreationKey(
        input.creationKey,
        input.ownerUserId,
        manager,
      );
      if (existing !== null) return existing;

      const createdAt = this.clock.now();
      const candidate = createBlankManualStructuredResumeDraft({
        id: this.idGenerator.nextId(),
        ownerUserId: input.ownerUserId,
        createdAt,
      });
      const content = validateManualContent(candidate.content);
      if (!content.ok) {
        throw new Error("blank_manual_content_invalid");
      }
      return this.repository.createManualDraft(
        { draft: candidate, creationKey: input.creationKey },
        manager,
      );
    });

    return manualDraftResponse({
      requestId: this.requestIdGenerator.nextRequestId(),
      draft,
      userMessage: "Your blank resume draft is ready to edit.",
    });
  }
}
