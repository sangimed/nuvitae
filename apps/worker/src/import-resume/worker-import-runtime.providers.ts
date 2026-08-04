import { randomUUID } from "node:crypto";
import type { Provider } from "@nestjs/common";
import {
  DeterministicLanguageDetector,
  IsolatedParserRunner,
  LibreOfficeRenderedPageCounter,
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  type ExtractionSourceReader,
} from "@nuvitae/extraction";
import {
  ValidateDocumentService,
  createImportEventEmitter,
  type ImportProcessingLimits,
} from "@nuvitae/import-application";
import type { ResumeSemanticParserProvider } from "@nuvitae/import-application";
import type {
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { LocalPrivateImportStorage } from "@nuvitae/storage";
import {
  WORKER_IMPORT_EVENT_EMITTER,
  WORKER_IMPORT_EXTRACTION_USE_CASE,
  WORKER_IMPORT_VALIDATION_USE_CASE,
} from "./import-processing.processor.js";
import { SemanticImportProcessor } from "./semantic-import.processor.js";
import { parseWorkerImportProcessingLimits } from "./import-processing-limits.js";
import {
  WORKER_IMPORT_RESUME_REPOSITORY,
  WORKER_PERSISTENCE_TRANSACTION_RUNNER,
} from "../persistence/worker-persistence.module.js";

export const WORKER_IMPORT_PROCESSING_LIMITS = Symbol(
  "WORKER_IMPORT_PROCESSING_LIMITS",
);
export const WORKER_PRIVATE_IMPORT_STORAGE = Symbol(
  "WORKER_PRIVATE_IMPORT_STORAGE",
);
export const WORKER_PRIVATE_SOURCE_READER = Symbol(
  "WORKER_PRIVATE_SOURCE_READER",
);
export const WORKER_SEMANTIC_PARSER_PROVIDER = Symbol(
  "WORKER_SEMANTIC_PARSER_PROVIDER",
);

/**
 * Production semantic-provider registration boundary.
 *
 * Production mode never activates a semantic provider: the deterministic test
 * adapter is available only through explicit dependency injection for
 * automated/local integration testing and must not be selected here. Absence
 * of a production provider fails closed through the provider-neutral
 * `provider_unavailable` worker state.
 */
export function createProductionSemanticParserProvider():
  ResumeSemanticParserProvider | undefined {
  return undefined;
}

class PrivateStorageSourceReader implements ExtractionSourceReader {
  constructor(private readonly storage: LocalPrivateImportStorage) {}

  async readSource(input: {
    readonly sourceStorageKey: string;
    readonly maximumBytes: number;
    readonly abortSignal?: AbortSignal;
  }): Promise<Uint8Array> {
    if (input.abortSignal?.aborted === true) throw new Error("aborted");
    const bytes = await this.storage.readObject(input.sourceStorageKey);
    return bytes.byteLength > input.maximumBytes
      ? bytes.subarray(0, input.maximumBytes + 1)
      : bytes;
  }
}

const importEventEmitter = createImportEventEmitter({
  write: (record) => {
    console.log(JSON.stringify(record));
  },
});

const logger = importEventEmitter;

export const workerImportRuntimeProviders: Provider[] = [
  {
    provide: WORKER_IMPORT_EVENT_EMITTER,
    useValue: importEventEmitter,
  },
  {
    provide: WORKER_IMPORT_PROCESSING_LIMITS,
    useFactory: () => parseWorkerImportProcessingLimits(),
  },
  {
    provide: WORKER_PRIVATE_IMPORT_STORAGE,
    useFactory: async () =>
      await LocalPrivateImportStorage.create({
        root: requireEnv("NUVITAE_PRIVATE_STORAGE_ROOT"),
        signingSecret: requireEnv("NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET"),
        maxSignedReferenceTtlSeconds: Number(
          process.env
            .NUVITAE_PRIVATE_STORAGE_MAX_SIGNED_REFERENCE_TTL_SECONDS ?? "300",
        ),
      }),
  },
  {
    provide: WORKER_PRIVATE_SOURCE_READER,
    useFactory: (storage: LocalPrivateImportStorage) =>
      new PrivateStorageSourceReader(storage),
    inject: [WORKER_PRIVATE_IMPORT_STORAGE],
  },
  {
    provide: WORKER_IMPORT_VALIDATION_USE_CASE,
    useFactory: (
      repository: ImportResumeRepository,
      transactionRunner: PersistenceTransactionRunner,
      sourceReader: ExtractionSourceReader,
      limits: ImportProcessingLimits,
    ) => {
      const pdf = new PdfJsPdfAdapter(sourceReader, {
        maximumFileSizeBytes: limits.maxUploadSizeBytes + 1,
        maximumPageCount: limits.maxRenderedPageCount,
      });
      const docxLimits = docxValidationLimits(limits);
      const docx = new OoxmlDocxAdapter(sourceReader, docxLimits);
      const docxPages = new LibreOfficeRenderedPageCounter(
        sourceReader,
        new IsolatedParserRunner({
          foregroundTimeoutMilliseconds: limits.foregroundTimeoutSeconds * 1000,
          memoryLimitBytes: limits.parserMemoryLimitMiB * 1024 * 1024,
          memoryEnforcement: {
            kind: "linux_prlimit_address_space",
            executable: "/usr/bin/prlimit",
          },
        }),
        {
          temporaryRoot: process.env.PARSER_TMP_ROOT ?? "/tmp/nuvitae-parser",
          libreOfficeExecutable: "/usr/lib/libreoffice/program/oosplash",
          maximumDocxSizeBytes: limits.maxUploadSizeBytes + 1,
          maximumConvertedPdfSizeBytes: 20 * 1024 * 1024,
          maximumRenderedPageCount: limits.maxRenderedPageCount,
          docxValidationLimits: docxLimits,
        },
      );
      return new ValidateDocumentService({
        repository,
        transactionRunner,
        sourceReader,
        pdfPageCounter: pdf,
        pdfTextExtractor: pdf,
        docxTextExtractor: docx,
        docxPageCounter: docxPages,
        languageDetector: new DeterministicLanguageDetector(),
        processingLimits: limits,
        requestIdGenerator: { nextRequestId: () => randomUUID() },
        clock: { now: () => new Date() },
        logger,
      });
    },
    inject: [
      WORKER_IMPORT_RESUME_REPOSITORY,
      WORKER_PERSISTENCE_TRANSACTION_RUNNER,
      WORKER_PRIVATE_SOURCE_READER,
      WORKER_IMPORT_PROCESSING_LIMITS,
    ],
  },
  {
    provide: WORKER_SEMANTIC_PARSER_PROVIDER,
    useFactory: createProductionSemanticParserProvider,
  },
  {
    provide: WORKER_IMPORT_EXTRACTION_USE_CASE,
    useFactory: (
      repository: ImportResumeRepository,
      transactionRunner: PersistenceTransactionRunner,
      sourceReader: ExtractionSourceReader,
      limits: ImportProcessingLimits,
      provider: ResumeSemanticParserProvider | undefined,
    ) => {
      const pdf = new PdfJsPdfAdapter(sourceReader, {
        maximumFileSizeBytes: limits.maxUploadSizeBytes + 1,
        maximumPageCount: limits.maxRenderedPageCount,
      });
      const docx = new OoxmlDocxAdapter(
        sourceReader,
        docxValidationLimits(limits),
      );
      return new SemanticImportProcessor({
        repository,
        transactionRunner,
        sourceReader,
        pdfTextExtractor: pdf,
        docxTextExtractor: docx,
        provider,
        clock: { now: () => new Date() },
        logger,
      });
    },
    inject: [
      WORKER_IMPORT_RESUME_REPOSITORY,
      WORKER_PERSISTENCE_TRANSACTION_RUNNER,
      WORKER_PRIVATE_SOURCE_READER,
      WORKER_IMPORT_PROCESSING_LIMITS,
      WORKER_SEMANTIC_PARSER_PROVIDER,
    ],
  },
];

function docxValidationLimits(limits: ImportProcessingLimits) {
  return {
    maximumArchiveSizeBytes: limits.maxUploadSizeBytes + 1,
    maximumEntryCount: 200,
    maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
    maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
    maximumCompressionRatio: 200,
    maximumXmlDepth: 80,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value;
}
