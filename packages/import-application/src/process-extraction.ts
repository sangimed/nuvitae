import {
  draftReadyResponseSchema,
  importResumeResponseSchemaVersion,
  partialExtractionResponseSchema,
  terminalFailureResponseSchema,
  type DraftReadyResponse,
  type ImportResumeResponse,
  type PartialExtractionResponse,
  type TerminalFailureResponse,
} from "@nuvitae/contracts";
import {
  buildExtractionDraft,
  type DeterministicResumeFieldCandidate as DomainCandidate,
  type DeterministicWarningCandidate as DomainWarning,
  type ImportedDocument,
} from "@nuvitae/domain";
import {
  DeterministicResumeFieldExtractor,
  fragmentsFromDocx,
  fragmentsFromPdf,
  type DocxDeterministicTextExtractor,
  type ExtractionFailure,
  type ExtractionSourceReader,
  type PdfPageText,
  type PdfSelectableTextExtractor,
  type ResumeSourceFragment,
} from "@nuvitae/extraction";
import type { ImportWorkflowRepository } from "./import-workflow-repository.js";
import type { ImportEventEmitter } from "./observability/import-events.js";
import type { ImportProcessingCapacityPort } from "./import-capacity.js";
import { ProcessingStartDeniedError } from "./import-capacity.js";

export interface ProcessExtractionInput {
  readonly ownerUserId: string;
  readonly importedDocumentId: string;
  readonly abortSignal?: AbortSignal;
}
export interface ProcessExtractionClock {
  now(): Date;
}
export interface ProcessExtractionIds {
  draftId(): string;
  fieldId(): string;
  warningId(): string;
  requestId(): string;
}
export type ProcessExtractionLogger = ImportEventEmitter;
export interface DeterministicFieldExtractorPort {
  extract(
    fragments: readonly ResumeSourceFragment[],
    language: ImportedDocument["detectedLanguage"],
    format: "pdf" | "docx",
  ): ReturnType<DeterministicResumeFieldExtractor["extract"]>;
}
export interface ProcessExtractionPorts {
  readonly repository: ImportWorkflowRepository;
  readonly sourceReader: ExtractionSourceReader;
  readonly pdfTextExtractor: PdfSelectableTextExtractor;
  readonly docxTextExtractor: DocxDeterministicTextExtractor;
  readonly fieldExtractor: DeterministicFieldExtractorPort;
  readonly clock: ProcessExtractionClock;
  readonly ids: ProcessExtractionIds;
  readonly logger: ProcessExtractionLogger;
  /**
   * Optional processing-start admission and capacity release boundary.
   * Production wiring provides it; tests without it keep legacy behavior.
   */
  readonly capacity?: ImportProcessingCapacityPort;
}

type Begin =
  | { readonly kind: "started"; readonly document: ImportedDocument }
  | { readonly kind: "not_found" }
  | { readonly kind: "invalid" }
  | { readonly kind: "capacity_denied" }
  | {
      readonly kind: "existing";
      readonly draft: NonNullable<
        Awaited<
          ReturnType<ImportWorkflowRepository["findDraftByImportAndOwner"]>
        >
      >;
    }
  | { readonly kind: "infrastructure" };

export class ProcessExtractionService {
  constructor(private readonly ports: ProcessExtractionPorts) {}

  async process(input: ProcessExtractionInput): Promise<ImportResumeResponse> {
    const requestId = this.ports.ids.requestId();
    const started = this.ports.clock.now();
    const beginning = await this.begin(input);
    if (beginning.kind === "not_found" || beginning.kind === "invalid")
      return this.failure(
        requestId,
        input.importedDocumentId,
        "terminal_failure",
        false,
      );
    if (beginning.kind === "capacity_denied") {
      throw new ProcessingStartDeniedError();
    }
    if (beginning.kind === "infrastructure")
      return this.failure(
        requestId,
        input.importedDocumentId,
        "terminal_failure",
        true,
      );
    if (beginning.kind === "existing")
      return this.responseForDraft(requestId, beginning.draft);
    const document = beginning.document;
    this.ports.logger.emit("extraction.started", {
      importId: document.id,
      documentFormat: storedFormat(document),
    });
    try {
      const extracted = await this.extract(document, input.abortSignal);
      if (!extracted.ok) {
        this.ports.logger.emit("extraction.failed", {
          importId: document.id,
          documentFormat: storedFormat(document),
          extractionCategory: extracted.error.category,
          retryable: extracted.error.retryable,
          durationBucket: durationBucket(
            Math.max(0, this.ports.clock.now().getTime() - started.getTime()),
          ),
        });
        await this.finishFailure(
          document,
          extracted.error.category === "cancelled" ? "cancelled" : "failed",
        );
        return this.failure(
          requestId,
          document.id,
          mapFailure(extracted.error),
          extracted.error.retryable,
        );
      }
      const result = buildExtractionDraft({
        importedDocument: document,
        fields: extracted.fields as readonly DomainCandidate[],
        warnings: extracted.warnings as readonly DomainWarning[],
        missingOrUnprocessedSections: extracted.missingOrUnprocessedSections,
        ids: {
          draftId: () => this.ports.ids.draftId(),
          fieldId: () => this.ports.ids.fieldId(),
          warningId: () => this.ports.ids.warningId(),
        },
        now: this.ports.clock.now(),
      });
      if (result.draft === undefined) {
        await this.finishFailure(document, "failed");
        const response = terminalFailureResponseSchema.parse({
          version: importResumeResponseSchemaVersion,
          requestId,
          status: "terminal_failure",
          importId: document.id,
          failure: {
            code: "no_supported_field",
            userMessage:
              "We could not find supported resume information in this document.",
            retryable: false,
            recoveryActions: ["replace_upload", "manual_entry"],
          },
        });
        this.log(document, started, "no_supported_field", 0, 0);
        return response;
      }
      const finalized = await this.finalize(document, result.draft);
      if (finalized.kind === "existing")
        return this.responseForDraft(requestId, finalized.draft);
      if (finalized.kind !== "saved")
        return this.failure(requestId, document.id, "terminal_failure", true);
      await this.releaseCapacity(document.id, document.ownerUserId);
      this.log(
        document,
        started,
        result.category,
        result.draft.fields.length,
        result.draft.warnings.length,
      );
      return result.category === "partial"
        ? this.partial(
            requestId,
            document.id,
            result.draft,
            result.missingOrUnprocessedSections,
          )
        : this.ready(requestId, document.id, result.draft);
    } catch {
      this.ports.logger.emit("extraction.failed", {
        importId: document.id,
        documentFormat: storedFormat(document),
        extractionCategory: "unexpected",
        retryable: true,
        durationBucket: durationBucket(
          Math.max(0, this.ports.clock.now().getTime() - started.getTime()),
        ),
      });
      await this.finishFailure(document, "failed");
      return this.failure(requestId, document.id, "terminal_failure", true);
    }
  }

  private async begin(input: ProcessExtractionInput): Promise<Begin> {
    try {
      return await this.ports.repository.transaction(async (repository) => {
        const aggregate = await repository.findImportByOwner(
          input.importedDocumentId,
          input.ownerUserId,
        );
        if (!aggregate) return { kind: "not_found" as const };
        const document = aggregate.document;
        const existing = await repository.findDraftByImportAndOwner(
          document.id,
          input.ownerUserId,
        );
        if (existing) {
          if (
            ["review_required", "ready_to_confirm", "confirmed"].includes(
              existing.status,
            )
          )
            return { kind: "existing" as const, draft: existing };
          return { kind: "invalid" as const };
        }
        if (!isProcessable(document, this.ports.clock.now()))
          return { kind: "invalid" as const };
        if (this.ports.capacity !== undefined) {
          const admission = await this.ports.capacity.admitToProcessing(
            input.ownerUserId,
            input.importedDocumentId,
            this.ports.clock.now(),
          );
          if (admission.kind !== "allowed") {
            return { kind: "capacity_denied" as const };
          }
        }
        const processing = {
          ...document,
          processingStatus: "processing" as const,
        };
        return {
          kind: "started" as const,
          document: await repository.saveImportLifecycle(processing),
        };
      });
    } catch {
      return { kind: "infrastructure" };
    }
  }

  private async extract(document: ImportedDocument, abortSignal?: AbortSignal) {
    if (!document.storageKey || !document.fileExtension || abortSignal?.aborted)
      return {
        ok: false as const,
        error: {
          category: abortSignal?.aborted
            ? ("cancelled" as const)
            : ("unexpected" as const),
          retryable: abortSignal?.aborted !== true,
          message: "source unavailable",
        },
      };
    if (document.fileExtension === "pdf") {
      const request = {
        importId: document.id,
        ownerUserId: document.ownerUserId,
        sourceStorageKey: document.storageKey,
        format: "pdf" as const,
        ...(abortSignal ? { abortSignal } : {}),
      };
      const result =
        await this.ports.pdfTextExtractor.extractSelectableText(request);
      if (!result.ok) return result;
      const fragments = fragmentsFromPdf(
        result.value as readonly PdfPageText[],
      );
      this.emitTranscriptNormalized(document, fragments);
      return {
        ok: true as const,
        ...this.ports.fieldExtractor.extract(
          fragments,
          document.detectedLanguage ?? "unknown",
          "pdf",
        ),
      };
    }
    const request = {
      importId: document.id,
      ownerUserId: document.ownerUserId,
      sourceStorageKey: document.storageKey,
      format: "docx" as const,
      ...(abortSignal ? { abortSignal } : {}),
    };
    const result = await this.ports.docxTextExtractor.extractText(request);
    if (!result.ok) return result;
    const fragments = fragmentsFromDocx(result.value);
    this.emitTranscriptNormalized(document, fragments);
    return {
      ok: true as const,
      ...this.ports.fieldExtractor.extract(
        fragments,
        document.detectedLanguage ?? "unknown",
        "docx",
      ),
    };
  }

  private async finalize(
    document: ImportedDocument,
    draft: NonNullable<ReturnType<typeof buildExtractionDraft>["draft"]>,
  ): Promise<
    | { kind: "saved" }
    | {
        kind: "existing";
        draft: NonNullable<
          Awaited<
            ReturnType<ImportWorkflowRepository["findDraftByImportAndOwner"]>
          >
        >;
      }
    | { kind: "failed" }
  > {
    try {
      return await this.ports.repository.transaction(async (repository) => {
        const current = await repository.findImportByOwner(
          document.id,
          document.ownerUserId,
        );
        if (
          !current ||
          !isProcessableForFinalization(
            current.document,
            this.ports.clock.now(),
          )
        )
          return { kind: "failed" as const };
        const existing = await repository.findDraftByImportAndOwner(
          document.id,
          document.ownerUserId,
        );
        if (existing) return { kind: "existing" as const, draft: existing };
        await repository.saveDraft(draft);
        await repository.saveImportLifecycle({
          ...current.document,
          processingStatus: "ready_for_review",
        });
        this.ports.logger.emit("review.draft_created", {
          importId: current.document.id,
          draftId: draft.id,
          status:
            draft.status === "ready_to_confirm"
              ? "ready_to_confirm"
              : "review_required",
          fieldCountBucket: bucket(draft.fields.length),
          warningCountBucket: bucket(draft.warnings.length),
        });
        return { kind: "saved" as const };
      });
    } catch {
      return { kind: "failed" };
    }
  }

  private async finishFailure(
    document: ImportedDocument,
    status: "failed" | "cancelled",
  ): Promise<void> {
    try {
      await this.ports.repository.transaction(async (repository) => {
        const current = await repository.findImportByOwner(
          document.id,
          document.ownerUserId,
        );
        if (current && current.document.processingStatus === "processing")
          await repository.saveImportLifecycle({
            ...current.document,
            processingStatus: status,
          });
      });
      await this.releaseCapacity(document.id, document.ownerUserId);
    } catch {
      /* response remains privacy-safe and retryable */
    }
  }

  private async releaseCapacity(
    importId: string,
    ownerUserId: string,
  ): Promise<void> {
    if (this.ports.capacity === undefined) return;
    try {
      await this.ports.capacity.releaseCapacity(
        ownerUserId,
        importId,
        this.ports.clock.now(),
      );
    } catch {
      this.ports.logger.emit("import.limit_release_failed", {
        importId,
        errorCategory: "limit_release_failed",
      });
    }
  }
  private responseForDraft(
    requestId: string,
    draft: NonNullable<
      Awaited<ReturnType<ImportWorkflowRepository["findDraftByImportAndOwner"]>>
    >,
  ): ImportResumeResponse {
    return draft.warnings.length
      ? this.partial(requestId, draft.importedDocumentId, draft, ["review"])
      : this.ready(requestId, draft.importedDocumentId, draft);
  }
  private ready(
    requestId: string,
    importId: string,
    draft: NonNullable<ReturnType<typeof buildExtractionDraft>["draft"]>,
  ): DraftReadyResponse {
    return draftReadyResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId,
      status: "draft_ready",
      importId,
      draft: summary(draft),
      userMessage: "Your resume information is ready to review.",
    });
  }
  private partial(
    requestId: string,
    importId: string,
    draft: NonNullable<ReturnType<typeof buildExtractionDraft>["draft"]>,
    missing: readonly string[],
  ): PartialExtractionResponse {
    return partialExtractionResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId,
      status: "partial_extraction",
      importId,
      draft: summary(draft),
      missingOrUnprocessedSections: [...missing],
      recoveryActions: ["manual_entry", "replace_upload"],
      userMessage: "Some resume information is ready to review.",
    });
  }
  private failure(
    requestId: string,
    importId: string,
    code:
      | "terminal_failure"
      | "cancelled"
      | "processing_timeout"
      | "parser_memory_limit"
      | "malformed_or_corrupted"
      | "password_protected"
      | "unsafe_content",
    retryable: boolean,
  ): TerminalFailureResponse {
    return terminalFailureResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      requestId,
      status: "terminal_failure",
      importId,
      failure: {
        code,
        userMessage: "We could not finish reading this resume.",
        retryable,
        recoveryActions: retryable
          ? ["retry", "replace_upload", "manual_entry"]
          : ["replace_upload", "manual_entry"],
      },
    });
  }
  private log(
    document: ImportedDocument,
    started: Date,
    category: "complete" | "partial" | "no_supported_field",
    fields: number,
    warnings: number,
  ): void {
    this.ports.logger.emit("extraction.completed", {
      importId: document.id,
      documentFormat: storedFormat(document),
      extractionCategory: category,
      fieldCountBucket: bucket(fields),
      warningCountBucket: bucket(warnings),
      durationBucket: durationBucket(
        Math.max(0, this.ports.clock.now().getTime() - started.getTime()),
      ),
    });
  }

  private emitTranscriptNormalized(
    document: ImportedDocument,
    fragments: readonly ResumeSourceFragment[],
  ): void {
    this.ports.logger.emit("extraction.transcript_normalized", {
      importId: document.id,
      documentFormat: storedFormat(document),
      fragmentCountBucket: bucket(fragments.length),
      lineCountBucket: bucket(
        fragments.filter((fragment) => fragment.text.trim().length > 0).length,
      ),
    });
  }
}

function storedFormat(document: ImportedDocument): "pdf" | "docx" {
  return document.fileExtension === "docx" ? "docx" : "pdf";
}

function isProcessable(document: ImportedDocument, now: Date): boolean {
  return (
    document.uploadStatus === "uploaded" &&
    document.validationStatus === "accepted" &&
    ["not_started", "queued", "processing"].includes(
      document.processingStatus,
    ) &&
    document.deletionStatus === "not_scheduled" &&
    document.deletedAt === undefined &&
    document.retentionExpiresAt.getTime() > now.getTime() &&
    document.storageKey !== undefined
  );
}
function isProcessableForFinalization(
  document: ImportedDocument,
  now: Date,
): boolean {
  return (
    document.validationStatus === "accepted" &&
    document.processingStatus === "processing" &&
    document.deletionStatus === "not_scheduled" &&
    document.deletedAt === undefined &&
    document.retentionExpiresAt.getTime() > now.getTime()
  );
}
function summary(draft: {
  id: string;
  retentionExpiresAt: Date;
  fields: readonly unknown[];
  warnings: readonly unknown[];
}) {
  return {
    draftId: draft.id,
    retentionExpiresAt: draft.retentionExpiresAt.toISOString(),
    fieldCount: draft.fields.length,
    warningCount: draft.warnings.length,
  };
}
function mapFailure(
  error: ExtractionFailure,
):
  | "terminal_failure"
  | "cancelled"
  | "processing_timeout"
  | "parser_memory_limit"
  | "malformed_or_corrupted"
  | "password_protected"
  | "unsafe_content" {
  switch (error.category) {
    case "cancelled":
      return "cancelled";
    case "resource_limit":
      return "parser_memory_limit";
    case "password_protected":
      return "password_protected";
    case "malformed":
    case "corrupted":
    case "encrypted":
      return "malformed_or_corrupted";
    case "scanned_or_image_only":
      return "malformed_or_corrupted";
    default:
      return "terminal_failure";
  }
}
function bucket(value: number): "0-4" | "5-19" | "20-99" | "100+" {
  if (value < 5) return "0-4";
  if (value < 20) return "5-19";
  if (value < 100) return "20-99";
  return "100+";
}

function durationBucket(
  milliseconds: number,
): "under_100ms" | "under_1s" | "under_10s" | "10s_or_more" {
  if (milliseconds < 100) return "under_100ms";
  if (milliseconds < 1_000) return "under_1s";
  if (milliseconds < 10_000) return "under_10s";
  return "10s_or_more";
}
