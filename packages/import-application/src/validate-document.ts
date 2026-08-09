import {
  importResumeResponseSchemaVersion,
  validationResponseSchema,
  type ValidationResponse,
} from "@nuvitae/contracts";
import type {
  DetectedLanguage,
  ImportedDocument,
  SupportedDocumentFormat,
} from "@nuvitae/domain";
import type {
  DocxDeterministicTextExtractor,
  DocxParagraph,
  DocxRenderedPageCounter,
  ExtractionFailure,
  ExtractionRequest,
  LanguageDetector,
  PdfPageCounter,
  PdfPageText,
  PdfSelectableTextExtractor,
  SelectableTextAssessment,
} from "@nuvitae/extraction";
import type {
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import type { EntityManager } from "typeorm";
import type { ImportProcessingLimits } from "./import-processing-limits.js";
import type { ImportProcessingCapacityPort } from "./import-capacity.js";
import type {
  ImportEventEmitter,
  ImportEventMetadataFor,
} from "./observability/import-events.js";

const pdfContentType = "application/pdf";
const docxContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type PublicFailureCode = NonNullable<ValidationResponse["failure"]>["code"];
type RecoveryAction = NonNullable<
  ValidationResponse["failure"]
>["recoveryActions"][number];

export interface ValidateDocumentInput {
  readonly ownerUserId: string;
  readonly importedDocumentId: string;
  readonly abortSignal?: AbortSignal;
}

export interface ValidateDocumentPrivateSourceReader {
  readSource(input: {
    readonly sourceStorageKey: string;
    readonly maximumBytes: number;
    readonly abortSignal?: AbortSignal;
  }): Promise<Uint8Array>;
}

export interface ValidateDocumentRequestIdGenerator {
  nextRequestId(): string;
}

export interface ValidateDocumentClock {
  now(): Date;
}

export type ValidateDocumentPrivacyLogger = ImportEventEmitter;

export interface ValidateDocumentPorts {
  readonly repository: ImportResumeRepository;
  readonly transactionRunner: PersistenceTransactionRunner;
  readonly sourceReader: ValidateDocumentPrivateSourceReader;
  readonly pdfPageCounter: PdfPageCounter;
  readonly pdfTextExtractor: PdfSelectableTextExtractor;
  readonly docxTextExtractor: DocxDeterministicTextExtractor;
  readonly docxPageCounter: DocxRenderedPageCounter;
  readonly languageDetector: LanguageDetector;
  readonly processingLimits: Pick<
    ImportProcessingLimits,
    "maxUploadSizeBytes" | "maxRenderedPageCount"
  >;
  readonly requestIdGenerator: ValidateDocumentRequestIdGenerator;
  readonly clock: ValidateDocumentClock;
  readonly logger: ValidateDocumentPrivacyLogger;
  readonly capacity?: ImportProcessingCapacityPort;
}

interface SuccessfulValidation {
  readonly renderedPageCount: number;
  readonly detectedLanguage: DetectedLanguage;
  readonly selectableText: SelectableTextAssessment;
}

interface DocumentRejection {
  readonly kind: "document_rejection";
  readonly code: PublicFailureCode;
  readonly detectedLanguage?: DetectedLanguage;
  readonly renderedPageCount?: number;
  readonly recoveryActions: readonly RecoveryAction[];
  readonly userMessage: string;
}

interface RecoverableOutcome {
  readonly kind: "recoverable";
  readonly code: PublicFailureCode;
  readonly recoveryActions: readonly RecoveryAction[];
  readonly userMessage: string;
}

type ValidationFailure = DocumentRejection | RecoverableOutcome;
type BeginValidationResult =
  | { readonly kind: "started"; readonly document: ImportedDocument }
  | { readonly kind: "not_found" }
  | { readonly kind: "infrastructure_failure" };

/**
 * Validates a previously persisted private import. The API runtime supplies
 * adapters, but a future worker processor must supply the concrete
 * parser-capable `DocxRenderedPageCounter`; this service never launches
 * LibreOffice and is intentionally not wired into AppModule.
 */
export class ValidateDocumentService {
  constructor(private readonly ports: ValidateDocumentPorts) {}

  async validate(input: ValidateDocumentInput): Promise<ValidationResponse> {
    const requestId = this.ports.requestIdGenerator.nextRequestId();
    const startedAt = this.ports.clock.now();
    const beginning = await this.beginValidation(input);
    if (beginning.kind === "not_found") {
      return this.response({
        requestId,
        importId: input.importedDocumentId,
        accepted: false,
        failure: publicFailure(
          "terminal_failure",
          "This resume import is unavailable.",
          false,
          ["manual_entry"],
        ),
      });
    }
    if (beginning.kind === "infrastructure_failure") {
      return this.retryableInfrastructureResponse(
        requestId,
        input.importedDocumentId,
      );
    }
    const document = beginning.document;

    let outcome: SuccessfulValidation | ValidationFailure;
    try {
      outcome = await this.inspectDocument(document, input.abortSignal);
    } catch {
      outcome = infrastructureFailure();
    }

    if ("kind" in outcome && outcome.kind === "recoverable") {
      await this.restoreRetryableState(document);
      this.logCompletion(document.id, outcome.code, startedAt);
      return this.response({
        requestId,
        importId: document.id,
        accepted: false,
        failure: publicFailure(
          outcome.code,
          outcome.userMessage,
          true,
          outcome.recoveryActions,
        ),
      });
    }

    if ("kind" in outcome && outcome.kind === "document_rejection") {
      const persisted = await this.persistFinalState(document, {
        validationStatus: "rejected",
        processingStatus: "failed",
        ...(outcome.renderedPageCount === undefined
          ? {}
          : { renderedPageCount: outcome.renderedPageCount }),
        ...(outcome.detectedLanguage === undefined
          ? {}
          : { detectedLanguage: outcome.detectedLanguage }),
      });
      if (!persisted) {
        return this.retryableInfrastructureResponse(requestId, document.id);
      }
      await this.releaseCapacity(document.id, document.ownerUserId);
      this.logCompletion(document.id, outcome.code, startedAt, {
        ...(outcome.renderedPageCount === undefined
          ? {}
          : { renderedPageCount: outcome.renderedPageCount }),
        ...(outcome.detectedLanguage === undefined
          ? {}
          : { detectedLanguage: outcome.detectedLanguage }),
      });
      return this.response({
        requestId,
        importId: document.id,
        accepted: false,
        ...(outcome.renderedPageCount === undefined
          ? {}
          : { renderedPageCount: outcome.renderedPageCount }),
        ...(outcome.detectedLanguage === undefined
          ? {}
          : { detectedLanguage: outcome.detectedLanguage }),
        failure: publicFailure(
          outcome.code,
          outcome.userMessage,
          false,
          outcome.recoveryActions,
        ),
      });
    }

    const persisted = await this.persistFinalState(document, {
      validationStatus: "accepted",
      renderedPageCount: outcome.renderedPageCount,
      detectedLanguage: outcome.detectedLanguage,
    });
    if (!persisted) {
      return this.retryableInfrastructureResponse(requestId, document.id);
    }
    this.logCompletion(document.id, "accepted", startedAt, outcome);
    return this.response({
      requestId,
      importId: document.id,
      accepted: true,
      renderedPageCount: outcome.renderedPageCount,
      detectedLanguage: outcome.detectedLanguage,
    });
  }

  private async beginValidation(
    input: ValidateDocumentInput,
  ): Promise<BeginValidationResult> {
    try {
      return await this.ports.transactionRunner.transaction(async (manager) => {
        const aggregate = await this.ports.repository.findImportByOwner(
          input.importedDocumentId,
          input.ownerUserId,
          manager,
        );
        if (aggregate === null) return { kind: "not_found" as const };
        if (aggregate.document.validationStatus !== "not_started") {
          return { kind: "not_found" as const };
        }
        const validating = {
          ...aggregate.document,
          validationStatus: "validating" as const,
        };
        await this.ports.repository.saveImportLifecycle(validating, manager);
        return { kind: "started" as const, document: validating };
      });
    } catch {
      return { kind: "infrastructure_failure" };
    }
  }

  private async inspectDocument(
    document: ImportedDocument,
    abortSignal: AbortSignal | undefined,
  ): Promise<SuccessfulValidation | ValidationFailure> {
    const format = validateStoredFormat(document);
    if (format === null) {
      return rejection("unsupported_format", "Upload a PDF or DOCX resume.", [
        "replace_upload",
        "manual_entry",
      ]);
    }
    if (document.storageKey === undefined) {
      return infrastructureFailure();
    }
    if (abortSignal?.aborted === true) {
      return cancelledFailure();
    }

    let source: Uint8Array;
    try {
      source = await this.ports.sourceReader.readSource({
        sourceStorageKey: document.storageKey,
        maximumBytes: this.ports.processingLimits.maxUploadSizeBytes + 1,
        ...(abortSignal === undefined ? {} : { abortSignal }),
      });
    } catch {
      this.ports.logger.emit("import.storage_read_failed", {
        importId: document.id,
        retryable: true,
      });
      return infrastructureFailure();
    }
    if (source.byteLength > this.ports.processingLimits.maxUploadSizeBytes) {
      return rejection(
        "oversized_file",
        "Choose a resume no larger than 10 MB.",
        ["replace_upload", "manual_entry"],
      );
    }
    if (source.byteLength === 0) {
      return rejection(
        "malformed_or_corrupted",
        "The document is empty or cannot be read.",
        ["replace_upload", "manual_entry"],
      );
    }

    const request: ExtractionRequest = {
      importId: document.id,
      ownerUserId: document.ownerUserId,
      sourceStorageKey: document.storageKey,
      format,
      ...(abortSignal === undefined ? {} : { abortSignal }),
    };
    return format === "pdf"
      ? await this.inspectPdf(request)
      : await this.inspectDocx(request);
  }

  private async inspectPdf(
    request: ExtractionRequest,
  ): Promise<SuccessfulValidation | ValidationFailure> {
    const count = await this.ports.pdfPageCounter.countPages(request);
    if (!count.ok) return mapExtractionFailure(count.error, "page_count");
    if (
      count.value.renderedPageCount >
      this.ports.processingLimits.maxRenderedPageCount
    ) {
      return overPageLimit(count.value.renderedPageCount);
    }

    const text =
      await this.ports.pdfTextExtractor.extractSelectableText(request);
    if (!text.ok) return mapExtractionFailure(text.error, "text");
    const selectableText = assessPdfSelectableText(text.value);
    if (!selectableText.hasSelectableText) {
      return noSelectableText(count.value.renderedPageCount);
    }
    return await this.finishLanguageValidation(
      request,
      text.value,
      count.value.renderedPageCount,
      selectableText,
    );
  }

  private async inspectDocx(
    request: ExtractionRequest,
  ): Promise<SuccessfulValidation | ValidationFailure> {
    const text = await this.ports.docxTextExtractor.extractText(request);
    if (!text.ok) return mapExtractionFailure(text.error, "text");
    const selectableText = assessDocxUsableText(text.value);
    if (!selectableText.hasSelectableText) {
      return noSelectableText();
    }
    const count = await this.ports.docxPageCounter.countRenderedPages(request);
    if (!count.ok) return mapExtractionFailure(count.error, "page_count");
    if (
      count.value.renderedPageCount >
      this.ports.processingLimits.maxRenderedPageCount
    ) {
      return overPageLimit(count.value.renderedPageCount);
    }
    return await this.finishLanguageValidation(
      request,
      text.value,
      count.value.renderedPageCount,
      selectableText,
    );
  }

  private async finishLanguageValidation(
    request: ExtractionRequest,
    text: readonly PdfPageText[] | readonly DocxParagraph[],
    renderedPageCount: number,
    selectableText: SelectableTextAssessment,
  ): Promise<SuccessfulValidation | ValidationFailure> {
    const detection = await this.ports.languageDetector.detectLanguage(
      request,
      text,
    );
    if (!detection.ok) return mapExtractionFailure(detection.error, "language");
    const detectedLanguage = detection.value.language;
    if (detectedLanguage === "unsupported" || detectedLanguage === "unknown") {
      return {
        ...rejection(
          "unsupported_language",
          detectedLanguage === "unknown"
            ? "The document language could not be identified reliably."
            : "This document language is not supported.",
          ["replace_upload", "manual_entry"],
        ),
        detectedLanguage,
        renderedPageCount,
      };
    }
    return { renderedPageCount, detectedLanguage, selectableText };
  }

  private async persistFinalState(
    original: ImportedDocument,
    changes: Pick<ImportedDocument, "validationStatus"> &
      Partial<Pick<ImportedDocument, "processingStatus">> &
      Partial<Pick<ImportedDocument, "renderedPageCount" | "detectedLanguage">>,
  ): Promise<boolean> {
    try {
      await this.ports.transactionRunner.transaction(async (manager) => {
        const current = await this.currentOwnedDocument(original, manager);
        await this.ports.repository.saveImportLifecycle(
          { ...current, ...changes },
          manager,
        );
      });
      return true;
    } catch {
      await this.restoreRetryableState(original);
      return false;
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

  private async restoreRetryableState(
    original: ImportedDocument,
  ): Promise<void> {
    try {
      await this.ports.transactionRunner.transaction(async (manager) => {
        const current = await this.currentOwnedDocument(original, manager);
        await this.ports.repository.saveImportLifecycle(
          { ...current, validationStatus: "not_started" },
          manager,
        );
      });
    } catch {
      this.ports.logger.emit("validation.state_recovery_failed", {
        importId: original.id,
        errorCategory: "state_recovery_failed",
      });
    }
  }

  private async currentOwnedDocument(
    original: ImportedDocument,
    manager: EntityManager,
  ): Promise<ImportedDocument> {
    const aggregate = await this.ports.repository.findImportByOwner(
      original.id,
      original.ownerUserId,
      manager,
    );
    if (aggregate === null) throw new Error("import_unavailable");
    return aggregate.document;
  }

  private response(
    value: Omit<ValidationResponse, "version" | "status">,
  ): ValidationResponse {
    return validationResponseSchema.parse({
      version: importResumeResponseSchemaVersion,
      status: "validation",
      ...value,
    });
  }

  private retryableInfrastructureResponse(
    requestId: string,
    importId: string,
  ): ValidationResponse {
    const failure = infrastructureFailure();
    return this.response({
      requestId,
      importId,
      accepted: false,
      failure: publicFailure(
        failure.code,
        failure.userMessage,
        true,
        failure.recoveryActions,
      ),
    });
  }

  private logCompletion(
    importId: string,
    errorCategory: ImportEventMetadataFor<"validation.completed">["errorCategory"],
    startedAt: Date,
    details: {
      readonly renderedPageCount?: number;
      readonly detectedLanguage?: DetectedLanguage;
    } = {},
  ): void {
    const duration = Math.max(
      0,
      this.ports.clock.now().getTime() - startedAt.getTime(),
    );
    this.ports.logger.emit("validation.completed", {
      importId,
      errorCategory,
      durationBucket: durationBucket(duration),
      pageCountBucket: pageCountBucket(details.renderedPageCount),
      languageCategory: details.detectedLanguage ?? "not_known",
    });
  }
}

/**
 * `imageOnlyPageCount` is intentionally a text-empty page count. PDF.js text
 * extraction alone does not prove that those pages contain images, so
 * `mixedTextAndImage` remains false until a real page-content signal exists.
 */
export function assessPdfSelectableText(
  pages: readonly PdfPageText[],
): SelectableTextAssessment {
  const textItemCount = pages.reduce(
    (total, page) =>
      total + page.items.filter((item) => item.text.trim().length > 0).length,
    0,
  );
  const selectablePageCount = pages.filter((page) =>
    page.items.some((item) => item.text.trim().length > 0),
  ).length;
  return {
    hasSelectableText: textItemCount > 0,
    textItemCount,
    selectablePageCount,
    imageOnlyPageCount: pages.length - selectablePageCount,
    mixedTextAndImage: false,
  };
}

export function assessDocxUsableText(
  paragraphs: readonly DocxParagraph[],
): SelectableTextAssessment {
  const textItemCount = paragraphs.reduce(
    (total, paragraph) =>
      total + paragraph.runs.filter((run) => run.text.trim().length > 0).length,
    0,
  );
  return {
    hasSelectableText: textItemCount > 0,
    textItemCount,
    selectablePageCount: textItemCount > 0 ? 1 : 0,
    imageOnlyPageCount: textItemCount > 0 ? 0 : 1,
    mixedTextAndImage: false,
  };
}

function validateStoredFormat(
  document: ImportedDocument,
): SupportedDocumentFormat | null {
  if (
    document.fileExtension === "pdf" &&
    document.contentType === pdfContentType
  ) {
    return "pdf";
  }
  if (
    document.fileExtension === "docx" &&
    document.contentType === docxContentType
  ) {
    return "docx";
  }
  return null;
}

function mapExtractionFailure(
  error: ExtractionFailure,
  stage: "page_count" | "text" | "language",
): ValidationFailure {
  switch (error.category) {
    case "cancelled":
      return cancelledFailure();
    case "malformed":
    case "corrupted":
      return rejection(
        "malformed_or_corrupted",
        "The document is malformed, corrupted, or incomplete.",
        ["replace_upload", "manual_entry"],
      );
    case "encrypted":
    case "password_protected":
      return rejection(
        "password_protected",
        "Password-protected or encrypted documents are not supported.",
        ["replace_upload", "manual_entry"],
      );
    case "scanned_or_image_only":
      return noSelectableText();
    case "unsupported":
      return rejection(
        "unsafe_content",
        "The document contains content that cannot be processed safely.",
        ["replace_upload", "manual_entry"],
      );
    case "resource_limit":
      return stage === "page_count"
        ? rejection(
            "over_page_limit",
            "Choose a resume with no more than 5 rendered pages.",
            ["replace_upload", "manual_entry"],
          )
        : infrastructureFailure();
    case "unexpected":
      return infrastructureFailure();
  }
  return infrastructureFailure();
}

function rejection(
  code: PublicFailureCode,
  userMessage: string,
  recoveryActions: readonly RecoveryAction[],
): DocumentRejection {
  return { kind: "document_rejection", code, userMessage, recoveryActions };
}

function infrastructureFailure(): RecoverableOutcome {
  return {
    kind: "recoverable",
    code: "terminal_failure",
    userMessage: "The document could not be checked safely. Try again.",
    recoveryActions: ["retry", "replace_upload", "manual_entry"],
  };
}

function cancelledFailure(): RecoverableOutcome {
  return {
    kind: "recoverable",
    code: "cancelled",
    userMessage: "Document validation was cancelled.",
    recoveryActions: ["retry", "replace_upload", "manual_entry"],
  };
}

function overPageLimit(renderedPageCount: number): DocumentRejection {
  return {
    ...rejection(
      "over_page_limit",
      "Choose a resume with no more than 5 rendered pages.",
      ["replace_upload", "manual_entry"],
    ),
    renderedPageCount,
  };
}

function noSelectableText(renderedPageCount?: number): DocumentRejection {
  return {
    ...rejection(
      "no_selectable_text",
      "Choose a resume with usable selectable text. OCR is not supported.",
      ["replace_upload", "manual_entry"],
    ),
    ...(renderedPageCount === undefined ? {} : { renderedPageCount }),
  };
}

function publicFailure(
  code: PublicFailureCode,
  userMessage: string,
  retryable: boolean,
  recoveryActions: readonly RecoveryAction[],
) {
  return {
    code,
    userMessage,
    retryable,
    recoveryActions: [...recoveryActions],
  };
}

function durationBucket(
  milliseconds: number,
): "under_100ms" | "under_1s" | "under_10s" | "10s_or_more" {
  if (milliseconds < 100) return "under_100ms";
  if (milliseconds < 1_000) return "under_1s";
  if (milliseconds < 10_000) return "under_10s";
  return "10s_or_more";
}

function pageCountBucket(
  value: number | undefined,
): "not_known" | "one" | "two_to_five" | "over_limit" {
  if (value === undefined) return "not_known";
  if (value <= 1) return "one";
  if (value <= 5) return "two_to_five";
  return "over_limit";
}
