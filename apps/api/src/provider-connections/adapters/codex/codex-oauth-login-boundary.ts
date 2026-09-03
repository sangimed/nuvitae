import { randomBytes, randomUUID } from "node:crypto";
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
  type ProviderLoginCompletion,
  type ProviderRuntimeAdapterContext,
  type ProviderRuntimeConnectionAdapter,
} from "@nuvitae/import-application";

const issuer = "https://auth.openai.com";
const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const deviceVerificationUrl = `${issuer}/codex/device`;
const deviceTokenRedirectUri = `${issuer}/deviceauth/callback`;
const pendingLoginTtlMs = 15 * 60 * 1000;
const maximumPendingLogins = 1_000;

interface PendingLogin {
  readonly ownerUserId: string;
  readonly connectionId: string;
  readonly deviceAuthId: string;
  readonly userCode: string;
  readonly intervalSeconds: number;
  readonly handoff: ProviderAdapterBrowserLoginHandoff;
  readonly loginStartedAt: Date;
  readonly expiresAt: number;
  readonly abortController: AbortController;
}

export interface CodexOAuthCredentialMaterial {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accountId: string | null;
  readonly expiresAt: Date | null;
}

interface CodexDeviceAuthorization {
  readonly deviceAuthId: string;
  readonly userCode: string;
  readonly intervalSeconds: number;
}

interface CodexDeviceGrant {
  readonly authorizationCode: string;
  readonly codeVerifier: string;
}

export interface CodexDeviceAuthClient {
  start(signal?: AbortSignal): Promise<CodexDeviceAuthorization>;
  waitForGrant(
    authorization: CodexDeviceAuthorization,
    signal: AbortSignal,
  ): Promise<CodexDeviceGrant>;
  exchange(
    grant: CodexDeviceGrant,
    signal?: AbortSignal,
  ): Promise<CodexOAuthCredentialMaterial>;
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
 * Codex broker boundary. It owns the callback-free device authorization,
 * authorization-code exchange, encrypted session persistence, and privacy-safe
 * inspection. The application service receives only an opaque session
 * reference and provider-neutral metadata.
 */
export class CodexOAuthLoginBoundary implements ProviderRuntimeConnectionAdapter {
  readonly providerKind = "codex";
  private readonly pending = new Map<string, PendingLogin>();

  constructor(
    private readonly options: {
      readonly deviceAuth?: CodexDeviceAuthClient;
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
    const deviceAuth =
      this.options.deviceAuth ?? new OpenAiCodexDeviceAuthClient();
    let authorization: CodexDeviceAuthorization;
    try {
      authorization = await deviceAuth.start();
    } catch (error) {
      if (error instanceof ProviderConnectionError) throw error;
      throw new ProviderConnectionError("provider_adapter_failed");
    }
    const handoff: ProviderAdapterBrowserLoginHandoff = {
      loginReference: randomUUID(),
      authorizationUrl: deviceVerificationUrl,
      userCode: authorization.userCode,
    };
    this.boundPendingCapacity();
    this.pending.set(key, {
      ownerUserId: context.ownerUserId,
      connectionId: context.connectionId,
      deviceAuthId: authorization.deviceAuthId,
      userCode: authorization.userCode,
      intervalSeconds: authorization.intervalSeconds,
      handoff,
      loginStartedAt,
      expiresAt: loginStartedAt.getTime() + pendingLoginTtlMs,
      abortController: new AbortController(),
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
    completion?: ProviderLoginCompletion,
  ): Promise<ProviderAdapterConnectedResult> {
    if (completion === undefined || !("deviceLoginReference" in completion)) {
      throw new ProviderConnectionError(
        "provider_connection_login_invalid_state",
      );
    }
    const pending = this.requirePending(
      context,
      completion.deviceLoginReference,
    );
    const deviceAuth =
      this.options.deviceAuth ?? new OpenAiCodexDeviceAuthClient();
    let credentials: CodexOAuthCredentialMaterial;
    try {
      const grant = await deviceAuth.waitForGrant(
        {
          deviceAuthId: pending.deviceAuthId,
          userCode: pending.userCode,
          intervalSeconds: pending.intervalSeconds,
        },
        pending.abortController.signal,
      );
      credentials = await deviceAuth.exchange(
        grant,
        pending.abortController.signal,
      );
    } catch (error) {
      this.pending.delete(this.key(context));
      if (pending.abortController.signal.aborted) {
        throw new ProviderConnectionError(
          "provider_connection_login_cancelled",
        );
      }
      if (error instanceof ProviderConnectionError) throw error;
      throw new ProviderConnectionError("provider_adapter_failed");
    }
    this.pending.delete(this.key(context));
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
    const pending = this.pending.get(this.key(context));
    pending?.abortController.abort();
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

  private key(context: ProviderRuntimeAdapterContext): string {
    return `${context.ownerUserId}:${context.connectionId}`;
  }

  private requirePending(
    context: ProviderRuntimeAdapterContext,
    loginReference: string,
  ): PendingLogin {
    const key = this.key(context);
    const pending = this.pending.get(key);
    if (
      pending === undefined ||
      pending.handoff.loginReference !== loginReference
    ) {
      throw new ProviderConnectionError(
        "provider_connection_login_invalid_state",
      );
    }
    if (pending.expiresAt <= this.clock().getTime()) {
      pending.abortController.abort();
      this.pending.delete(key);
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
      if (login.expiresAt <= now) {
        login.abortController.abort();
        this.pending.delete(key);
      }
    }
  }

  private boundPendingCapacity(): void {
    while (this.pending.size >= maximumPendingLogins) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) return;
      this.pending.get(oldest)?.abortController.abort();
      this.pending.delete(oldest);
    }
  }
}

type CodexSessionPayload = CodexSessionMaterial;

class OpenAiCodexDeviceAuthClient implements CodexDeviceAuthClient {
  async start(signal?: AbortSignal): Promise<CodexDeviceAuthorization> {
    const response = await fetch(`${issuer}/api/accounts/deviceauth/usercode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
      signal: requestSignal(signal),
      redirect: "error",
    });
    if (!response.ok) throw providerFailure();
    const parsed = await boundedJson(response);
    const deviceAuthId = boundedString(parsed, "device_auth_id", 4096);
    const userCode =
      boundedString(parsed, "user_code", 32) ??
      boundedString(parsed, "usercode", 32);
    const rawInterval = boundedString(parsed, "interval", 8);
    if (
      deviceAuthId === undefined ||
      userCode === undefined ||
      !/^[A-Za-z0-9-]{4,32}$/.test(userCode)
    ) {
      throw providerFailure();
    }
    const parsedInterval = Number.parseInt(rawInterval ?? "1", 10);
    return {
      deviceAuthId,
      userCode,
      intervalSeconds: Number.isFinite(parsedInterval)
        ? Math.min(30, Math.max(1, parsedInterval))
        : 1,
    };
  }

  async waitForGrant(
    authorization: CodexDeviceAuthorization,
    signal: AbortSignal,
  ): Promise<CodexDeviceGrant> {
    const deadline = Date.now() + pendingLoginTtlMs;
    while (Date.now() < deadline) {
      const response = await fetch(`${issuer}/api/accounts/deviceauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          device_auth_id: authorization.deviceAuthId,
          user_code: authorization.userCode,
        }),
        signal: requestSignal(signal),
        redirect: "error",
      });
      if (response.ok) {
        const parsed = await boundedJson(response);
        const authorizationCode = boundedString(
          parsed,
          "authorization_code",
          4096,
        );
        const codeVerifier = boundedString(parsed, "code_verifier", 4096);
        if (authorizationCode === undefined || codeVerifier === undefined) {
          throw providerFailure();
        }
        return { authorizationCode, codeVerifier };
      }
      if (response.status !== 403 && response.status !== 404) {
        throw providerFailure();
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await abortableDelay(
        Math.min(authorization.intervalSeconds * 1_000, remainingMs),
        signal,
      );
    }
    throw new ProviderConnectionError("provider_connection_login_expired");
  }

  async exchange(
    grant: CodexDeviceGrant,
    signal?: AbortSignal,
  ): Promise<CodexOAuthCredentialMaterial> {
    try {
      const response = await fetch(`${issuer}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: grant.authorizationCode,
          code_verifier: grant.codeVerifier,
          redirect_uri: deviceTokenRedirectUri,
        }),
        signal: requestSignal(signal),
        redirect: "error",
      });
      if (!response.ok) throw providerFailure();
      const parsed = await boundedJson(response);
      if (
        boundedString(parsed, "access_token", 65_536) === undefined ||
        boundedString(parsed, "refresh_token", 65_536) === undefined
      ) {
        throw providerFailure();
      }
      const accessToken = boundedString(parsed, "access_token", 65_536)!;
      const refreshToken = boundedString(parsed, "refresh_token", 65_536)!;
      const accountId = boundedString(parsed, "account_id", 512) ?? null;
      const expiresIn = parsed.expires_in;
      return {
        accessToken,
        refreshToken,
        accountId,
        expiresAt:
          typeof expiresIn === "number" && Number.isFinite(expiresIn)
            ? new Date(Date.now() + Math.max(0, expiresIn) * 1000)
            : null,
      };
    } catch (error) {
      if (error instanceof ProviderConnectionError) throw error;
      throw new ProviderConnectionError("provider_adapter_failed");
    }
  }
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(15_000);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function boundedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (body.length > 65_536) throw providerFailure();
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw providerFailure();
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ProviderConnectionError) throw error;
    throw providerFailure();
  }
}

function boundedString(
  value: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" &&
    candidate.length > 0 &&
    candidate.length <= maximumLength
    ? candidate
    : undefined;
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function providerFailure() {
  return new ProviderConnectionError("provider_adapter_failed");
}

function unsupportedUntilFutureState(
  operation: string,
): ProviderConnectionError {
  void operation;
  return new ProviderConnectionError("provider_adapter_failed");
}
