import { BullModule } from "@nestjs/bullmq";
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { IMPORT_RESUME_PROCESSING_QUEUE } from "@nuvitae/contracts";
import { TypeOrmImportLimitAttemptsRepository } from "@nuvitae/persistence/typeorm";
import {
  ImportLimitService,
  RepositoryBackedImportLimitStore,
} from "@nuvitae/import-application";
import { LocalPrivateImportStorage } from "@nuvitae/storage";
import { createImportEventEmitter } from "../observability/import-events.js";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import {
  PRODUCT_RUNTIME_CONFIG,
  type ProductRuntimeConfig,
  type ProductRuntimeModuleOptions,
} from "../runtime/product-runtime.config.js";
import { ImportResumeModule } from "./import-resume.module.js";
import { StartImportQueue } from "./adapters/bullmq/start-import.queue.js";
import { ImportStatusQueue } from "./adapters/bullmq/import-status.queue.js";
import { parseImportProcessingLimitsEnv } from "../config/import-processing-limits.js";
import {
  COMMUNITY_FUNNEL_EVENT_EMITTER,
  IMPORT_STATUS_QUEUE_READER,
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_LIMIT_SERVICE,
  START_IMPORT_PRIVATE_STORAGE,
  START_IMPORT_PRIVACY_LOGGER,
  START_IMPORT_PROCESSING_LIMITS,
  START_IMPORT_QUEUE_PUBLISHER,
  START_IMPORT_REQUEST_ID_GENERATOR,
} from "./ports/tokens.js";

const importResumeRuntimeProviders: Provider[] = [
  {
    provide: START_IMPORT_PROCESSING_LIMITS,
    useFactory: () => parseImportProcessingLimitsEnv(process.env),
  },
  {
    provide: START_IMPORT_PRIVATE_STORAGE,
    useFactory: async (config: ProductRuntimeConfig) =>
      await LocalPrivateImportStorage.create({
        root: config.privateStorageRoot,
        signingSecret: config.privateStorageSigningSecret,
        maxSignedReferenceTtlSeconds: config.maxSignedReferenceTtlSeconds,
      }),
    inject: [PRODUCT_RUNTIME_CONFIG],
  },
  {
    provide: START_IMPORT_LIMIT_SERVICE,
    useFactory: (
      dataSource: DataSource,
      limits: ReturnType<typeof parseImportProcessingLimitsEnv>,
    ) =>
      new ImportLimitService(
        new RepositoryBackedImportLimitStore(
          new TypeOrmImportLimitAttemptsRepository(dataSource),
        ),
        limits,
      ),
    inject: [DataSource, START_IMPORT_PROCESSING_LIMITS],
  },
  { provide: START_IMPORT_CLOCK, useValue: { now: () => new Date() } },
  {
    provide: START_IMPORT_ID_GENERATOR,
    useValue: { nextId: () => randomUUID() },
  },
  {
    provide: START_IMPORT_REQUEST_ID_GENERATOR,
    useValue: { nextRequestId: () => randomUUID() },
  },
  {
    provide: START_IMPORT_PRIVACY_LOGGER,
    useValue: createImportEventEmitter({
      write: (record) => console.log(JSON.stringify(record)),
    }),
  },
  {
    provide: COMMUNITY_FUNNEL_EVENT_EMITTER,
    useFactory: (config: ProductRuntimeConfig) =>
      createImportEventEmitter({
        write: (record) => {
          if (config.communityFunnelTelemetryEnabled) {
            console.log(JSON.stringify(record));
          }
        },
      }),
    inject: [PRODUCT_RUNTIME_CONFIG],
  },
  StartImportQueue,
  { provide: START_IMPORT_QUEUE_PUBLISHER, useExisting: StartImportQueue },
  ImportStatusQueue,
  { provide: IMPORT_STATUS_QUEUE_READER, useExisting: ImportStatusQueue },
];

/** Resume-import feature composition at the API infrastructure edge. */
@Module({})
export class ImportResumeRuntimeModule {
  static register(options: ProductRuntimeModuleOptions): DynamicModule {
    return {
      module: ImportResumeRuntimeModule,
      imports: [
        BullModule.forRootAsync({
          useFactory: () => ({
            connection: {
              host: process.env.QUEUE_HOST ?? "queue",
              port: Number(process.env.QUEUE_PORT ?? "6379"),
              password: process.env.QUEUE_PASSWORD || undefined,
            },
          }),
        }),
        BullModule.registerQueue({ name: IMPORT_RESUME_PROCESSING_QUEUE }),
        ImportResumeModule.register({
          imports: [
            ApiPersistenceModule,
            BullModule.registerQueue({ name: IMPORT_RESUME_PROCESSING_QUEUE }),
          ],
          providers: [options.configProvider, ...importResumeRuntimeProviders],
        }),
      ],
    };
  }
}
