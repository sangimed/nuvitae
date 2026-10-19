"use client";

import type { ReviewWarning as ReviewWarningContract } from "@nuvitae/contracts";
import { useTranslation } from "../../i18n/LocaleProvider";

export function ReviewWarning(props: {
  readonly warning: ReviewWarningContract;
  readonly pending: boolean;
  readonly onResolve: (
    resolution: "confirmed" | "edited" | "excluded" | "intentionally_left",
  ) => void;
}) {
  const warning = props.warning;
  const { t } = useTranslation();
  return (
    <article
      className={warningTone(warning)}
      aria-labelledby={`${warning.warningId}-title`}
    >
      <h3 id={`${warning.warningId}-title`}>{warningTitle(warning, t)}</h3>
      <p>{warningMessage(warning, t)}</p>
      {warning.fieldPath === undefined ? null : (
        <p className="review-warning-context">{t("review.warning.context")}</p>
      )}
      {warning.reviewStatus === "needs_review" ? (
        <WarningActions {...props} />
      ) : (
        <p>
          {t("review.warning.state")} {stateLabel(warning.reviewStatus, t)}
        </p>
      )}
    </article>
  );
}

function WarningActions(props: {
  readonly warning: ReviewWarningContract;
  readonly pending: boolean;
  readonly onResolve: (
    resolution: "confirmed" | "edited" | "excluded" | "intentionally_left",
  ) => void;
}) {
  const { t } = useTranslation();
  if (isUnsafeExtraction(props.warning)) {
    return (
      <div className="action-row">
        <button
          type="button"
          disabled={props.pending}
          onClick={() => props.onResolve("intentionally_left")}
        >
          {t("review.warning.leaveOut")}
        </button>
      </div>
    );
  }
  return (
    <div className="action-row">
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("confirmed")}
      >
        {t("review.warning.confirm")}
      </button>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("edited")}
      >
        {t("review.warning.edit")}
      </button>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("excluded")}
      >
        {t("review.warning.exclude")}
      </button>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("intentionally_left")}
      >
        {t("review.warning.leaveOut")}
      </button>
    </div>
  );
}

function warningTitle(
  warning: ReviewWarningContract,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (isUnsafeExtraction(warning)) return t("review.warning.unsafe.title");
  if (warning.warningType === "missing")
    return t("review.warning.missing.title");
  if (warning.warningType === "ambiguous")
    return t("review.warning.ambiguous.title");
  return t("review.warning.default.title");
}

function warningMessage(
  warning: ReviewWarningContract,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (warning.warningType) {
    case "missing":
      return t("review.warning.missing.message");
    case "ambiguous":
      return t("review.warning.message.ambiguous");
    case "conflicting":
      return t("review.warning.message.conflicting");
    case "duplicate":
      return t("review.warning.message.duplicate");
    case "low_confidence":
      return t("review.warning.message.lowConfidence");
    case "inferred":
      return t("review.warning.message.inferred");
    case "mixed_content":
      return t("review.warning.message.mixedContent");
    case "expired_source":
      return t("review.warning.message.expiredSource");
    case "unsupported":
    case "unsafe":
    case "incomplete":
    case "partial":
      return t("review.warning.unsafe.message");
    default:
      return t("review.warning.message.default");
  }
}

function warningTone(warning: ReviewWarningContract): string {
  return isUnsafeExtraction(warning)
    ? "review-warning review-warning-recovery"
    : "review-warning";
}

function isUnsafeExtraction(warning: ReviewWarningContract): boolean {
  return (
    warning.warningType === "unsupported" ||
    warning.warningType === "unsafe" ||
    warning.warningType === "partial" ||
    warning.warningType === "incomplete"
  );
}

function stateLabel(
  state: ReviewWarningContract["reviewStatus"],
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (state) {
    case "needs_review":
      return t("review.warning.status.needsReview");
    case "confirmed":
      return t("review.warning.status.confirmed");
    case "edited":
      return t("review.warning.status.edited");
    case "excluded":
      return t("review.warning.status.excluded");
    case "intentionally_left":
      return t("review.warning.status.intentionallyLeft");
  }
}
