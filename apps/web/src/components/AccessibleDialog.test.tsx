// @vitest-environment jsdom

import { act, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessibleDialog,
  type AccessibleDialogFocusTarget,
} from "./AccessibleDialog";

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
  vi.restoreAllMocks();
});

function render(ui: ReactNode) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() => root.render(ui));
}

function pressKey(element: Element, key: string, shiftKey = false) {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

interface HarnessProps {
  readonly initialOpen?: boolean;
  readonly label?: string;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly closeOnEscape?: boolean;
  readonly closeOnBackdropClick?: boolean;
  readonly modal?: boolean;
  readonly initialFocus?: AccessibleDialogFocusTarget;
  readonly destructive?: boolean;
  readonly onClose?: () => void;
  readonly children?: ReactNode;
}

function DialogHarness(props: HarnessProps) {
  const [open, setOpen] = useState(props.initialOpen ?? false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <button type="button">Outside control</button>
      <h2 id="dialog-title">Dialog title</h2>
      <p id="dialog-description">Dialog description</p>
      <AccessibleDialog
        open={open}
        onClose={() => {
          props.onClose?.();
          setOpen(false);
        }}
        label={props.label}
        labelledBy={props.labelledBy}
        describedBy={props.describedBy}
        closeOnEscape={props.closeOnEscape}
        closeOnBackdropClick={props.closeOnBackdropClick}
        modal={props.modal}
        initialFocus={props.initialFocus}
        destructive={props.destructive}
      >
        <button type="button">First action</button>
        <div>
          <input aria-label="Nested input" />
        </div>
        <button type="button">Last action</button>
        {props.children}
      </AccessibleDialog>
    </div>
  );
}

function dialogElement(): HTMLDivElement | null {
  return container.querySelector<HTMLDivElement>('[role="dialog"]');
}

describe("AccessibleDialog (T060)", () => {
  it("renders an opened modal dialog with dialog semantics", () => {
    render(<DialogHarness initialOpen label="Confirm deletion" />);
    const dialog = dialogElement();
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Confirm deletion");
  });

  it("does not render anything when closed", () => {
    render(<DialogHarness label="Confirm deletion" />);
    expect(dialogElement()).toBeNull();
    expect(container.textContent).not.toContain("First action");
  });

  it("moves focus into the dialog on open with deterministic default initial focus", () => {
    render(<DialogHarness initialOpen label="Confirm deletion" />);
    const dialog = dialogElement()!;
    expect(document.activeElement).toBe(
      dialog.querySelector<HTMLButtonElement>("button"),
    );
    expect(dialog.querySelector<HTMLButtonElement>("button")?.textContent).toBe(
      "First action",
    );
  });

  it("honors a configurable initial focus target", () => {
    const initialFocusRef: RefObject<HTMLInputElement | null> = {
      current: null,
    };
    render(
      <DialogHarness
        initialOpen
        label="Confirm deletion"
        initialFocus={initialFocusRef}
      >
        <input ref={initialFocusRef} aria-label="Custom initial focus" />
      </DialogHarness>,
    );
    expect(document.activeElement).toBe(initialFocusRef.current);
    expect(initialFocusRef.current?.getAttribute("aria-label")).toBe(
      "Custom initial focus",
    );
  });

  it("keeps Tab inside the dialog and follows DOM order including nested controls", () => {
    render(<DialogHarness initialOpen label="Confirm deletion" />);
    const dialog = dialogElement()!;
    const first = dialog.querySelector<HTMLButtonElement>("button")!;
    const nested = dialog.querySelector<HTMLInputElement>("input")!;
    const last = dialog.querySelectorAll<HTMLButtonElement>("button")[1]!;

    first.focus();
    pressKey(dialog, "Tab");
    expect(document.activeElement).toBe(nested);
    pressKey(dialog, "Tab");
    expect(document.activeElement).toBe(last);
    pressKey(dialog, "Tab");
    expect(document.activeElement).toBe(first);
  });

  it("supports reverse tab order", () => {
    render(<DialogHarness initialOpen label="Confirm deletion" />);
    const dialog = dialogElement()!;
    const first = dialog.querySelector<HTMLButtonElement>("button")!;
    const last = dialog.querySelectorAll<HTMLButtonElement>("button")[1]!;

    first.focus();
    pressKey(dialog, "Tab", true);
    expect(document.activeElement).toBe(last);
    pressKey(dialog, "Tab", true);
    expect(document.activeElement).toBe(dialog.querySelector("input"));
  });

  it("returns focus into the dialog when it escapes to background content", () => {
    render(<DialogHarness initialOpen label="Confirm deletion" />);
    const outside = container.querySelectorAll<HTMLButtonElement>(
      'button[type="button"]',
    )[1]!;
    act(() => outside.focus());
    const dialog = dialogElement()!;
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and restores focus to the triggering control", () => {
    const onClose = vi.fn();
    render(<DialogHarness label="Confirm deletion" onClose={onClose} />);
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[type="button"]',
    )!;
    act(() => {
      trigger.focus();
      trigger.click();
    });
    expect(dialogElement()).not.toBeNull();
    pressKey(dialogElement()!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogElement()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not close on Escape when Escape closing is disallowed", () => {
    const onClose = vi.fn();
    render(
      <DialogHarness
        initialOpen
        label="Confirm deletion"
        closeOnEscape={false}
        onClose={onClose}
      />,
    );
    pressKey(dialogElement()!, "Escape");
    expect(onClose).not.toHaveBeenCalled();
    expect(dialogElement()).not.toBeNull();
  });

  it("keeps the dialog open in non-dismissible mode", () => {
    const onClose = vi.fn();
    render(
      <DialogHarness
        initialOpen
        label="Confirm deletion"
        closeOnEscape={false}
        closeOnBackdropClick={false}
        onClose={onClose}
      />,
    );
    pressKey(dialogElement()!, "Escape");
    act(() => {
      container
        .querySelector<HTMLDivElement>("[data-dialog-backdrop]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(dialogElement()).not.toBeNull();
  });

  it("closes on backdrop click only when explicitly enabled and only for the backdrop", () => {
    const onClose = vi.fn();
    render(
      <DialogHarness
        initialOpen
        label="Confirm deletion"
        closeOnBackdropClick
        onClose={onClose}
      />,
    );
    act(() => {
      dialogElement()?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      container
        .querySelector<HTMLDivElement>("[data-dialog-backdrop]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialogElement()).toBeNull();
  });

  it("exposes the accessible name through labelledby and an optional description", () => {
    render(
      <DialogHarness
        initialOpen
        labelledBy="dialog-title"
        describedBy="dialog-description"
      />,
    );
    const dialog = dialogElement()!;
    expect(dialog.getAttribute("aria-labelledby")).toBe("dialog-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("dialog-description");
  });

  it("marks destructive dialogs with visible text, not color alone", () => {
    render(<DialogHarness initialOpen label="Discard import" destructive />);
    expect(container.textContent).toContain("Destructive action");
    expect(container.querySelector("[data-destructive-marker]")).not.toBeNull();
  });

  it("does not render the destructive marker for non-destructive dialogs", () => {
    render(<DialogHarness initialOpen label="Retry import" />);
    expect(container.textContent).not.toContain("Destructive action");
  });

  it("does not trap focus when modal is false", () => {
    render(<DialogHarness initialOpen label="Panel" modal={false} />);
    const dialog = dialogElement()!;
    const last = container.querySelectorAll<HTMLButtonElement>(
      'button[type="button"]',
    )[2]!;
    last.focus();
    pressKey(dialog, "Tab");
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(document.activeElement).toBe(last);
  });

  it("restores focus safely when the original trigger no longer exists", () => {
    render(<DialogHarness label="Confirm deletion" />);
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[type="button"]',
    )!;
    act(() => trigger.click());
    expect(dialogElement()).not.toBeNull();
    act(() => trigger.remove());
    expect(() => pressKey(dialogElement()!, "Escape")).not.toThrow();
    expect(dialogElement()).toBeNull();
  });

  it("warns in development when no accessible name is provided", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(<DialogHarness initialOpen />);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Provide an accessible name"),
    );
  });
});
