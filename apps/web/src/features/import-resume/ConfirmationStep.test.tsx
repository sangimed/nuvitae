// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ReviewDraftReadResponse,
  ReviewField,
  ReviewWarning,
} from "@nuvitae/contracts";
import { actionableReviewItems } from "./actionable-review-items";
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

function renderStep(currentDraft = draft) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() =>
    root.render(
      <ConfirmationStep
        importId={importId}
        draft={currentDraft}
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

function dialogButton(name: string): HTMLButtonElement {
  const found = Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent?.includes(name),
  );
  expect(found, `dialog button ${name}`).toBeDefined();
  return found as HTMLButtonElement;
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
  it("creates the resume directly without a redundant confirmation dialog", async () => {
    mocks.confirmStructuredResume.mockResolvedValue({
      ok: true,
      response: { resumeUrl: "/resumes/ready" },
    });
    renderStep();
    await act(async () => button("Create my resume").click());
    expect(mocks.confirmStructuredResume).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("keeps Tab and Shift+Tab inside the discard dialog", () => {
    renderStep();
    act(() => button("Discard import").click());
    expect(document.activeElement).toBe(dialogButton("Discard import"));
    pressKey(document.activeElement, "Tab");
    expect(document.activeElement).toBe(button("Cancel"));
    pressKey(document.activeElement, "Tab");
    expect(document.activeElement).toBe(dialogButton("Discard import"));
    pressKey(document.activeElement, "Tab", true);
    expect(document.activeElement).toBe(button("Cancel"));
  });

  it("returns focus into the dialog when focus escapes to background content", () => {
    renderStep();
    const trigger = button("Discard import");
    act(() => trigger.click());
    expect(dialog()).not.toBeNull();
    act(() => trigger.focus());
    expect(dialog()?.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and restores focus to the initiating control", () => {
    renderStep();
    const trigger = button("Discard import");
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
    await act(async () => {
      button("Create my resume").click();
    });
    const summary = container.querySelector("[data-error-summary]");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain(
      "Resume creation is temporarily unavailable.",
    );
    expect(document.activeElement).toBe(summary);
    expect(dialog()).toBeNull();
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
    await act(async () => {
      button("Create my resume").click();
    });
    expect(dialog()).toBeNull();
    expect(onConfirmed).toHaveBeenCalledWith(
      "/resumes/44444444-4444-4444-8444-444444444444",
      "Your resume is ready.",
    );
  });

  it("explains remaining review work without internal blocking language", () => {
    renderStep({
      ...draft,
      readyToConfirm: false,
      unresolvedWarningCount: 1,
      sections: [
        {
          section: "summary",
          label: "summary",
          fields: [],
          warnings: [
            {
              warningId: "44444444-4444-4444-8444-444444444444",
              warningType: "ambiguous",
              section: "summary",
              message: "Please review this detail.",
              severity: "needs_attention",
              reviewStatus: "needs_review",
              requiresResolution: true,
              allowedActions: [
                "confirm",
                "edit",
                "exclude",
                "intentionally_leave",
              ],
            },
          ],
          allowedActions: ["add", "exclude"],
        },
      ],
    });

    expect(container.textContent).toContain("Review remaining details");
    expect(container.textContent).toContain(
      "1 detail still needs your attention",
    );
    expect(container.textContent).not.toContain("Review Professional summary");
    expect(container.textContent).not.toContain("Confirmation is blocked");
    expect(container.textContent).not.toMatch(/needs_review|review_required/);
  });

  it("keeps an unconfirmed Category-B field visible when no warning remains", () => {
    const fieldId = "55555555-5555-4555-8555-555555555555";
    const field = reviewRequiredField(
      fieldId,
      "summary",
      "A grounded summary.",
    );
    const pendingDraft: ReviewDraftReadResponse = {
      ...draft,
      readyToConfirm: false,
      unresolvedWarningCount: 0,
      sections: [
        {
          section: "summary",
          label: "summary",
          fields: [field],
          warnings: [],
          allowedActions: ["add", "exclude"],
        },
      ],
    };

    renderStep(pendingDraft);

    expect(container.textContent).toContain(
      "1 detail still needs your attention",
    );
    expect(container.textContent).not.toContain("Review Professional summary");
    expect(container.textContent).not.toContain("Create my resume");
    expect(container.textContent).not.toContain(
      "Your imported information is ready",
    );
    expect(container.querySelector(`a[href="#${fieldId}-label"]`)).toBeNull();

    renderStep({
      ...pendingDraft,
      readyToConfirm: true,
      sections: [
        {
          ...pendingDraft.sections[0],
          fields: [
            {
              ...field,
              inferenceStatus: "confirmed_inference",
              reviewStatus: "confirmed",
            },
          ],
        },
      ],
    });

    expect(container.textContent).toContain(
      "All review details are complete. Continue to create your editable resume from the information you have kept and edited.",
    );
    expect(container.textContent).toContain("Your review is complete");
    expect(container.textContent).toContain("Create my resume");
    expect(container.textContent).not.toContain("Review remaining details");
  });

  it("counts the smallest mixed blocker matrix by persisted identity", () => {
    const fieldId = "55555555-5555-4555-8555-555555555555";
    const warningId = "66666666-6666-4666-8666-666666666666";
    const unrelatedWarningId = "77777777-7777-4777-8777-777777777777";
    const field = reviewRequiredField(
      fieldId,
      "summary",
      "A grounded summary.",
    );
    const warning = reviewWarning(warningId, "summary");
    const unrelatedWarning = reviewWarning(unrelatedWarningId, "headline");
    const withReviewState = (
      fields: ReviewField[],
      warnings: ReviewWarning[],
      readyToConfirm = false,
    ): ReviewDraftReadResponse => ({
      ...draft,
      readyToConfirm,
      unresolvedWarningCount: warnings.length,
      sections: [
        {
          section: "summary",
          label: "summary",
          fields,
          warnings,
          allowedActions: ["add", "exclude"],
        },
      ],
    });

    expect(actionableReviewItems(withReviewState([], [warning]))).toHaveLength(
      1,
    );
    expect(actionableReviewItems(withReviewState([field], []))).toHaveLength(1);
    expect(
      actionableReviewItems(
        withReviewState([{ ...field, inferenceStatus: "not_inferred" }], []),
      ),
    ).toHaveLength(0);
    expect(
      actionableReviewItems(
        withReviewState([{ ...field, warningIds: [warningId] }], [warning]),
      ),
    ).toHaveLength(1);
    expect(
      actionableReviewItems(withReviewState([field], [unrelatedWarning])),
    ).toHaveLength(2);
    expect(
      actionableReviewItems(
        withReviewState(
          [
            {
              ...field,
              inferenceStatus: "confirmed_inference",
              reviewStatus: "confirmed",
            },
          ],
          [{ ...warning, reviewStatus: "confirmed" }],
          true,
        ),
      ),
    ).toHaveLength(0);
  });
});

function reviewRequiredField(
  fieldId: string,
  fieldPath: string,
  value: string,
): ReviewField {
  return {
    fieldId,
    fieldPath,
    value: { kind: "text", value },
    sourceStatus: "inferred",
    confidenceStatus: "high",
    inferenceStatus: "inferred_needs_review",
    reviewStatus: "unreviewed",
    provenance: {
      kind: "inferred",
      needsConfirmation: true,
      original: { kind: "pdf", pageNumber: 1 },
    },
    warningIds: [],
    allowedActions: ["confirm", "edit", "remove"],
  };
}

function reviewWarning(warningId: string, fieldPath: string): ReviewWarning {
  return {
    warningId,
    warningType: "ambiguous",
    section: "summary",
    fieldPath,
    message: "Please review this detail.",
    severity: "needs_attention",
    reviewStatus: "needs_review",
    requiresResolution: true,
    allowedActions: ["confirm", "edit", "exclude", "intentionally_leave"],
  };
}
