// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  LanguageSelector,
  LocaleProvider,
  useTranslation,
} from "./LocaleProvider";
import { localeCookie, resolveAppLocale } from "./locale";

afterEach(() => vi.unstubAllGlobals());

function Draft() {
  const [value, setValue] = useState("مهندسة — Paris — 中文");
  const { t } = useTranslation();
  return (
    <>
      <h1>{t("home.title")}</h1>
      <input
        aria-label="Resume content"
        dir="auto"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  );
}

it("switches in place, preserves unsaved content and persists only the locale", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <LocaleProvider initialLocale="en">
          <LanguageSelector />
          <Draft />
        </LocaleProvider>,
      ),
    );
    const input = container.querySelector("input")!;
    const select = container.querySelector("select")!;
    const change = async (locale: string) => {
      await act(async () => {
        select.value = locale;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await change("fr");
    expect(container.querySelector("h1")?.textContent).toBe(
      "Créez un CV que vous serez fier d’envoyer.",
    );
    await change("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("مهندسة — Paris — 中文");
    expect(input.dir).toBe("auto");
    expect(document.cookie).toContain(`${localeCookie}=ar`);
    expect(document.cookie).not.toContain("Paris");
    expect(
      resolveAppLocale(
        document.cookie.split(`${localeCookie}=`)[1]?.split(";")[0],
        "en",
      ),
    ).toBe("ar");
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "تم تغيير لغة التطبيق. لم تتغير سيرتك الذاتية.",
    );
    await change("en");
    expect(document.documentElement.dir).toBe("ltr");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(["fr", "ar"] as const)(
  "hydrates %s without replacing server content",
  async (locale) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const view = (
      <LocaleProvider initialLocale={locale}>
        <LanguageSelector />
        <Draft />
      </LocaleProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(view);
    const before = container.querySelector("h1");
    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, view, { onRecoverableError });
    await act(async () => {});
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector("h1")).toBe(before);
    await act(async () => root.unmount());
  },
);
