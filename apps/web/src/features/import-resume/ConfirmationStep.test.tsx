// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewDraftReadResponse } from "@nuvitae/contracts";
import { ConfirmationStep } from "./ConfirmationStep";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  confirmStructuredResume: vi.fn(),
  discardImportDraft: vi.fn(),
}));

vi.mock("../../services/import-resume/confirmation-client", () => ({
  confirmStructuredResume: mocks.confirmStructuredResume,
  createConfirmationOperationId: () => "operation-confirm",
  createConfirmationRequest: (input: unknown) => input,
}));
vi.mock("../../services/import-resume/draft-lifecycle-client", () => ({
  discardImportDraft: mocks.discardImportDraft,
  createDiscardOperationId: () => "operation-discard",
  createDiscardRequest: (input: unknown) => input,
}));

const importId = "22222222-2222-4222-8222-222222222222";

const draft: ReviewDraftReadResponse = {
  version: "2026-07-28",
  requestId: "11111111-1111-4111-8111-111111111111",
  status: "review_draft",
  importId,
  draftId: "33333333-3333-4333-8333-333333333333",
  draftStatus: "ready_to_confirm",
  reviewRevision: 1,
  retentionExpiresAt: "2026-08-05T09:30:00.000Z",
  sections: [],
  activeFieldCount: 1,
  unresolvedWarningCount: 0,
  readyToConfirm: true,
  userMessage: "Review the imported information.",
};

let container: HTMLDivElement;
let root: Root | undefined;
const onConfirmed = vi.fn();
const onDiscarded = vi.fn();
const onStaleReview = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.clearAllMocks();
  mocks.confirmStructuredResume.mockReset();
  mocks.discardImportDraft.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function renderStep() {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() =>
    root.render(
      <ConfirmationStep
        importId={importId}
        draft={draft}
        disabled={false}
        onConfirmed={onConfirmed}
        onDiscarded={onDiscarded}
        onStaleReview={onStaleReview}
      />,
    ),
  );
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.includes(name),
  );
  expect(found, `button ${name}`).toBeDefined();
  return found as HTMLButtonElement;
}

function dialog(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"]');
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

describe("ConfirmationStep accessible dialogs (T063)", () => {
  it("opens the confirm dialog with accessible semantics and deterministic initial focus", () => {
    renderStep();
    act(() => button("Create structured resume").click());
    const node = dialog();
    expect(node).not.toBeNull();
    expect(node?.getAttribute("role")).toBe("dialog");
    expect(node?.getAttribute("aria-modal")).toBe("true");
    expect(node?.getAttribute("aria-label")).toBe("Confirm resume creation");
    expect(document.activeElement).toBe(button("Confirm and create resume"));
  });

  it("keeps Tab and Shift+Tab inside the confirm dialog", () => {
    renderStep();
    act(() => button("Create structured resume").click());
    expect(document.activeElement).toBe(button("Confirm and create resume"));
    pressKey(document.activeElement, "Tab");
    expect(document.activeElement).toBe(button("Cancel"));
    pressKey(document.activeElement, "Tab");
    expect(document.activeElement).toBe(button("Confirm and create resume"));
    pressKey(document.activeElement, "Tab", true);
    expect(document.activeElement).toBe(button("Cancel"));
  });

  it("returns focus into the dialog when focus escapes to background content", () => {
    renderStep();
    const trigger = button("Create structured resume");
    act(() => trigger.click());
    expect(dialog()).not.toBeNull();
    act(() => trigger.focus());
    expect(dialog()?.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and restores focus to the initiating control", () => {
    renderStep();
    const trigger = button("Create structured resume");
    act(() => {
      trigger.focus();
      trigger.click();
    });
    expect(dialog()).not.toBeNull();
    pressKey(document.activeElement, "Escape");
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not close on backdrop click for destructive discard dialogs", () => {
    renderStep();
    act(() => button("Discard import").click());
    expect(dialog()).not.toBeNull();
    act(() => {
      container
        .querySelector<HTMLElement>("[data-dialog-backdrop]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(dialog()).not.toBeNull();
  });

  it("expresses destructive intent in text for the discard dialog", () => {
    renderStep();
    act(() => button("Discard import").click());
    expect(container.textContent).toContain("Destructive action");
    expect(container.querySelector("[data-destructive-marker]")).not.toBeNull();
    expect(dialog()?.getAttribute("aria-label")).toBe("Discard import");
  });

  it("focuses an error summary when confirmation fails", async () => {
    mocks.confirmStructuredResume.mockResolvedValue({
      ok: false,
      category: "temporarily_unavailable",
      message: "Resume creation is temporarily unavailable.",
    });
    renderStep();
    act(() => button("Create structured resume").click());
    await act(async () => {
      button("Confirm and create resume").click();
    });
    const summary = container.querySelector("[data-error-summary]");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain(
      "Resume creation is temporarily unavailable.",
    );
    expect(document.activeElement).toBe(summary);
    expect(dialog()).not.toBeNull();
  });

  it("closes the dialog and reports success after confirmation", async () => {
    mocks.confirmStructuredResume.mockResolvedValue({
      ok: true,
      response: {
        resumeUrl: "/resumes/44444444-4444-4444-8444-444444444444",
        userMessage: "Your structured resume was created.",
      },
    });
    renderStep();
    act(() => button("Create structured resume").click());
    await act(async () => {
      button("Confirm and create resume").click();
    });
    expect(dialog()).toBeNull();
    expect(onConfirmed).toHaveBeenCalledWith(
      "/resumes/44444444-4444-4444-8444-444444444444",
      "Your structured resume was created.",
    );
  });
});
