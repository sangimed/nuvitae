"use client";

import type { ReviewWarning as ReviewWarningContract } from "@nuvitae/contracts";

export function ReviewWarning(props: {
  readonly warning: ReviewWarningContract;
  readonly pending: boolean;
  readonly onResolve: (
    resolution: "confirmed" | "edited" | "excluded" | "intentionally_left",
  ) => void;
}) {
  const warning = props.warning;
  return (
    <article
      className={warningTone(warning)}
      aria-labelledby={`${warning.warningId}-title`}
    >
      <h3 id={`${warning.warningId}-title`}>{warningTitle(warning)}</h3>
      <p>{warningMessage(warning)}</p>
      {warning.fieldPath === undefined ? null : (
        <p className="review-warning-context">
          This relates to imported information in this section.
        </p>
      )}
      {warning.reviewStatus === "needs_review" ? (
        <WarningActions {...props} />
      ) : (
        <p>This item is {stateLabel(warning.reviewStatus)}.</p>
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
  if (isUnsafeExtraction(props.warning)) {
    return (
      <div className="action-row">
        <button
          type="button"
          disabled={props.pending}
          onClick={() => props.onResolve("intentionally_left")}
        >
          Leave out for now
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
        Confirm
      </button>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("edited")}
      >
        Edit information
      </button>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("excluded")}
      >
        Exclude
      </button>
      <button
        type="button"
        disabled={props.pending}
        onClick={() => props.onResolve("intentionally_left")}
      >
        Leave out for now
      </button>
    </div>
  );
}

function warningTitle(warning: ReviewWarningContract): string {
  if (isUnsafeExtraction(warning)) return "Information not included";
  if (warning.warningType === "missing")
    return "Information to add or leave out";
  if (warning.warningType === "ambiguous")
    return "Please choose how to use this information";
  return "A quick review is needed";
}

function warningMessage(warning: ReviewWarningContract): string {
  if (isUnsafeExtraction(warning)) {
    return "Nuvitae could not safely use some information from your resume. It was left out; you can add it yourself if you want it included.";
  }
  if (warning.warningType === "missing") {
    return "This information was not added automatically. You can add it, or leave it out for now.";
  }
  return warning.message;
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

function stateLabel(state: ReviewWarningContract["reviewStatus"]): string {
  return state.replaceAll("_", " ");
}
