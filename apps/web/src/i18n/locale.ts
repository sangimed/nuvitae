import {
  catalogs,
  en,
  exportMessages,
  type AppLocale,
  type MessageKey,
} from "./messages";

export const localeCookie = "nuvitae-app-locale";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && Object.hasOwn(catalogs, value);
}

export function direction(locale: AppLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** Explicit preference wins; negotiate supported browser languages by quality. */
export function resolveAppLocale(
  preference?: string,
  acceptLanguage?: string | null,
): AppLocale {
  if (isAppLocale(preference)) return preference;
  const candidates = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [tag = "", ...parameters] = entry.trim().split(";");
      const quality = parameters.find((value) => value.trim().startsWith("q="));
      return {
        tag: tag.toLowerCase(),
        quality: quality === undefined ? 1 : Number(quality.trim().slice(2)),
      };
    })
    .filter(({ quality }) => quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality);
  for (const { tag } of candidates) {
    // Do not silently substitute simplified Chinese for traditional Chinese.
    if (["zh", "zh-cn", "zh-sg", "zh-hans"].includes(tag)) return "zh-CN";
    const base = tag.split("-")[0];
    if (isAppLocale(base)) return base;
  }
  return "en";
}

export function translate(locale: AppLocale, key: MessageKey): string {
  const translated =
    key in exportMessages.en
      ? exportMessages[locale][key as keyof typeof exportMessages.en]
      : catalogs[locale][key as keyof typeof en];
  if (translated) return translated;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(`Missing application translation: ${locale}:${key}`);
  }
  return (
    (key in exportMessages.en
      ? exportMessages.en[key as keyof typeof exportMessages.en]
      : en[key as keyof typeof en]) ?? key
  );
}
