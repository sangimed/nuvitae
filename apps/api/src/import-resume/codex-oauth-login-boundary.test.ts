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
