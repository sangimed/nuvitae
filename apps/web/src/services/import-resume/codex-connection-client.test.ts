import { describe, expect, it } from "vitest";
import {
  beginCodexConnection,
  disconnectCodexConnection,
} from "./codex-connection-client";

const response = {
  version: "2026-08-08",
  status: "login_pending",
  loginReference: "login-reference-123456",
  authorizationUrl:
    "https://auth.openai.com/oauth/authorize?state=server-state",
};

describe("beginCodexConnection (T213)", () => {
  it("accepts only the safe pending handoff contract", async () => {
    const result = await beginCodexConnection({
      fetchImpl: async () =>
        new Response(JSON.stringify(response), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(result).toEqual({ ok: true, response });
    expect(JSON.stringify(result)).not.toContain("token");
    expect(JSON.stringify(result)).not.toContain("credential");
  });

  it("maps initiation failures to actionable plain language", async () => {
    const result = await beginCodexConnection({
      fetchImpl: async () => new Response("internal details", { status: 503 }),
    });
    expect(result).toEqual({
      ok: false,
      category: "temporarily_unavailable",
      message: "Codex could not be connected right now. Try again later.",
    });
    expect(JSON.stringify(result)).not.toContain("internal details");
  });

  it("rejects malformed or unsafe handoff metadata", async () => {
    const result = await beginCodexConnection({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ...response,
            authorizationUrl: "http://attacker.test/callback?token=secret",
          }),
          { status: 201 },
        ),
    });
    expect(result.ok).toBe(false);
  });
});

describe("disconnectCodexConnection (T215)", () => {
  it("accepts only the provider-neutral disconnected projection", async () => {
    const result = await disconnectCodexConnection({
      fetchImpl: async (_input, init) => {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            version: "2026-08-08",
            providerKind: "codex",
            connectionStatus: "disconnected",
            authenticationStatus: "unauthenticated",
            availabilityStatus: "unknown",
            ready: false,
            safeMessage: null,
          }),
          { status: 200 },
        );
      },
    });
    expect(result).toMatchObject({
      ok: true,
      response: { connectionStatus: "disconnected", ready: false },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /token|credential|session|account|oauth/i,
    );
  });

  it("sanitizes repeated or failed disconnect responses", async () => {
    const result = await disconnectCodexConnection({
      fetchImpl: async () =>
        new Response("provider token=secret", { status: 503 }),
    });
    expect(result).toEqual({
      ok: false,
      message: "Codex could not be disconnected safely. Try again later.",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
