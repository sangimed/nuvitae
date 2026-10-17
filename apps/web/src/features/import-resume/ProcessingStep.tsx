"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import type { MessageKey } from "../../i18n/messages";
import { useTranslation } from "../../i18n/LocaleProvider";
import { direction, translate } from "../../i18n/locale";
import { RotatingLoadingMessage } from "../../components/community/RotatingLoadingMessage";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary, focusNextLogicalHeading } from "./focus-management";
import { ProviderRecoveryActions } from "./ProviderRecoveryActions";

const importLoadingMessageKeys = [
  "import.processing.loading.experience",
  "import.processing.loading.bullets",
  "import.processing.loading.surprises",
  "import.processing.loading.dates",
  "import.processing.loading.sections",
  "import.processing.loading.polishing",
] as const satisfies readonly MessageKey[];

const failureStatuses = new Set<PublicImportStatusResponse["status"]>([
  "recoverable_timeout",
  "validation_failure",
  "terminal_processing_failure",
  "authentication_required",
  "connectivity_lost",
  "not_found",
  "expired",
  "cancelled",
]);

const terminalStatuses = new Set<PublicImportStatusResponse["status"]>([
  "draft_ready",
  "partial_extraction",
  ...failureStatuses,
]);

export function ProcessingStep(props: {
  readonly status: PublicImportStatusResponse;
  readonly connectivityMessage?: string | undefined;
  readonly onManualEntry: () => void;
  readonly onReplaceUpload: () => void;
  readonly onReview?: (importId: string) => void;
}) {
  const status = props.status;
  const { locale, t } = useTranslation();
  const importLoadingMessages = useMemo(
    () => importLoadingMessageKeys.map((key) => translate(locale, key)),
    [locale],
  );
  const numberFormat = new Intl.NumberFormat(locale);
  const sectionRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const previousStatusRef = useRef<string | undefined>(undefined);
  const heading = t(`import.processing.heading.${status.status}`);
  const body = bodyFor(status);

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status.status;
    if (previous === status.status) return;
    if (failureStatuses.has(status.status)) {
      focusErrorSummary(summaryRef.current);
      return;
    }
    if (terminalStatuses.has(status.status)) {
      focusNextLogicalHeading(sectionRef.current);
    }
  }, [status.status]);

  return (
    <section
      className={`import-card${status.status === "processing" ? " import-processing-card" : ""}`}
      aria-labelledby="processing-title"
      aria-busy={status.status === "processing" || undefined}
      lang={locale}
      dir={direction(locale)}
      ref={sectionRef}
    >
      <p className="eyebrow">{t("import.processing.eyebrow")}</p>
      {status.status === "processing" ? <ImportLoadingVisual /> : null}
      <h1 id="processing-title">{heading}</h1>
      {failureStatuses.has(status.status) ? (
        <ErrorSummary
          ref={summaryRef}
          heading={t("import.processing.problem")}
          messagesLang="en"
          messagesDir="ltr"
          errors={
            [
              {
                id: "import-failure",
                message: status.failure?.userMessage ?? status.userMessage,
              },
            ] as const
          }
        />
      ) : status.status === "processing" ? (
        <>
          <RotatingLoadingMessage
            className="import-loading-message"
            messages={importLoadingMessages}
            longWaitMessage={t("import.processing.longWait")}
          />
          <p className="import-processing-detail" lang="en" dir="ltr">
            {body}
          </p>
        </>
      ) : (
        <p lang="en" dir="ltr">
          {body}
        </p>
      )}
      {status.status === "processing" ? (
        <p className="import-processing-stage">
          <span>{t("import.processingStep.current")} </span>
          <strong>{t(messageKeyForStep(status.currentStep))}</strong>
        </p>
      ) : null}
      {props.connectivityMessage === undefined ? null : (
        <p className="message" lang="en" dir="ltr">
          {props.connectivityMessage}
        </p>
      )}

      {status.draftSummary === undefined ? null : (
        <dl className="status-list compact">
          <div>
            <dt>{t("import.processing.draftFields")}</dt>
            <dd>{numberFormat.format(status.draftSummary.fieldCount)}</dd>
          </div>
          <div>
            <dt>{t("import.processing.needsAttention")}</dt>
            <dd>{numberFormat.format(status.draftSummary.warningCount)}</dd>
          </div>
        </dl>
      )}

      {status.status === "draft_ready" ||
      status.status === "partial_extraction" ? (
        <div className="action-row">
          <button
            type="button"
            className="primary-action"
            onClick={() => props.onReview?.(status.importId)}
          >
            {t("import.processing.review")}
          </button>
          <a href={`/import-resume/${status.importId}/review`}>
            {t("import.processing.openReview")}
          </a>
        </div>
      ) : null}

      {status.status === "recoverable_timeout" ||
      status.status === "validation_failure" ||
      status.status === "terminal_processing_failure" ||
      status.status === "expired" ||
      status.status === "cancelled" ||
      status.status === "not_found" ? (
        <>
          {status.failure?.code === "provider_unavailable" ? (
            <div lang="en" dir="ltr">
              <ProviderRecoveryActions
                state="provider_unavailable"
                recoveryActions={["manual_entry"]}
                alternativeProviderAvailable={false}
                onManualEntry={props.onManualEntry}
              />
            </div>
          ) : null}
          {status.allowedRecoveryActions.includes("replace_upload") ? (
            <p className="message">
              {t("import.processing.replacementNotice")}
            </p>
          ) : null}
          {status.failure?.code === "provider_unavailable" ? null : (
            <div className="action-row">
              {status.allowedRecoveryActions.includes("replace_upload") ? (
                <button
                  type="button"
                  className="primary-action"
                  onClick={props.onReplaceUpload}
                >
                  {t("import.processing.replaceUpload")}
                </button>
              ) : null}
              {status.allowedRecoveryActions.includes("manual_entry") ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={props.onManualEntry}
                >
                  {t("import.entry.manualAction")}
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function ImportLoadingVisual() {
  return (
    <div className="import-loading-visual" aria-hidden="true">
      <div className="import-loading-document">
        <span className="import-loading-avatar" />
        <span className="import-loading-line import-loading-line-heading" />
        <span className="import-loading-line" />
        <span className="import-loading-line import-loading-line-short" />
        <span className="import-loading-line" />
      </div>
      <span className="import-loading-orbit" />
    </div>
  );
}

function bodyFor(status: PublicImportStatusResponse): string {
  if (status.status === "processing") return status.userMessage;
  return status.failure?.userMessage ?? status.userMessage;
}

export function labelForStep(
  step: PublicImportStatusResponse["currentStep"],
): string {
  switch (step) {
    case "checking_document":
      return "checking the document";
    case "reading_content":
      return "reading the content";
    case "organizing_resume_sections":
      return "organizing resume sections";
    case "preparing_review":
      return "preparing review";
    default:
      return "checking the document";
  }
}

export function messageKeyForStep(
  step: PublicImportStatusResponse["currentStep"],
): MessageKey {
  switch (step) {
    case "checking_document":
      return "import.processingStep.checkingDocument";
    case "reading_content":
      return "import.processingStep.readingContent";
    case "organizing_resume_sections":
      return "import.processingStep.organizingResumeSections";
    case "preparing_review":
      return "import.processingStep.preparingReview";
    default:
      return "import.processingStep.checkingDocument";
  }
}
