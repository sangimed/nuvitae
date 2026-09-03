import { describe, expect, it, vi } from "vitest";
import { attachVerifiedPrincipal } from "../../../auth/user-context.js";
import { CodexConnectionInitiationService } from "../../use-cases/codex-connection-initiation.js";
import { ProviderConnectionController } from "./provider-connection.controller.js";
import { VerifiedPrincipalGuard } from "../../../auth/verified-principal.guard.js";

const ownerUserId = "10000000-0000-4000-8000-000000000001";

function authenticatedRequest(): object {
  const request = {};
  attachVerifiedPrincipal(request, {
    verification: "verified",
    userId: ownerUserId,
  });
  new VerifiedPrincipalGuard().canActivate({
    switchToHttp: () => ({ getRequest: () => request }),
  } as never);
  return request;
}

function serviceMock(overrides: Record<string, unknown> = {}) {
  return {
    begin: vi.fn(),
    status: vi.fn(async () => null),
    cancel: vi.fn(async () => null),
    disconnect: vi.fn(async () => null),
    ...overrides,
  } as unknown as CodexConnectionInitiationService;
}

describe("ProviderConnectionController (T214)", () => {
  it("returns only a safe not-configured status when no row exists", async () => {
    const controller = new ProviderConnectionController(serviceMock());
    const response = await controller.readStatus(authenticatedRequest());
    expect(response).toEqual({
      version: "2026-08-08",
      providerKind: "codex",
      connectionStatus: "not_configured",
      authenticationStatus: "unauthenticated",
      availabilityStatus: "unknown",
      ready: false,
      safeMessage: null,
    });
    expect(JSON.stringify(response)).not.toMatch(
      /token|authorization|account|session|oauth|url/i,
    );
  });

  it("projects persisted ready state without exposing the connection reference", async () => {
    const controller = new ProviderConnectionController(
      serviceMock({
        status: vi.fn(async () => ({
          connectionId: "internal-connection-id",
          providerKind: "codex",
          displayName: "Codex",
          connectionStatus: "connected",
          authenticationStatus: "authenticated",
          availabilityStatus: "available",
          capabilities: null,
          capabilitySnapshotAt: null,
          lastCheckedAt: new Date(),
          loginStartedAt: new Date(),
          connectedAt: new Date(),
          refreshedAt: new Date(),
          expiresAt: null,
          disconnectedAt: null,
          revokedAt: null,
          deletedAt: null,
          safeMessage: null,
          ready: true,
        })),
      }),
    );
    const response = await controller.readStatus(authenticatedRequest());
    expect(response.ready).toBe(true);
    expect(response.connectionStatus).toBe("connected");
    expect(JSON.stringify(response)).not.toContain("internal-connection-id");
    expect(JSON.stringify(response)).not.toMatch(/token|account|session|url/i);
  });

  it("disconnects only through the authenticated owner context and returns a safe disconnected projection", async () => {
    const disconnect = vi.fn(async () => ({
      connectionId: "internal-connection-id",
      providerKind: "codex",
      displayName: "Codex",
      connectionStatus: "disconnected" as const,
      authenticationStatus: "unauthenticated" as const,
      availabilityStatus: "unknown" as const,
      capabilities: null,
      capabilitySnapshotAt: null,
      lastCheckedAt: new Date(),
      loginStartedAt: null,
      connectedAt: new Date(),
      refreshedAt: null,
      expiresAt: null,
      disconnectedAt: new Date(),
      revokedAt: null,
      deletedAt: null,
      safeMessage: null,
      ready: false,
    }));
    const controller = new ProviderConnectionController(
      serviceMock({ disconnect }),
    );

    const response = await controller.disconnect(authenticatedRequest());
    expect(disconnect).toHaveBeenCalledWith(ownerUserId);
    expect(response.connectionStatus).toBe("disconnected");
    expect(response.ready).toBe(false);
    expect(JSON.stringify(response)).not.toMatch(
      /token|account|session|credential|oauth|internal-connection-id/i,
    );
  });

  it("cancels a pending login through the authenticated owner context", async () => {
    const cancel = vi.fn(async () => ({
      connectionId: "internal-connection-id",
      providerKind: "codex",
      displayName: "Codex",
      connectionStatus: "login_cancelled" as const,
      authenticationStatus: "unauthenticated" as const,
      availabilityStatus: "unknown" as const,
      capabilities: null,
      capabilitySnapshotAt: null,
      lastCheckedAt: new Date(),
      loginStartedAt: new Date(),
      connectedAt: null,
      refreshedAt: null,
      expiresAt: null,
      disconnectedAt: null,
      revokedAt: null,
      deletedAt: null,
      safeMessage: null,
      ready: false,
    }));
    const controller = new ProviderConnectionController(
      serviceMock({ cancel }),
    );

    const response = await controller.cancel(authenticatedRequest());

    expect(cancel).toHaveBeenCalledWith(ownerUserId);
    expect(response).toMatchObject({
      connectionStatus: "login_cancelled",
      authenticationStatus: "unauthenticated",
      ready: false,
    });
    expect(JSON.stringify(response)).not.toMatch(
      /token|account|session|credential|oauth|internal-connection-id/i,
    );
  });

  it("keeps provider-unavailable separate from authentication expiry", async () => {
    const controller = new ProviderConnectionController(
      serviceMock({
        status: vi.fn(async () => ({
          connectionId: "internal-connection-id",
          providerKind: "codex",
          displayName: "Codex",
          connectionStatus: "connected",
          authenticationStatus: "authenticated",
          availabilityStatus: "unavailable",
          capabilities: null,
          capabilitySnapshotAt: null,
          lastCheckedAt: new Date(),
          loginStartedAt: null,
          connectedAt: new Date(),
          refreshedAt: null,
          expiresAt: null,
          disconnectedAt: null,
          revokedAt: null,
          deletedAt: null,
          safeMessage: null,
          ready: false,
        })),
      }),
    );
    const response = await controller.readStatus(authenticatedRequest());
    expect(response).toMatchObject({
      connectionStatus: "connected",
      authenticationStatus: "authenticated",
      availabilityStatus: "unavailable",
      ready: false,
      safeMessage: "Codex is temporarily unavailable.",
    });
  });
});
