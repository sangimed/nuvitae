import {
  DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { VerifiedPrincipalGuard } from "../auth/verified-principal.guard.js";
import { CodexOAuthLoginBoundary } from "./adapters/codex/codex-oauth-login-boundary.js";
import { ProviderConnectionController } from "./transport/http/provider-connection.controller.js";
import { CodexConnectionInitiationService } from "./use-cases/codex-connection-initiation.js";

export interface ProviderConnectionsModuleOptions {
  readonly imports?: ModuleMetadata["imports"];
  readonly providers: readonly Provider[];
  readonly exports?: readonly (string | symbol)[];
}

@Module({})
export class ProviderConnectionsModule {
  static register(options: ProviderConnectionsModuleOptions): DynamicModule {
    return {
      module: ProviderConnectionsModule,
      imports: options.imports === undefined ? [] : [...options.imports],
      controllers: [ProviderConnectionController],
      providers: [
        CodexConnectionInitiationService,
        CodexOAuthLoginBoundary,
        VerifiedPrincipalGuard,
        ...options.providers,
      ],
      exports: [CodexConnectionInitiationService, ...(options.exports ?? [])],
    };
  }
}
