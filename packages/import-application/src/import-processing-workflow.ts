import {
  IMPORT_RESUME_JOB_NAMES,
  importResumeJobId,
  type DeterministicExtractionJobPayload,
  type DocumentValidationJobPayload,
  type ForegroundTimeoutJobPayload,
} from "@nuvitae/contracts";
import type { ImportedDocument } from "@nuvitae/domain";
import type { ImportWorkflowRepository } from "./import-workflow-repository.js";
import {
  ProcessingStartDeniedError,
  type ImportProcessingCapacityPort,
} from "./import-capacity.js";
import {
  emitImportTiming,
  type ImportEventEmitter,
} from "./observability/import-events.js";

export type ImportProgressStep =
  | "checking_document"
  | "reading_content"
  | "organizing_resume_sections"
  | "preparing_review";

export interface ImportProgress {
  readonly step: ImportProgressStep;
  readonly progressKnown: boolean;
  readonly progressPercent?: number;
  readonly importId: string;
}

export interface ImportValidationUseCase {
  validate(input: {
    ownerUserId: string;
    importedDocumentId: string;
    correlationId?: string;
    uploadReceivedAt?: Date;
    abortSignal?: AbortSignal;
  }): Promise<{ accepted: boolean }>;
}

export interface ImportExtractionUseCase {
  process(input: {
    ownerUserId: string;
    importedDocumentId: string;
    correlationId?: string;
    abortSignal?: AbortSignal;
  }): Promise<unknown>;
}

export interface ImportProcessingJobPublisher {
  add(
    name: string,
    data: unknown,
    options: {
      readonly jobId: string;
      readonly attempts: number;
      readonly removeOnComplete: {
        readonly age: number;
        readonly count: number;
      };
      readonly removeOnFail: { readonly age: number; readonly count: number };
    },
  ): Promise<unknown>;
}

export interface ImportProcessingWorkflowPorts {
  readonly repository: ImportWorkflowRepository;
  readonly validation: ImportValidationUseCase;
  readonly extraction: ImportExtractionUseCase;
  readonly jobs: ImportProcessingJobPublisher;
  readonly events?: ImportEventEmitter;
  readonly capacity?: ImportProcessingCapacityPort;
  readonly clock?: { readonly now: () => Date };
  readonly isUnrecoverableError?: (error: unknown) => boolean;
}

export interface ImportJobExecutionContext {
  readonly signal: AbortSignal;
  readonly queuedAt?: number;
  readonly progress: (value: ImportProgress) => Promise<void>;
}

export class ImportProcessingWorkflow {
  private readonly clock: { readonly now: () => Date };

  constructor(private readonly ports: ImportProcessingWorkflowPorts) {
    this.clock = ports.clock ?? { now: () => new Date() };
  }

  async validate(
    payload: DocumentValidationJobPayload,
    context: ImportJobExecutionContext,
  ): Promise<void> {
    const workerStartedAt = this.clock.now();
    if (this.ports.events !== undefined) {
      emitImportTiming(this.ports.events, {
        importId: payload.importId,
        correlationId: payload.correlationId,
        phase: "worker_started",
        jobType: "validation",
        source: "worker",
        at: workerStartedAt,
        durationMs:
          context.queuedAt === undefined
            ? undefined
            : workerStartedAt.getTime() - context.queuedAt,
        uploadReceivedAt: new Date(payload.requestedAt),
      });
    }
    const document = await this.findOwnedDocument(
      payload.importId,
      payload.owner.ownerUserId,
    );
    if (document === null || !eligibleForValidation(document)) return;
    try {
      await context.progress({
        step: "checking_document",
        progressKnown: false,
        importId: document.id,
      });
      const result = await this.ports.validation.validate({
        ownerUserId: document.ownerUserId,
        importedDocumentId: document.id,
        correlationId: payload.correlationId,
        uploadReceivedAt: new Date(payload.requestedAt),
        abortSignal: context.signal,
      });
      if (!result.accepted || context.signal.aborted) return;
      const acceptedAt = this.clock.now().toISOString();
      const extractionPayload: DeterministicExtractionJobPayload = {
        schemaVersion: payload.schemaVersion,
        jobType: "deterministic_extraction",
        importId: document.id,
        owner: { ownerUserId: document.ownerUserId },
        correlationId: payload.correlationId,
        idempotencyKey: importResumeJobId(document.id, "extraction"),
        requestedAt: acceptedAt,
        documentFormat: document.fileExtension as "pdf" | "docx",
        sourceStorageKey: document.storageKey!,
        validationCompletedAt: acceptedAt,
        foregroundDeadline: payload.foregroundDeadline,
      };
      await this.ports.jobs.add(
        IMPORT_RESUME_JOB_NAMES.extraction,
        extractionPayload,
        {
          jobId: importResumeJobId(document.id, "extraction"),
          attempts: 1,
          removeOnComplete: { age: 300, count: 100 },
          removeOnFail: { age: 900, count: 100 },
        },
      );
    } catch (error) {
      this.emitFailure(document.id, payload.correlationId, "validation", error);
      throw error;
    }
  }

  async extract(
    payload: DeterministicExtractionJobPayload,
    context: ImportJobExecutionContext,
  ): Promise<void> {
    const workerStartedAt = this.clock.now();
    if (this.ports.events !== undefined) {
      emitImportTiming(this.ports.events, {
        importId: payload.importId,
        correlationId: payload.correlationId,
        phase: "worker_started",
        jobType: "extraction",
        source: "worker",
        at: workerStartedAt,
        durationMs:
          context.queuedAt === undefined
            ? undefined
            : workerStartedAt.getTime() - context.queuedAt,
      });
    }
    const document = await this.findOwnedDocument(
      payload.importId,
      payload.owner.ownerUserId,
    );
    if (document === null || !eligibleForExtraction(document)) return;
    try {
      for (const step of [
        "reading_content",
        "organizing_resume_sections",
        "preparing_review",
      ] as const) {
        await context.progress({
          step,
          progressKnown: false,
          importId: document.id,
        });
      }
      await this.ports.extraction.process({
        ownerUserId: document.ownerUserId,
        importedDocumentId: document.id,
        correlationId: payload.correlationId,
        abortSignal: context.signal,
      });
    } catch (error) {
      if (error instanceof ProcessingStartDeniedError) {
        this.ports.events?.emit("import.active_limit_reached", {});
        this.ports.events?.emit("import.processing_start_denied", {});
      } else {
        this.emitFailure(
          document.id,
          payload.correlationId,
          "extraction",
          error,
        );
      }
      throw error;
    }
  }

  async timeOut(payload: ForegroundTimeoutJobPayload): Promise<void> {
    if (
      new Date(payload.foregroundDeadline).getTime() >
      this.clock.now().getTime()
    )
      return;
    try {
      await this.ports.repository.transaction(async (repository) => {
        const aggregate = await repository.findImportByOwner(
          payload.importId,
          payload.owner.ownerUserId,
        );
        if (aggregate === null) return;
        const current = aggregate.document;
        if (
          current.validationStatus === "rejected" ||
          [
            "failed",
            "cancelled",
            "expired",
            "timeout_partial",
            "ready_for_review",
          ].includes(current.processingStatus) ||
          (await repository.findDraftByImportAndOwner(
            current.id,
            current.ownerUserId,
          )) !== null ||
          current.retentionExpiresAt.getTime() <= this.clock.now().getTime()
        )
          return;
        await repository.saveImportLifecycle({
          ...current,
          processingStatus: "timeout_partial",
        });
      });
      await this.ports.capacity?.releaseCapacity(
        payload.owner.ownerUserId,
        payload.importId,
        this.clock.now(),
      );
    } catch (error) {
      this.emitFailure(
        payload.importId,
        payload.correlationId,
        "foreground_timeout",
        error,
      );
      throw error;
    }
  }

  private emitFailure(
    importId: string,
    correlationId: string,
    jobType: "validation" | "extraction" | "foreground_timeout",
    error: unknown,
  ): void {
    this.ports.events?.emit("import.worker_failed", {
      importId,
      correlationId,
      jobType,
      errorCategory: "unexpected_failure",
      retryable: !(this.ports.isUnrecoverableError?.(error) ?? false),
    });
  }

  private async findOwnedDocument(
    importId: string,
    ownerUserId: string,
  ): Promise<ImportedDocument | null> {
    const aggregate = await this.ports.repository.findImportByOwner(
      importId,
      ownerUserId,
    );
    return aggregate?.document ?? null;
  }
}

function eligibleForValidation(document: ImportedDocument): boolean {
  return (
    document.uploadStatus === "uploaded" &&
    document.validationStatus === "not_started" &&
    document.deletionStatus === "not_scheduled" &&
    document.storageKey !== undefined
  );
}

function eligibleForExtraction(document: ImportedDocument): boolean {
  return (
    document.uploadStatus === "uploaded" &&
    document.validationStatus === "accepted" &&
    ["queued", "processing", "not_started"].includes(
      document.processingStatus,
    ) &&
    document.deletionStatus === "not_scheduled" &&
    document.storageKey !== undefined
  );
}
