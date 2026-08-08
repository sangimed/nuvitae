import { Inject, Injectable } from "@nestjs/common";
import type { CodexConnectionInitiationResponse } from "@nuvitae/contracts";
import {
  ProviderConnectionService,
  type ProviderOAuthCallback,
} from "../services/import-resume/provider-connections.js";
import { CodexOAuthLoginBoundary } from "./codex-oauth-login-boundary.js";
import { API_PROVIDER_CONNECTION_SERVICE } from "./provider-connection.tokens.js";

@Injectable()
export class CodexConnectionInitiationService {
  constructor(
    @Inject(API_PROVIDER_CONNECTION_SERVICE)
    private readonly providerConnections: ProviderConnectionService,
    private readonly oauthBoundary: CodexOAuthLoginBoundary,
  ) {}

  async begin(ownerUserId: string): Promise<CodexConnectionInitiationResponse> {
    const result = await this.providerConnections.beginBrowserLogin(
      ownerUserId,
      {
        displayName: "Codex",
      },
    );
    return {
      version: "2026-08-08",
      status: "login_pending",
      loginReference: result.browserHandoff.loginReference,
      authorizationUrl: result.browserHandoff.authorizationUrl,
    };
  }

  async completeCallback(ownerUserId: string, callback: ProviderOAuthCallback) {
    const connectionId = this.oauthBoundary.resolvePendingLogin(
      ownerUserId,
      callback.state,
    );
    return this.providerConnections.completeLogin(
      ownerUserId,
      connectionId,
      callback,
    );
  }

  async status(ownerUserId: string) {
    return this.providerConnections.statusForProvider(ownerUserId, "codex");
  }

  async disconnect(ownerUserId: string) {
    return this.providerConnections.disconnectForProvider(ownerUserId, "codex");
  }
}
