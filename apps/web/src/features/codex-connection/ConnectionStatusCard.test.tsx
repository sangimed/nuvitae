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
  });

  it("does not infer readiness from connected-but-unusable state", async () => {
    await renderStatus(
      status({
        connectionStatus: "connected",
        authenticationStatus: "authenticated",
        availabilityStatus: "unavailable",
      }).response,
    );
    expect(container.textContent).toContain("Codex connection expired");
    expect(container.textContent).not.toContain("Codex is ready");
  });
});
