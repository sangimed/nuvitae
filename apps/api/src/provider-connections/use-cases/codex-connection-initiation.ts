import { Inject, Injectable } from "@nestjs/common";
import type { CodexConnectionInitiationResponse } from "@nuvitae/contracts";
import { ProviderConnectionService } from "@nuvitae/import-application";
import { API_PROVIDER_CONNECTION_SERVICE } from "../ports/tokens.js";

@Injectable()
export class CodexConnectionInitiationService {
  private readonly activeCompletions = new Set<string>();

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
    const response = {
      version: "2026-08-08",
      status: "login_pending",
      loginReference: result.browserHandoff.loginReference,
      authorizationUrl: result.browserHandoff.authorizationUrl,
      userCode: result.browserHandoff.userCode,
    } as const;
    this.completeInBackground(
      ownerUserId,
      result.status.connectionId,
      result.browserHandoff.loginReference,
    );
    return response;
  }

  async status(ownerUserId: string) {
    return this.providerConnections.statusForProvider(ownerUserId, "codex");
  }

  async cancel(ownerUserId: string) {
    return this.providerConnections.cancelLoginForProvider(
      ownerUserId,
      "codex",
    );
  }

  async disconnect(ownerUserId: string) {
    return this.providerConnections.disconnectForProvider(ownerUserId, "codex");
  }

  private completeInBackground(
    ownerUserId: string,
    connectionId: string,
    deviceLoginReference: string,
  ) {
    if (this.activeCompletions.has(deviceLoginReference)) return;
    this.activeCompletions.add(deviceLoginReference);
    void this.providerConnections
      .completeLogin(ownerUserId, connectionId, { deviceLoginReference })
      .catch(() => undefined)
      .finally(() => this.activeCompletions.delete(deviceLoginReference));
  }
}
