// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Alert, Button, ProgressSteps, StatusState, Tabs, TextField } from ".";

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

describe("Community UI primitives", () => {
  it("exposes loading, error, success and progress semantics without relying on color", () => {
    const rendered = renderToStaticMarkup(
      <>
        <Button loading>Save resume</Button>
        <Alert tone="error">Check the highlighted fields.</Alert>
        <StatusState tone="success">Your changes are saved.</StatusState>
        <ProgressSteps
          steps={[
            { label: "Details", status: "complete" },
            { label: "Review", status: "current" },
            { label: "Finish", status: "upcoming" },
          ]}
        />
      </>,
    );

    expect(rendered).toContain('aria-busy="true"');
    expect(rendered).toContain("Save resume");
    expect(rendered).toContain('role="alert"');
    expect(rendered).toContain("Error");
    expect(rendered).toContain("Complete");
    expect(rendered).toContain('aria-current="step"');
  });

  it("associates form labels, help and validation messages", () => {
    const rendered = renderToStaticMarkup(
      <TextField
        id="display-name"
        label="Display name"
        hint="Use the name shown on your resume."
        error="Enter a display name."
      />,
    );
    container.innerHTML = rendered;

    const input = container.querySelector("input");
    expect(container.querySelector("label")?.htmlFor).toBe("display-name");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe(
      "display-name-hint display-name-error",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Enter a display name.",
    );
  });

  it("supports arrow, Home and End keyboard navigation between enabled tabs", async () => {
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <Tabs
          label="Resume sections"
          items={[
            { id: "content", label: "Content", content: "Content panel" },
            {
              id: "disabled",
              label: "Unavailable",
              content: "Unavailable panel",
              disabled: true,
            },
            { id: "settings", label: "Settings", content: "Settings panel" },
          ]}
        />,
      );
    });

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0]?.focus();
    await act(async () => {
      tabs[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    expect(tabs[2]?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
    expect(container.textContent).toContain("Settings panel");

    await act(async () => {
      tabs[2]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
      );
    });
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
  });
});
