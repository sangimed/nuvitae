"use client";

import Link from "next/link";
import { useTranslation } from "../../i18n/LocaleProvider";

export function CreateResumeEntry(props: {
  readonly onChooseImport: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="import-card" aria-labelledby="import-entry-title">
      <p className="eyebrow">{t("import.entry.eyebrow")}</p>
      <h1 id="import-entry-title">{t("import.entry.title")}</h1>
      <p className="lead">{t("import.entry.description")}</p>

      <div className="choice-grid" aria-label={t("import.entry.choices")}>
        <article className="choice-card choice-card-primary">
          <p className="badge">{t("import.entry.recommendedPath")}</p>
          <h2>{t("import.entry.importTitle")}</h2>
          <p>{t("import.entry.importDescription")}</p>
          <button
            className="primary-action"
            type="button"
            onClick={props.onChooseImport}
          >
            {t("import.entry.importAction")}
          </button>
        </article>

        <article className="choice-card">
          <h2>{t("import.entry.manualTitle")}</h2>
          <p>{t("import.entry.manualDescription")}</p>
          <Link className="secondary-action" href="/resumes/new/manual">
            {t("import.entry.manualAction")}
          </Link>
        </article>
      </div>
    </section>
  );
}
