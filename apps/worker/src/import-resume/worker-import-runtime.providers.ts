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
  ImportLimitService,
  TypeOrmImportLimitStore,
  CodexDirectProviderAdapter,
  type CodexModelIdentifier,
  emitImportTiming,
  type ProviderSessionStore,
  type ResumeSemanticParserProvider,
  ValidateDocumentService,
  createImportEventEmitter,
  type ImportProcessingCapacityPort,
  type ImportProcessingLimits,
  type ImportEventEmitter,
} from "@nuvitae/import-application";
import type {
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import type { AIProviderRuntimeConnectionsRepository } from "@nuvitae/import-application";
import {
  TypeOrmAIProviderRuntimeConnectionsRepository,
  TypeOrmImportLimitAttemptsRepository,
} from "@nuvitae/persistence";
import { DataSource } from "typeorm";
import {
  LocalPrivateImportStorage,
  LocalProviderSessionStorage,
} from "@nuvitae/storage";
import {
  WORKER_IMPORT_EVENT_EMITTER,
  WORKER_IMPORT_CAPACITY_PORT,
  WORKER_IMPORT_CLOCK,
  WORKER_IMPORT_EXTRACTION_USE_CASE,
  WORKER_IMPORT_VALIDATION_USE_CASE,
} from "./import-processing.processor.js";
import { SemanticImportProcessor } from "./semantic-import.processor.js";
import { parseWorkerImportProcessingLimits } from "./import-processing-limits.js";
import {
  WORKER_IMPORT_RESUME_REPOSITORY,
  WORKER_PERSISTENCE_TRANSACTION_RUNNER,
} from "../persistence/worker-persistence.module.js";
import {
  readWorkerPrivateRuntimeConfig,
  type WorkerPrivateRuntimeConfig,
} from "./private-runtime.config.js";

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
export const WORKER_PROVIDER_CONNECTION_REPOSITORY = Symbol(
  "WORKER_PROVIDER_CONNECTION_REPOSITORY",
);
export const WORKER_PROVIDER_SESSION_STORE = Symbol(
  "WORKER_PROVIDER_SESSION_STORE",
);
export const WORKER_PRIVATE_RUNTIME_CONFIG = Symbol(
  "WORKER_PRIVATE_RUNTIME_CONFIG",
);

/**
 * Production semantic-provider registration boundary.
 *
 * Production provider construction is dependency-only. It does not inspect a
 * user or contact Codex at startup; owner/session resolution happens on each
 * semantic invocation.
 */
export function createProductionSemanticParserProvider(
  repository: AIProviderRuntimeConnectionsRepository,
  sessionStore: ProviderSessionStore,
  logger?: ImportEventEmitter,
  model?: CodexModelIdentifier,
): ResumeSemanticParserProvider {
  return new CodexDirectProviderAdapter({
    repository,
    sessionStore,
    ...(model === undefined ? {} : { model }),
    ...(logger === undefined
      ? {}
      : {
          onTransportTiming: (timing) =>
            (() => {
              logger.emit("semantic.provider_transport_timing", timing);
              const phase = providerTimingPhase(timing.phase);
              if (phase === undefined) return;
              emitImportTiming(logger, {
                importId: timing.importId,
                correlationId: timing.correlationId,
                phase,
                source: "worker",
                at: new Date(timing.timestampMs),
                durationMs: timing.elapsedMs,
              });
            })(),
          onTransportProtocolShape: (shape) =>
            logger.emit("semantic.provider_protocol_shape", shape),
          onTransportSseError: (diagnostic) =>
            logger.emit("semantic.provider_sse_error", diagnostic),
          onResponseLimitDiagnostic: (diagnostic) =>
            logger.emit("semantic.provider_response_limit", diagnostic),
          onV2EnvelopeDiagnostic: (diagnostic) =>
            logger.emit(
              "semantic.provider_v2_envelope_diagnostics",
              diagnostic,
            ),
          onV2FieldDiagnostic: (diagnostic) =>
            logger.emit("semantic.provider_v2_field_diagnostics", diagnostic),
          onCanonicalizationTiming: (timing) =>
            emitImportTiming(logger, {
              importId: timing.importId,
              correlationId: timing.correlationId,
              phase: "canonicalization_completed",
              source: "worker",
              at: new Date(timing.timestampMs),
              durationMs: timing.durationMs,
            }),
        }),
  });
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
    provide: WORKER_PRIVATE_RUNTIME_CONFIG,
    useFactory: (): WorkerPrivateRuntimeConfig =>
      readWorkerPrivateRuntimeConfig(),
  },
  {
    provide: WORKER_IMPORT_CLOCK,
    useValue: { now: () => new Date() },
  },
  {
    provide: WORKER_IMPORT_EVENT_EMITTER,
    useValue: importEventEmitter,
  },
  {
    provide: WORKER_IMPORT_PROCESSING_LIMITS,
    useFactory: () => parseWorkerImportProcessingLimits(),
  },
  {
    provide: WORKER_IMPORT_CAPACITY_PORT,
    useFactory: (
      dataSource: DataSource,
      limits: ImportProcessingLimits,
    ): ImportProcessingCapacityPort => {
      const service = new ImportLimitService(
        new TypeOrmImportLimitStore(
          new TypeOrmImportLimitAttemptsRepository(dataSource),
        ),
        limits,
      );
      return {
        admitToProcessing: (ownerUserId, importId, now) =>
          service.admitToProcessing(ownerUserId, importId, now),
        releaseCapacity: (ownerUserId, importId, now) =>
          service.releaseCapacityForImport(ownerUserId, importId, now),
      };
    },
    inject: [DataSource, WORKER_IMPORT_PROCESSING_LIMITS],
  },
  {
    provide: WORKER_PRIVATE_IMPORT_STORAGE,
    useFactory: async (config: WorkerPrivateRuntimeConfig) =>
      await LocalPrivateImportStorage.create({
        root: config.privateStorageRoot,
        signingSecret: config.privateStorageSigningSecret,
        maxSignedReferenceTtlSeconds: config.maxSignedReferenceTtlSeconds,
      }),
    inject: [WORKER_PRIVATE_RUNTIME_CONFIG],
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
      capacity: ImportProcessingCapacityPort,
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
        capacity,
      });
    },
    inject: [
      WORKER_IMPORT_RESUME_REPOSITORY,
      WORKER_PERSISTENCE_TRANSACTION_RUNNER,
      WORKER_PRIVATE_SOURCE_READER,
      WORKER_IMPORT_PROCESSING_LIMITS,
      WORKER_IMPORT_CAPACITY_PORT,
    ],
  },
  {
    provide: WORKER_SEMANTIC_PARSER_PROVIDER,
    useFactory: createProductionSemanticParserProvider,
    inject: [
      WORKER_PROVIDER_CONNECTION_REPOSITORY,
      WORKER_PROVIDER_SESSION_STORE,
      WORKER_IMPORT_EVENT_EMITTER,
    ],
  },
  {
    provide: WORKER_PROVIDER_CONNECTION_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmAIProviderRuntimeConnectionsRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: WORKER_PROVIDER_SESSION_STORE,
    useFactory: async (config: WorkerPrivateRuntimeConfig) =>
      await LocalProviderSessionStorage.create({
        root: config.providerSessionRoot,
        encryptionSecret: config.providerSessionEncryptionSecret,
        maxSessionBytes: config.maxProviderSessionBytes,
      }),
    inject: [WORKER_PRIVATE_RUNTIME_CONFIG],
  },
  {
    provide: WORKER_IMPORT_EXTRACTION_USE_CASE,
    useFactory: (
      repository: ImportResumeRepository,
      transactionRunner: PersistenceTransactionRunner,
      sourceReader: ExtractionSourceReader,
      limits: ImportProcessingLimits,
      provider: ResumeSemanticParserProvider | undefined,
      capacity: ImportProcessingCapacityPort,
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
        capacity,
      });
    },
    inject: [
      WORKER_IMPORT_RESUME_REPOSITORY,
      WORKER_PERSISTENCE_TRANSACTION_RUNNER,
      WORKER_PRIVATE_SOURCE_READER,
      WORKER_IMPORT_PROCESSING_LIMITS,
      WORKER_SEMANTIC_PARSER_PROVIDER,
      WORKER_IMPORT_CAPACITY_PORT,
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

function providerTimingPhase(
  phase:
    | "request_started"
    | "response_headers"
    | "first_byte"
    | "first_semantic_output"
    | "sse_started"
    | "completion_event"
    | "response_eof"
    | "request_timeout"
    | "first_output_timeout"
    | "stream_inactivity_timeout"
    | "generation_timeout"
    | "cancelled"
    | "completed"
    | "transport_error",
):
  | "provider_headers"
  | "provider_first_output"
  | "provider_completed"
  | undefined {
  switch (phase) {
    case "response_headers":
      return "provider_headers";
    case "first_semantic_output":
      return "provider_first_output";
    case "completed":
      return "provider_completed";
    default:
      return undefined;
  }
}
