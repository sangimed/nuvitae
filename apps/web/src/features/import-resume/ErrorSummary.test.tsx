// @vitest-environment jsdom

import { act, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ErrorSummary,
  normalizeErrorSummaryItems,
  toPublicErrorText,
  type ErrorSummaryItem,
} from "./ErrorSummary";
import { focusErrorSummary } from "./focus-management";

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
  container?.remove();
  root = undefined;
});

function render(ui: ReactNode) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() => root.render(ui));
}

function summary(): HTMLDivElement | null {
  return container.querySelector<HTMLDivElement>("[data-error-summary]");
}

describe("ErrorSummary (T062)", () => {
  it("renders a clear heading and a deterministic ordered list of errors", () => {
    render(
      <ErrorSummary
        errors={[
          { id: "a", message: "Enter your name.", targetId: "name-input" },
          {
            id: "b",
            message: "Choose a PDF or DOCX file.",
            targetId: "file-input",
          },
        ]}
      />,
    );
    const element = summary()!;
    expect(element.getAttribute("role")).toBe("alert");
    expect(element.textContent).toContain("There is a problem");
    const links = Array.from(element.querySelectorAll("a"));
    expect(links.map((link) => link.textContent)).toEqual([
      "Enter your name.",
      "Choose a PDF or DOCX file.",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#name-input",
      "#file-input",
    ]);
  });

  it("deduplicates identical errors and preserves first-seen order", () => {
    const input: readonly ErrorSummaryItem[] = [
      { id: "name", message: "Enter your name.", targetId: "name-input" },
      { id: "file", message: "Choose a PDF or DOCX file." },
      { id: "name", message: "Enter your name.", targetId: "name-input" },
      { id: "file", message: "Choose a PDF or DOCX file." },
    ];
    const normalized = normalizeErrorSummaryItems(input);
    expect(normalized).toEqual([
      { id: "name", message: "Enter your name.", targetId: "name-input" },
      { id: "file", message: "Choose a PDF or DOCX file." },
    ]);
    expect(normalizeErrorSummaryItems(input)).toEqual(normalized);
  });

  it("drops errors with internal codes, paths, or raw diagnostics", () => {
    expect(toPublicErrorText("ERR_401 /private/codex/session=abc")).toBe(
      undefined,
    );
    render(
      <ErrorSummary
        errors={[
          {
            id: "technical",
            message: "ERR_401 /private/codex/session=abc",
            targetId: "field",
          },
          { id: "plain", message: "The file could not be imported." },
        ]}
      />,
    );
    expect(summary()?.textContent).not.toContain("ERR_401");
    expect(summary()?.textContent).not.toContain("private");
    expect(summary()?.textContent).not.toContain("codex");
    expect(summary()?.textContent).toContain("The file could not be imported.");
  });

  it("does not render empty markup when there are no errors", () => {
    render(<ErrorSummary errors={[]} />);
    expect(summary()).toBeNull();
    render(
      <ErrorSummary
        errors={[
          {
            id: "technical",
            message: "ERR_401 /private/codex/session=abc",
          },
        ]}
      />,
    );
    expect(summary()).toBeNull();
  });

  it("focuses the summary after a failed submit", () => {
    function SubmitHarness() {
      const [errors, setErrors] = useState<readonly ErrorSummaryItem[]>([]);
      const summaryRef = useRef<HTMLDivElement>(null);
      const submittedRef = useRef(false);
      function handleSubmit(event: FormEvent) {
        event.preventDefault();
        submittedRef.current = true;
        setErrors([
          {
            id: "name",
            message: "Enter your name.",
            targetId: "name-input",
          },
        ]);
      }
      useEffect(() => {
        if (submittedRef.current) {
          focusErrorSummary(summaryRef.current);
        }
      }, [errors]);
      return (
        <form onSubmit={handleSubmit} noValidate>
          <ErrorSummary ref={summaryRef} errors={errors} />
          <input id="name-input" />
          <button type="submit">Submit</button>
        </form>
      );
    }
    render(<SubmitHarness />);
    act(() => {
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click();
    });
    expect(document.activeElement).toBe(summary());
  });

  it("links field-level errors to their intended controls", () => {
    render(
      <div>
        <ErrorSummary
          errors={[
            {
              id: "email",
              message: "Enter a valid email address.",
              targetId: "email-input",
              fieldLabel: "Email",
            },
          ]}
        />
        <input id="email-input" />
      </div>,
    );
    const link = summary()!.querySelector("a")!;
    expect(link.textContent).toBe("Email: Enter a valid email address.");
    act(() => link.click());
    expect(document.activeElement).toBe(document.getElementById("email-input"));
  });

  it("supports generic non-field processing errors without links", () => {
    render(
      <ErrorSummary
        errors={[
          {
            id: "processing",
            message:
              "Your resume could not be prepared. You can try again or enter the information manually.",
          },
        ]}
      />,
    );
    expect(summary()?.querySelector("a")).toBeNull();
    expect(summary()?.textContent).toContain("try again");
  });

  it("supports provider-neutral recovery errors", () => {
    render(
      <ErrorSummary
        errors={[
          {
            id: "provider",
            message:
              "The AI provider is temporarily unavailable. You can try again or continue with limited extraction.",
          },
        ]}
      />,
    );
    expect(summary()?.textContent).toContain("AI provider");
    expect(summary()?.textContent).toContain("limited extraction");
  });

  it("never contains provider names, model names, or technical wording", () => {
    render(
      <ErrorSummary
        errors={[
          {
            id: "provider",
            message:
              "The AI provider is temporarily unavailable. You can try again or continue with limited extraction.",
          },
        ]}
      />,
    );
    const text = summary()!.textContent!.toLowerCase();
    for (const term of [
      "codex",
      "openai",
      "model",
      "oauth",
      "token",
      "session",
    ]) {
      expect(text).not.toContain(term);
    }
  });

  it("does not steal focus on repeated state updates", () => {
    const errors: readonly ErrorSummaryItem[] = [
      { id: "name", message: "Enter your name.", targetId: "name-input" },
    ];
    render(
      <div>
        <ErrorSummary errors={errors} />
        <input id="name-input" />
        <input id="unrelated" />
      </div>,
    );
    const unrelated = document.getElementById("unrelated") as HTMLInputElement;
    act(() => unrelated.focus());
    render(
      <div>
        <ErrorSummary errors={[...errors]} />
        <input id="name-input" />
        <input id="unrelated" />
      </div>,
    );
    expect(document.activeElement).toBe(unrelated);
  });

  it("forwards navigation to the caller-provided handler", () => {
    const onNavigate = vi.fn();
    render(
      <ErrorSummary
        errors={[
          {
            id: "name",
            message: "Enter your name.",
            targetId: "name-input",
          },
        ]}
        onNavigateToTarget={onNavigate}
      />,
    );
    act(() => summary()!.querySelector("a")!.click());
    expect(onNavigate).toHaveBeenCalledWith("name-input");
  });
});
