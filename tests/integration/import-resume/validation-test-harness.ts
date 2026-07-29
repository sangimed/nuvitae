import type {
  ImportDraft,
  ImportedDocument,
  UserCorrection,
} from "@nuvitae/domain";
import {
  DeterministicLanguageDetector,
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  type DocxRenderedPageCounter,
  type ExtractionRequest,
  type ExtractionSourceReader,
} from "@nuvitae/extraction";
import type {
  ImportAggregate,
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import type { EntityManager } from "typeorm";
import {
  ValidateDocumentService,
  type ValidateDocumentPrivacyLogger,
} from "../../../apps/api/src/services/import-resume/validate-document.js";
import {
  failed,
  succeeded,
} from "../../../packages/extraction/src/extraction-failures.js";

export const ownerUserId = "00000000-0000-4000-8000-000000000101";
export const otherUserId = "00000000-0000-4000-8000-000000000102";
const createdAt = new Date("2026-07-29T08:00:00.000Z");
export const retentionExpiresAt = new Date("2026-08-05T08:00:00.000Z");

const docxLimits = {
  maximumArchiveSizeBytes: 10 * 1024 * 1024,
  maximumEntryCount: 100,
  maximumEntryUncompressedSizeBytes: 4 * 1024 * 1024,
  maximumTotalUncompressedSizeBytes: 12 * 1024 * 1024,
  maximumCompressionRatio: 200,
  maximumXmlDepth: 64,
} as const;

export interface ValidationHarness {
  readonly service: ValidateDocumentService;
  readonly repository: InMemoryImportResumeRepository;
  readonly sources: Map<string, Uint8Array>;
  readonly pageCounts: Map<string, number>;
  readonly pageCountFailures: Map<string, Parameters<typeof failed>[0]>;
  readonly logs: {
    readonly event: string;
    readonly metadata: Readonly<Record<string, unknown>>;
  }[];
}

export function createValidationHarness(): ValidationHarness {
  const sources = new Map<string, Uint8Array>();
  const pageCounts = new Map<string, number>();
  const pageCountFailures = new Map<string, Parameters<typeof failed>[0]>();
  const repository = new InMemoryImportResumeRepository();
  const sourceReader: ExtractionSourceReader = {
    readSource: async ({ sourceStorageKey, maximumBytes, abortSignal }) => {
      if (abortSignal?.aborted === true) {
        throw new DOMException("cancelled", "AbortError");
      }
      const source = sources.get(sourceStorageKey);
      if (source === undefined) throw new Error("source_unavailable");
      return new Uint8Array(
        source.byteLength > maximumBytes
          ? source.subarray(0, maximumBytes + 1)
          : source,
      );
    },
  };
  const pdf = new PdfJsPdfAdapter(sourceReader, {
    maximumFileSizeBytes: 10 * 1024 * 1024,
    maximumPageCount: 100,
  });
  const docxPageCounter: DocxRenderedPageCounter = {
    countRenderedPages: async (request: ExtractionRequest) => {
      const failure = pageCountFailures.get(request.sourceStorageKey);
      if (failure !== undefined) return failed(failure);
      return succeeded({
        renderedPageCount: pageCounts.get(request.sourceStorageKey) ?? 1,
      });
    },
  };
  const logs: ValidationHarness["logs"] = [];
  const logger: ValidateDocumentPrivacyLogger = {
    info: (event, metadata = {}) => logs.push({ event, metadata }),
    warn: (event, metadata = {}) => logs.push({ event, metadata }),
  };
  let requestSequence = 1;
  let clockSequence = 0;
  const service = new ValidateDocumentService({
    repository,
    transactionRunner: repository,
    sourceReader,
    pdfPageCounter: pdf,
    pdfTextExtractor: pdf,
    docxTextExtractor: new OoxmlDocxAdapter(sourceReader, docxLimits),
    docxPageCounter,
    languageDetector: new DeterministicLanguageDetector(),
    processingLimits: {
      maxUploadSizeBytes: 10 * 1024 * 1024,
      maxRenderedPageCount: 5,
    },
    requestIdGenerator: {
      nextRequestId: () =>
        `10000000-0000-4000-8000-${String(requestSequence++).padStart(12, "0")}`,
    },
    clock: {
      now: () => new Date(createdAt.getTime() + (clockSequence++ % 2) * 25),
    },
    logger,
  });
  return {
    service,
    repository,
    sources,
    pageCounts,
    pageCountFailures,
    logs,
  };
}

export function importedDocument(input: {
  readonly id: string;
  readonly source: Uint8Array;
  readonly format: "pdf" | "docx";
  readonly ownerId?: string;
  readonly contentType?: string;
  readonly sizeBytes?: number;
}): ImportedDocument {
  return {
    id: input.id,
    ownerUserId: input.ownerId ?? ownerUserId,
    visibleFilename: `synthetic.${input.format}`,
    contentType:
      input.contentType ??
      (input.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    fileExtension: input.format,
    sizeBytes: input.sizeBytes ?? input.source.byteLength,
    storageKey: `opaque-${input.id}`,
    uploadStatus: "uploaded",
    validationStatus: "not_started",
    processingStatus: "not_started",
    deletionStatus: "not_scheduled",
    createdAt,
    retentionExpiresAt,
  };
}

export function addDocument(
  harness: ValidationHarness,
  document: ImportedDocument,
  source: Uint8Array,
  renderedPageCount = 1,
): void {
  harness.repository.documents.set(document.id, document);
  harness.sources.set(document.storageKey!, source);
  harness.pageCounts.set(document.storageKey!, renderedPageCount);
}

export class InMemoryImportResumeRepository
  implements ImportResumeRepository, PersistenceTransactionRunner
{
  readonly documents = new Map<string, ImportedDocument>();
  draftSaveCount = 0;
  artifactCreateCount = 0;
  lifecycleSaveCount = 0;
  failNextLifecycleSave = false;
  failLifecycleSaveOnAttempt: number | undefined;
  private lifecycleSaveAttempt = 0;

  async transaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return await work(undefined as unknown as EntityManager);
  }

  async createImportAggregate(
    aggregate: ImportAggregate,
  ): Promise<ImportAggregate> {
    this.documents.set(aggregate.document.id, aggregate.document);
    this.artifactCreateCount += aggregate.artifacts.length;
    return aggregate;
  }

  async findImportByOwner(
    importId: string,
    userId: string,
  ): Promise<ImportAggregate | null> {
    const document = this.documents.get(importId);
    return document?.ownerUserId === userId
      ? { document, artifacts: [] }
      : null;
  }

  async saveImportLifecycle(
    document: ImportedDocument,
  ): Promise<ImportedDocument> {
    this.lifecycleSaveAttempt += 1;
    if (
      this.failNextLifecycleSave ||
      this.lifecycleSaveAttempt === this.failLifecycleSaveOnAttempt
    ) {
      this.failNextLifecycleSave = false;
      throw new Error("persistence_unavailable");
    }
    this.lifecycleSaveCount += 1;
    this.documents.set(document.id, document);
    return document;
  }

  async saveDraft(): Promise<never> {
    this.draftSaveCount += 1;
    throw new Error("draft creation is outside validation");
  }

  async findDraftByOwner(): Promise<null> {
    return null;
  }

  async findDraftByImportAndOwner(): Promise<null> {
    return null;
  }

  async findReviewDraftByImportAndOwner(): Promise<null> {
    return null;
  }

  async findReviewDraftByImportAndOwnerForUpdate(): Promise<null> {
    return null;
  }

  async findCorrectionByOwnerAndOperation(): Promise<null> {
    return null;
  }

  async saveReviewMutation(input: {
    readonly draft: ImportDraft;
    readonly correction: UserCorrection;
    readonly previousReviewRevision: number;
  }): Promise<ImportDraft> {
    return {
      ...input.draft,
      reviewRevision: input.previousReviewRevision + 1,
    };
  }

  async saveStructuredResume(): Promise<never> {
    throw new Error("structured resume creation is outside validation");
  }

  async findStructuredResumeByOwner(): Promise<null> {
    return null;
  }

  async scheduleDeletionJob(): Promise<never> {
    throw new Error("deletion is outside validation");
  }

  async findDeletionJobByOwner(): Promise<null> {
    return null;
  }
}

export const validateOwned = (
  harness: ValidationHarness,
  importedDocumentId: string,
  signal?: AbortSignal,
) =>
  harness.service.validate({
    ownerUserId,
    importedDocumentId,
    ...(signal === undefined ? {} : { abortSignal: signal }),
  });
