import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogs, en, type MessageKey } from "./messages";
import { direction, isAppLocale, resolveAppLocale, translate } from "./locale";

afterEach(() => vi.unstubAllEnvs());

describe("application locale", () => {
  it.each([
    [undefined, undefined, "en"],
    ["es", "ar,fr;q=0.8", "es"],
    ["invalid", "fr-CA;q=0.4,ar;q=0.9", "ar"],
    [undefined, "de,es-MX;q=0.8", "es"],
    [undefined, "ar;q=0,fr;q=0.2", "fr"],
    [undefined, "ar;q=bogus,en;q=0.1", "en"],
    [undefined, "zh-CN,fr;q=0.1", "zh-CN"],
    [undefined, "zh-TW,fr;q=0.1", "fr"],
    ["__proto__", "xx", "en"],
  ])(
    "resolves preference %s and browser %s to %s",
    (preference, browser, expected) => {
      expect(resolveAppLocale(preference, browser)).toBe(expected);
    },
  );

  it("rejects untrusted cookie values and isolates direction", () => {
    expect(isAppLocale("<script>")).toBe(false);
    expect(isAppLocale("constructor")).toBe(false);
    expect(direction("ar")).toBe("rtl");
    expect(direction("fr")).toBe("ltr");
  });

  it("requires exactly the English keys and nonempty copy in every catalog", () => {
    for (const messages of Object.values(catalogs)) {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      for (const value of Object.values(messages))
        expect(value.trim()).not.toBe("");
    }
  });

  it("detects missing keys in test and falls back in production", () => {
    const key = "missing.key" as MessageKey;
    expect(() => translate("fr", key)).toThrow(
      "Missing application translation",
    );
    vi.stubEnv("NODE_ENV", "production");
    expect(translate("fr", key)).toBe("missing.key");
    const original = catalogs.fr["shell.home"];
    try {
      catalogs.fr["shell.home"] = "";
      expect(translate("fr", "shell.home")).toBe("Home");
    } finally {
      catalogs.fr["shell.home"] = original;
    }
  });
});
