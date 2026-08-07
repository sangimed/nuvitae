"use client";

import { useEffect, useRef } from "react";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary, focusNextLogicalHeading } from "./focus-management";
import { ProviderRecoveryActions } from "./ProviderRecoveryActions";

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
  const sectionRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const previousStatusRef = useRef<string | undefined>(undefined);
  const heading = headingFor(status);
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
      className="import-card"
      aria-labelledby="processing-title"
      ref={sectionRef}
    >
      <p className="eyebrow">Import status</p>
      <h1 id="processing-title">{heading}</h1>
      {failureStatuses.has(status.status) ? (
        <ErrorSummary
          ref={summaryRef}
          heading="There is a problem"
          errors={
            [
              {
                id: "import-failure",
                message: status.failure?.userMessage ?? status.userMessage,
              },
            ] as const
          }
        />
      ) : (
        <p>{body}</p>
      )}
      {status.status === "processing" ? (
        <p>
          Current step: {labelForStep(status.currentStep)}
          {status.progressKnown && status.progressPercent !== undefined
            ? `, ${status.progressPercent}% complete`
            : ""}
        </p>
      ) : null}
      {props.connectivityMessage === undefined ? null : (
        <p className="message">{props.connectivityMessage}</p>
      )}

      {status.draftSummary === undefined ? null : (
        <dl className="status-list compact">
          <div>
            <dt>Draft fields</dt>
            <dd>{status.draftSummary.fieldCount}</dd>
          </div>
          <div>
            <dt>Needs attention</dt>
            <dd>{status.draftSummary.warningCount}</dd>
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
            Review imported resume
          </button>
          <a href={`/import-resume/${status.importId}/review`}>
            Open review page
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
            <ProviderRecoveryActions
              state="provider_unavailable"
              recoveryActions={["manual_entry"]}
              alternativeProviderAvailable={false}
              onManualEntry={props.onManualEntry}
            />
          ) : null}
          {status.allowedRecoveryActions.includes("replace_upload") ? (
            <p className="message">
              If you upload a replacement, the previous import is not deleted
              here and remains subject to its original retention deadline.
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
                  Upload a different file
                </button>
              ) : null}
              {status.allowedRecoveryActions.includes("manual_entry") ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={props.onManualEntry}
                >
                  Enter manually
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function headingFor(status: PublicImportStatusResponse): string {
  switch (status.status) {
    case "processing":
      return "Preparing your resume for review";
    case "draft_ready":
      return "Your resume draft is ready";
    case "partial_extraction":
      return "Your resume draft is ready with notes";
    case "recoverable_timeout":
      return "This is taking longer than expected";
    case "validation_failure":
      return "This file cannot be imported";
    case "terminal_processing_failure":
      return "This resume could not be prepared";
    case "authentication_required":
      return "Sign in required";
    case "connectivity_lost":
      return "Connection temporarily lost";
    case "not_found":
      return "Import unavailable";
    case "expired":
      return "Import expired";
    case "cancelled":
      return "Import stopped";
  }
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
