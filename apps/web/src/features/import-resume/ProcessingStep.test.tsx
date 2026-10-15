// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import { ProcessingStep } from "./ProcessingStep";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const importId = "22222222-2222-4222-8222-222222222222";

function statusResponse(
  status: PublicImportStatusResponse["status"],
  overrides: Partial<PublicImportStatusResponse> = {},
): PublicImportStatusResponse {
  return {
    version: "2026-07-28",
    requestId: "11111111-1111-4111-8111-111111111111",
    importId,
    status,
    progressKnown: false,
    allowedRecoveryActions: ["replace_upload", "manual_entry"],
    userMessage: "Status update.",
    ...(status === "processing" ? { currentStep: "checking_document" } : {}),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | undefined;
const onManualEntry = vi.fn();
const onReplaceUpload = vi.fn();

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

function renderProcessing(status: PublicImportStatusResponse) {
  if (root === undefined) {
    root = createRoot(container);
  }
  act(() =>
    root.render(
      <ProcessingStep
        status={status}
        onManualEntry={onManualEntry}
        onReplaceUpload={onReplaceUpload}
      />,
    ),
  );
}

function summary(): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-error-summary]");
}

describe("ProcessingStep error summary and recovery (T063)", () => {
  it("focuses the error summary when a validation failure arrives", () => {
    renderProcessing(
      statusResponse("validation_failure", {
        failure: {
          code: "malformed_or_corrupted",
          retryable: true,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage:
            "This file could not be accepted. Choose a PDF or DOCX resume that follows the upload guidance.",
        },
        userMessage:
          "This file could not be accepted. Choose another file or enter your resume manually.",
      }),
    );
    expect(summary()).not.toBeNull();
    expect(summary()?.textContent).toContain("This file could not be accepted");
    expect(document.activeElement).toBe(summary());
    expect(container.textContent).not.toContain("malformed_or_corrupted");
    expect(container.textContent).not.toContain("diagnostic");
  });

  it("offers only supported recovery actions for a recoverable timeout", () => {
    renderProcessing(
      statusResponse("recoverable_timeout", {
        failure: {
          code: "processing_timeout",
          retryable: true,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage: "Reading this resume took longer than expected.",
        },
        allowedRecoveryActions: ["replace_upload", "manual_entry"],
      }),
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Upload a different file",
      "Enter manually",
    ]);
    expect(container.textContent).not.toContain("Try again");
    expect(container.textContent).not.toContain("Cancel");
  });

  it("shows visible processing progress without fabricating percentages", () => {
    renderProcessing(
      statusResponse("processing", {
        currentStep: "reading_content",
        progressKnown: false,
      }),
    );
    expect(container.textContent).toContain(
      "Current step: reading the content",
    );
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(
      container
        .querySelector(".import-loading-visual")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      container
        .querySelector("[data-loading-message]")
        ?.getAttribute("aria-live"),
    ).toBe("off");
    expect(container.textContent).not.toContain("percent");
    expect(summary()).toBeNull();

    act(() =>
      root?.render(
        <ProcessingStep
          status={statusResponse("processing", {
            currentStep: "organizing_resume_sections",
            progressKnown: true,
            progressPercent: 42,
          })}
          onManualEntry={onManualEntry}
          onReplaceUpload={onReplaceUpload}
        />,
      ),
    );
    expect(container.textContent).toContain(
      "Current step: organizing resume sections",
    );
    expect(container.textContent).not.toContain("42");
  });

  it("removes playful loading content as soon as a failure arrives", () => {
    renderProcessing(
      statusResponse("processing", { currentStep: "reading_content" }),
    );
    expect(container.querySelector("[data-loading-message]")).not.toBeNull();

    renderProcessing(
      statusResponse("terminal_processing_failure", {
        failure: {
          code: "unexpected_processing_failure",
          retryable: false,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage: "This resume could not be prepared.",
        },
      }),
    );

    expect(container.querySelector("[data-loading-message]")).toBeNull();
    expect(container.querySelector(".import-loading-visual")).toBeNull();
    expect(container.querySelector("section")?.hasAttribute("aria-busy")).toBe(
      false,
    );
    expect(summary()?.textContent).toContain(
      "This resume could not be prepared.",
    );
    expect(document.activeElement).toBe(summary());
  });

  it("does not duplicate the authoritative live region", () => {
    renderProcessing(statusResponse("processing"));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
  });
});
