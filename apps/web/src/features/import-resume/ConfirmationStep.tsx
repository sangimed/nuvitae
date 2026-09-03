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
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const actionRef = useRef<HTMLButtonElement | null>(null);
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
      setDiscardDialogOpen(false);
      props.onDiscarded(outcome.response.userMessage);
      return;
    }
    setError(outcome.message);
  }

  function closeDialog() {
    setDiscardDialogOpen(false);
    setError(undefined);
  }

  return (
    <section
      className="confirmation-panel"
      aria-labelledby="confirmation-title"
    >
      <h2 id="confirmation-title">
        {readyForConfirmation
          ? "Your review is complete"
          : "Finish your review"}
      </h2>
      <div role="status" aria-live="polite" aria-atomic="true">
        {pending ? message : message}
      </div>
      {error === undefined ? null : (
        <ErrorSummary
          ref={errorRef}
          heading="The action could not be completed"
          errors={[{ id: "confirmation-error", message: error }]}
        />
      )}
      {readyForConfirmation ? (
        <div className="message message-success">
          <p>
            All review details are complete. Continue to create your editable
            resume from the information you have kept and edited.
          </p>
          <button
            ref={actionRef}
            type="button"
            className="primary-action"
            disabled={props.disabled || pending}
            onClick={runConfirmation}
          >
            {pending ? "Creating your resume…" : "Create my resume"}
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
        </div>
      )}
      <div className="action-row">
        <button
          type="button"
          className="secondary-button danger-action"
          disabled={props.disabled || pending}
          onClick={() => setDiscardDialogOpen(true)}
        >
          Discard import
        </button>
      </div>
      <AccessibleDialog
        open={discardDialogOpen}
        label="Discard import"
        describedBy="discard-dialog-description"
        closeOnEscape
        closeOnBackdropClick={false}
        destructive
        initialFocus={discardPrimaryRef}
        onClose={closeDialog}
      >
        {!discardDialogOpen ? null : (
          <>
            <h3 id="discard-dialog-title">Discard import</h3>
            <p id="discard-dialog-description">
              Nuvitae will discard this unconfirmed draft and schedule source
              cleanup. Deletion is not complete immediately, and an already
              confirmed resume would not be deleted by this action.
            </p>
            <div className="action-row">
              <button
                ref={discardPrimaryRef}
                type="button"
                className="secondary-button danger-action"
                disabled={pending}
                onClick={runDiscard}
              >
                {pending ? "Working" : "Discard import"}
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
