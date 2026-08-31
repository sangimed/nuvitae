import { Module, type DynamicModule, type Provider } from "@nestjs/common";
import { DataSource } from "typeorm";
import { TypeOrmAIProviderRuntimeConnectionsRepository } from "@nuvitae/persistence/typeorm";
import {
  ProviderConnectionService,
  type AIProviderRuntimeConnectionsRepository,
  type ProviderRuntimeConnectionAdapter,
  type ProviderSessionStore,
} from "@nuvitae/import-application";
import { CodexContextualResumeEditProvider } from "@nuvitae/import-application/codex";
import { LocalProviderSessionStorage } from "@nuvitae/storage";
import { ApiPersistenceModule } from "../persistence/api-persistence.module.js";
import {
  PRODUCT_RUNTIME_CONFIG,
  type ProductRuntimeConfig,
  type ProductRuntimeModuleOptions,
} from "../runtime/product-runtime.config.js";
import { CodexOAuthLoginBoundary } from "./adapters/codex/codex-oauth-login-boundary.js";
import { ProviderConnectionsModule } from "./provider-connections.module.js";
import {
  API_PROVIDER_CONNECTION_ADAPTER,
  API_PROVIDER_CONNECTION_REPOSITORY,
  API_PROVIDER_CONNECTION_SERVICE,
  API_PROVIDER_SESSION_STORE,
  API_CONTEXTUAL_RESUME_EDIT_PROVIDER,
} from "./ports/tokens.js";

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
  {
    provide: API_CONTEXTUAL_RESUME_EDIT_PROVIDER,
    useFactory: (
      repository: AIProviderRuntimeConnectionsRepository,
      sessionStore: ProviderSessionStore,
    ) => new CodexContextualResumeEditProvider({ repository, sessionStore }),
    inject: [API_PROVIDER_CONNECTION_REPOSITORY, API_PROVIDER_SESSION_STORE],
  },
];

/** Provider-connection feature composition at the API infrastructure edge. */
@Module({})
export class ProviderConnectionsRuntimeModule {
  static register(options: ProductRuntimeModuleOptions): DynamicModule {
    return {
      module: ProviderConnectionsRuntimeModule,
      imports: [
        ProviderConnectionsModule.register({
          imports: [ApiPersistenceModule],
          providers: [options.configProvider, ...providerConnectionProviders],
          exports: [API_CONTEXTUAL_RESUME_EDIT_PROVIDER],
        }),
      ],
      global: true,
      exports: [ProviderConnectionsModule],
    };
  }
}
