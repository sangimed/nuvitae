import { Inject, Injectable } from "@nestjs/common";
import {
  importResumeResponseSchemaVersion,
  sourceDeletionResponseSchema,
  type SourceDeletionResponse,
} from "@nuvitae/contracts";
import {
  SourceDeletionService as SourceDeletionApplicationService,
  type SourceDeletionRepository,
  type SourceDeletionStorage,
} from "@nuvitae/import-application";
import type { ImportEventEmitter } from "../../observability/import-events.js";
import { API_SOURCE_DELETION_REPOSITORY } from "../../persistence/api-persistence.module.js";
import type { ImportStatusRequestIdGenerator } from "../ports/import-status.js";
import type { StartImportClock } from "../ports/start-import.js";
import {
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
  START_IMPORT_CLOCK,
  START_IMPORT_PRIVATE_STORAGE,
  START_IMPORT_PRIVACY_LOGGER,
} from "../ports/tokens.js";

export type DeleteSourceResult =
  | { readonly ok: true; readonly response: SourceDeletionResponse }
  | {
      readonly ok: false;
      readonly status: 404 | 503;
      readonly code: "not_found" | "temporarily_unavailable";
      readonly requestId: string;
      readonly message: string;
    };

@Injectable()
export class DeleteSourceService {
  private readonly deletion: SourceDeletionApplicationService;

  constructor(
    @Inject(API_SOURCE_DELETION_REPOSITORY)
    private readonly repository: SourceDeletionRepository,
    @Inject(START_IMPORT_PRIVATE_STORAGE) storage: SourceDeletionStorage,
    @Inject(START_IMPORT_CLOCK) private readonly clock: StartImportClock,
    @Inject(IMPORT_STATUS_REQUEST_ID_GENERATOR)
    private readonly requestIds: ImportStatusRequestIdGenerator,
    @Inject(START_IMPORT_PRIVACY_LOGGER) events: ImportEventEmitter,
  ) {
    this.deletion = new SourceDeletionApplicationService(
      repository,
      storage,
      events,
    );
  }

  async deleteForStructuredResume(input: {
    readonly structuredResumeId: string;
    readonly ownerUserId: string;
    readonly requestId?: string;
  }): Promise<DeleteSourceResult> {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const importId =
      await this.repository.findImportIdByStructuredResumeAndOwner(
        input.structuredResumeId,
        input.ownerUserId,
      );
    if (importId === null) return notFound(requestId);

    const result = await this.deletion.delete({
      importId,
      ownerUserId: input.ownerUserId,
      now: this.clock.now(),
    });
    if (result.kind === "not_found") return notFound(requestId);
    if (result.kind === "failed") {
      return {
        ok: false,
        status: 503,
        code: "temporarily_unavailable",
        requestId,
        message: "The uploaded source could not be deleted. Try again later.",
      };
    }
    return {
      ok: true,
      response: sourceDeletionResponseSchema.parse({
        version: importResumeResponseSchemaVersion,
        requestId,
        status: "source_deletion",
        importId,
        deletionState: "deleted",
        verificationStatus: "verified",
        userMessage:
          "The uploaded source was deleted. Your structured resume and edits were kept.",
      }),
    };
  }
}

function notFound(requestId: string): DeleteSourceResult {
  return {
    ok: false,
    status: 404,
    code: "not_found",
    requestId,
    message: "This resume or uploaded source is unavailable.",
  };
}
