import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexOAuthLoginBoundary } from "./codex-oauth-login-boundary.js";
import type {
  ProviderRuntimeAdapterContext,
  ProviderSessionStore,
} from "@nuvitae/import-application";

const sessionStore: ProviderSessionStore = {
  writeSession: async (input) => input,
  readSession: async () => new Uint8Array(),
  deleteSession: async () => ({ deleted: false }),
  hasSession: async () => false,
};

afterEach(() => vi.unstubAllGlobals());

function context(
  ownerUserId: string,
  connectionId: string,
): ProviderRuntimeAdapterContext {
  return { ownerUserId, connectionId, sessionStore };
}

describe("CodexOAuthLoginBoundary (T213)", () => {
  it("requests a device code without sending owner or resume data", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            device_auth_id: "device-auth-id",
            user_code: "ABCD-EFGH",
            interval: "5",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const boundary = new CodexOAuthLoginBoundary();

    await boundary.startLogin(
      context(
        "10000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000001",
      ),
      null,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.openai.com/api/accounts/deviceauth/usercode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
        }),
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(
      /10000000|resume/i,
    );
  });

  it("fails closed on malformed provider device metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              device_auth_id: "device-auth-id",
              user_code: "<script>not-a-code</script>",
              interval: "5",
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(
      new CodexOAuthLoginBoundary().startLogin(
        context(
          "10000000-0000-4000-8000-000000000001",
          "20000000-0000-4000-8000-000000000001",
        ),
        null,
      ),
    ).rejects.toMatchObject({ code: "provider_adapter_failed" });
  });

  it("returns the official device page and a bounded one-time code", async () => {
    const boundary = new CodexOAuthLoginBoundary({
      deviceAuth: fakeDeviceAuth(),
    });
    const result = await boundary.startLogin(
      context(
        "10000000-0000-4000-8000-000000000001",
        "20000000-0000-4000-8000-000000000001",
      ),
      null,
    );
    expect(result.browserHandoff).toMatchObject({
      authorizationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
    });
    expect(result.browserHandoff!.loginReference).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain("access_token");
    expect(JSON.stringify(result)).not.toContain("refresh_token");
    expect(JSON.stringify(result)).not.toContain("code_verifier");
    expect(JSON.stringify(result)).not.toContain("device-auth-id");
  });

  it("resumes one active attempt for repeated clicks and isolates owners", async () => {
    const boundary = new CodexOAuthLoginBoundary({
      deviceAuth: fakeDeviceAuth(),
    });
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
    const boundary = new CodexOAuthLoginBoundary({
      deviceAuth: fakeDeviceAuth(),
    });
    const owner = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const first = await boundary.startLogin(owner, null);
    await boundary.cancelLogin(owner, null);
    const replacement = await boundary.startLogin(owner, null);

    expect(replacement.browserHandoff).not.toEqual(first.browserHandoff);
  });
});

describe("CodexOAuthLoginBoundary device completion", () => {
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
      deviceAuth: fakeDeviceAuth({
        async exchange() {
          exchanges += 1;
          return {
            accessToken: "access-token-sentinel",
            refreshToken: "refresh-token-sentinel",
            accountId: "account-id-sentinel",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          };
        },
      }),
    });
    const context = {
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      connectionId: "20000000-0000-4000-8000-000000000001",
      sessionStore,
    };
    const login = await boundary.startLogin(context, null);
    const result = await boundary.completeLogin(context, null, {
      deviceLoginReference: login.browserHandoff!.loginReference,
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
    "wrong reference",
    "foreign owner",
    "replayed login",
    "stale login",
  ])("rejects %s without accepting a credential", async (caseName) => {
    let now = new Date("2026-08-08T12:00:00.000Z");
    const boundary = new CodexOAuthLoginBoundary({
      now: () => now,
      deviceAuth: fakeDeviceAuth(),
    });
    const owner = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const login = await boundary.startLogin(owner, null);
    const loginReference = login.browserHandoff!.loginReference;
    const completionReference =
      caseName === "wrong reference"
        ? `${loginReference}-wrong`
        : loginReference;
    const completionOwner =
      caseName === "foreign owner"
        ? context(
            "10000000-0000-4000-8000-000000000002",
            "20000000-0000-4000-8000-000000000002",
          )
        : owner;
    if (caseName === "stale login") {
      now = new Date("2026-08-08T12:16:00.000Z");
    }
    if (caseName === "replayed login") {
      await boundary.completeLogin(owner, null, {
        deviceLoginReference: loginReference,
      });
      await expect(
        boundary.completeLogin(owner, null, {
          deviceLoginReference: loginReference,
        }),
      ).rejects.toMatchObject({
        code: "provider_connection_login_invalid_state",
      });
      return;
    }
    await expect(
      boundary.completeLogin(completionOwner, null, {
        deviceLoginReference: completionReference,
      }),
    ).rejects.toMatchObject({
      code:
        caseName === "stale login"
          ? "provider_connection_login_expired"
          : "provider_connection_login_invalid_state",
    });
  });

  it("aborts provider polling when the user cancels", async () => {
    let observedSignal: AbortSignal | undefined;
    const boundary = new CodexOAuthLoginBoundary({
      deviceAuth: fakeDeviceAuth({
        waitForGrant: async (_authorization, signal) => {
          observedSignal = signal;
          return await new Promise(() => undefined);
        },
      }),
    });
    const owner = context(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    );
    const login = await boundary.startLogin(owner, null);
    void boundary.completeLogin(owner, null, {
      deviceLoginReference: login.browserHandoff!.loginReference,
    });
    await Promise.resolve();
    await boundary.cancelLogin(owner, null);
    expect(observedSignal?.aborted).toBe(true);
  });
});

function fakeDeviceAuth(overrides: Record<string, unknown> = {}) {
  return {
    start: async () => ({
      deviceAuthId: "device-auth-id",
      userCode: "ABCD-EFGH",
      intervalSeconds: 1,
    }),
    waitForGrant: async () => ({
      authorizationCode: "authorization-code-sentinel",
      codeVerifier: "code-verifier-sentinel",
    }),
    exchange: async () => ({
      accessToken: "a",
      refreshToken: "r",
      accountId: null,
      expiresAt: null,
    }),
    ...overrides,
  };
}
