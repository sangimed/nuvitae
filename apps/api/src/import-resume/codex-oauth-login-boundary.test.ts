import { describe, expect, it } from "vitest";
import { CodexOAuthLoginBoundary } from "./codex-oauth-login-boundary.js";
import type {
  ProviderRuntimeAdapterContext,
  ProviderSessionStore,
} from "../services/import-resume/provider-connections.js";

const sessionStore: ProviderSessionStore = {
  writeSession: async (input) => input,
  readSession: async () => new Uint8Array(),
  deleteSession: async () => ({ deleted: false }),
  hasSession: async () => false,
};

function context(
  ownerUserId: string,
  connectionId: string,
): ProviderRuntimeAdapterContext {
  return { ownerUserId, connectionId, sessionStore };
}

describe("CodexOAuthLoginBoundary (T213)", () => {
  it("generates the audited PKCE/state browser handoff without network activity", async () => {
    const boundary = new CodexOAuthLoginBoundary();
    const result = await boundary.startLogin(
      context(
        "10000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000001",
      ),
      null,
    );
    const url = new URL(result.browserHandoff!.authorizationUrl);
    const verifier = url.searchParams.get("code_challenge")!;
    const state = url.searchParams.get("state")!;

    expect(url.origin).toBe("https://auth.openai.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state.length).toBeGreaterThan(20);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.browserHandoff!.loginReference).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(JSON.stringify(result)).not.toContain("refresh_token");
    expect(JSON.stringify(result)).not.toContain("code_verifier");
  });

  it("matches the qualified live OAuth request contract structurally", async () => {
    const originalHost = process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST;
    const originalPort = process.env.NUVITAE_CODEX_OAUTH_CALLBACK_PORT;
    delete process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST;
    delete process.env.NUVITAE_CODEX_OAUTH_CALLBACK_PORT;
    try {
      const result = await new CodexOAuthLoginBoundary().startLogin(
        context(
          "10000000-0000-4000-8000-000000000001",
          "20000000-0000-4000-8000-000000000001",
        ),
        null,
      );
      const url = new URL(result.browserHandoff!.authorizationUrl);

      expect({
        origin: url.origin,
        pathname: url.pathname,
        parameterNames: [...url.searchParams.keys()].sort(),
        clientId: url.searchParams.get("client_id"),
        responseType: url.searchParams.get("response_type"),
        redirectUri: url.searchParams.get("redirect_uri"),
        scopes: url.searchParams.get("scope")?.split(" ").sort(),
        codeChallengeMethod: url.searchParams.get("code_challenge_method"),
        requiredDynamicFieldsPresent: ["state", "code_challenge"].every(
          (name) => url.searchParams.has(name),
        ),
        authorizationExtras: {
          idTokenAddOrganizations: url.searchParams.get(
            "id_token_add_organizations",
          ),
          codexCliSimplifiedFlow: url.searchParams.get(
            "codex_cli_simplified_flow",
          ),
          originator: url.searchParams.get("originator"),
        },
      }).toEqual({
        origin: "https://auth.openai.com",
        pathname: "/oauth/authorize",
        parameterNames: [
          "client_id",
          "code_challenge",
          "code_challenge_method",
          "codex_cli_simplified_flow",
          "id_token_add_organizations",
          "originator",
          "redirect_uri",
          "response_type",
          "scope",
          "state",
        ],
        clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
        responseType: "code",
        redirectUri: "http://localhost:1455/auth/callback",
        scopes: ["email", "offline_access", "openid", "profile"],
        codeChallengeMethod: "S256",
        requiredDynamicFieldsPresent: true,
        authorizationExtras: {
          idTokenAddOrganizations: "true",
          codexCliSimplifiedFlow: "true",
          originator: "openclaw",
        },
      });
    } finally {
      if (originalHost === undefined) {
        delete process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST;
      } else {
        process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST = originalHost;
      }
      if (originalPort === undefined) {
        delete process.env.NUVITAE_CODEX_OAUTH_CALLBACK_PORT;
      } else {
        process.env.NUVITAE_CODEX_OAUTH_CALLBACK_PORT = originalPort;
      }
    }
  });

  it("resumes one active attempt for repeated clicks and isolates owners", async () => {
    const boundary = new CodexOAuthLoginBoundary();
    const ownerA = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const ownerB = context(
      "10000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000002",
    );
    const first = await boundary.startLogin(ownerA, null);
    const repeated = await boundary.startLogin(ownerA, null);
    const other = await boundary.startLogin(ownerB, null);

    expect(repeated.browserHandoff).toEqual(first.browserHandoff);
    expect(other.browserHandoff).not.toEqual(first.browserHandoff);
  });

  it("clears the cancelled handoff before allowing a replacement attempt", async () => {
    const boundary = new CodexOAuthLoginBoundary();
    const owner = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const first = await boundary.startLogin(owner, null);
    const firstState = new URL(
      first.browserHandoff!.authorizationUrl,
    ).searchParams.get("state")!;

    await boundary.cancelLogin(owner, null);
    const replacement = await boundary.startLogin(owner, null);

    expect(replacement.browserHandoff).not.toEqual(first.browserHandoff);
    expect(() =>
      boundary.resolvePendingLogin(owner.ownerUserId, firstState),
    ).toThrowError(
      expect.objectContaining({
        code: "provider_connection_login_invalid_state",
      }),
    );
  });

  it("rejects an unsafe redirect host before producing a handoff", async () => {
    const original = process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST;
    process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST = "attacker.test";
    try {
      await expect(
        new CodexOAuthLoginBoundary().startLogin(
          context(
            "10000000-0000-4000-8000-000000000001",
            "20000000-0000-4000-8000-000000000001",
          ),
          null,
        ),
      ).rejects.toMatchObject({ code: "provider_adapter_failed" });
    } finally {
      if (original === undefined) {
        delete process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST;
      } else {
        process.env.NUVITAE_CODEX_OAUTH_REDIRECT_HOST = original;
      }
    }
  });
});

describe("CodexOAuthLoginBoundary callback completion (T214)", () => {
  it("exchanges once, writes an opaque owner-bound session, and inspects ready state", async () => {
    const stored = new Map<string, Uint8Array>();
    const sessionStore: ProviderSessionStore = {
      writeSession: async (input) => {
        stored.set(input.sessionReference, input.payload);
        return input;
      },
      readSession: async (input) =>
        stored.get(input.sessionReference) ?? new Uint8Array(),
      deleteSession: async (input) => ({
        deleted: stored.delete(input.sessionReference),
      }),
      hasSession: async (input) => stored.has(input.sessionReference),
    };
    let exchanges = 0;
    const boundary = new CodexOAuthLoginBoundary({
      exchange: {
        async exchange() {
          exchanges += 1;
          return {
            accessToken: "access-token-sentinel",
            refreshToken: "refresh-token-sentinel",
            accountId: "account-id-sentinel",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          };
        },
      },
    });
    const context = {
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      connectionId: "20000000-0000-4000-8000-000000000001",
      sessionStore,
    };
    const login = await boundary.startLogin(context, null);
    const state = new URL(
      login.browserHandoff!.authorizationUrl,
    ).searchParams.get("state")!;
    const connectionId = boundary.resolvePendingLogin(
      context.ownerUserId,
      state,
    );
    expect(connectionId).toBe(context.connectionId);

    const result = await boundary.completeLogin(context, null, {
      state,
      authorizationCode: "authorization-code-sentinel",
    });

    expect(exchanges).toBe(1);
    expect(result.sessionReference).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("access-token-sentinel");
    expect(JSON.stringify(result)).not.toContain("account-id-sentinel");
    expect(stored.size).toBe(1);
    await expect(
      boundary.inspect(context, result.sessionReference),
    ).resolves.toMatchObject({
      connectionState: "connected",
      authenticationState: "authenticated",
      availabilityState: "available",
    });
  });

  it.each([
    "wrong state",
    "foreign owner",
    "replayed callback",
    "stale callback",
  ])("rejects %s without another exchange", async (caseName) => {
    let now = new Date("2026-08-08T12:00:00.000Z");
    const boundary = new CodexOAuthLoginBoundary({
      now: () => now,
      exchange: {
        async exchange() {
          return {
            accessToken: "a",
            refreshToken: "r",
            accountId: null,
            expiresAt: null,
          };
        },
      },
    });
    const owner = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const login = await boundary.startLogin(owner, null);
    const state = new URL(
      login.browserHandoff!.authorizationUrl,
    ).searchParams.get("state")!;
    const callbackState = caseName === "wrong state" ? `${state}-wrong` : state;
    const callbackOwner =
      caseName === "foreign owner"
        ? context(
            "10000000-0000-4000-8000-000000000002",
            "20000000-0000-4000-8000-000000000002",
          )
        : owner;
    if (caseName === "stale callback") {
      now = new Date("2026-08-08T12:11:00.000Z");
    }
    if (caseName === "replayed callback") {
      await boundary.completeLogin(owner, null, {
        state,
        authorizationCode: "code",
      });
      await expect(
        boundary.completeLogin(owner, null, {
          state,
          authorizationCode: "code",
        }),
      ).rejects.toMatchObject({
        code: "provider_connection_login_invalid_state",
      });
      return;
    }
    await expect(
      boundary.completeLogin(callbackOwner, null, {
        state: callbackState,
        authorizationCode: "code",
      }),
    ).rejects.toMatchObject({
      code:
        caseName === "stale callback"
          ? "provider_connection_login_expired"
          : "provider_connection_login_invalid_state",
    });
  });

  it("sanitizes a provider error and consumes its callback state", async () => {
    const boundary = new CodexOAuthLoginBoundary();
    const owner = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const login = await boundary.startLogin(owner, null);
    const state = new URL(
      login.browserHandoff!.authorizationUrl,
    ).searchParams.get("state")!;
    await expect(
      boundary.completeLogin(owner, null, {
        state,
        providerError: "access_denied",
      }),
    ).rejects.toMatchObject({ code: "provider_connection_login_cancelled" });
    expect(() =>
      boundary.resolvePendingLogin(owner.ownerUserId, state),
    ).toThrowError(
      expect.objectContaining({
        code: "provider_connection_login_invalid_state",
      }),
    );
  });
});
