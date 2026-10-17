// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import { ProcessingStep } from "./ProcessingStep";
import { LanguageSelector, LocaleProvider } from "../../i18n/LocaleProvider";
import type { AppLocale } from "../../i18n/messages";

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
  vi.useRealTimers();
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

describe("localized processing screen", () => {
  function renderLocalized(
    status: PublicImportStatusResponse,
    locale: AppLocale,
  ) {
    root = createRoot(container);
    act(() =>
      root?.render(
        <LocaleProvider initialLocale={locale}>
          <LanguageSelector />
          <ProcessingStep
            status={status}
            onManualEntry={onManualEntry}
            onReplaceUpload={onReplaceUpload}
          />
        </LocaleProvider>,
      ),
    );
  }

  it("switches French processing copy to Arabic in place without stealing focus", () => {
    renderLocalized(statusResponse("processing"), "fr");
    expect(container.querySelector("h1")?.textContent).toBe(
      "Préparation de votre CV pour la vérification",
    );
    expect(container.querySelector("[data-loading-message]")?.textContent).toBe(
      "Un dernier regard sur votre expérience…",
    );
    const select = container.querySelector("select")!;
    select.focus();
    act(() => {
      select.value = "ar";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("h1")?.textContent).toBe(
      "جارٍ تحضير سيرتك الذاتية للمراجعة",
    );
    expect(container.querySelector("section")?.lang).toBe("ar");
    expect(container.querySelector("section")?.dir).toBe("rtl");
    expect(document.activeElement).toBe(select);
    expect(container.querySelector(".import-processing-detail")?.lang).toBe(
      "en",
    );
    expect(container.querySelector(".import-processing-detail")?.dir).toBe(
      "ltr",
    );
    expect(
      container.querySelector(".import-processing-detail")?.textContent,
    ).toBe("Status update.");
  });

  it.each(["fr", "ar"] as const)(
    "formats draft counts and preserves review navigation in %s",
    (locale) => {
      const onReview = vi.fn();
      root = createRoot(container);
      act(() =>
        root?.render(
          <LocaleProvider initialLocale={locale}>
            <ProcessingStep
              status={statusResponse("draft_ready", {
                draftSummary: {
                  draftId: "33333333-3333-4333-8333-333333333333",
                  retentionExpiresAt: "2026-10-24T00:00:00.000Z",
                  fieldCount: 1234,
                  warningCount: 2,
                },
              })}
              onManualEntry={onManualEntry}
              onReplaceUpload={onReplaceUpload}
              onReview={onReview}
            />
          </LocaleProvider>,
        ),
      );
      expect(container.querySelector("dd")?.textContent).toBe(
        new Intl.NumberFormat(locale).format(1234),
      );
      expect(container.querySelector("a")?.getAttribute("href")).toBe(
        `/import-resume/${importId}/review`,
      );
      act(() => container.querySelector("button")?.click());
      expect(onReview).toHaveBeenCalledWith(importId);
      expect(container.querySelector("h1")?.textContent).not.toContain(
        "Your resume",
      );
    },
  );

  it("localizes recovery actions and marks the safe backend error as English", () => {
    renderLocalized(
      statusResponse("validation_failure", {
        failure: {
          code: "malformed_or_corrupted",
          retryable: true,
          recoveryActions: ["replace_upload", "manual_entry"],
          userMessage: "This file could not be accepted.",
        },
      }),
      "ar",
    );
    expect(summary()?.querySelector("ul")?.lang).toBe("en");
    expect(summary()?.querySelector("ul")?.dir).toBe("ltr");
    expect(summary()?.querySelector("h2")?.textContent).toBe("حدثت مشكلة");
    expect(document.activeElement).toBe(summary());
    expect(container.querySelector("h1")?.textContent).toBe(
      "لا يمكن استيراد هذا الملف",
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "رفع ملف آخر",
      "إدخال يدويًا",
    ]);
    act(() => buttons[0]?.click());
    act(() => buttons[1]?.click());
    expect(onReplaceUpload).toHaveBeenCalledOnce();
    expect(onManualEntry).toHaveBeenCalledOnce();
  });

  it("keeps the loading timer running across status polls and translates the long wait", () => {
    vi.useFakeTimers();
    renderLocalized(statusResponse("processing"), "fr");
    act(() => vi.advanceTimersByTime(30_000));
    act(() =>
      root?.render(
        <LocaleProvider initialLocale="fr">
          <LanguageSelector />
          <ProcessingStep
            status={statusResponse("processing", {
              currentStep: "reading_content",
            })}
            onManualEntry={onManualEntry}
            onReplaceUpload={onReplaceUpload}
          />
        </LocaleProvider>,
      ),
    );
    act(() => vi.advanceTimersByTime(15_000));
    expect(container.querySelector("[data-loading-message]")?.textContent).toBe(
      "Cela prend un peu plus de temps. Nous continuons à afficher la dernière étape du traitement.",
    );
    expect(
      container
        .querySelector("[data-loading-message]")
        ?.getAttribute("aria-live"),
    ).toBe("off");
  });

  it.each(["fr", "ar"] as const)(
    "hydrates the %s status screen without replacing its markup",
    async (locale) => {
      const view = (
        <LocaleProvider initialLocale={locale}>
          <ProcessingStep
            status={statusResponse("processing")}
            onManualEntry={onManualEntry}
            onReplaceUpload={onReplaceUpload}
          />
        </LocaleProvider>
      );
      container.innerHTML = renderToString(view);
      const heading = container.querySelector("h1");
      const onRecoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(container, view, { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector("h1")).toBe(heading);
    },
  );
});
