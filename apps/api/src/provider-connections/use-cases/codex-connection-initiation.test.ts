import { describe, expect, it, vi } from "vitest";
import type { ProviderConnectionService } from "@nuvitae/import-application";
import { CodexConnectionInitiationService } from "./codex-connection-initiation.js";
import type { CodexOAuthLoginBoundary } from "../adapters/codex/codex-oauth-login-boundary.js";

describe("CodexConnectionInitiationService (T258)", () => {
  it("cancels the authenticated owner's pending Codex handoff", async () => {
    const cancelLoginForProvider = vi.fn(async () => ({
      connectionStatus: "login_cancelled",
    }));
    const service = new CodexConnectionInitiationService(
      { cancelLoginForProvider } as unknown as ProviderConnectionService,
      {} as CodexOAuthLoginBoundary,
    );

    await expect(
      service.cancel("10000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({ connectionStatus: "login_cancelled" });
    expect(cancelLoginForProvider).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "codex",
    );
  });

  it("completes a cross-site callback using only the server-resolved state owner", async () => {
    const completeLogin = vi.fn(async () => ({ ready: true }));
    const resolvePendingLogin = vi.fn(() => ({
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      connectionId: "20000000-0000-4000-8000-000000000001",
    }));
    const service = new CodexConnectionInitiationService(
      { completeLogin } as unknown as ProviderConnectionService,
      { resolvePendingLogin } as unknown as CodexOAuthLoginBoundary,
    );
    const callback = {
      state: "server-controlled-state",
      authorizationCode: "synthetic-authorization-code",
    } as const;

    await expect(service.completeCallback(callback)).resolves.toEqual({
      ready: true,
    });
    expect(resolvePendingLogin).toHaveBeenCalledWith(callback.state);
    expect(completeLogin).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
      callback,
    );
  });
});
