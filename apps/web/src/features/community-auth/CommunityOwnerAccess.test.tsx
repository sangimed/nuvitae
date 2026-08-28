// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityOwnerAccess } from "./CommunityOwnerAccess";

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
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("CommunityOwnerAccess", () => {
  it("completes a successful 204 login after the async response", async () => {
    let resolveLogin: ((response: Response) => void) | undefined;
    const loginResponse = new Promise<Response>((resolve) => {
      resolveLogin = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/community-auth/session/status")) {
        return Promise.resolve(jsonResponse({ authenticated: false }));
      }
      if (
        String(input).endsWith("/api/community-auth/session") &&
        init?.method === "POST"
      ) {
        return loginResponse;
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    root = createRoot(container);
    await act(async () => {
      root?.render(<CommunityOwnerAccess />);
    });
    expect(container.textContent).toContain("Access code");

    const input = container.querySelector<HTMLInputElement>(
      "#community-access-secret",
    );
    const form = container.querySelector<HTMLFormElement>("form");
    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();
    expect(submit).not.toBeNull();

    input!.value = "valid-community-secret";
    await act(async () => {
      submit!.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Signing in…");

    await act(async () => {
      resolveLogin!(new Response(null, { status: 204 }));
    });

    expect(input!.value).toBe("");
    expect(container.textContent).toContain("Signed in.");
    expect(container.textContent).not.toContain("Signing in…");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/community-auth/session",
      expect.objectContaining({
        body: JSON.stringify({ accessSecret: "valid-community-secret" }),
        method: "POST",
      }),
    );
  });

  it("keeps authenticated owner status and logout reachable", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/community-auth/session/status")) {
        return Promise.resolve(jsonResponse({ authenticated: true }));
      }
      if (
        String(input).endsWith("/api/community-auth/session") &&
        init?.method === "DELETE"
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    root = createRoot(container);
    await act(async () => {
      root?.render(<CommunityOwnerAccess />);
    });

    const signOut = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Sign out",
    );
    expect(signOut).toBeDefined();

    await act(async () => {
      signOut!.click();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/community-auth/session",
      expect.objectContaining({
        credentials: "same-origin",
        method: "DELETE",
      }),
    );
    expect(container.textContent).toContain("Access code");
  });
});
