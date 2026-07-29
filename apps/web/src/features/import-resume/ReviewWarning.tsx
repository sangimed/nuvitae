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
      className="review-warning"
      aria-labelledby={`${warning.warningId}-title`}
    >
      <h3 id={`${warning.warningId}-title`}>
        {warningTypeLabel(warning.warningType)}
      </h3>
      <p>{warning.message}</p>
      <p>
        Severity: {severityLabel(warning.severity)}. Review state:{" "}
        {stateLabel(warning.reviewStatus)}.
      </p>
      {warning.fieldPath === undefined ? null : (
        <p>Related field: {warning.fieldPath}</p>
      )}
      {warning.reviewStatus === "needs_review" ? (
        <div className="action-row">
          <button
            type="button"
            disabled={props.pending}
            onClick={() => props.onResolve("confirmed")}
          >
            Confirm warning
          </button>
          <button
            type="button"
            disabled={props.pending}
            onClick={() => props.onResolve("edited")}
          >
            Mark edited
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
            Intentionally leave
          </button>
        </div>
      ) : (
        <p>This warning is {stateLabel(warning.reviewStatus)}.</p>
      )}
    </article>
  );
}

function warningTypeLabel(type: ReviewWarningContract["warningType"]): string {
  return type.replaceAll("_", " ");
}

function severityLabel(severity: ReviewWarningContract["severity"]): string {
  switch (severity) {
    case "info":
      return "information";
    case "needs_attention":
      return "needs attention";
    case "blocking":
      return "must be addressed";
  }
}

function stateLabel(state: ReviewWarningContract["reviewStatus"]): string {
  return state.replaceAll("_", " ");
}
