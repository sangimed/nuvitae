import { Inject, Injectable } from "@nestjs/common";
import type { CodexConnectionInitiationResponse } from "@nuvitae/contracts";
import { ProviderConnectionService } from "../services/import-resume/provider-connections.js";
import { API_PROVIDER_CONNECTION_SERVICE } from "./provider-connection.tokens.js";

@Injectable()
export class CodexConnectionInitiationService {
  constructor(
    @Inject(API_PROVIDER_CONNECTION_SERVICE)
    private readonly providerConnections: ProviderConnectionService,
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
}
