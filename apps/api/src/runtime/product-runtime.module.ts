import { BullModule } from "@nestjs/bullmq";
import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { IMPORT_RESUME_PROCESSING_QUEUE } from "@nuvitae/contracts";
import {
  TypeOrmAIProviderRuntimeConnectionsRepository,
  TypeOrmImportLimitAttemptsRepository,
} from "@nuvitae/persistence/typeorm";
import {
  ImportLimitService,
  ProviderConnectionService,
  RepositoryBackedImportLimitStore,
  type AIProviderRuntimeConnectionsRepository,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStore,
} from "@nuvitae/import-application";
import {
  LocalPrivateImportStorage,
  LocalProviderSessionStorage,
} from "@nuvitae/storage";
import { createImportEventEmitter } from "../observability/import-events.js";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import { ProviderConnectionsModule } from "../provider-connections/provider-connections.module.js";
import { CodexOAuthLoginBoundary } from "../provider-connections/adapters/codex/codex-oauth-login-boundary.js";
import {
  API_PROVIDER_CONNECTION_ADAPTER,
  API_PROVIDER_CONNECTION_REPOSITORY,
  API_PROVIDER_CONNECTION_SERVICE,
  API_PROVIDER_SESSION_STORE,
} from "../provider-connections/ports/tokens.js";
import { ImportResumeModule } from "../import-resume/import-resume.module.js";
import { StartImportQueue } from "../import-resume/adapters/bullmq/start-import.queue.js";
import { ImportStatusQueue } from "../import-resume/adapters/bullmq/import-status.queue.js";
import { parseImportProcessingLimitsEnv } from "../config/import-processing-limits.js";
import {
  IMPORT_STATUS_QUEUE_READER,
  START_IMPORT_CLOCK,
  START_IMPORT_ID_GENERATOR,
  START_IMPORT_LIMIT_SERVICE,
  START_IMPORT_PRIVATE_STORAGE,
  START_IMPORT_PRIVACY_LOGGER,
  START_IMPORT_PROCESSING_LIMITS,
  START_IMPORT_QUEUE_PUBLISHER,
  START_IMPORT_REQUEST_ID_GENERATOR,
} from "../import-resume/ports/tokens.js";

export interface ProductRuntimeConfig {
  readonly privateStorageRoot: string;
  readonly privateStorageSigningSecret: string;
  readonly maxSignedReferenceTtlSeconds: number;
  readonly providerSessionRoot: string;
  readonly providerSessionEncryptionSecret: string;
  readonly maxProviderSessionBytes: number;
}

export const PRODUCT_RUNTIME_CONFIG = Symbol("PRODUCT_RUNTIME_CONFIG");

export interface ProductRuntimeModuleOptions {
  readonly configProvider: Provider;
}

const providerConnectionProviders: Provider[] = [
  {
    provide: API_PROVIDER_CONNECTION_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmAIProviderRuntimeConnectionsRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: API_PROVIDER_CONNECTION_ADAPTER,
    useExisting: CodexOAuthLoginBoundary,
  },
  {
    provide: API_PROVIDER_SESSION_STORE,
    useFactory: async (config: ProductRuntimeConfig) =>
      await LocalProviderSessionStorage.create({
        root: config.providerSessionRoot,
        encryptionSecret: config.providerSessionEncryptionSecret,
        maxSessionBytes: config.maxProviderSessionBytes,
      }),
    inject: [PRODUCT_RUNTIME_CONFIG],
  },
  {
    provide: API_PROVIDER_CONNECTION_SERVICE,
    useFactory: (
      repository: AIProviderRuntimeConnectionsRepository,
      adapter: ProviderRuntimeConnectionAdapter,
      sessionStore: ProviderSessionStore,
    ) => new ProviderConnectionService({ repository, adapter, sessionStore }),
    inject: [
      API_PROVIDER_CONNECTION_REPOSITORY,
      API_PROVIDER_CONNECTION_ADAPTER,
      API_PROVIDER_SESSION_STORE,
    ],
  },
];

const productRuntimeProviders: Provider[] = [
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
  StartImportQueue,
  { provide: START_IMPORT_QUEUE_PUBLISHER, useExisting: StartImportQueue },
  ImportStatusQueue,
  { provide: IMPORT_STATUS_QUEUE_READER, useExisting: ImportStatusQueue },
];

/** Shared product wiring, deliberately independent from either auth adapter. */
@Module({})
export class ProductRuntimeModule {
  static register(options: ProductRuntimeModuleOptions): DynamicModule {
    return {
      module: ProductRuntimeModule,
      imports: [
        ApiPersistenceModule,
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
        ProviderConnectionsModule.register({
          imports: [ApiPersistenceModule],
          providers: [options.configProvider, ...providerConnectionProviders],
        }),
        ImportResumeModule.register({
          imports: [
            ApiPersistenceModule,
            BullModule.registerQueue({ name: IMPORT_RESUME_PROCESSING_QUEUE }),
          ],
          providers: [options.configProvider, ...productRuntimeProviders],
        }),
      ],
    };
  }
}
