import { randomUUID } from "node:crypto";
import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import {
  resumeSemanticParserContractVersion,
  resumeSemanticParseRequestSchema,
} from "@nuvitae/contracts";
import {
  buildExtractionDraft,
  type DeterministicResumeFieldCandidate,
  type DeterministicWarningCandidate,
  type ImportedDocument,
} from "@nuvitae/domain";
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
  mapSemanticV2CandidatesToDraft,
  runLimitedDeterministicPartialFallback,
  emitImportTiming,
  serializeSemanticValidationDiagnostic,
  validationIssueCategory,
  validateSemanticResponse,
  type ImportEventEmitter,
  type ImportEventMetadataFor,
  type ImportProcessingCapacityPort,
  type LimitedDeterministicFallbackOutcome,
  type LimitedDeterministicFallbackProviderTrigger,
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

/**
 * T217's application-owned semantic call budget. The deterministic fallback
 * is local and bounded; it never invokes a second provider or schedules a
 * provider retry.
 */
export const T217_SEMANTIC_FALLBACK_BUDGET = {
  maximumPrimaryProviderAttempts: 1,
  maximumFallbackAttempts: 1,
  maximumTotalSemanticProviderCalls: 1,
  automaticProviderRetry: false,
} as const;

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

    try {
      const extracted = await this.readAndNormalize(
        document,
        input.abortSignal,
        input.correlationId,
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
      this.emitSourceFidelity(
        document,
        "source_extraction",
        {
          sourceCoverageCategory: "unknown",
          sourceRefCount: undefined,
          sourceCharacterCount: undefined,
          acceptedCharacterCount: undefined,
          truncationDetected: false,
        },
        input.correlationId,
      );

      if (!this.ports.provider) {
        this.emitSemanticOutcome(
          document,
          started,
          "not_configured",
          false,
          0,
          0,
          input.correlationId,
        );
        await this.runFallbackOrLeaveTerminal(
          document,
          requestResult.data,
          extracted.fragments,
          "no_provider",
          started,
          input,
        );
        return;
      }

      const providerStartedAt = this.clock.now();
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId: input.correlationId,
        phase: "provider_started",
        source: "worker",
        at: providerStartedAt,
        uploadReceivedAt: document.createdAt,
      });
      this.logger.emit("semantic.provider_invocation_started", {
        importId: document.id,
        contractVersion: resumeSemanticParserContractVersion,
        requestContractVersion: resumeSemanticParserContractVersion,
        responseContractVersion: "nuvitae.semantic-extraction.v2",
        ...(requestResult.data.correlationId === null ||
        requestResult.data.correlationId === undefined
          ? {}
          : { correlationId: requestResult.data.correlationId }),
      });
      const invocationOptions = {
        timeoutMs: this.ports.provider.capabilities.maxTimeoutMs,
        ownerUserId: input.ownerUserId,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      };
      const providerResult =
        this.ports.provider.parseV2 === undefined
          ? await this.ports.provider.parse(
              requestResult.data,
              invocationOptions,
            )
          : await this.ports.provider.parseV2(
              requestResult.data,
              invocationOptions,
            );
      const providerCompletedAt = this.clock.now();
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId: input.correlationId,
        phase: "semantic_parsing_completed",
        source: "worker",
        at: providerCompletedAt,
        durationMs: providerCompletedAt.getTime() - providerStartedAt.getTime(),
        uploadReceivedAt: document.createdAt,
      });
      if (!providerResult.ok) {
        if (
          input.abortSignal?.aborted ||
          providerResult.error.code === "cancelled"
        ) {
          await this.transition(document, "cancelled");
          this.emitSemanticOutcome(
            document,
            started,
            "cancelled",
            false,
            0,
            0,
            input.correlationId,
          );
          return;
        }
        for (const issue of providerResult.error.validationIssues) {
          this.logger.emit("semantic.validation_diagnostics", {
            category: validationIssueCategory(issue),
            code: issue.code,
            retryable: providerResult.error.retryable,
            requiresReview: false,
            path: issue.path,
            importId: document.id,
            ...(input.correlationId === undefined
              ? {}
              : { correlationId: input.correlationId }),
          });
        }
        const fallbackTrigger = fallbackTriggerForProviderError(
          providerResult.error.code,
        );
        if (fallbackTrigger !== undefined && !input.abortSignal?.aborted) {
          this.emitSemanticOutcome(
            document,
            started,
            providerResult.error.validationIssues.some(
              (issue) => issue.code === "v2_invalid_envelope",
            )
              ? "v2_invalid_envelope"
              : providerResult.error.code,
            providerResult.error.retryable,
            0,
            providerResult.error.validationIssues.length,
            input.correlationId,
          );
          await this.runFallbackOrLeaveTerminal(
            document,
            requestResult.data,
            extracted.fragments,
            fallbackTrigger,
            started,
            input,
          );
          return;
        }
        await this.transition(
          document,
          providerResult.error.code === "timeout"
            ? "failed"
            : providerResult.error.code === "not_configured" ||
                providerResult.error.code === "provider_unavailable" ||
                providerResult.error.code === "disconnected" ||
                providerResult.error.code === "authentication_expired" ||
                providerResult.error.code === "authentication_revoked"
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
      if ("canonical" in providerResult) {
        const canonical = providerResult.canonical;
        const summaryCandidate = canonical.candidates.find(
          (candidate) => candidate.fieldPath === "summary",
        );
        this.emitSourceFidelity(
          document,
          "provider_response",
          {
            sourceCoverageCategory:
              summaryCandidate === undefined ? "unknown" : "grounded",
            sourceRefCount: summaryCandidate?.evidence.length,
            sourceCharacterCount:
              summaryCandidate === undefined
                ? undefined
                : evidenceCharacterCount(summaryCandidate.evidence),
            acceptedCharacterCount: summaryCandidate?.value.length,
            truncationDetected: false,
          },
          input.correlationId,
        );
        if (canonical.candidates.length === 0) {
          this.emitSemanticOutcome(
            document,
            started,
            "v2_zero_accepted_fields",
            false,
            0,
            canonical.rejected.length,
            input.correlationId,
          );
          if (!input.abortSignal?.aborted) {
            await this.runFallbackOrLeaveTerminal(
              document,
              requestResult.data,
              extracted.fragments,
              "malformed_provider_output",
              started,
              input,
            );
          }
          return;
        }
        for (const rejected of canonical.rejected.slice(0, 20)) {
          this.logger.emit("semantic.validation_diagnostics", {
            category: "schema",
            code: rejected.code,
            retryable: false,
            requiresReview: true,
            path: rejected.path,
            importId: document.id,
            ...(input.correlationId === undefined
              ? {}
              : { correlationId: input.correlationId }),
          });
        }
        const mapping = mapSemanticV2CandidatesToDraft({
          candidates: canonical.candidates,
          rejected: canonical.rejected,
          signals: canonical.signals,
          document,
        });
        const draftResult = buildExtractionDraft({
          importedDocument: document,
          fields: mapping.fields,
          warnings: mapping.warnings,
          missingOrUnprocessedSections: [],
          ids: {
            draftId: randomUUID,
            fieldId: randomUUID,
            warningId: randomUUID,
          },
          now: this.clock.now(),
        });
        this.emitSourceFidelityForCandidates(
          document,
          canonical.candidates,
          mapping.fields,
          input.correlationId,
        );
        this.emitSemanticOutcome(
          document,
          started,
          canonical.rejected.length > 0 || canonical.signals.length > 0
            ? "v2_partial_acceptance"
            : "v2_success",
          false,
          canonical.candidates.length,
          canonical.rejected.length + canonical.signals.length,
          input.correlationId,
        );
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
            current.document.processingStatus === "ready_for_review" ||
            (await this.ports.repository.findDraftByImportAndOwner(
              document.id,
              document.ownerUserId,
              manager,
            ))
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
        emitImportTiming(this.logger, {
          importId: document.id,
          correlationId: input.correlationId,
          phase: "draft_persisted",
          source: "worker",
          at: this.clock.now(),
          uploadReceivedAt: document.createdAt,
        });
        await this.releaseCapacity(document.id, document.ownerUserId);
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
        // A schema-invalid provider response is a recoverable protocol
        // failure. Grounding, no-invention, ambiguity, conflict, and review
        // failures are semantic-quality failures and remain terminal; the
        // deterministic fallback is never used to retry them until they pass.
        if (
          isRecoverableProtocolValidation(validation) &&
          !input.abortSignal?.aborted
        ) {
          await this.runFallbackOrLeaveTerminal(
            document,
            requestResult.data,
            extracted.fragments,
            "malformed_provider_output",
            started,
            input,
          );
          return;
        }
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
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId: input.correlationId,
        phase: "draft_persisted",
        source: "worker",
        at: this.clock.now(),
        uploadReceivedAt: document.createdAt,
      });
      await this.releaseCapacity(document.id, document.ownerUserId);
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

  private async runFallbackOrLeaveTerminal(
    document: ImportedDocument,
    request: ResumeSemanticParseRequest,
    sourceFragments: readonly ResumeSourceFragment[],
    trigger: LimitedDeterministicFallbackProviderTrigger,
    started: Date,
    input: {
      readonly ownerUserId: string;
      readonly importedDocumentId: string;
      readonly correlationId?: string;
      readonly abortSignal?: AbortSignal;
    },
  ): Promise<void> {
    if (input.abortSignal?.aborted) {
      await this.transition(document, "cancelled");
      this.emitSemanticOutcome(
        document,
        started,
        "cancelled",
        false,
        0,
        0,
        input.correlationId,
      );
      return;
    }

    let outcome: LimitedDeterministicFallbackOutcome;
    try {
      outcome = runLimitedDeterministicPartialFallback({
        normalizedTranscript: request.normalizedTranscript,
        sourceFragments: request.sourceFragments,
        trigger,
        alternativeProviderAvailable: false,
      });
    } catch {
      await this.transition(document, "failed");
      this.emitSemanticOutcome(
        document,
        started,
        "extraction_failed",
        false,
        0,
        0,
        input.correlationId,
      );
      return;
    }

    if (input.abortSignal?.aborted) {
      await this.transition(document, "cancelled");
      this.emitSemanticOutcome(
        document,
        started,
        "cancelled",
        false,
        0,
        0,
        input.correlationId,
      );
      return;
    }

    const fallbackFields = mapFallbackFields(outcome, sourceFragments);
    const draftResult = buildExtractionDraft({
      importedDocument: document,
      fields: fallbackFields,
      warnings: mapFallbackWarnings(outcome),
      missingOrUnprocessedSections: fallbackMissingSections,
      ids: {
        draftId: randomUUID,
        fieldId: randomUUID,
        warningId: randomUUID,
      },
      now: this.clock.now(),
    });

    if (!draftResult.draft || !outcome.meetsDraftThreshold) {
      await this.transition(
        document,
        terminalStatusForFallbackTrigger(trigger),
      );
      this.emitSemanticOutcome(
        document,
        started,
        "partial_deterministic_fallback",
        false,
        outcome.acceptedCandidateCount,
        outcome.rejectedCandidateCount,
        input.correlationId,
      );
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
        current.document.processingStatus === "ready_for_review" ||
        (await this.ports.repository.findDraftByImportAndOwner(
          document.id,
          document.ownerUserId,
          manager,
        )) !== null
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
        status: "review_required",
        fieldCountBucket: bucket(draftResult.draft!.fields.length),
        warningCountBucket: bucket(draftResult.draft!.warnings.length),
      });
    });
    emitImportTiming(this.logger, {
      importId: document.id,
      correlationId: input.correlationId,
      phase: "draft_persisted",
      source: "worker",
      at: this.clock.now(),
      uploadReceivedAt: document.createdAt,
    });
    await this.releaseCapacity(document.id, document.ownerUserId);
    this.emitSemanticOutcome(
      document,
      started,
      "partial_deterministic_fallback",
      false,
      outcome.acceptedCandidateCount,
      outcome.rejectedCandidateCount,
      input.correlationId,
    );
  }

  private async readAndNormalize(
    document: ImportedDocument,
    abortSignal?: AbortSignal,
    correlationId?: string,
  ) {
    if (!document.storageKey || !document.fileExtension || abortSignal?.aborted)
      return { ok: false as const, cancelled: abortSignal?.aborted === true };
    let fragments: readonly ResumeSourceFragment[];
    if (document.fileExtension === "pdf") {
      const extractionStartedAt = this.clock.now();
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
      const extractedAt = this.clock.now();
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId,
        phase: "extraction_completed",
        source: "worker",
        at: extractedAt,
        durationMs: extractedAt.getTime() - extractionStartedAt.getTime(),
        uploadReceivedAt: document.createdAt,
      });
      const normalizationStartedAt = extractedAt;
      fragments = fragmentsFromPdf(result.value as readonly PdfPageText[]);
      const normalizedAt = this.clock.now();
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId,
        phase: "normalization_completed",
        source: "worker",
        at: normalizedAt,
        durationMs: normalizedAt.getTime() - normalizationStartedAt.getTime(),
        uploadReceivedAt: document.createdAt,
      });
      this.emitTranscriptNormalized(document, fragments, correlationId);
    } else {
      const extractionStartedAt = this.clock.now();
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
      const extractedAt = this.clock.now();
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId,
        phase: "extraction_completed",
        source: "worker",
        at: extractedAt,
        durationMs: extractedAt.getTime() - extractionStartedAt.getTime(),
        uploadReceivedAt: document.createdAt,
      });
      const normalizationStartedAt = extractedAt;
      fragments = fragmentsFromDocx(result.value);
      const normalizedAt = this.clock.now();
      emitImportTiming(this.logger, {
        importId: document.id,
        correlationId,
        phase: "normalization_completed",
        source: "worker",
        at: normalizedAt,
        durationMs: normalizedAt.getTime() - normalizationStartedAt.getTime(),
        uploadReceivedAt: document.createdAt,
      });
      this.emitTranscriptNormalized(document, fragments, correlationId);
    }
    return { ok: true as const, fragments };
  }

  private emitTranscriptNormalized(
    document: ImportedDocument,
    fragments: readonly ResumeSourceFragment[],
    correlationId?: string,
  ): void {
    this.logger.emit("extraction.transcript_normalized", {
      importId: document.id,
      documentFormat: document.fileExtension === "docx" ? "docx" : "pdf",
      fragmentCountBucket: bucket(fragments.length),
      lineCountBucket: bucket(
        fragments.filter((fragment) => fragment.text.trim().length > 0).length,
      ),
      ...(correlationId === undefined ? {} : { correlationId }),
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

  private emitSourceFidelity(
    document: ImportedDocument,
    stage: "source_extraction" | "provider_response",
    measurements: {
      readonly sourceCoverageCategory: "unknown" | "grounded";
      readonly sourceRefCount: number | undefined;
      readonly sourceCharacterCount: number | undefined;
      readonly acceptedCharacterCount: number | undefined;
      readonly truncationDetected: boolean;
    },
    correlationId?: string,
  ): void {
    this.logger.emit("semantic.source_fidelity", {
      importId: document.id,
      stage,
      longFormFieldCategory: "summary",
      sourceCoverageCategory: measurements.sourceCoverageCategory,
      sourceRefCountBucket:
        measurements.sourceRefCount === undefined
          ? "unknown"
          : countBucket(measurements.sourceRefCount),
      sourceCharacterCountBucket: characterBucket(
        measurements.sourceCharacterCount,
      ),
      acceptedCharacterCountBucket: characterBucket(
        measurements.acceptedCharacterCount,
      ),
      truncationDetected: measurements.truncationDetected,
      ...(correlationId === undefined ? {} : { correlationId }),
    });
  }

  private emitSourceFidelityForCandidates(
    document: ImportedDocument,
    candidates: readonly {
      readonly fieldPath: string;
      readonly value: string;
      readonly evidence: readonly { readonly quote: string }[];
    }[],
    fields: readonly DeterministicResumeFieldCandidate[],
    correlationId?: string,
  ): void {
    for (const candidate of candidates) {
      const category = longFormCategory(candidate.fieldPath);
      if (category === undefined) continue;
      const draftField = fields.find(
        (field) => field.fieldPath === draftFieldPath(candidate.fieldPath),
      );
      this.logger.emit("semantic.source_fidelity", {
        importId: document.id,
        stage: "canonical_candidate",
        longFormFieldCategory: category,
        sourceCoverageCategory: "grounded",
        sourceRefCountBucket: countBucket(candidate.evidence.length),
        sourceCharacterCountBucket: characterBucket(
          evidenceCharacterCount(candidate.evidence),
        ),
        acceptedCharacterCountBucket: characterBucket(candidate.value.length),
        truncationDetected: false,
        ...(correlationId === undefined ? {} : { correlationId }),
      });
      if (draftField !== undefined) {
        const accepted =
          draftField.value.kind === "text"
            ? draftField.value.value.length
            : draftField.value.kind === "link"
              ? draftField.value.url.length
              : 0;
        this.logger.emit("semantic.source_fidelity", {
          importId: document.id,
          stage: "draft_field",
          longFormFieldCategory: category,
          sourceCoverageCategory: "grounded",
          sourceRefCountBucket: countBucket(candidate.evidence.length),
          sourceCharacterCountBucket: characterBucket(
            evidenceCharacterCount(candidate.evidence),
          ),
          acceptedCharacterCountBucket: characterBucket(accepted),
          truncationDetected: accepted !== candidate.value.length,
          ...(correlationId === undefined ? {} : { correlationId }),
        });
      }
    }
  }
}

function longFormCategory(
  fieldPath: string,
): "summary" | "work_bullet" | "project_description" | undefined {
  if (fieldPath === "summary") return "summary";
  if (/\.responsibilities\.\d+$/u.test(fieldPath)) return "work_bullet";
  if (/\.achievements\.\d+$/u.test(fieldPath)) return "work_bullet";
  if (/^projects\.\d+\.description$/u.test(fieldPath))
    return "project_description";
  return undefined;
}

function draftFieldPath(fieldPath: string): string {
  return fieldPath
    .replace(/^workExperience/u, "work_experience")
    .replace(/^professionalLinks/u, "professional_links")
    .replace(/\.startDate$/u, ".start_date")
    .replace(/\.endDate$/u, ".end_date")
    .replace(/\.employerName$/u, ".employer")
    .replace(/\.employerLocation$/u, ".employer_location")
    .replace(/\.fieldOfStudy$/u, ".field_of_study");
}

function countBucket(value: number): "0-4" | "5-19" | "20-99" | "100+" {
  if (value < 5) return "0-4";
  if (value < 20) return "5-19";
  if (value < 100) return "20-99";
  return "100+";
}

function characterBucket(
  value: number | undefined,
):
  | "unknown"
  | "none"
  | "under_256"
  | "256_to_999"
  | "1000_to_3999"
  | "4000_plus" {
  if (value === undefined) return "unknown";
  if (value === 0) return "none";
  if (value < 256) return "under_256";
  if (value < 1_000) return "256_to_999";
  if (value < 4_000) return "1000_to_3999";
  return "4000_plus";
}

function evidenceCharacterCount(
  evidence: readonly { readonly quote: string }[],
): number {
  return evidence.reduce((total, item) => total + item.quote.length, 0);
}

const fallbackMissingSections = [
  "headline",
  "summary",
  "work_experience",
  "education",
  "projects",
  "certifications",
  "professional_links",
] as const;

export function fallbackTriggerForProviderError(
  code: string,
): LimitedDeterministicFallbackProviderTrigger | undefined {
  switch (code) {
    case "not_configured":
      return "no_provider";
    case "provider_unavailable":
      return "provider_unavailable";
    case "rate_limited":
      return "rate_limited";
    case "quota_exceeded":
      return "quota_exhausted";
    case "timeout":
      return "timeout";
    case "invalid_provider_response":
    case "schema_violation":
    case "unsupported_contract_version":
    case "malformed_flattened_evidence":
    case "response_too_large":
      return "malformed_provider_output";
    default:
      // Authentication/security, unsupported capability, grounding,
      // no-invention, ambiguity, conflict, cancellation, and unknown
      // internal/provider failures never enter the deterministic fallback.
      return undefined;
  }
}

function isRecoverableProtocolValidation(
  validation: ReturnType<typeof validateSemanticResponse>,
): boolean {
  return (
    !validation.schemaValid ||
    validation.diagnostics.some(
      (diagnostic) =>
        diagnostic.category === "evidence" &&
        diagnostic.code === "invalid_bounds",
    )
  );
}

function terminalStatusForFallbackTrigger(
  trigger: LimitedDeterministicFallbackProviderTrigger,
): ImportedDocument["processingStatus"] {
  // The public lifecycle has one provider-unavailable terminal state. The
  // original closed trigger remains in the privacy-safe semantic event stream
  // and is never replaced by a generic provider payload or error string.
  void trigger;
  return "provider_unavailable";
}

function mapFallbackFields(
  outcome: LimitedDeterministicFallbackOutcome,
  sourceFragments: readonly ResumeSourceFragment[],
): readonly DeterministicResumeFieldCandidate[] {
  const normalizedFragments = sourceFragments
    .map((fragment) =>
      fragment.text.normalize("NFKC").replace(/\s+/gu, " ").trim(),
    )
    .map((text, index) => ({ text, fragment: sourceFragments[index] }))
    .filter(
      (
        item,
      ): item is {
        readonly text: string;
        readonly fragment: ResumeSourceFragment;
      } => item.text.length > 0 && item.fragment !== undefined,
    );

  return outcome.acceptedCandidates.flatMap((candidate, index) => {
    const evidence = candidate.evidence[0];
    const source =
      evidence === undefined
        ? undefined
        : normalizedFragments[evidence.line - 1];
    if (
      evidence === undefined ||
      source === undefined ||
      source.text.length === 0
    )
      return [];
    return [
      {
        section: fallbackSection(candidate.fieldPath),
        fieldPath: candidate.fieldPath,
        value: { kind: "text", value: candidate.value },
        sourceLocation: source.fragment.location,
        confidence: "high" as const,
        inferenceStatus: "not_inferred" as const,
        sourceOrder: evidence.line * 1_000_000 + evidence.start + index,
      },
    ];
  });
}

function mapFallbackWarnings(
  outcome: LimitedDeterministicFallbackOutcome,
): readonly DeterministicWarningCandidate[] {
  return outcome.warnings.map((warning) => ({
    warningType: fallbackWarningType(warning.category),
    section: fallbackSection(warning.fieldPath),
    ...(warning.fieldPath === undefined
      ? {}
      : { fieldPath: warning.fieldPath }),
    message: warning.message,
    requiresResolution: warning.requiresResolution,
  }));
}

function fallbackSection(
  fieldPath: string | undefined,
): DeterministicResumeFieldCandidate["section"] {
  if (fieldPath?.startsWith("contact.")) return "contact";
  if (fieldPath?.startsWith("skills.")) return "skills";
  if (fieldPath?.startsWith("languages.")) return "languages";
  return "summary";
}

function fallbackWarningType(
  category: LimitedDeterministicFallbackOutcome["warnings"][number]["category"],
): DeterministicWarningCandidate["warningType"] {
  switch (category) {
    case "ambiguous":
      return "ambiguous";
    case "low_confidence":
      return "low_confidence";
    case "unsupported":
      return "unsupported";
    case "duplicate":
      return "duplicate";
    case "no_reliable_semantic_parsing":
    case "partial_extraction":
      return "partial";
    default:
      return "partial";
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
    document.processingStatus === "queued" &&
    document.deletionStatus === "not_scheduled" &&
    document.deletedAt === undefined &&
    document.retentionExpiresAt.getTime() > now.getTime() &&
    document.storageKey !== undefined
  );
}
