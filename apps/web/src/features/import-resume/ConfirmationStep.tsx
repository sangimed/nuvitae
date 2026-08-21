"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewDraftReadResponse } from "@nuvitae/contracts";
import { AccessibleDialog } from "../../components/AccessibleDialog";
import {
  confirmStructuredResume,
  createConfirmationOperationId,
  createConfirmationRequest,
} from "./client";
import {
  createDiscardOperationId,
  createDiscardRequest,
  discardImportDraft,
} from "./client";
import { actionableReviewItems } from "./actionable-review-items";
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

  const actionableItems = actionableReviewItems(props.draft);
  const readyForConfirmation =
    props.draft.readyToConfirm && actionableItems.length === 0;

  async function runConfirmation() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setMessage("Creating your resume.");
    const outcome = await confirmStructuredResume({
      importId: props.importId,
      request: createConfirmationRequest({
        operationId: createConfirmationOperationId(),
        expectedReviewRevision: props.draft.reviewRevision,
      }),
    });
    setPending(false);
    if (outcome.ok) {
      setMessage("Your resume is ready.");
      setDialog(undefined);
      props.onConfirmed(outcome.response.resumeUrl, "Your resume is ready.");
      return;
    }
    if (outcome.category === "stale_review") {
      await props.onStaleReview();
      setError("Your review has changed. We reloaded the latest information.");
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
      <h2 id="confirmation-title">Finish your review</h2>
      <div role="status" aria-live="polite" aria-atomic="true">
        {pending ? message : message}
      </div>
      {readyForConfirmation ? (
        <div className="message message-success">
          <p>
            This creates a new resume from the valid information you have kept.
            Changes use your edited values. You do not have to confirm every
            imported field individually for it to be included. Your uploaded
            file stays separate and is available temporarily.
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
            Create my resume
          </button>
        </div>
      ) : (
        <div className="message" aria-labelledby="blocked-confirmation-title">
          <h3 id="blocked-confirmation-title">Review remaining details</h3>
          <p>
            {actionableItems.length === 1
              ? "1 detail still needs your attention."
              : `${actionableItems.length} details still need your attention.`}{" "}
            Review these items before creating your resume.
          </p>
          <div className="action-row">
            {actionableItems.map((item) => (
              <a key={item.key} href={item.href}>
                Review {item.label}
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
        label={dialog === "confirm" ? "Create your resume" : "Discard import"}
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
              {dialog === "confirm" ? "Create your resume" : "Discard import"}
            </h3>
            <p id={`${dialog}-dialog-description`}>
              {dialog === "confirm"
                ? "Nuvitae will create your resume. Your uploaded file will not change and remains available until its original expiry date."
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
                    ? "Create resume"
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
