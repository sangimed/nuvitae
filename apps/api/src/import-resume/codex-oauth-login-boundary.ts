import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ProviderConnectionError,
  type ProviderAdapterBrowserLoginHandoff,
  type ProviderAdapterConnectedResult,
  type ProviderAdapterInspection,
  type ProviderAdapterLoginResult,
  type ProviderAdapterQuotaResult,
  type ProviderRuntimeAdapterContext,
  type ProviderRuntimeConnectionAdapter,
} from "../services/import-resume/provider-connections.js";

const authorizationEndpoint = "https://auth.openai.com/oauth/authorize";
const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const callbackPort = "1455";
const callbackPath = "/auth/callback";
const callbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const pendingLoginTtlMs = 10 * 60 * 1000;
const maximumPendingLogins = 1_000;

interface PendingLogin {
  readonly ownerUserId: string;
  readonly connectionId: string;
  readonly state: string;
  readonly codeVerifier: string;
  readonly handoff: ProviderAdapterBrowserLoginHandoff;
  readonly loginStartedAt: Date;
  readonly expiresAt: number;
}

/**
 * T213 broker login boundary.
 *
 * This boundary is deliberately handoff-only. It owns PKCE/state material and
 * the bounded pending-login registry; callback completion, credential
 * persistence, and connection status remain T214/T215 work. No OAuth network
 * request is made while initiating the browser redirect.
 */
export class CodexOAuthLoginBoundary implements ProviderRuntimeConnectionAdapter {
  readonly providerKind = "codex";
  private readonly pending = new Map<string, PendingLogin>();

  async startLogin(
    context: ProviderRuntimeAdapterContext,
    _sessionReference: string | null,
  ): Promise<ProviderAdapterLoginResult> {
    this.removeExpiredLogins();
    const key = this.key(context);
    const existing = this.pending.get(key);
    if (existing !== undefined) {
      return {
        loginStartedAt: existing.loginStartedAt,
        safeMessage: null,
        browserHandoff: existing.handoff,
      };
    }

    const loginStartedAt = new Date();
    const state = base64Url(randomBytes(32));
    const codeVerifier = base64Url(randomBytes(32));
    const codeChallenge = base64Url(
      createHash("sha256").update(codeVerifier, "ascii").digest(),
    );
    const authorizationUrl = this.buildAuthorizationUrl(state, codeChallenge);
    const handoff: ProviderAdapterBrowserLoginHandoff = {
      loginReference: randomUUID(),
      authorizationUrl,
    };
    this.boundPendingCapacity();
    this.pending.set(key, {
      ownerUserId: context.ownerUserId,
      connectionId: context.connectionId,
      state,
      codeVerifier,
      handoff,
      loginStartedAt,
      expiresAt: loginStartedAt.getTime() + pendingLoginTtlMs,
    });
    return { loginStartedAt, safeMessage: null, browserHandoff: handoff };
  }

  async inspect(): Promise<ProviderAdapterInspection> {
    throw unsupportedUntilFutureState("inspect");
  }

  async completeLogin(): Promise<ProviderAdapterConnectedResult> {
    throw unsupportedUntilFutureState("complete_login");
  }

  async cancelLogin(): Promise<ProviderAdapterLoginResult> {
    throw unsupportedUntilFutureState("cancel_login");
  }

  async reconnect(): Promise<ProviderAdapterConnectedResult> {
    throw unsupportedUntilFutureState("reconnect");
  }

  async disconnect(): Promise<void> {
    throw unsupportedUntilFutureState("disconnect");
  }

  async revoke(): Promise<void> {
    throw unsupportedUntilFutureState("revoke");
  }

  async deleteLocalState(): Promise<void> {
    throw unsupportedUntilFutureState("delete_local_state");
  }

  async capabilities(): Promise<never> {
    throw unsupportedUntilFutureState("capabilities");
  }

  async quotaState(): Promise<ProviderAdapterQuotaResult> {
    throw unsupportedUntilFutureState("quota_state");
  }

  private buildAuthorizationUrl(state: string, codeChallenge: string): string {
    const callbackHost =
      process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST ?? "localhost";
    if (!callbackHosts.has(callbackHost)) {
      throw new ProviderConnectionError("provider_adapter_failed");
    }
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "redirect_uri",
      `http://${callbackHost}:${callbackPort}${callbackPath}`,
    );
    url.searchParams.set("scope", "openid profile email offline_access");
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("id_token_add_organizations", "true");
    url.searchParams.set("codex_cli_simplified_flow", "true");
    url.searchParams.set("originator", "openclaw");
    return url.toString();
  }

  private key(context: ProviderRuntimeAdapterContext): string {
    return `${context.ownerUserId}:${context.connectionId}`;
  }

  private removeExpiredLogins(): void {
    const now = Date.now();
    for (const [key, login] of this.pending) {
      if (login.expiresAt <= now) this.pending.delete(key);
    }
  }

  private boundPendingCapacity(): void {
    while (this.pending.size >= maximumPendingLogins) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) return;
      this.pending.delete(oldest);
    }
  }
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function unsupportedUntilFutureState(
  operation: string,
): ProviderConnectionError {
  void operation;
  return new ProviderConnectionError("provider_adapter_failed");
}
