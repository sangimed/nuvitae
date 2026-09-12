"use client";

import { ButtonLink, Panel, ProgressSteps } from "./community";
import { CommunityFunnelBeacon } from "./CommunityFunnelBeacon";
import { useTranslation } from "../i18n/LocaleProvider";
import { direction } from "../i18n/locale";

export function HomeOnboarding({
  localPlayMode,
}: {
  readonly localPlayMode: boolean;
}) {
  const { t, locale } = useTranslation();

  return (
    <main className="onboarding-shell" lang={locale} dir={direction(locale)}>
      <CommunityFunnelBeacon />
      <section className="onboarding-intro" aria-labelledby="page-title">
        <p className="eyebrow">{t("home.eyebrow")}</p>
        <h1 id="page-title">{t("home.title")}</h1>
        <p className="onboarding-lede">{t("home.lede")}</p>
        {localPlayMode ? (
          <div className="local-banner" role="status" lang="en" dir="ltr">
            Local play mode uses one development identity. Data is stored in
            local Docker volumes and this is not production authentication.
          </div>
        ) : null}
        {!localPlayMode ? (
          <p className="onboarding-sign-in-note">{t("home.signIn")}</p>
        ) : null}
      </section>

      <section className="onboarding-choices" aria-label={t("home.choices")}>
        <Panel className="onboarding-choice onboarding-choice-featured">
          <p className="onboarding-choice-kicker">{t("home.recommended")}</p>
          <h2>{t("home.importTitle")}</h2>
          <p>{t("home.importDescription")}</p>
          <ButtonLink href="/import-resume">
            {t("home.importAction")}
          </ButtonLink>
        </Panel>
        <Panel className="onboarding-choice">
          <p className="onboarding-choice-kicker">{t("home.fresh")}</p>
          <h2>{t("home.createTitle")}</h2>
          <p>{t("home.createDescription")}</p>
          <ButtonLink href="/resumes/new/manual" variant="secondary">
            {t("home.createAction")}
          </ButtonLink>
        </Panel>
      </section>

      <section
        className="onboarding-next"
        aria-labelledby="onboarding-next-title"
      >
        <h2 id="onboarding-next-title">{t("home.path")}</h2>
        <ProgressSteps
          label={t("home.path")}
          steps={[
            { label: t("home.details"), status: "current" },
            { label: t("home.review"), status: "upcoming" },
            { label: t("home.export"), status: "upcoming" },
          ]}
        />
        <p>{t("home.privacy")}</p>
      </section>
    </main>
  );
}
