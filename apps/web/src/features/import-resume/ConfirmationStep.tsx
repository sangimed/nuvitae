"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewDraftReadResponse } from "@nuvitae/contracts";
import { AccessibleDialog } from "../../components/AccessibleDialog";
import {
  confirmStructuredResume,
  createConfirmationOperationId,
  createConfirmationRequest,
} from "../../services/import-resume/confirmation-client";
import {
  createDiscardOperationId,
  createDiscardRequest,
  discardImportDraft,
} from "../../services/import-resume/draft-lifecycle-client";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary } from "./focus-management";

export function ConfirmationStep(props: {
  readonly importId: string;
  readonly draft: ReviewDraftReadResponse;
  readonly onConfirmed: (resumeUrl: string, message: string) => void;
  readonly onDiscarded: (message: string) => void;
  readonly onStaleReview: () => Promise<void>;
  readonly disabled: boolean;
}) {
  const [dialog, setDialog] = useState<"confirm" | "discard" | undefined>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const actionRef = useRef<HTMLButtonElement | null>(null);
  const confirmPrimaryRef = useRef<HTMLButtonElement | null>(null);
  const discardPrimaryRef = useRef<HTMLButtonElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const previousErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (error !== undefined && error !== previousErrorRef.current) {
      focusErrorSummary(errorRef.current);
    }
    previousErrorRef.current = error;
  }, [error]);

  const unresolvedSections = props.draft.sections.filter((section) =>
    section.warnings.some((warning) => warning.reviewStatus === "needs_review"),
  );

  async function runConfirmation() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setMessage("Creating structured resume.");
    const outcome = await confirmStructuredResume({
      importId: props.importId,
      request: createConfirmationRequest({
        operationId: createConfirmationOperationId(),
        expectedReviewRevision: props.draft.reviewRevision,
      }),
    });
    setPending(false);
    if (outcome.ok) {
      setMessage("Structured resume created.");
      setDialog(undefined);
      props.onConfirmed(
        outcome.response.resumeUrl,
        outcome.response.userMessage,
      );
      return;
    }
    if (outcome.category === "stale_review") {
      await props.onStaleReview();
      setError("The review changed. Current server data has been reloaded.");
    } else {
      setError(outcome.message);
    }
  }

  async function runDiscard() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setMessage("Scheduling source cleanup.");
    const outcome = await discardImportDraft({
      importId: props.importId,
      request: createDiscardRequest({
        operationId: createDiscardOperationId(),
        expectedReviewRevision: props.draft.reviewRevision,
      }),
    });
    setPending(false);
    if (outcome.ok) {
      setDialog(undefined);
      props.onDiscarded(outcome.response.userMessage);
      return;
    }
    setError(outcome.message);
  }

  function closeDialog() {
    setDialog(undefined);
    setError(undefined);
  }

  return (
    <section
      className="confirmation-panel"
      aria-labelledby="confirmation-title"
    >
      <h2 id="confirmation-title">Create structured resume</h2>
      <div role="status" aria-live="polite" aria-atomic="true">
        {pending ? message : message}
      </div>
      {props.draft.readyToConfirm ? (
        <div className="message message-success">
          <p>
            This creates a new structured resume from every valid imported field
            that you have not excluded. Edited fields use their edited values;
            fields do not need individual confirmation clicks to be retained.
            The uploaded source remains separate and temporary.
          </p>
          <p>
            Original upload retention ends{" "}
            {formatDate(props.draft.retentionExpiresAt)}. Confirmation does not
            extend that deadline.
          </p>
          <button
            ref={actionRef}
            type="button"
            className="primary-action"
            disabled={props.disabled || pending}
            onClick={() => setDialog("confirm")}
          >
            Create structured resume
          </button>
        </div>
      ) : (
        <div className="message" aria-labelledby="blocked-confirmation-title">
          <h3 id="blocked-confirmation-title">Confirmation is blocked</h3>
          <p>
            {props.draft.unresolvedWarningCount} warning
            {props.draft.unresolvedWarningCount === 1 ? "" : "s"} still need
            review. Resolve the blocking review items before creating a resume.
          </p>
          <div className="action-row">
            {unresolvedSections.map((section) => (
              <a
                key={section.section}
                href={`#${section.section}-review-heading`}
              >
                Review {section.label}
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="action-row">
        <button
          type="button"
          className="secondary-button danger-action"
          disabled={props.disabled || pending}
          onClick={() => setDialog("discard")}
        >
          Discard import
        </button>
      </div>
      <AccessibleDialog
        open={dialog !== undefined}
        label={
          dialog === "confirm" ? "Confirm resume creation" : "Discard import"
        }
        describedBy={`${dialog ?? "dialog"}-dialog-description`}
        closeOnEscape
        closeOnBackdropClick={false}
        destructive={dialog === "discard"}
        initialFocus={
          dialog === "confirm" ? confirmPrimaryRef : discardPrimaryRef
        }
        onClose={closeDialog}
      >
        {dialog === undefined ? null : (
          <>
            <h3 id={`${dialog}-dialog-title`}>
              {dialog === "confirm"
                ? "Confirm resume creation"
                : "Discard import"}
            </h3>
            <p id={`${dialog}-dialog-description`}>
              {dialog === "confirm"
                ? "Nuvitae will create a new structured resume. The uploaded source and temporary artifacts are not modified and keep their original retention deadline."
                : "Nuvitae will discard this unconfirmed draft and schedule source cleanup. Deletion is not complete immediately, and an already confirmed resume would not be deleted by this action."}
            </p>
            <ErrorSummary
              ref={errorRef}
              heading="The action could not be completed"
              errors={
                error === undefined
                  ? []
                  : [
                      {
                        id: "confirmation-error",
                        message: error,
                      },
                    ]
              }
            />
            <div className="action-row">
              <button
                ref={
                  dialog === "confirm" ? confirmPrimaryRef : discardPrimaryRef
                }
                type="button"
                className={
                  dialog === "confirm"
                    ? "primary-action"
                    : "secondary-button danger-action"
                }
                disabled={pending}
                onClick={dialog === "confirm" ? runConfirmation : runDiscard}
              >
                {pending
                  ? "Working"
                  : dialog === "confirm"
                    ? "Confirm and create resume"
                    : "Discard import"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={closeDialog}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </AccessibleDialog>
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
