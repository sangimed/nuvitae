"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { direction, isAppLocale, localeCookie, translate } from "./locale";
import { localeNames, type AppLocale, type MessageKey } from "./messages";

const LocaleContext = createContext<{
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}>({ locale: "en", setLocale: () => {} });

export function LocaleProvider({
  initialLocale,
  children,
}: {
  readonly initialLocale: AppLocale;
  readonly children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  function setLocale(next: AppLocale) {
    if (!isAppLocale(next)) return;
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = next;
    document.documentElement.dir = direction(next);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", translate(next, "metadata.description"));
    updateLocale(next);
  }
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useTranslation() {
  const { locale } = useContext(LocaleContext);
  return { locale, t: (key: MessageKey) => translate(locale, key) };
}

export function LanguageSelector() {
  const { locale, setLocale } = useContext(LocaleContext);
  const [changed, setChanged] = useState(false);
  return (
    <div className="application-language">
      <label>
        {translate(locale, "shell.language")}
        <select
          value={locale}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (isAppLocale(next)) {
              setLocale(next);
              setChanged(true);
            }
          }}
        >
          {Object.entries(localeNames).map(([value, name]) => (
            <option key={value} value={value} lang={value} dir="auto">
              {name}
            </option>
          ))}
        </select>
      </label>
      <span className="visually-hidden" role="status">
        {changed ? translate(locale, "shell.changed") : ""}
      </span>
    </div>
  );
}
