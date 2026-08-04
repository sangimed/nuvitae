// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRecoveryActions } from "./ProviderRecoveryActions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
const onManualEntry = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function renderPanel(
  props: {
    readonly state?: "provider_unavailable" | "rate_limited" | "unknown";
    readonly error?: string;
  } = {},
) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() =>
    root.render(
      <ProviderRecoveryActions
        state={props.state ?? "provider_unavailable"}
        recoveryActions={["retry", "replace_upload", "manual_entry"]}
        alternativeProviderAvailable={false}
        error={props.error}
        onRetry={() => undefined}
        onReplaceUpload={() => undefined}
        onManualEntry={onManualEntry}
      />,
    ),
  );
}

function section(): HTMLElement | null {
  return container.querySelector<HTMLElement>("section.import-card");
}

describe("ProviderRecoveryActions focus and errors (T063)", () => {
  it("focuses the recovery section when it appears", () => {
    renderPanel();
    expect(document.activeElement).toBe(section());
    expect(section()?.getAttribute("tabindex")).toBe("-1");
  });

  it("does not steal focus on repeated renders of the same recovery state", () => {
    renderPanel();
    expect(document.activeElement).toBe(section());
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Enter manually"),
    );
    act(() => button?.focus());
    expect(document.activeElement).toBe(button);
    renderPanel();
    expect(document.activeElement).toBe(button);
  });

  it("renders and focuses an error summary when a recovery failure occurs", () => {
    renderPanel({
      error: "The AI provider is temporarily unavailable. You can try again.",
    });
    const summary = container.querySelector("[data-error-summary]");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("AI provider is temporarily");
    expect(summary?.textContent).not.toContain("diagnostic");
    expect(document.activeElement).toBe(summary);
  });

  it("keeps manual entry keyboard accessible in recovery states", () => {
    renderPanel({ state: "unknown" });
    const manual = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("Enter manually"),
    ) as HTMLButtonElement;
    act(() => manual.focus());
    act(() => manual.click());
    expect(onManualEntry).toHaveBeenCalledTimes(1);
  });
});
