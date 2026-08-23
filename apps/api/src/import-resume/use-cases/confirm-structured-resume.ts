import { Inject, Injectable } from "@nestjs/common";
import {
  confirmedStructuredResumeReadResponseSchema,
  confirmStructuredResumeRequestSchema,
  confirmStructuredResumeResponseSchema,
  discardImportRequestSchema,
  discardImportResponseSchema,
  importResumeResponseSchemaVersion,
  type ConfirmStructuredResumeResponse,
  type ConfirmedStructuredResumeReadResponse,
  type DiscardImportResponse,
} from "@nuvitae/contracts";
import {
  mapReviewedImportDraftToStructuredResume,
  validateStructuredResumeConfirmation,
  type DeletionJob,
  type StructuredResume,
} from "@nuvitae/domain";
import type { ImportConfirmationRepository } from "@nuvitae/import-application";
import type { ImportEventEmitter } from "../../observability/import-events.js";
import { API_IMPORT_CONFIRMATION_REPOSITORY } from "../../persistence/api-persistence.module.js";
import type {
  StartImportClock,
  StartImportIdGenerator,
} from "../ports/start-import.js";
import type { ImportStatusRequestIdGenerator } from "../ports/import-status.js";
import {
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_PRIVACY_LOGGER,
} from "../ports/tokens.js";
import { toPublicStructuredResumeContent } from "./structured-resume-response.js";

export type ConfirmationServiceResult<T> =
  | { readonly ok: true; readonly response: T }
  | {
      readonly ok: false;
      readonly status: 400 | 404 | 409 | 410 | 422 | 503;
      readonly code:
        | "not_found"
        | "draft_not_ready"
        | "unresolved_warnings"
        | "no_user_confirmed_field"
        | "reviewed_content_not_mappable"
        | "stale_review"
        | "expired"
        | "lifecycle_not_confirmable"
        | "concurrent_confirmation"
        | "temporarily_unavailable"
        | "validation_failed"
        | "lifecycle_not_discardable";
      readonly requestId: string;
      readonly importId?: string;
      readonly draftId?: string;
      readonly message: string;
      readonly blockerCount?: number;
    };

@Injectable()
export class ConfirmStructuredResumeService {
  constructor(
    @Inject(API_IMPORT_CONFIRMATION_REPOSITORY)
    private readonly repository: ImportConfirmationRepository,
    @Inject(START_IMPORT_CLOCK)
    private readonly clock: StartImportClock,
    @Inject(START_IMPORT_ID_GENERATOR)
    private readonly ids: StartImportIdGenerator,
    @Inject(IMPORT_STATUS_REQUEST_ID_GENERATOR)
    private readonly requestIds: ImportStatusRequestIdGenerator,
    @Inject(START_IMPORT_PRIVACY_LOGGER)
    private readonly logger: ImportEventEmitter,
  ) {}

  async confirm(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly body: unknown;
    readonly requestId?: string;
  }): Promise<ConfirmationServiceResult<ConfirmStructuredResumeResponse>> {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const parsed = confirmStructuredResumeRequestSchema.safeParse(input.body);
    if (!parsed.success) {
      const result = validationFailed(requestId);
      this.emitConfirmationResult(result, input.importId);
      return result;
    }
    const result = await this.repository.transaction((repository) =>
      this.confirmInTransaction({
        ownerUserId: input.ownerUserId,
        importId: input.importId,
        requestId,
        expectedReviewRevision: parsed.data.expectedReviewRevision,
        repository,
      }),
    );
    this.emitConfirmationResult(result, input.importId);
    return result;
  }

  async discard(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly body: unknown;
    readonly requestId?: string;
  }): Promise<ConfirmationServiceResult<DiscardImportResponse>> {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const parsed = discardImportRequestSchema.safeParse(input.body);
    if (!parsed.success) {
      const result = validationFailed(requestId);
      this.emitDiscardResult(result, input.importId);
      return result;
    }
    const result = await this.repository.transaction((repository) =>
      this.discardInTransaction({
        ownerUserId: input.ownerUserId,
        importId: input.importId,
        requestId,
        expectedReviewRevision: parsed.data.expectedReviewRevision,
        operationId: parsed.data.operationId,
        repository,
      }),
    );
    this.emitDiscardResult(result, input.importId);
    return result;
  }

  async readConfirmed(input: {
    readonly ownerUserId: string;
    readonly structuredResumeId: string;
    readonly requestId?: string;
  }): Promise<
    ConfirmationServiceResult<ConfirmedStructuredResumeReadResponse>
  > {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const resume = await this.repository.findStructuredResumeByOwner(
      input.structuredResumeId,
      input.ownerUserId,
    );
    if (resume === null) {
      this.logger.emit("import.resource_not_found", {
        importId: input.structuredResumeId,
        operation: "structured_resume",
      });
      return notFound(requestId);
    }
    return {
      ok: true,
      response: confirmedStructuredResumeReadResponseSchema.parse({
        version: importResumeResponseSchemaVersion,
        requestId,
        status: "confirmed_structured_resume",
        structuredResumeId: resume.id,
        confirmationStatus: "confirmed",
        provenanceLabel: "imported_from_initial_resume",
        content: toPublicStructuredResumeContent(resume.content),
        createdAt: resume.createdAt.toISOString(),
        updatedAt: resume.updatedAt.toISOString(),
        sourceAvailability: "source_availability_unknown",
        userMessage:
          "This structured resume was created from your reviewed initial resume.",
      }),
    };
  }

  private async confirmInTransaction(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly requestId: string;
    readonly expectedReviewRevision: number;
    readonly repository: ImportConfirmationRepository;
  }): Promise<ConfirmationServiceResult<ConfirmStructuredResumeResponse>> {
    const aggregate = await input.repository.findImportByOwner(
      input.importId,
      input.ownerUserId,
    );
    if (aggregate === null) return notFound(input.requestId);
    const draft =
      await input.repository.findConfirmationDraftByImportAndOwnerForUpdate(
        input.importId,
        input.ownerUserId,
      );
    if (draft === null) return notFound(input.requestId);
    const existing =
      await input.repository.findStructuredResumeBySourceDraftAndOwner(
        draft.id,
        input.ownerUserId,
      );
    if (existing !== null) {
      return {
        ok: true,
        response: confirmationResponse(
          input.requestId,
          input.importId,
          draft.id,
          existing,
          draft.retentionExpiresAt,
          existing.createdAt,
        ),
      };
    }
    if (input.expectedReviewRevision !== draft.reviewRevision) {
      return {
        ok: false,
        status: 409,
        code: "stale_review",
        requestId: input.requestId,
        importId: input.importId,
        draftId: draft.id,
        message:
          "This review changed in another tab or session. Reload the review before creating the resume.",
      };
    }
    const now = this.clock.now();
    const eligibility = validateStructuredResumeConfirmation(draft, now, {
      sourceDeletionStatus: aggregate.document.deletionStatus,
      sourceArtifactsAvailable: aggregate.artifacts.some(
        (artifact) => artifact.deletedAt === undefined,
      ),
    });
    if (!eligibility.ok) {
      return confirmationEligibilityError(
        input.requestId,
        input.importId,
        draft.id,
        eligibility.error.code,
      );
    }
    const corrections = await input.repository.findCorrectionsByDraftAndOwner(
      draft.id,
      input.ownerUserId,
    );
    const mapped = mapReviewedImportDraftToStructuredResume({
      draft,
      corrections,
      structuredResumeId: this.ids.nextId(),
      childIds: {
        textItemId: () => this.ids.nextId(),
        workExperienceId: () => this.ids.nextId(),
        workRoleId: () => this.ids.nextId(),
        sectionItemId: () => this.ids.nextId(),
        linkId: () => this.ids.nextId(),
      },
      confirmedAt: now,
      now,
    });
    if (!mapped.ok) {
      return {
        ok: false,
        status: 422,
        code: mapped.blockers.some(
          (blocker) => blocker.code === "no_user_confirmed_field",
        )
          ? "no_user_confirmed_field"
          : mapped.blockers.some(
                (blocker) => blocker.code === "unresolved_warning",
              )
            ? "unresolved_warnings"
            : "reviewed_content_not_mappable",
        requestId: input.requestId,
        importId: input.importId,
        draftId: draft.id,
        blockerCount: mapped.blockers.length,
        message:
          "The reviewed content cannot be safely converted yet. Review the highlighted items and try again.",
      };
    }
    try {
      const saved =
        await input.repository.confirmDraftAndCreateStructuredResume({
          draft,
          resume: mapped.resume,
          confirmedAt: now,
        });
      return {
        ok: true,
        response: confirmationResponse(
          input.requestId,
          input.importId,
          draft.id,
          saved,
          draft.retentionExpiresAt,
          now,
        ),
      };
    } catch {
      const raced =
        await input.repository.findStructuredResumeBySourceDraftAndOwner(
          draft.id,
          input.ownerUserId,
        );
      if (raced !== null) {
        return {
          ok: true,
          response: confirmationResponse(
            input.requestId,
            input.importId,
            draft.id,
            raced,
            draft.retentionExpiresAt,
            raced.createdAt,
          ),
        };
      }
      return {
        ok: false,
        status: 409,
        code: "concurrent_confirmation",
        requestId: input.requestId,
        importId: input.importId,
        draftId: draft.id,
        message:
          "Resume creation is already being completed. Reload to see the current result.",
      };
    }
  }

  private async discardInTransaction(input: {
    readonly ownerUserId: string;
    readonly importId: string;
    readonly requestId: string;
    readonly expectedReviewRevision: number;
    readonly operationId: string;
    readonly repository: ImportConfirmationRepository;
  }): Promise<ConfirmationServiceResult<DiscardImportResponse>> {
    const draft =
      await input.repository.findConfirmationDraftByImportAndOwnerForUpdate(
        input.importId,
        input.ownerUserId,
      );
    if (draft === null) return notFound(input.requestId);
    const existingJob =
      await input.repository.findDiscardDeletionJobByImportAndOwner(
        input.importId,
        input.ownerUserId,
      );
    if (
      draft.status === "discarded" &&
      draft.discardedAt !== undefined &&
      existingJob !== null
    ) {
      return {
        ok: true,
        response: discardResponse(
          input.requestId,
          input.importId,
          draft.id,
          draft.discardedAt,
          existingJob.id,
        ),
      };
    }
    if (input.expectedReviewRevision !== draft.reviewRevision) {
      return {
        ok: false,
        status: 409,
        code: "stale_review",
        requestId: input.requestId,
        importId: input.importId,
        draftId: draft.id,
        message:
          "This review changed in another tab or session. Reload the review before discarding it.",
      };
    }
    const now = this.clock.now();
    if (now.getTime() >= draft.retentionExpiresAt.getTime()) {
      return {
        ok: false,
        status: 410,
        code: "expired",
        requestId: input.requestId,
        importId: input.importId,
        draftId: draft.id,
        message: "This import has expired.",
      };
    }
    if (
      draft.status !== "review_required" &&
      draft.status !== "ready_to_confirm"
    ) {
      return {
        ok: false,
        status: 409,
        code: "lifecycle_not_discardable",
        requestId: input.requestId,
        importId: input.importId,
        draftId: draft.id,
        message: "This import cannot be discarded in its current state.",
      };
    }
    // The deletion job id is generated server-side. The client operation id
    // remains an idempotency token only; using a client-supplied id as the
    // deletion job primary key would let a foreign job id reparent another
    // user's deletion row through the repository upsert.
    const job: DeletionJob = {
      id: this.ids.nextId(),
      importedDocumentId: input.importId,
      ownerUserId: input.ownerUserId,
      reason: "user_discarded_import",
      status: "scheduled",
      scheduledAt: now,
      verificationStatus: "not_started",
    };
    const saved = await input.repository.discardDraftAndScheduleDeletion({
      draft,
      job,
      discardedAt: now,
    });
    return {
      ok: true,
      response: discardResponse(
        input.requestId,
        input.importId,
        draft.id,
        now,
        saved.id,
      ),
    };
  }

  private emitConfirmationResult(
    result: ConfirmationServiceResult<ConfirmStructuredResumeResponse>,
    importId: string,
  ): void {
    if (result.ok) {
      this.logger.emit("confirm.completed", {
        importId: result.response.importId,
        draftId: result.response.draftId,
        requestId: result.response.requestId,
      });
      return;
    }
    if (result.code === "not_found") {
      this.logger.emit("import.resource_not_found", {
        importId,
        operation: "confirm",
      });
      return;
    }
    this.logger.emit("confirm.failed", {
      ...(result.importId === undefined ? {} : { importId: result.importId }),
      ...(result.draftId === undefined ? {} : { draftId: result.draftId }),
      errorCategory: result.code,
      statusCode: result.status,
      requestId: result.requestId,
    });
  }

  private emitDiscardResult(
    result: ConfirmationServiceResult<DiscardImportResponse>,
    importId: string,
  ): void {
    if (result.ok) {
      this.logger.emit("import.discarded", {
        importId: result.response.importId,
        deletionJobId: result.response.deletionJobId,
        requestId: result.response.requestId,
      });
      return;
    }
    if (result.code === "not_found") {
      this.logger.emit("import.resource_not_found", {
        importId,
        operation: "discard",
      });
      return;
    }
    this.logger.emit("import.discard_failed", {
      ...(result.importId === undefined ? {} : { importId: result.importId }),
      ...(result.draftId === undefined ? {} : { draftId: result.draftId }),
      errorCategory: discardFailureCategory(result.code),
      statusCode: result.status,
      requestId: result.requestId,
    });
  }
}

function confirmationResponse(
  requestId: string,
  importId: string,
  draftId: string,
  resume: StructuredResume,
  retentionExpiresAt: Date,
  confirmedAt: Date,
): ConfirmStructuredResumeResponse {
  return confirmStructuredResumeResponseSchema.parse({
    version: importResumeResponseSchemaVersion,
    requestId,
    status: "structured_resume_confirmed",
    importId,
    draftId,
    structuredResumeId: resume.id,
    confirmationStatus: "confirmed",
    provenanceLabel: "imported_from_initial_resume",
    confirmedAt: confirmedAt.toISOString(),
    sourceRetentionExpiresAt: retentionExpiresAt.toISOString(),
    resumeUrl: `/resumes/${resume.id}`,
    userMessage:
      "Your structured resume was created. The original upload remains separate and temporary.",
  });
}

function discardResponse(
  requestId: string,
  importId: string,
  draftId: string,
  discardedAt: Date,
  deletionJobId: string,
): DiscardImportResponse {
  return discardImportResponseSchema.parse({
    version: importResumeResponseSchemaVersion,
    requestId,
    status: "import_discarded",
    importId,
    draftId,
    discardedAt: discardedAt.toISOString(),
    deletionJobId,
    deletionState: "scheduled",
    userMessage:
      "This import was discarded. Source cleanup has been scheduled and is not complete yet.",
    recoveryActions: ["new_import", "manual_entry"],
  });
}

function validationFailed(requestId: string): ConfirmationServiceResult<never> {
  return {
    ok: false,
    status: 400,
    code: "validation_failed",
    requestId,
    message: "The request could not be accepted safely.",
  };
}

function discardFailureCategory(
  code: string,
):
  | "validation_failed"
  | "stale_review"
  | "expired"
  | "lifecycle_not_discardable" {
  switch (code) {
    case "stale_review":
      return "stale_review";
    case "expired":
      return "expired";
    case "lifecycle_not_discardable":
      return "lifecycle_not_discardable";
    default:
      return "validation_failed";
  }
}

function notFound(requestId: string): ConfirmationServiceResult<never> {
  return {
    ok: false,
    status: 404,
    code: "not_found",
    requestId,
    message:
      "We could not find that resource. It may be unavailable or no longer accessible.",
  };
}

function confirmationEligibilityError(
  requestId: string,
  importId: string,
  draftId: string,
  code: string,
): ConfirmationServiceResult<never> {
  if (code === "draft_expired") {
    return {
      ok: false,
      status: 410,
      code: "expired",
      requestId,
      importId,
      draftId,
      message: "This import has expired.",
    };
  }
  if (
    code === "unresolved_required_warnings" ||
    code === "unreviewed_field_warnings"
  ) {
    return {
      ok: false,
      status: 422,
      code: "unresolved_warnings",
      requestId,
      importId,
      draftId,
      message: "Review every warning before creating the structured resume.",
    };
  }
  return {
    ok: false,
    status: 409,
    code: "lifecycle_not_confirmable",
    requestId,
    importId,
    draftId,
    message: "This import cannot be confirmed in its current state.",
  };
}
