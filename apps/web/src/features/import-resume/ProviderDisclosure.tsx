"use client";

import { useTranslation } from "../../i18n/LocaleProvider";

/**
 * T175/T213 - Codex requirement and provider-use disclosure.
 *
 * Plain-language disclosure shown on the upload step before Codex-backed
 * processing starts. It never exposes implementation details.
 */
export function ProviderDisclosure() {
  const { t } = useTranslation();
  return (
    <div className="guidance-panel" aria-labelledby="provider-disclosure-title">
      <h2 id="provider-disclosure-title">{t("import.provider.title")}</h2>
      <ul>
        <li>{t("import.provider.connection")}</li>
        <li>{t("import.provider.access")}</li>
        <li>{t("import.provider.review")}</li>
        <li>{t("import.provider.verification")}</li>
        <li>{t("import.provider.fallback")}</li>
      </ul>
    </div>
  );
}
