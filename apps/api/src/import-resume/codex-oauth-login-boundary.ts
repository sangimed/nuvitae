import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  parseCodexSessionMaterial,
  type CodexSessionMaterial,
} from "@nuvitae/import-application/codex";
import {
  ProviderConnectionError,
  type ProviderAdapterBrowserLoginHandoff,
  type ProviderAdapterConnectedResult,
  type ProviderAdapterInspection,
  type ProviderAdapterLoginResult,
  type ProviderAdapterQuotaResult,
  type ProviderOAuthCallback,
  type ProviderRuntimeAdapterContext,
  type ProviderRuntimeConnectionAdapter,
} from "../services/import-resume/provider-connections.js";

const authorizationEndpoint = "https://auth.openai.com/oauth/authorize";
const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const defaultCallbackPort = "1455";
// The official/qualified Codex browser contract owns this exact loopback
// callback path. The application exposes an alias for its provider-neutral
// route, but the authorization request must remain on the qualified contract.
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

export interface CodexOAuthCredentialMaterial {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accountId: string | null;
  readonly expiresAt: Date | null;
}

export interface CodexOAuthTokenExchange {
  exchange(input: {
    readonly authorizationCode: string;
    readonly codeVerifier: string;
  }): Promise<CodexOAuthCredentialMaterial>;
}

const codexCapabilities = Object.freeze({
  supportedDocumentFormats: ["pdf", "docx", "plain_text"] as const,
  supportedDocumentLanguages: [
    "english",
    "french",
    "bilingual_french_english",
  ] as const,
  supportsNonInteractiveParsing: true,
  supportsStructuredJson: true,
  supportsCanonicalFlattenedEvidence: true,
  acceptsNormalizedTranscript: true,
  acceptsRawStoragePaths: false,
  exposesCredentialsToDomain: false,
  predictsPhysicalCoordinates: false,
  maxRequestJsonBytes: 256_000,
  maxResponseJsonBytes: 256_000,
  maxTimeoutMs: 30_000,
});

/**
 * Codex broker boundary. It owns PKCE/state material, authorization-code
 * exchange, encrypted session persistence, and privacy-safe inspection. The
 * application service receives only an opaque session reference and
 * provider-neutral metadata.
 */
export class CodexOAuthLoginBoundary implements ProviderRuntimeConnectionAdapter {
  readonly providerKind = "codex";
  private readonly pending = new Map<string, PendingLogin>();

  constructor(
    private readonly options: {
      readonly exchange?: CodexOAuthTokenExchange;
      readonly now?: () => Date;
    } = {},
  ) {}

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

    const loginStartedAt = this.clock();
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

  async inspect(
    context: ProviderRuntimeAdapterContext,
    sessionReference: string | null,
  ): Promise<ProviderAdapterInspection> {
    const checkedAt = this.clock();
    if (sessionReference === null) {
      return {
        connectionState: "disconnected",
        authenticationState: "unauthenticated",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: null,
      };
    }
    let payload: CodexSessionPayload;
    try {
      payload = parseCodexSessionMaterial(
        await context.sessionStore.readSession({
          ownerUserId: context.ownerUserId,
          connectionId: context.connectionId,
          sessionReference,
        }),
      );
    } catch {
      return {
        connectionState: "authentication_revoked",
        authenticationState: "revoked",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: "Your Codex connection needs attention.",
      };
    }
    if (
      payload.expiresAt !== null &&
      payload.expiresAt.getTime() <= checkedAt.getTime()
    ) {
      return {
        connectionState: "authentication_expired",
        authenticationState: "expired",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: "Your Codex connection has expired.",
      };
    }
    return {
      connectionState: "connected",
      authenticationState: "authenticated",
      availabilityState: "available",
      checkedAt,
      safeMessage: null,
    };
  }

  async completeLogin(
    context: ProviderRuntimeAdapterContext,
    _sessionReference: string | null,
    callback?: ProviderOAuthCallback,
  ): Promise<ProviderAdapterConnectedResult> {
    if (callback === undefined) {
      throw new ProviderConnectionError(
        "provider_connection_login_invalid_state",
      );
    }
    const pending = this.consumePending(context, callback.state);
    if (callback.providerError !== undefined) {
      throw new ProviderConnectionError("provider_connection_login_cancelled");
    }
    if (callback.authorizationCode === undefined) {
      throw new ProviderConnectionError(
        "provider_connection_login_invalid_state",
      );
    }
    const exchange =
      this.options.exchange ?? new OpenAiCodexOAuthTokenExchange();
    let credentials: CodexOAuthCredentialMaterial;
    try {
      credentials = await exchange.exchange({
        authorizationCode: callback.authorizationCode,
        codeVerifier: pending.codeVerifier,
      });
    } catch (error) {
      if (error instanceof ProviderConnectionError) throw error;
      throw new ProviderConnectionError("provider_adapter_failed");
    }
    const sessionReference = randomBytes(32).toString("hex");
    const payload = new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        accessToken: credentials.accessToken,
        refreshToken: credentials.refreshToken,
        accountId: credentials.accountId,
        expiresAt: credentials.expiresAt?.toISOString() ?? null,
      }),
    );
    try {
      await context.sessionStore.writeSession({
        ownerUserId: context.ownerUserId,
        connectionId: context.connectionId,
        sessionReference,
        payload,
      });
    } catch {
      throw new ProviderConnectionError("provider_session_storage_unavailable");
    }
    const connectedAt = this.clock();
    return {
      connectedAt,
      expiresAt: credentials.expiresAt,
      sessionReference,
      capabilities: codexCapabilities,
    };
  }

  async cancelLogin(
    context: ProviderRuntimeAdapterContext,
  ): Promise<ProviderAdapterLoginResult> {
    this.pending.delete(this.key(context));
    return {
      loginStartedAt: this.clock(),
      safeMessage: null,
    };
  }

  async reconnect(): Promise<ProviderAdapterConnectedResult> {
    // Reconnect is intentionally initiated through startLogin so the
    // application reuses T213's browser handoff and T214's callback. A direct
    // adapter reconnect cannot prove a replacement session without a browser
    // authorization result.
    throw new ProviderConnectionError("provider_connection_state_conflict");
  }

  async disconnect(): Promise<void> {
    // Local encrypted session deletion is owned by ProviderConnectionService.
    // No supported remote revocation endpoint is assumed by T245/T215.
    return;
  }

  async revoke(): Promise<void> {
    // Remote provider-side revocation is intentionally out of scope. The
    // application records the provider-neutral revoked state and deletes local
    // encrypted material before calling this boundary.
    return;
  }

  async deleteLocalState(): Promise<void> {
    // The provider session store is the local state boundary and is deleted by
    // the application service with owner/connection/reference scoping.
    return;
  }

  async capabilities(): Promise<never> {
    throw unsupportedUntilFutureState("capabilities");
  }

  async quotaState(): Promise<ProviderAdapterQuotaResult> {
    throw unsupportedUntilFutureState("quota_state");
  }

  /**
   * Resolves a cross-site callback to its initiating owner and connection.
   * The callback must never take an owner identity from browser input or rely
   * on the ordinary Community session cookie being present.
   */
  resolvePendingLogin(state: string): {
    readonly ownerUserId: string;
    readonly connectionId: string;
  } {
    const pending = [...this.pending.values()].find(
      (candidate) => candidate.state === state,
    );
    if (pending === undefined) {
      throw new ProviderConnectionError(
        "provider_connection_login_invalid_state",
      );
    }
    if (pending.expiresAt <= this.clock().getTime()) {
      this.pending.delete(`${pending.ownerUserId}:${pending.connectionId}`);
      throw new ProviderConnectionError("provider_connection_login_expired");
    }
    return {
      ownerUserId: pending.ownerUserId,
      connectionId: pending.connectionId,
    };
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
      `http://${callbackHost}:${callbackPort()}${callbackPath}`,
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

  private consumePending(
    context: ProviderRuntimeAdapterContext,
    state: string,
  ): PendingLogin {
    const key = this.key(context);
    const pending = this.pending.get(key);
    if (pending === undefined || pending.state !== state) {
      throw new ProviderConnectionError(
        "provider_connection_login_invalid_state",
      );
    }
    this.pending.delete(key);
    if (pending.expiresAt <= this.clock().getTime()) {
      throw new ProviderConnectionError("provider_connection_login_expired");
    }
    return pending;
  }

  private clock(): Date {
    return this.options.now?.() ?? new Date();
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

type CodexSessionPayload = CodexSessionMaterial;

class OpenAiCodexOAuthTokenExchange implements CodexOAuthTokenExchange {
  async exchange(input: {
    readonly authorizationCode: string;
    readonly codeVerifier: string;
  }): Promise<CodexOAuthCredentialMaterial> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: input.authorizationCode,
          code_verifier: input.codeVerifier,
          redirect_uri: redirectUri(),
        }),
        signal: controller.signal,
        redirect: "error",
      });
      const body = await response.text();
      if (!response.ok || body.length > 65_536) {
        throw new ProviderConnectionError("provider_adapter_failed");
      }
      const parsed: unknown = JSON.parse(body);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { access_token?: unknown }).access_token !==
          "string" ||
        typeof (parsed as { refresh_token?: unknown }).refresh_token !==
          "string"
      ) {
        throw new ProviderConnectionError("provider_adapter_failed");
      }
      const expiresIn = (parsed as { expires_in?: unknown }).expires_in;
      return {
        accessToken: (parsed as { access_token: string }).access_token,
        refreshToken: (parsed as { refresh_token: string }).refresh_token,
        accountId:
          typeof (parsed as { account_id?: unknown }).account_id === "string"
            ? (parsed as { account_id: string }).account_id
            : null,
        expiresAt:
          typeof expiresIn === "number" && Number.isFinite(expiresIn)
            ? new Date(Date.now() + Math.max(0, expiresIn) * 1000)
            : null,
      };
    } catch (error) {
      if (error instanceof ProviderConnectionError) throw error;
      throw new ProviderConnectionError("provider_adapter_failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function redirectUri(): string {
  const host = process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST ?? "localhost";
  return `http://${host}:${callbackPort()}${callbackPath}`;
}

function callbackPort(): string {
  const configured = process.env.NUVITAE_CODEX_OAUTH_CALLBACK_PORT;
  if (
    configured !== undefined &&
    /^(?:[1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d|655[0-2]\d|6553[0-5])$/.test(
      configured,
    )
  ) {
    return configured;
  }
  return defaultCallbackPort;
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
