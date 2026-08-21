import { Inject, Injectable } from "@nestjs/common";
import {
  importResumeResponseSchemaVersion,
  reviewMutationRequestSchema,
  reviewMutationResponseSchema,
  type ReviewMutationRequest,
  type ReviewMutationResponse,
} from "@nuvitae/contracts";
import {
  applyReviewCommand,
  type ExtractedValue,
  type ReviewCommand,
} from "@nuvitae/domain";
import {
  ReviewCorrectionOperationIdConflictError,
  type ImportReviewMutationRepository,
} from "@nuvitae/import-application";
import { API_IMPORT_REVIEW_REPOSITORY } from "../../persistence/api-persistence.module.js";
import type { ImportEventEmitter } from "../../observability/import-events.js";
import type {
  StartImportClock,
  StartImportIdGenerator,
} from "../../import-resume/start-import.ports.js";
import {
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_PRIVACY_LOGGER,
} from "../../import-resume/start-import.tokens.js";
import type { ImportStatusRequestIdGenerator } from "../../import-resume/import-status.ports.js";
import { buildReviewDraftResponse } from "./read-draft.js";

export type UpdateReviewResult =
  | { readonly ok: true; readonly response: ReviewMutationResponse }
  | {
      readonly ok: false;
      readonly status: 400 | 404 | 409 | 410;
      readonly code:
        | "not_found"
        | "not_ready"
        | "stale_review"
        | "lifecycle_not_reviewable"
        | "validation_failed";
      readonly requestId: string;
      readonly message: string;
    };

@Injectable()
export class UpdateImportReviewService {
  constructor(
    @Inject(API_IMPORT_REVIEW_REPOSITORY)
    private readonly repository: ImportReviewMutationRepository,
    @Inject(START_IMPORT_CLOCK)
    private readonly clock: StartImportClock,
    @Inject(START_IMPORT_ID_GENERATOR)
    private readonly ids: StartImportIdGenerator,
    @Inject(IMPORT_STATUS_REQUEST_ID_GENERATOR)
    private readonly requestIds: ImportStatusRequestIdGenerator,
    @Inject(START_IMPORT_PRIVACY_LOGGER)
    private readonly logger: ImportEventEmitter,
  ) {}

  async update(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly body: unknown;
    readonly requestId?: string;
  }): Promise<UpdateReviewResult> {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const parsed = reviewMutationRequestSchema.safeParse(input.body);
    if (!parsed.success) {
      return {
        ok: false,
        status: 400,
        code: "validation_failed",
        requestId,
        message:
          "The review action could not be applied. Check the highlighted input and try again.",
      };
    }

    try {
      return await this.repository.transaction((repository) =>
        this.updateInTransaction({
          ownerUserId: input.ownerUserId,
          importId: input.importId,
          requestId,
          request: parsed.data,
          repository,
        }),
      );
    } catch (error) {
      if (error instanceof ReviewCorrectionOperationIdConflictError) {
        this.logger.emit("import.resource_not_found", {
          importId: input.importId,
          operation: "review",
        });
        return {
          ok: false,
          status: 404,
          code: "not_found",
          requestId,
          message:
            "We could not find that import. It may be unavailable or no longer accessible.",
        };
      }
      throw error;
    }
  }

  private async updateInTransaction(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly requestId: string;
    readonly request: ReviewMutationRequest;
    readonly repository: ImportReviewMutationRepository;
  }): Promise<UpdateReviewResult> {
    const draft =
      await input.repository.findReviewDraftByImportAndOwnerForUpdate(
        input.importId,
        input.ownerUserId,
      );
    if (draft === null) {
      this.logger.emit("import.resource_not_found", {
        importId: input.importId,
        operation: "review",
      });
      return {
        ok: false,
        status: 404,
        code: "not_found",
        requestId: input.requestId,
        message:
          "We could not find that import. It may be unavailable or no longer accessible.",
      };
    }
    if (
      draft.status !== "review_required" &&
      draft.status !== "ready_to_confirm"
    ) {
      return {
        ok: false,
        status: draft.status === "expired" ? 410 : 409,
        code: "lifecycle_not_reviewable",
        requestId: input.requestId,
        message: "This import cannot be reviewed in its current state.",
      };
    }

    const existing = await input.repository.findCorrectionByOwnerAndOperation(
      input.request.operationId,
      input.ownerUserId,
    );
    if (existing !== null) {
      if (existing.importDraftId !== draft.id) {
        return stale(input.requestId);
      }
      this.emitReviewCorrected(
        input.importId,
        draft.id,
        input.request.action.type,
        draft.reviewRevision,
        input.requestId,
      );
      return {
        ok: true,
        response: this.response(input.requestId, input.importId, draft),
      };
    }

    if (input.request.expectedReviewRevision !== draft.reviewRevision) {
      return stale(input.requestId);
    }

    const domain = applyReviewCommand({
      draft,
      ownerUserId: input.ownerUserId,
      command: this.toDomainCommand(input.request),
      now: this.clock.now(),
    });
    if (!domain.ok) {
      return {
        ok: false,
        status: 400,
        code: "validation_failed",
        requestId: input.requestId,
        message: domain.message,
      };
    }

    const saved = await input.repository.saveReviewMutation({
      draft: domain.draft,
      correction: domain.correction,
      previousReviewRevision: draft.reviewRevision,
    });
    this.emitReviewCorrected(
      input.importId,
      saved.id,
      input.request.action.type,
      saved.reviewRevision,
      input.requestId,
    );
    return {
      ok: true,
      response: this.response(input.requestId, input.importId, saved),
    };
  }

  private toDomainCommand(request: ReviewMutationRequest): ReviewCommand {
    switch (request.action.type) {
      case "add_field":
        return {
          ...request.action,
          operationId: request.operationId,
          fieldId: this.ids.nextId(),
          value: request.action.value as ExtractedValue,
        };
      case "complete_missing_field":
        return {
          ...request.action,
          operationId: request.operationId,
          fieldId: this.ids.nextId(),
          value: request.action.value as ExtractedValue,
        };
      case "edit_field":
        return {
          ...request.action,
          operationId: request.operationId,
          value: request.action.value as ExtractedValue,
        };
      default:
        return { ...request.action, operationId: request.operationId };
    }
  }

  private response(
    requestId: string,
    importId: string,
    draft: Parameters<typeof buildReviewDraftResponse>[0]["draft"],
  ): ReviewMutationResponse {
    const read = buildReviewDraftResponse({ requestId, importId, draft });
    return reviewMutationResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId,
      status: "review_updated",
      importId,
      draftId: draft.id,
      reviewRevision: draft.reviewRevision,
      draft: read,
      userMessage: "Your review change was saved.",
    });
  }

  private emitReviewCorrected(
    importId: string,
    draftId: string,
    operationType:
      | "confirm_field"
      | "edit_field"
      | "remove_field"
      | "add_field"
      | "complete_missing_field"
      | "resolve_warning"
      | "exclude_section",
    reviewRevision: number,
    requestId: string,
  ): void {
    this.logger.emit("review.corrected", {
      importId,
      draftId,
      operationType,
      reviewRevision,
      requestId,
    });
  }
}

function stale(requestId: string): UpdateReviewResult {
  return {
    ok: false,
    status: 409,
    code: "stale_review",
    requestId,
    message:
      "This review changed in another tab or session. Refresh the review and try again.",
  };
}
