// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodexConnectionScreen } from "./CodexConnectionScreen";

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

function renderScreen(
  onInitiateConnection: Parameters<
    typeof CodexConnectionScreen
  >[0]["onInitiateConnection"],
  onNavigate = vi.fn(),
) {
  root = createRoot(container);
  act(() =>
    root?.render(
      <CodexConnectionScreen
        onInitiateConnection={onInitiateConnection}
        onNavigate={onNavigate}
      />,
    ),
  );
  return onNavigate;
}

const successfulInitiation = async () => ({
  ok: true as const,
  response: {
    version: "2026-08-08" as const,
    status: "login_pending" as const,
    loginReference: "login-reference-123456",
    authorizationUrl:
      "https://auth.openai.com/oauth/authorize?state=server-state",
  },
});

describe("CodexConnectionScreen (T213)", () => {
  it("shows a clear non-technical Connect Codex action", () => {
    renderScreen(successfulInitiation);
    expect(container.textContent).toContain("Connect Codex");
    expect(container.textContent).toContain("organize your resume");
    for (const forbidden of [
      "OAuth",
      "token",
      "API key",
      "authorization code",
      "broker",
      "credential",
      "model",
    ]) {
      expect(container.textContent?.toLowerCase()).not.toContain(
        forbidden.toLowerCase(),
      );
    }
    expect(container.textContent).not.toContain("Codex is ready");
  });

  it("invokes the production initiation action and navigates the top-level browser", async () => {
    const initiate = vi.fn(successfulInitiation);
    const onNavigate = renderScreen(initiate);
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    expect(initiate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/authorize?state=server-state",
    );
    expect(container.textContent).not.toContain("Codex is ready");
  });

  it("bounds repeated clicks to one initiation", async () => {
    let resolve:
      | ((value: Awaited<ReturnType<typeof successfulInitiation>>) => void)
      | undefined;
    const initiate = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof successfulInitiation>>>(
          (done) => {
            resolve = done;
          },
        ),
    );
    renderScreen(initiate);
    const button = container.querySelector<HTMLButtonElement>("button")!;
    act(() => {
      button.click();
      button.click();
    });
    expect(initiate).toHaveBeenCalledTimes(1);
    await act(async () => resolve?.(await successfulInitiation()));
  });

  it("shows a recoverable sanitized failure and never claims readiness", async () => {
    renderScreen(async () => ({
      ok: false as const,
      category: "temporarily_unavailable" as const,
      message: "Codex could not be connected right now. Try again later.",
    }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click();
    });
    expect(container.textContent).toContain("Try again later");
    expect(container.textContent).not.toContain("Codex is ready");
  });
});
