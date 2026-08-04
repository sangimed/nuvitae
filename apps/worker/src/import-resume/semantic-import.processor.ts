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
  generateSemanticWarnings,
  mapSemanticCandidates,
  validateSemanticResponse,
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
}

export interface SemanticImportLogger {
  info(event: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn(event: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export class SemanticImportProcessor {
  private readonly clock: { now(): Date };
  private readonly logger: SemanticImportLogger;

  constructor(private readonly ports: SemanticImportProcessorPorts) {
    this.clock = ports.clock ?? { now: () => new Date() };
    this.logger = ports.logger ?? {
      info: () => undefined,
      warn: () => undefined,
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

    await this.transition(document, "semantic_parsing_pending");
    await this.transition(document, "semantic_parsing_running");
    if (!this.ports.provider) {
      await this.transition(document, "provider_unavailable");
      this.log("provider_unavailable", document, started, 0, 0, true);
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
        this.log(
          extracted.cancelled ? "cancelled" : "extraction_failed",
          document,
          started,
          0,
          0,
          extracted.cancelled,
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
        this.log("request_invalid", document, started, 0, 0, false);
        return;
      }
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
        this.log(
          providerResult.error.code,
          document,
          started,
          0,
          0,
          providerResult.error.retryable,
        );
        return;
      }
      const validation = validateSemanticResponse({
        request: requestResult.data,
        response: providerResult.response,
      });
      this.log(
        "validated",
        document,
        started,
        validation.response ? countValues(validation.response) : 0,
        validation.diagnostics.length,
        false,
      );
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
      });
    } catch (error) {
      const cancelled = input.abortSignal?.aborted === true;
      await this.transition(document, cancelled ? "cancelled" : "failed");
      this.logger.warn("semantic_import_failed", {
        importId: document.id,
        outcome: cancelled ? "cancelled" : "unexpected_failure",
        retryable: !cancelled,
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
    }
    return { ok: true as const, fragments };
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
  }

  private log(
    outcome: string,
    document: ImportedDocument,
    started: Date,
    values: number,
    diagnostics: number,
    retryable: boolean,
  ): void {
    this.logger.info("semantic_import_outcome", {
      importId: document.id,
      contractVersion: resumeSemanticParserContractVersion,
      outcome,
      retryable,
      valueCountBucket: bucket(values),
      diagnosticCountBucket: bucket(diagnostics),
      durationBucket: bucket(
        Math.max(0, this.clock.now().getTime() - started.getTime()),
      ),
    });
  }
}
function bucket(value: number): string {
  return value < 5
    ? "0-4"
    : value < 20
      ? "5-19"
      : value < 100
        ? "20-99"
        : "100+";
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
