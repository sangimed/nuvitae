// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionStatusCard } from "./ConnectionStatusCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = undefined;
});

const status = (overrides: Record<string, unknown> = {}) => ({
  ok: true as const,
  response: {
    version: "2026-08-08" as const,
    providerKind: "codex",
    connectionStatus: "not_configured" as const,
    authenticationStatus: "unauthenticated" as const,
    availabilityStatus: "unknown" as const,
    ready: false,
    safeMessage: null,
    ...overrides,
  },
});

async function renderStatus(response: ReturnType<typeof status>["response"]) {
  root = createRoot(container);
  const onReadStatus = vi.fn(async () => ({ ok: true as const, response }));
  await act(async () => {
    root?.render(<ConnectionStatusCard onReadStatus={onReadStatus} />);
  });
}

describe("ConnectionStatusCard (T214)", () => {
  it("offers Connect Codex when disconnected", async () => {
    await renderStatus(status().response);
    expect(container.textContent).toContain("Connect Codex");
    expect(container.textContent).not.toContain("Codex is ready");
  });

  it("shows connecting without a duplicate initiation action", async () => {
    await renderStatus(
      status({
        connectionStatus: "login_pending",
        authenticationStatus: "pending",
      }).response,
    );
    expect(container.textContent).toContain("Connecting Codex");
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).not.toContain("Codex is ready");
  });

  it("shows ready only for the server-approved ready projection", async () => {
    await renderStatus(
      status({
        connectionStatus: "connected",
        authenticationStatus: "authenticated",
        availabilityStatus: "available",
        ready: true,
      }).response,
    );
    expect(container.textContent).toContain("Codex is ready");
    expect(container.textContent).toContain("Disconnect");
  });

  it("does not infer readiness from connected-but-unusable state", async () => {
    await renderStatus(
      status({
        connectionStatus: "connected",
        authenticationStatus: "authenticated",
        availabilityStatus: "unavailable",
      }).response,
    );
    expect(container.textContent).toContain("temporarily unavailable");
    expect(container.textContent).not.toContain("Codex is ready");
  });

  it("offers Reconnect Codex after authentication expiry", async () => {
    await renderStatus(
      status({
        connectionStatus: "authentication_expired",
        authenticationStatus: "expired",
      }).response,
    );
    expect(container.textContent).toContain("Reconnect Codex");
    expect(container.textContent).not.toContain("Disconnect");
  });

  it("confirms disconnect and replaces ready state with the server response", async () => {
    root = createRoot(container);
    const onDisconnect = vi.fn(async () => ({
      ok: true as const,
      response: status({
        connectionStatus: "disconnected",
        authenticationStatus: "unauthenticated",
      }).response,
    }));
    await act(async () => {
      root?.render(
        <ConnectionStatusCard
          onReadStatus={vi.fn(async () =>
            status({
              connectionStatus: "connected",
              authenticationStatus: "authenticated",
              availabilityStatus: "available",
              ready: true,
            }),
          )}
          onDisconnect={onDisconnect}
        />,
      );
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Disconnect")
        ?.click();
    });
    expect(container.textContent).toContain("Disconnect Codex?");
    await act(async () => {
      [...container.querySelectorAll('[role="dialog"] button')]
        .find((button) => button.textContent === "Disconnect")
        ?.click();
    });
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Reconnect Codex");
    expect(container.textContent).not.toContain("Codex is ready");
  });
});
