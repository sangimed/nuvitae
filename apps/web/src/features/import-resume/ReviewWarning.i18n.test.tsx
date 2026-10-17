// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ReviewWarning as WarningContract } from "@nuvitae/contracts";
import { LanguageSelector, LocaleProvider } from "../../i18n/LocaleProvider";
import { ReviewWarning } from "./ReviewWarning";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const warning: WarningContract = {
  warningId: "11111111-1111-4111-8111-111111111111",
  warningType: "ambiguous",
  section: "summary",
  message: "Source message: keep this byte-for-byte.",
  severity: "needs_attention",
  reviewStatus: "needs_review",
  requiresResolution: true,
  allowedActions: ["confirm", "edit", "exclude", "intentionally_leave"],
};

it("switches warning controls between French and Arabic while preserving API text", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onResolve = vi.fn();
  act(() =>
    root.render(
      <LocaleProvider initialLocale="fr">
        <LanguageSelector />
        <ReviewWarning
          warning={warning}
          pending={false}
          onResolve={onResolve}
        />
      </LocaleProvider>,
    ),
  );
  expect(container.textContent).toContain(
    "Choisissez comment utiliser ces informations",
  );
  expect(container.textContent).toContain(warning.message);
  const selector = container.querySelector("select")!;
  act(() => {
    selector.value = "ar";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(document.documentElement.dir).toBe("rtl");
  expect(container.textContent).toContain("اختر كيفية استخدام هذه المعلومات");
  expect(container.textContent).toContain(warning.message);
  const confirm = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "تأكيد",
  )!;
  act(() => confirm.click());
  expect(onResolve).toHaveBeenCalledWith("confirmed");
  act(() => root.unmount());
  container.remove();
});

afterEach(() => vi.unstubAllGlobals());
