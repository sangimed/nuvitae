import { describe, expect, it, vi } from "vitest";
import type { ProviderConnectionService } from "@nuvitae/import-application";
import { CodexConnectionInitiationService } from "./codex-connection-initiation.js";

describe("CodexConnectionInitiationService (T258)", () => {
  it("cancels the authenticated owner's pending Codex handoff", async () => {
    const cancelLoginForProvider = vi.fn(async () => ({
      connectionStatus: "login_cancelled",
    }));
    const service = new CodexConnectionInitiationService({
      cancelLoginForProvider,
    } as unknown as ProviderConnectionService);

    await expect(
      service.cancel("10000000-0000-4000-8000-000000000001"),
    ).resolves.toEqual({ connectionStatus: "login_cancelled" });
    expect(cancelLoginForProvider).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      "codex",
    );
  });

  it("starts one owner-scoped background completion after persisting the device handoff", async () => {
    const completeLogin = vi.fn(() => new Promise(() => undefined));
    const beginBrowserLogin = vi.fn(async () => ({
      status: {
        connectionId: "20000000-0000-4000-8000-000000000001",
      },
      browserHandoff: {
        loginReference: "device-login-reference",
        authorizationUrl: "https://auth.openai.com/codex/device",
        userCode: "ABCD-EFGH",
      },
    }));
    const service = new CodexConnectionInitiationService({
      beginBrowserLogin,
      completeLogin,
    } as unknown as ProviderConnectionService);
    const ownerUserId = "10000000-0000-4000-8000-000000000001";

    await expect(service.begin(ownerUserId)).resolves.toEqual({
      version: "2026-08-08",
      status: "login_pending",
      loginReference: "device-login-reference",
      authorizationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
    });
    expect(completeLogin).toHaveBeenCalledWith(
      ownerUserId,
      "20000000-0000-4000-8000-000000000001",
      { deviceLoginReference: "device-login-reference" },
    );

    await service.begin(ownerUserId);
    expect(completeLogin).toHaveBeenCalledTimes(1);
  });
});
