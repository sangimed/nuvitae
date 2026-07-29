import { Inject, Injectable, Optional } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import {
  deterministicExtractionJobPayloadSchema,
  documentValidationJobPayloadSchema,
  foregroundTimeoutJobPayloadSchema,
  IMPORT_RESUME_JOB_NAMES,
  IMPORT_RESUME_PROCESSING_QUEUE,
  importResumeJobId,
  type DeterministicExtractionJobPayload,
} from "@nuvitae/contracts";
import type { ImportedDocument } from "@nuvitae/domain";
import type {
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { Queue, UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import {
  WORKER_IMPORT_RESUME_REPOSITORY,
  WORKER_PERSISTENCE_TRANSACTION_RUNNER,
} from "../persistence/worker-persistence.module.js";

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

export interface WorkerImportValidationUseCase {
  validate(input: {
    ownerUserId: string;
    importedDocumentId: string;
    abortSignal?: AbortSignal;
  }): Promise<{ accepted: boolean }>;
}

export interface WorkerImportExtractionUseCase {
  process(input: {
    ownerUserId: string;
    importedDocumentId: string;
    abortSignal?: AbortSignal;
  }): Promise<unknown>;
}

export interface ImportProcessingQueuePublisher {
  addBulk(
    jobs: readonly {
      name: string;
      jobId: string;
      data: unknown;
    }[],
  ): Promise<unknown>;
}

export const WORKER_IMPORT_VALIDATION_USE_CASE = Symbol(
  "WORKER_IMPORT_VALIDATION_USE_CASE",
);
export const WORKER_IMPORT_EXTRACTION_USE_CASE = Symbol(
  "WORKER_IMPORT_EXTRACTION_USE_CASE",
);

@Injectable()
@Processor(IMPORT_RESUME_PROCESSING_QUEUE, {
  concurrency: 1,
})
export class ImportProcessingProcessor extends WorkerHost {
  constructor(
    @Inject(WORKER_IMPORT_RESUME_REPOSITORY)
    private readonly repository: ImportResumeRepository,
    @Inject(WORKER_PERSISTENCE_TRANSACTION_RUNNER)
    private readonly transactionRunner: PersistenceTransactionRunner,
    @Optional()
    @Inject(WORKER_IMPORT_VALIDATION_USE_CASE)
    private readonly validation: WorkerImportValidationUseCase | undefined,
    @Optional()
    @Inject(WORKER_IMPORT_EXTRACTION_USE_CASE)
    private readonly extraction: WorkerImportExtractionUseCase | undefined,
    @InjectQueue(IMPORT_RESUME_PROCESSING_QUEUE)
    private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    switch (job.name) {
      case IMPORT_RESUME_JOB_NAMES.validation:
        await this.processValidation(job);
        return;
      case IMPORT_RESUME_JOB_NAMES.extraction:
        await this.processExtraction(job);
        return;
      case IMPORT_RESUME_JOB_NAMES.foregroundTimeout:
        await this.processForegroundTimeout(job);
        return;
      default:
        throw new UnrecoverableError("Unsupported import processing job.");
    }
  }

  private async processValidation(job: Job<unknown>): Promise<void> {
    if (this.validation === undefined)
      throw new Error("validation_use_case_unavailable");
    const payload = parsePayload(documentValidationJobPayloadSchema, job.data);
    const document = await this.findOwnedDocument(
      payload.importId,
      payload.owner.ownerUserId,
    );
    if (document === null || !eligibleForValidation(document)) return;
    const deadline = deadlineSignal(document, payload.foregroundDeadline);
    const signal = deadline.signal;
    try {
      await this.progress(job, {
        step: "checking_document",
        progressKnown: false,
        importId: document.id,
      });
      const result = await this.validation.validate({
        ownerUserId: document.ownerUserId,
        importedDocumentId: document.id,
        abortSignal: signal,
      });
      if (!result.accepted || signal.aborted) return;
      const acceptedAt = new Date().toISOString();
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
      await this.queue.add(
        IMPORT_RESUME_JOB_NAMES.extraction,
        extractionPayload,
        {
          jobId: importResumeJobId(document.id, "extraction"),
          attempts: 3,
          backoff: { type: "exponential", delay: 500 },
          removeOnComplete: { age: 300, count: 100 },
          removeOnFail: { age: 900, count: 100 },
        },
      );
    } finally {
      deadline.controller.abort();
    }
  }

  private async processExtraction(job: Job<unknown>): Promise<void> {
    if (this.extraction === undefined)
      throw new Error("extraction_use_case_unavailable");
    const payload = parsePayload(
      deterministicExtractionJobPayloadSchema,
      job.data,
    );
    const document = await this.findOwnedDocument(
      payload.importId,
      payload.owner.ownerUserId,
    );
    if (document === null || !eligibleForExtraction(document)) return;
    const deadline = deadlineSignal(document, payload.foregroundDeadline);
    const signal = deadline.signal;
    try {
      await this.progress(job, {
        step: "reading_content",
        progressKnown: false,
        importId: document.id,
      });
      await this.progress(job, {
        step: "organizing_resume_sections",
        progressKnown: false,
        importId: document.id,
      });
      await this.progress(job, {
        step: "preparing_review",
        progressKnown: false,
        importId: document.id,
      });
      await this.extraction.process({
        ownerUserId: document.ownerUserId,
        importedDocumentId: document.id,
        abortSignal: signal,
      });
    } finally {
      deadline.controller.abort();
    }
  }

  private async processForegroundTimeout(job: Job<unknown>): Promise<void> {
    const payload = parsePayload(foregroundTimeoutJobPayloadSchema, job.data);
    if (new Date(payload.foregroundDeadline).getTime() > Date.now()) return;
    await this.transactionRunner.transaction(async (manager) => {
      const aggregate = await this.repository.findImportByOwner(
        payload.importId,
        payload.owner.ownerUserId,
        manager,
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
        (await this.repository.findDraftByImportAndOwner(
          current.id,
          current.ownerUserId,
          manager,
        )) !== null
      )
        return;
      if (current.retentionExpiresAt.getTime() <= Date.now()) return;
      await this.repository.saveImportLifecycle(
        { ...current, processingStatus: "timeout_partial" },
        manager,
      );
    });
  }

  private async progress(
    job: Job<unknown>,
    value: ImportProgress,
  ): Promise<void> {
    await job.updateProgress(value);
  }

  private async findOwnedDocument(
    importId: string,
    ownerUserId: string,
  ): Promise<ImportedDocument | null> {
    const aggregate = await this.repository.findImportByOwner(
      importId,
      ownerUserId,
    );
    return aggregate?.document ?? null;
  }
}

function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new UnrecoverableError("Invalid import processing payload.");
  return parsed.data;
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

function deadlineSignal(
  document: ImportedDocument,
  foregroundDeadline?: string,
): {
  controller: AbortController;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const remaining =
    (foregroundDeadline === undefined
      ? document.createdAt.getTime() + 180_000
      : new Date(foregroundDeadline).getTime()) - Date.now();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1, Math.min(180_000, remaining)),
  );
  timeout.unref();
  return { controller, signal: controller.signal };
}
