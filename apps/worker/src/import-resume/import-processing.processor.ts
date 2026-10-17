import { Inject, Injectable, Optional } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import {
  deterministicExtractionJobPayloadSchema,
  documentValidationJobPayloadSchema,
  foregroundTimeoutJobPayloadSchema,
  sourceArtifactDeletionJobPayloadSchema,
  IMPORT_RESUME_JOB_NAMES,
  IMPORT_RESUME_PROCESSING_QUEUE,
} from "@nuvitae/contracts";
import {
  ImportProcessingWorkflow,
  type ImportEventEmitter,
  type ImportExtractionUseCase,
  type ImportProcessingCapacityPort,
  type ImportProgress,
  type ImportValidationUseCase,
  type ImportWorkflowRepository,
  type SourceDeletionService,
} from "@nuvitae/import-application";
import { Queue, UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import { WORKER_IMPORT_WORKFLOW_REPOSITORY } from "../persistence/worker-persistence.module.js";

export type WorkerImportValidationUseCase = ImportValidationUseCase;
export type WorkerImportExtractionUseCase = ImportExtractionUseCase;

export const WORKER_IMPORT_VALIDATION_USE_CASE = Symbol(
  "WORKER_IMPORT_VALIDATION_USE_CASE",
);
export const WORKER_IMPORT_EXTRACTION_USE_CASE = Symbol(
  "WORKER_IMPORT_EXTRACTION_USE_CASE",
);
export const WORKER_IMPORT_EVENT_EMITTER = Symbol(
  "WORKER_IMPORT_EVENT_EMITTER",
);
export const WORKER_IMPORT_CAPACITY_PORT = Symbol(
  "WORKER_IMPORT_CAPACITY_PORT",
);
export const WORKER_IMPORT_CLOCK = Symbol("WORKER_IMPORT_CLOCK");
export const WORKER_SOURCE_DELETION_USE_CASE = Symbol(
  "WORKER_SOURCE_DELETION_USE_CASE",
);

@Injectable()
@Processor(IMPORT_RESUME_PROCESSING_QUEUE, {
  concurrency: 1,
})
export class ImportProcessingProcessor extends WorkerHost {
  constructor(
    @Inject(WORKER_IMPORT_WORKFLOW_REPOSITORY)
    repository: ImportWorkflowRepository,
    @Optional()
    @Inject(WORKER_IMPORT_VALIDATION_USE_CASE)
    validation: WorkerImportValidationUseCase | undefined,
    @Optional()
    @Inject(WORKER_IMPORT_EXTRACTION_USE_CASE)
    extraction: WorkerImportExtractionUseCase | undefined,
    @InjectQueue(IMPORT_RESUME_PROCESSING_QUEUE)
    queue: Queue,
    @Optional()
    @Inject(WORKER_IMPORT_EVENT_EMITTER)
    events: ImportEventEmitter | undefined = undefined,
    @Optional()
    @Inject(WORKER_IMPORT_CAPACITY_PORT)
    capacity: ImportProcessingCapacityPort | undefined = undefined,
    @Optional()
    @Inject(WORKER_IMPORT_CLOCK)
    clock?: { readonly now: () => Date },
    @Optional()
    @Inject(WORKER_SOURCE_DELETION_USE_CASE)
    private readonly sourceDeletion?: SourceDeletionService,
  ) {
    super();
    this.clock = clock ?? { now: () => new Date() };
    this.workflow = new ImportProcessingWorkflow({
      repository,
      validation: validation ?? unavailableValidation,
      extraction: extraction ?? unavailableExtraction,
      jobs: queue,
      ...(events === undefined ? {} : { events }),
      ...(capacity === undefined ? {} : { capacity }),
      clock: this.clock,
      isUnrecoverableError: (error) => error instanceof UnrecoverableError,
    });
  }

  private readonly clock: { readonly now: () => Date };
  private readonly workflow: ImportProcessingWorkflow;

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
      case IMPORT_RESUME_JOB_NAMES.sourceDeletion:
        await this.processSourceDeletion(job);
        return;
      default:
        throw new UnrecoverableError("Unsupported import processing job.");
    }
  }

  private async processValidation(job: Job<unknown>): Promise<void> {
    const payload = parsePayload(documentValidationJobPayloadSchema, job.data);
    const deadline = deadlineSignal(payload.foregroundDeadline);
    const signal = deadline.signal;
    try {
      await this.workflow.validate(payload, {
        signal,
        ...(typeof job.timestamp === "number"
          ? { queuedAt: job.timestamp }
          : {}),
        progress: (value) => this.progress(job, value),
      });
    } finally {
      deadline.controller.abort();
    }
  }

  private async processExtraction(job: Job<unknown>): Promise<void> {
    const payload = parsePayload(
      deterministicExtractionJobPayloadSchema,
      job.data,
    );
    const deadline = deadlineSignal(payload.foregroundDeadline);
    const signal = deadline.signal;
    try {
      await this.workflow.extract(payload, {
        signal,
        ...(typeof job.timestamp === "number"
          ? { queuedAt: job.timestamp }
          : {}),
        progress: (value) => this.progress(job, value),
      });
    } finally {
      deadline.controller.abort();
    }
  }

  private async processForegroundTimeout(job: Job<unknown>): Promise<void> {
    const payload = parsePayload(foregroundTimeoutJobPayloadSchema, job.data);
    await this.workflow.timeOut(payload);
  }

  private async processSourceDeletion(job: Job<unknown>): Promise<void> {
    if (this.sourceDeletion === undefined) {
      throw new Error("source_deletion_use_case_unavailable");
    }
    const payload = parsePayload(
      sourceArtifactDeletionJobPayloadSchema,
      job.data,
    );
    const result = await this.sourceDeletion.delete({
      importId: payload.importId,
      ownerUserId: payload.owner.ownerUserId,
      now: this.clock.now(),
    });
    if (result.kind === "not_found") {
      throw new UnrecoverableError("Import source is unavailable.");
    }
    if (result.kind === "failed") {
      throw new Error("source_deletion_failed");
    }
  }

  private async progress(
    job: Job<unknown>,
    value: ImportProgress,
  ): Promise<void> {
    await job.updateProgress(value);
  }
}

const unavailableValidation: ImportValidationUseCase = {
  validate: () => Promise.reject(new Error("validation_use_case_unavailable")),
};

const unavailableExtraction: ImportExtractionUseCase = {
  process: () => Promise.reject(new Error("extraction_use_case_unavailable")),
};

function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new UnrecoverableError("Invalid import processing payload.");
  return parsed.data;
}

function deadlineSignal(foregroundDeadline?: string): {
  controller: AbortController;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const remaining =
    (foregroundDeadline === undefined
      ? Date.now() + 180_000
      : new Date(foregroundDeadline).getTime()) - Date.now();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(1, Math.min(180_000, remaining)),
  );
  timeout.unref();
  return { controller, signal: controller.signal };
}
