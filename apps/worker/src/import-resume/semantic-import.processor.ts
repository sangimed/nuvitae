import { randomUUID } from "node:crypto";
import type { NuvitaeSemanticExtractionResponse } from "@nuvitae/contracts";
import {
  resumeSemanticParserContractVersion,
  resumeSemanticParseRequestSchema,
} from "@nuvitae/contracts";
import { buildExtractionDraft, type ImportedDocument } from "@nuvitae/domain";
import {
  fragmentsFromDocx,
  fragmentsFromPdf,
  type DocxDeterministicTextExtractor,
  type ExtractionSourceReader,
  type PdfPageText,
  type PdfSelectableTextExtractor,
  type ResumeSourceFragment,
} from "@nuvitae/extraction";
import {
  ProcessingStartDeniedError,
  consumesProcessingCapacity,
  generateSemanticWarnings,
  mapSemanticCandidates,
  serializeSemanticValidationDiagnostic,
  validateSemanticResponse,
  type ImportEventEmitter,
  type ImportEventMetadataFor,
  type ImportProcessingCapacityPort,
  type ResumeSemanticParserProvider,
} from "@nuvitae/import-application";
import type {
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { buildSemanticParseRequest } from "./build-semantic-parse-request.js";

export interface SemanticImportProcessorPorts {
  readonly repository: ImportResumeRepository;
  readonly transactionRunner: PersistenceTransactionRunner;
  readonly sourceReader: ExtractionSourceReader;
  readonly pdfTextExtractor: PdfSelectableTextExtractor;
  readonly docxTextExtractor: DocxDeterministicTextExtractor;
  readonly provider: ResumeSemanticParserProvider | undefined;
  readonly clock?: { now(): Date };
  readonly logger?: SemanticImportLogger;
  readonly capacity?: ImportProcessingCapacityPort;
}

export interface SemanticImportLogger {
  emit: ImportEventEmitter["emit"];
}

export class SemanticImportProcessor {
  private readonly clock: { now(): Date };
  private readonly logger: SemanticImportLogger;

  constructor(private readonly ports: SemanticImportProcessorPorts) {
    this.clock = ports.clock ?? { now: () => new Date() };
    this.logger = ports.logger ?? {
      emit: () => undefined,
    };
  }

  async process(input: {
    ownerUserId: string;
    importedDocumentId: string;
    correlationId?: string;
    abortSignal?: AbortSignal;
  }): Promise<void> {
    const started = this.clock.now();
    const aggregate = await this.ports.repository.findImportByOwner(
      input.importedDocumentId,
      input.ownerUserId,
    );
    if (!aggregate || aggregate.document.ownerUserId !== input.ownerUserId)
      return;
    const document = aggregate.document;
    if (document.processingStatus === "ready_for_review") return;
    if (!isProcessable(document, this.clock.now())) return;
    if (this.ports.capacity !== undefined) {
      const admission = await this.ports.capacity.admitToProcessing(
        input.ownerUserId,
        input.importedDocumentId,
        this.clock.now(),
      );
      if (admission.kind !== "allowed") {
        throw new ProcessingStartDeniedError();
      }
    }

    await this.transition(document, "semantic_parsing_pending");
    await this.transition(document, "semantic_parsing_running");
    if (!this.ports.provider) {
      await this.transition(document, "provider_unavailable");
      this.emitSemanticOutcome(
        document,
        started,
        "provider_unavailable",
        true,
        0,
        0,
        input.correlationId,
      );
      return;
    }

    try {
      const extracted = await this.readAndNormalize(
        document,
        input.abortSignal,
      );
      if (!extracted.ok) {
        await this.transition(
          document,
          extracted.cancelled ? "cancelled" : "failed",
        );
        this.emitSemanticOutcome(
          document,
          started,
          extracted.cancelled ? "cancelled" : "extraction_failed",
          extracted.cancelled,
          0,
          0,
          input.correlationId,
        );
        return;
      }
      const requestResult = resumeSemanticParseRequestSchema.safeParse(
        buildSemanticParseRequest(
          document,
          extracted.fragments,
          input.correlationId,
        ),
      );
      if (!requestResult.success) {
        await this.transition(document, "semantic_response_invalid");
        this.emitSemanticOutcome(
          document,
          started,
          "request_invalid",
          false,
          0,
          0,
          input.correlationId,
        );
        return;
      }
      this.logger.emit("semantic.provider_invocation_started", {
        importId: document.id,
        contractVersion: resumeSemanticParserContractVersion,
        ...(requestResult.data.correlationId === null ||
        requestResult.data.correlationId === undefined
          ? {}
          : { correlationId: requestResult.data.correlationId }),
      });
      const providerResult = await this.ports.provider.parse(
        requestResult.data,
        {
          timeoutMs: this.ports.provider.capabilities.maxTimeoutMs,
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        },
      );
      if (!providerResult.ok) {
        await this.transition(
          document,
          providerResult.error.code === "timeout" ||
            providerResult.error.code === "cancelled"
            ? "failed"
            : providerResult.error.code === "not_configured" ||
                providerResult.error.code === "provider_unavailable"
              ? "provider_unavailable"
              : "semantic_response_invalid",
        );
        this.emitSemanticOutcome(
          document,
          started,
          providerResult.error.code,
          providerResult.error.retryable,
          0,
          0,
          input.correlationId,
        );
        return;
      }
      const validation = validateSemanticResponse({
        request: requestResult.data,
        response: providerResult.response,
      });
      const accepted = validation.accepted && validation.response !== null;
      this.emitSemanticOutcome(
        document,
        started,
        accepted ? "accepted" : "invalid_provider_response",
        false,
        validation.response ? countValues(validation.response) : 0,
        validation.diagnostics.length,
        input.correlationId,
      );
      for (const diagnostic of validation.diagnostics.slice(0, 20)) {
        this.logger.emit(
          "semantic.validation_diagnostics",
          serializeSemanticValidationDiagnostic(diagnostic, {
            importId: document.id,
            ...(input.correlationId === undefined
              ? {}
              : { correlationId: input.correlationId }),
          }),
        );
      }
      if (!validation.accepted || !validation.response) {
        await this.transition(document, "semantic_validation_failed");
        return;
      }
      const mapping = mapSemanticCandidates({
        response: validation.response,
        document,
        diagnostics: validation.diagnostics,
      });
      const warningResult = generateSemanticWarnings({
        response: validation.response,
        diagnostics: validation.diagnostics,
        mapping,
      });
      const draftResult = buildExtractionDraft({
        importedDocument: document,
        fields: mapping.fields,
        warnings: warningResult.draftWarnings,
        missingOrUnprocessedSections: [],
        ids: {
          draftId: randomUUID,
          fieldId: randomUUID,
          warningId: randomUUID,
        },
        now: this.clock.now(),
      });
      if (!draftResult.draft) {
        await this.transition(document, "semantic_validation_failed");
        return;
      }
      await this.ports.transactionRunner.transaction(async (manager) => {
        const current = await this.ports.repository.findImportByOwner(
          document.id,
          document.ownerUserId,
          manager,
        );
        if (
          !current ||
          current.document.processingStatus === "ready_for_review"
        )
          return;
        if (
          await this.ports.repository.findDraftByImportAndOwner(
            document.id,
            document.ownerUserId,
            manager,
          )
        )
          return;
        await this.ports.repository.saveDraft(draftResult.draft!, manager);
        await this.ports.repository.saveImportLifecycle(
          { ...current.document, processingStatus: "ready_for_review" },
          manager,
        );
        this.logger.emit("review.draft_created", {
          importId: document.id,
          draftId: draftResult.draft!.id,
          status:
            draftResult.draft!.status === "ready_to_confirm"
              ? "ready_to_confirm"
              : "review_required",
          fieldCountBucket: bucket(draftResult.draft!.fields.length),
          warningCountBucket: bucket(draftResult.draft!.warnings.length),
        });
      });
    } catch (error) {
      const cancelled = input.abortSignal?.aborted === true;
      await this.transition(document, cancelled ? "cancelled" : "failed");
      this.logger.emit("import.unexpected_failure", {
        importId: document.id,
        errorCategory: "unexpected_failure",
        retryable: !cancelled,
        ...(input.correlationId === undefined
          ? {}
          : { correlationId: input.correlationId }),
      });
      void error;
    }
  }

  private async readAndNormalize(
    document: ImportedDocument,
    abortSignal?: AbortSignal,
  ) {
    if (!document.storageKey || !document.fileExtension || abortSignal?.aborted)
      return { ok: false as const, cancelled: abortSignal?.aborted === true };
    let fragments: readonly ResumeSourceFragment[];
    if (document.fileExtension === "pdf") {
      const result = await this.ports.pdfTextExtractor.extractSelectableText({
        importId: document.id,
        ownerUserId: document.ownerUserId,
        sourceStorageKey: document.storageKey,
        format: "pdf",
        ...(abortSignal ? { abortSignal } : {}),
      });
      if (!result.ok)
        return {
          ok: false as const,
          cancelled: result.error.category === "cancelled",
        };
      fragments = fragmentsFromPdf(result.value as readonly PdfPageText[]);
      this.emitTranscriptNormalized(document, fragments);
    } else {
      const result = await this.ports.docxTextExtractor.extractText({
        importId: document.id,
        ownerUserId: document.ownerUserId,
        sourceStorageKey: document.storageKey,
        format: "docx",
        ...(abortSignal ? { abortSignal } : {}),
      });
      if (!result.ok)
        return {
          ok: false as const,
          cancelled: result.error.category === "cancelled",
        };
      fragments = fragmentsFromDocx(result.value);
      this.emitTranscriptNormalized(document, fragments);
    }
    return { ok: true as const, fragments };
  }

  private emitTranscriptNormalized(
    document: ImportedDocument,
    fragments: readonly ResumeSourceFragment[],
  ): void {
    this.logger.emit("extraction.transcript_normalized", {
      importId: document.id,
      documentFormat: document.fileExtension === "docx" ? "docx" : "pdf",
      fragmentCountBucket: bucket(fragments.length),
      lineCountBucket: bucket(
        fragments.filter((fragment) => fragment.text.trim().length > 0).length,
      ),
    });
  }

  private async transition(
    document: ImportedDocument,
    processingStatus: ImportedDocument["processingStatus"],
  ): Promise<void> {
    await this.ports.transactionRunner.transaction(async (manager) => {
      const current = await this.ports.repository.findImportByOwner(
        document.id,
        document.ownerUserId,
        manager,
      );
      if (current && current.document.processingStatus !== "ready_for_review")
        await this.ports.repository.saveImportLifecycle(
          { ...current.document, processingStatus },
          manager,
        );
    });
    if (!consumesProcessingCapacity(processingStatus)) {
      await this.releaseCapacity(document.id, document.ownerUserId);
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
        this.clock.now(),
      );
    } catch {
      this.logger.emit("import.limit_release_failed", {
        importId,
        errorCategory: "limit_release_failed",
      });
    }
  }

  private emitSemanticOutcome(
    document: ImportedDocument,
    started: Date,
    outcome: ImportEventMetadataFor<"semantic.outcome">["outcome"],
    retryable: boolean,
    values: number,
    diagnostics: number,
    correlationId?: string,
  ): void {
    this.logger.emit("semantic.outcome", {
      importId: document.id,
      outcome,
      retryable,
      valueCountBucket: bucket(values),
      diagnosticCountBucket: bucket(diagnostics),
      durationBucket: durationBucket(
        Math.max(0, this.clock.now().getTime() - started.getTime()),
      ),
      ...(correlationId === undefined ? {} : { correlationId }),
    });
  }
}
function bucket(value: number): "0-4" | "5-19" | "20-99" | "100+" {
  return value < 5
    ? "0-4"
    : value < 20
      ? "5-19"
      : value < 100
        ? "20-99"
        : "100+";
}
function durationBucket(
  milliseconds: number,
): "under_100ms" | "under_1s" | "under_10s" | "10s_or_more" {
  if (milliseconds < 100) return "under_100ms";
  if (milliseconds < 1_000) return "under_1s";
  if (milliseconds < 10_000) return "under_10s";
  return "10s_or_more";
}
function countValues(response: NuvitaeSemanticExtractionResponse): number {
  return JSON.stringify(response.sections).match(/"value"/gu)?.length ?? 0;
}
function isProcessable(document: ImportedDocument, now: Date): boolean {
  return (
    document.uploadStatus === "uploaded" &&
    document.validationStatus === "accepted" &&
    document.deletionStatus === "not_scheduled" &&
    document.deletedAt === undefined &&
    document.retentionExpiresAt.getTime() > now.getTime() &&
    document.storageKey !== undefined
  );
}
