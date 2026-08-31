// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RotatingLoadingMessage } from "./RotatingLoadingMessage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const messages = ["First message", "Second message", "Third message"];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("RotatingLoadingMessage", () => {
  it("rotates predictably without exposing its copy as a live region", () => {
    act(() =>
      root.render(
        <RotatingLoadingMessage messages={messages} intervalMs={5_000} />,
      ),
    );

    const message = container.querySelector("[data-loading-message]");
    expect(message?.textContent).toBe("First message");
    expect(message?.getAttribute("aria-live")).toBe("off");

    act(() => vi.advanceTimersByTime(5_000));
    expect(message?.textContent).toBe("Second message");

    act(() => vi.advanceTimersByTime(10_000));
    expect(message?.textContent).toBe("First message");
  });

  it("replaces jokes with truthful long-wait copy", () => {
    act(() =>
      root.render(
        <RotatingLoadingMessage
          messages={messages}
          intervalMs={5_000}
          longWaitAfterMs={12_000}
          longWaitMessage="Still working. The latest real stage remains below."
        />,
      ),
    );

    act(() => vi.advanceTimersByTime(12_000));
    expect(container.textContent).toBe(
      "Still working. The latest real stage remains below.",
    );
  });
});
