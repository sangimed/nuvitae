import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  type Provider,
} from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { randomUUID } from "node:crypto";
import { IMPORT_RESUME_PROCESSING_QUEUE } from "@nuvitae/contracts";
import {
  TypeOrmAIProviderRuntimeConnectionsRepository,
  TypeOrmImportLimitAttemptsRepository,
} from "@nuvitae/persistence";
import {
  LocalPrivateImportStorage,
  LocalProviderSessionStorage,
} from "@nuvitae/storage";
import { DataSource } from "typeorm";
import { createImportEventEmitter } from "../observability/import-events.js";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import { ImportResumeModule } from "../import-resume/import-resume.module.js";
import { StartImportQueue } from "../import-resume/start-import.queue.js";
import { ImportStatusQueue } from "../import-resume/import-status.queue.js";
import { parseImportProcessingLimitsEnv } from "../config/import-processing-limits.js";
import {
  ImportLimitService,
  TypeOrmImportLimitStore,
} from "../services/import-resume/import-limits.js";
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
} from "../import-resume/start-import.tokens.js";
import { readLocalPlayConfig } from "./local-play.config.js";
import { LocalPlayPrincipalMiddleware } from "./local-play-principal.middleware.js";
import { CodexOAuthLoginBoundary } from "../import-resume/codex-oauth-login-boundary.js";
import {
  API_PROVIDER_CONNECTION_ADAPTER,
  API_PROVIDER_CONNECTION_REPOSITORY,
  API_PROVIDER_CONNECTION_SERVICE,
  API_PROVIDER_SESSION_STORE,
} from "../import-resume/provider-connection.tokens.js";
import { ProviderConnectionController } from "../import-resume/provider-connection.controller.js";
import { CodexConnectionInitiationService } from "../import-resume/codex-connection-initiation.service.js";
import {
  ProviderConnectionService,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStore,
} from "../services/import-resume/provider-connections.js";
import type { AIProviderRuntimeConnectionsRepository } from "@nuvitae/persistence";

const localPlayProviders: Provider[] = [
  {
    provide: START_IMPORT_PROCESSING_LIMITS,
    useFactory: () => parseImportProcessingLimitsEnv(process.env),
  },
  {
    provide: API_PROVIDER_CONNECTION_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmAIProviderRuntimeConnectionsRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: API_PROVIDER_CONNECTION_ADAPTER,
    useClass: CodexOAuthLoginBoundary,
  },
  {
    provide: API_PROVIDER_SESSION_STORE,
    useFactory: async () => {
      const config = readLocalPlayConfig();
      return await LocalProviderSessionStorage.create({
        root: config.providerSessionRoot,
        encryptionSecret: config.providerSessionEncryptionSecret,
        maxSessionBytes: config.maxProviderSessionBytes,
      });
    },
  },
  {
    provide: CodexOAuthLoginBoundary,
    useExisting: API_PROVIDER_CONNECTION_ADAPTER,
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
  CodexConnectionInitiationService,
  {
    provide: START_IMPORT_PRIVATE_STORAGE,
    useFactory: async () => {
      const config = readLocalPlayConfig();
      return await LocalPrivateImportStorage.create({
        root: config.privateStorageRoot,
        signingSecret: config.privateStorageSigningSecret,
        maxSignedReferenceTtlSeconds: config.maxSignedReferenceTtlSeconds,
      });
    },
  },
  {
    provide: START_IMPORT_LIMIT_SERVICE,
    useFactory: (
      dataSource: DataSource,
      limits: ReturnType<typeof parseImportProcessingLimitsEnv>,
    ) =>
      new ImportLimitService(
        new TypeOrmImportLimitStore(
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
      write: (record) => {
        console.log(JSON.stringify(record));
      },
    }),
  },
  StartImportQueue,
  { provide: START_IMPORT_QUEUE_PUBLISHER, useExisting: StartImportQueue },
  ImportStatusQueue,
  { provide: IMPORT_STATUS_QUEUE_READER, useExisting: ImportStatusQueue },
];

@Module({
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
    ImportResumeModule.register({
      imports: [
        ApiPersistenceModule,
        BullModule.registerQueue({ name: IMPORT_RESUME_PROCESSING_QUEUE }),
      ],
      providers: localPlayProviders,
      controllers: [ProviderConnectionController],
    }),
  ],
})
export class LocalPlayRuntimeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LocalPlayPrincipalMiddleware)
      .exclude(
        { path: "health", method: RequestMethod.ALL },
        { path: "health/(.*)", method: RequestMethod.ALL },
        { path: "openapi", method: RequestMethod.ALL },
        { path: "openapi/(.*)", method: RequestMethod.ALL },
      )
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
