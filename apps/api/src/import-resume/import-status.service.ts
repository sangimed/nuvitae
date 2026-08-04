import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  importResumeResponseSchemaVersion,
  publicImportStatusResponseSchema,
  type PublicImportStatusResponse,
} from "@nuvitae/contracts";
import type { ImportDraft, ImportedDocument } from "@nuvitae/domain";
import type { ImportResumeRepository } from "@nuvitae/persistence";
import { z } from "zod";
import type { ImportEventEmitter } from "../observability/import-events.js";
import { API_IMPORT_RESUME_REPOSITORY } from "../persistence/api-persistence.module.js";
import type {
  ImportStatusQueueReader,
  ImportStatusRequestIdGenerator,
} from "./import-status.ports.js";
import {
  IMPORT_STATUS_QUEUE_READER,
  IMPORT_STATUS_REQUEST_ID_GENERATOR,
  START_IMPORT_PRIVACY_LOGGER,
} from "./start-import.tokens.js";

const stepOrder = [
  "checking_document",
  "reading_content",
  "organizing_resume_sections",
  "preparing_review",
] as const;

const queueProgressSchema = z
  .object({
    step: z.enum(stepOrder),
    progressKnown: z.boolean(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    updatedAt: z.date(),
  })
  .strict()
  .refine(
    (value) => value.progressKnown || value.progressPercent === undefined,
  );

@Injectable()
export class ImportStatusService {
  constructor(
    @Inject(API_IMPORT_RESUME_REPOSITORY)
    private readonly repository: ImportResumeRepository,
    @Inject(IMPORT_STATUS_REQUEST_ID_GENERATOR)
    private readonly requestIds: ImportStatusRequestIdGenerator,
    @Inject(START_IMPORT_PRIVACY_LOGGER)
    private readonly logger: ImportEventEmitter,
    @Optional()
    @Inject(IMPORT_STATUS_QUEUE_READER)
    private readonly queueReader: ImportStatusQueueReader | undefined,
  ) {}

  async readStatus(input: {
    readonly importId: string;
    readonly ownerUserId: string;
    readonly requestId?: string;
  }): Promise<PublicImportStatusResponse> {
    const requestId = input.requestId ?? this.requestIds.nextRequestId();
    const aggregate = await this.repository.findImportByOwner(
      input.importId,
      input.ownerUserId,
    );

    if (aggregate === null) {
      this.logger.emit("import.resource_not_found", {
        importId: input.importId,
        operation: "status",
      });
      return parseStatus({
        requestId,
        importId: input.importId,
        status: "not_found",
        progressKnown: false,
        allowedRecoveryActions: ["manual_entry"],
        userMessage:
          "We could not find that import. It may be unavailable or no longer accessible.",
      });
    }

    const draft = await this.repository.findDraftByImportAndOwner(
      input.importId,
      input.ownerUserId,
    );
    const document = aggregate.document;
    const queueProgress = await this.readTrustedQueueProgress(input.importId);

    if (document.processingStatus === "ready_for_review" && draft !== null) {
      return draft.warnings.length > 0
        ? parseStatus({
            requestId,
            importId: document.id,
            status: "partial_extraction",
            progressKnown: true,
            progressPercent: 100,
            draftSummary: summarizeDraft(draft),
            allowedRecoveryActions: ["replace_upload", "manual_entry"],
            userMessage:
              "Your resume is ready to review, with a few items that need attention.",
          })
        : parseStatus({
            requestId,
            importId: document.id,
            status: "draft_ready",
            progressKnown: true,
            progressPercent: 100,
            draftSummary: summarizeDraft(draft),
            allowedRecoveryActions: ["manual_entry"],
            userMessage: "Your imported resume draft is ready for review.",
          });
    }

    if (document.validationStatus === "rejected") {
      return parseStatus({
        requestId,
        importId: document.id,
        status: "validation_failure",
        progressKnown: false,
        failure: {
          code: "malformed_or_corrupted",
          retryable: true,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage:
            "This file could not be accepted. Choose a PDF or DOCX resume that follows the upload guidance.",
        },
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
        userMessage:
          "This file could not be accepted. Choose another file or enter your resume manually.",
      });
    }

    if (document.processingStatus === "timeout_partial") {
      return parseStatus({
        requestId,
        importId: document.id,
        status: "recoverable_timeout",
        progressKnown: false,
        ...(draft === null ? {} : { draftSummary: summarizeDraft(draft) }),
        failure: {
          code: "processing_timeout",
          retryable: true,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage:
            "Reading this resume took longer than expected. You can upload a different file or enter the information manually.",
        },
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
        userMessage:
          "Reading this resume took longer than expected. You can upload a different file or enter the information manually.",
      });
    }

    if (document.processingStatus === "failed") {
      return parseStatus({
        requestId,
        importId: document.id,
        status: "terminal_processing_failure",
        progressKnown: false,
        failure: {
          code: "terminal_failure",
          retryable: false,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage:
            "We could not prepare this resume for review. Upload another file or enter your resume manually.",
        },
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
        userMessage:
          "We could not prepare this resume for review. Upload another file or enter your resume manually.",
      });
    }

    if (document.processingStatus === "provider_unavailable") {
      return parseStatus({
        requestId,
        importId: document.id,
        status: "terminal_processing_failure",
        progressKnown: false,
        failure: {
          code: "terminal_failure",
          retryable: false,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage:
            "Reliable resume parsing is not available on this server right now. Upload a different file or enter your resume manually.",
        },
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
        userMessage:
          "We could not prepare this resume for review. Upload a different file or enter your resume manually.",
      });
    }

    if (document.processingStatus === "cancelled") {
      return parseStatus({
        requestId,
        importId: document.id,
        status: "cancelled",
        progressKnown: false,
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
        userMessage:
          "This import is no longer active. Upload another file or enter your resume manually.",
      });
    }

    if (document.processingStatus === "expired") {
      return parseStatus({
        requestId,
        importId: document.id,
        status: "expired",
        progressKnown: false,
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
        userMessage:
          "This import has expired. Upload another file or enter your resume manually.",
      });
    }

    const step = publicStepFor(document, queueProgress);
    return parseStatus({
      requestId,
      importId: document.id,
      status: "processing",
      currentStep: step.step,
      progressKnown: step.progressKnown,
      ...(step.progressPercent === undefined
        ? {}
        : { progressPercent: step.progressPercent }),
      allowedRecoveryActions: ["manual_entry"],
      userMessage: messageForStep(step.step),
    });
  }

  private async readTrustedQueueProgress(importId: string) {
    if (this.queueReader === undefined) return null;
    try {
      const result = queueProgressSchema.safeParse(
        await this.queueReader.readProgress(importId),
      );
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}

function publicStepFor(
  document: ImportedDocument,
  queueProgress: z.infer<typeof queueProgressSchema> | null,
): {
  readonly step: (typeof stepOrder)[number];
  readonly progressKnown: boolean;
  readonly progressPercent?: number;
} {
  if (
    document.validationStatus === "not_started" ||
    document.validationStatus === "validating"
  ) {
    return { step: "checking_document", progressKnown: false };
  }

  if (
    document.validationStatus === "accepted" &&
    (document.processingStatus === "queued" ||
      document.processingStatus === "processing")
  ) {
    if (queueProgress !== null) {
      return {
        step: queueProgress.step,
        progressKnown: queueProgress.progressKnown,
        ...(queueProgress.progressPercent === undefined
          ? {}
          : { progressPercent: queueProgress.progressPercent }),
      };
    }
    return { step: "reading_content", progressKnown: false };
  }

  return { step: "checking_document", progressKnown: false };
}

function summarizeDraft(draft: ImportDraft) {
  return {
    draftId: draft.id,
    retentionExpiresAt: draft.retentionExpiresAt.toISOString(),
    fieldCount: draft.fields.length,
    warningCount: draft.warnings.length,
  };
}

function messageForStep(step: (typeof stepOrder)[number]): string {
  switch (step) {
    case "checking_document":
      return "Checking that your document can be imported.";
    case "reading_content":
      return "Reading the selectable text in your resume.";
    case "organizing_resume_sections":
      return "Organizing the resume information into sections.";
    case "preparing_review":
      return "Preparing your resume draft for review.";
  }
}

function parseStatus(
  value: Omit<PublicImportStatusResponse, "version">,
): PublicImportStatusResponse {
  return publicImportStatusResponseSchema.parse({
    version: importResumeResponseSchemaVersion,
    ...value,
  });
}
