import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  importInitializationResponseSchema,
  importResumeResponseSchemaVersion,
  type ImportInitializationResponse,
} from "@nuvitae/contracts";
import { IMPORT_RESUME_JOB_NAMES, importResumeJobId } from "@nuvitae/contracts";
import {
  calculateRetentionExpiresAt,
  validateUploadEligibility,
  type ImportedDocument,
  type SupportedDocumentFormat,
} from "@nuvitae/domain";
import type { ImportWorkflowRepository } from "@nuvitae/import-application";
import { generatePrivateImportStorageKey } from "@nuvitae/storage";
import type { ImportProcessingLimits } from "../config/import-processing-limits.js";
import { API_START_IMPORT_REPOSITORY } from "../persistence/api-persistence.module.js";
import {
  StartImportHttpError,
  type StartImportPublicErrorCode,
  StartImportResponseContractError,
} from "./start-import.errors.js";
import type { ImportLimitOutcome } from "../services/import-resume/import-limits.js";
import { mapLimitOutcomeToHttpResponse } from "./limit-responses.js";
import type {
  StartImportClock,
  StartImportIdGenerator,
  StartImportInput,
  StartImportLimitPort,
  StartImportPrivacyLogger,
  StartImportPrivateStorage,
  StartImportQueuePublisher,
  StartImportRequestIdGenerator,
} from "./start-import.ports.js";
import { emitImportTiming } from "../observability/import-events.js";
import {
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_LIMIT_SERVICE,
  START_IMPORT_PRIVACY_LOGGER,
  START_IMPORT_PRIVATE_STORAGE,
  START_IMPORT_PROCESSING_LIMITS,
  START_IMPORT_REQUEST_ID_GENERATOR,
  START_IMPORT_QUEUE_PUBLISHER,
} from "./start-import.tokens.js";

const retentionDays = 7;
const maximumVisibleFilenameLength = 255;
const docxContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

@Injectable()
export class StartImportService {
  constructor(
    @Inject(API_START_IMPORT_REPOSITORY)
    private readonly repository: ImportWorkflowRepository,
    @Inject(START_IMPORT_PRIVATE_STORAGE)
    private readonly storage: StartImportPrivateStorage,
    @Inject(START_IMPORT_LIMIT_SERVICE)
    private readonly limits: StartImportLimitPort,
    @Inject(START_IMPORT_PROCESSING_LIMITS)
    private readonly processingLimits: ImportProcessingLimits,
    @Inject(START_IMPORT_CLOCK)
    private readonly clock: StartImportClock,
    @Inject(START_IMPORT_ID_GENERATOR)
    private readonly idGenerator: StartImportIdGenerator,
    @Inject(START_IMPORT_REQUEST_ID_GENERATOR)
    private readonly requestIdGenerator: StartImportRequestIdGenerator,
    @Inject(START_IMPORT_PRIVACY_LOGGER)
    private readonly logger: StartImportPrivacyLogger,
    @Optional()
    @Inject(START_IMPORT_QUEUE_PUBLISHER)
    private readonly queuePublisher: StartImportQueuePublisher | undefined,
  ) {}

  async start(input: StartImportInput): Promise<ImportInitializationResponse> {
    const createdAt = this.clock.now();
    const reservation = await this.limits.reserveAttempt(
      input.ownerUserId,
      createdAt,
    );
    if (!reservation.allowed) {
      if (reservation.outcome.code === "limit_service_unavailable") {
        this.logger.emit("import.limit_service_failed", {});
      } else {
        this.logger.emit("import.rate_limited", {
          retryAfterSeconds: reservation.outcome.retryAfterSeconds ?? 1,
        });
      }
      throw mapLimitDenial(reservation.outcome);
    }

    let upload: {
      readonly visibleFilename: string;
      readonly format: SupportedDocumentFormat;
      readonly contentType: string;
      readonly sizeBytes: number;
    };
    try {
      upload = prepareUpload(input, this.processingLimits.maxUploadSizeBytes);
    } catch (error) {
      await this.releaseRejectedAttempt(
        input.ownerUserId,
        reservation.reservation.id,
        createdAt,
      );
      this.logger.emit("import.upload_rejected", {
        errorCategory: uploadRejectionCategory(error),
      });
      throw error;
    }

    const importId = this.idGenerator.nextId();
    const queueAdmission = await this.limits.admitToQueue(
      input.ownerUserId,
      reservation.reservation.id,
      importId,
      createdAt,
    );
    if (queueAdmission.kind !== "allowed") {
      this.logger.emit(
        queueAdmission.code === "queued_job_limit"
          ? "import.queued_limit_reached"
          : "import.limit_service_failed",
        {},
      );
      throw mapLimitDenial(queueAdmission);
    }
    emitImportTiming(this.logger, {
      importId,
      correlationId: importId,
      phase: "upload_received",
      source: "api",
      at: createdAt,
    });

    const storageKey = generatePrivateImportStorageKey({
      ownerUserId: input.ownerUserId,
      importId,
      objectKind: "source",
    });
    const retentionExpiresAt = calculateRetentionExpiresAt(
      createdAt,
      retentionDays,
    );
    const document: ImportedDocument = {
      id: importId,
      ownerUserId: input.ownerUserId,
      visibleFilename: upload.visibleFilename,
      contentType: upload.contentType,
      fileExtension: upload.format,
      sizeBytes: upload.sizeBytes,
      storageKey,
      uploadStatus: "uploaded",
      validationStatus: "not_started",
      processingStatus: "not_started",
      deletionStatus: "not_scheduled",
      createdAt,
      retentionExpiresAt,
    };

    try {
      await this.storage.writeObject(storageKey, input.content);
    } catch {
      this.logger.emit("import.storage_write_failed", {
        importId,
        retryable: true,
      });
      await this.rollbackFailedCreation(
        input.ownerUserId,
        reservation.reservation.id,
        createdAt,
      );
      throw new StartImportHttpError(
        503,
        "storage_unavailable",
        "Private resume storage is unavailable. Try again later.",
      );
    }

    try {
      await this.repository.transaction(async (repository) => {
        await repository.createImportAggregate({ document, artifacts: [] });
      });
    } catch {
      let compensationFailed = false;
      try {
        await this.storage.deleteObject(storageKey);
      } catch {
        compensationFailed = true;
        this.logger.emit("import.storage_delete_failed", {
          importId,
          retryable: true,
        });
      }
      await this.rollbackFailedCreation(
        input.ownerUserId,
        reservation.reservation.id,
        createdAt,
      );
      if (compensationFailed) {
        throw new StartImportHttpError(
          500,
          "internal_failure",
          "The resume import could not be started.",
        );
      }
      throw new StartImportHttpError(
        503,
        "persistence_unavailable",
        "Resume import is unavailable. Try again later.",
      );
    }
    const persistedAt = this.clock.now();
    emitImportTiming(this.logger, {
      importId,
      correlationId: importId,
      phase: "upload_persisted",
      source: "api",
      at: persistedAt,
      durationMs: persistedAt.getTime() - createdAt.getTime(),
      uploadReceivedAt: createdAt,
    });

    if (this.queuePublisher !== undefined) {
      const deadline = new Date(
        createdAt.getTime() +
          this.processingLimits.foregroundTimeoutSeconds * 1_000,
      );
      try {
        await this.queuePublisher.addBulk([
          {
            name: IMPORT_RESUME_JOB_NAMES.validation,
            jobId: importResumeJobId(importId, "validation"),
            data: {
              schemaVersion: "2026-07-28",
              jobType: "document_validation",
              importId,
              owner: { ownerUserId: input.ownerUserId },
              correlationId: importId,
              idempotencyKey: importResumeJobId(importId, "validation"),
              requestedAt: createdAt.toISOString(),
              documentFormat: upload.format,
              sourceStorageKey: storageKey,
              uploadedAt: createdAt.toISOString(),
              foregroundDeadline: deadline.toISOString(),
              sizeBytes: upload.sizeBytes,
            },
          },
          {
            name: IMPORT_RESUME_JOB_NAMES.foregroundTimeout,
            jobId: importResumeJobId(importId, "timeout"),
            delay: Math.max(0, deadline.getTime() - Date.now()),
            data: {
              schemaVersion: "2026-07-28",
              jobType: "foreground_timeout",
              importId,
              owner: { ownerUserId: input.ownerUserId },
              correlationId: importId,
              idempotencyKey: importResumeJobId(importId, "timeout"),
              requestedAt: createdAt.toISOString(),
              foregroundDeadline: deadline.toISOString(),
            },
          },
        ]);
        const enqueuedAt = this.clock.now();
        emitImportTiming(this.logger, {
          importId,
          correlationId: importId,
          phase: "queue_enqueued",
          source: "api",
          at: enqueuedAt,
          durationMs: enqueuedAt.getTime() - persistedAt.getTime(),
          uploadReceivedAt: createdAt,
        });
        await this.repository.transaction(async (repository) => {
          const current = await repository.findImportByOwner(
            importId,
            input.ownerUserId,
          );
          if (
            current !== null &&
            current.document.processingStatus === "not_started"
          ) {
            await repository.saveImportLifecycle({
              ...current.document,
              processingStatus: "queued",
            });
          }
        });
      } catch {
        await this.markPublicationFailure(importId, input.ownerUserId);
        await this.limits.releaseReservation(
          input.ownerUserId,
          reservation.reservation.id,
          createdAt,
        );
        throw new StartImportHttpError(
          503,
          "persistence_unavailable",
          "Resume processing is temporarily unavailable. Try again later.",
        );
      }
    } else {
      // No processing queue is configured, so no job will ever claim this
      // import. Release the queued slot while retaining the attempt history.
      try {
        await this.limits.releaseReservation(
          input.ownerUserId,
          reservation.reservation.id,
          createdAt,
        );
      } catch {
        this.logger.emit("import.limit_release_failed", {
          importId,
          errorCategory: "limit_release_failed",
        });
        throw new StartImportHttpError(
          500,
          "internal_failure",
          "The resume import could not be started.",
        );
      }
    }

    const candidate = {
      version: importResumeResponseSchemaVersion,
      requestId: this.requestIdGenerator.nextRequestId(),
      status: "import_initialization" as const,
      importId,
      uploadStatus: "uploaded" as const,
      retentionExpiresAt: retentionExpiresAt.toISOString(),
      manualEntryUrl: "/resumes/new/manual" as const,
      userMessage:
        "Your resume was uploaded privately and will be kept for up to 7 days.",
    };
    const parsed = importInitializationResponseSchema.safeParse(candidate);
    if (!parsed.success) {
      this.logger.emit("import.response_contract_failed", {
        importId,
        errorCategory: "response_contract_failed",
      });
      throw new StartImportResponseContractError();
    }

    this.logger.emit("import.created", {
      importId,
      statusCode: 201,
      fileSizeBucket: sizeBucket(upload.sizeBytes),
    });
    return parsed.data;
  }

  private async markPublicationFailure(
    importId: string,
    ownerUserId: string,
  ): Promise<void> {
    try {
      await this.repository.transaction(async (repository) => {
        const current = await repository.findImportByOwner(
          importId,
          ownerUserId,
        );
        if (current !== null) {
          await repository.saveImportLifecycle({
            ...current.document,
            processingStatus: "failed",
          });
        }
      });
    } catch {
      this.logger.emit("import.queue_publication_failed", {
        importId,
        errorCategory: "queue_publication_failed",
      });
    }
  }

  private async releaseRejectedAttempt(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<void> {
    try {
      await this.limits.releaseReservation(ownerUserId, reservationId, now);
    } catch {
      throw new StartImportHttpError(
        503,
        "import_limit_unavailable",
        "Import capacity cannot be checked right now. Try again later.",
      );
    }
  }

  private async rollbackFailedCreation(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<void> {
    try {
      await this.limits.rollbackReservation(ownerUserId, reservationId, now);
    } catch {
      this.logger.emit("import.limit_rollback_failed", {
        errorCategory: "limit_rollback_failed",
      });
      throw new StartImportHttpError(
        500,
        "internal_failure",
        "The resume import could not be started.",
      );
    }
  }
}

function prepareUpload(
  input: StartImportInput,
  maxUploadSizeBytes: number,
): {
  readonly visibleFilename: string;
  readonly format: SupportedDocumentFormat;
  readonly contentType: string;
  readonly sizeBytes: number;
} {
  const filename = normalizeVisibleFilename(input.visibleFilename);
  const contentType = input.contentType.trim().toLowerCase();
  const extension = extensionOf(filename);
  const format =
    extension === "pdf" && contentType === "application/pdf"
      ? "pdf"
      : extension === "docx" && contentType === docxContentType
        ? "docx"
        : "unsupported";
  const sizeBytes = input.content.byteLength;
  const eligibility = validateUploadEligibility(
    {
      isAuthenticated: true,
      format,
      sizeBytes,
    },
    { maxUploadSizeBytes },
  );
  if (!eligibility.ok) {
    switch (eligibility.error.code) {
      case "unsupported_format":
        throw new StartImportHttpError(
          415,
          "unsupported_format",
          "Upload a PDF or DOCX resume with matching file details.",
        );
      case "empty_file":
        throw new StartImportHttpError(
          400,
          "empty_file",
          "Choose a non-empty resume document.",
        );
      case "file_too_large":
        throw new StartImportHttpError(
          413,
          "oversized_file",
          "Choose a resume within the upload size limit.",
        );
      case "authentication_required":
        throw new StartImportHttpError(
          401,
          "authentication_required",
          "Sign in before uploading a resume.",
        );
    }
  }
  if (format === "unsupported") {
    throw new StartImportHttpError(
      415,
      "unsupported_format",
      "Upload a PDF or DOCX resume with matching file details.",
    );
  }
  return {
    visibleFilename: capVisibleFilename(filename),
    format,
    contentType,
    sizeBytes,
  };
}

function normalizeVisibleFilename(value: string): string {
  if (value.length === 0 || Array.from(value).some(isControlCharacter)) {
    throw new StartImportHttpError(
      400,
      "unsafe_upload_metadata",
      "Choose a file with a safe visible name.",
    );
  }
  const normalized = value.normalize("NFC").split(/[\\/]/u).at(-1)?.trim();
  if (normalized === undefined || normalized.length === 0) {
    throw new StartImportHttpError(
      400,
      "unsafe_upload_metadata",
      "Choose a file with a safe visible name.",
    );
  }
  return normalized;
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0);
  return (
    codePoint !== undefined &&
    (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
  );
}

function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot <= 0 ? "" : filename.slice(lastDot + 1).toLowerCase();
}

function capVisibleFilename(filename: string): string {
  const characters = Array.from(filename);
  if (characters.length <= maximumVisibleFilenameLength) {
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const suffix = dot > 0 ? filename.slice(dot) : "";
  const suffixCharacters = Array.from(suffix);
  return [
    ...characters.slice(
      0,
      maximumVisibleFilenameLength - suffixCharacters.length,
    ),
    ...suffixCharacters,
  ].join("");
}

function mapLimitDenial(outcome: ImportLimitOutcome): StartImportHttpError {
  const mapped = mapLimitOutcomeToHttpResponse(outcome);
  return new StartImportHttpError(
    mapped.statusCode,
    mapped.code as StartImportPublicErrorCode,
    mapped.message,
    mapped.retryAfterSeconds,
  );
}

function sizeBucket(
  sizeBytes: number,
): "under_1_mib" | "1_to_5_mib" | "5_to_10_mib" {
  if (sizeBytes < 1024 * 1024) return "under_1_mib";
  if (sizeBytes < 5 * 1024 * 1024) return "1_to_5_mib";
  return "5_to_10_mib";
}

function uploadRejectionCategory(
  error: unknown,
):
  | "unsupported_format"
  | "empty_file"
  | "oversized_file"
  | "unsafe_upload_metadata" {
  if (error instanceof StartImportHttpError) {
    switch (error.code) {
      case "unsupported_format":
        return "unsupported_format";
      case "empty_file":
        return "empty_file";
      case "oversized_file":
        return "oversized_file";
    }
  }
  return "unsafe_upload_metadata";
}
