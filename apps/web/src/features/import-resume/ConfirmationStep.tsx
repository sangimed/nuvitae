"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewDraftReadResponse } from "@nuvitae/contracts";
import { AccessibleDialog } from "../../components/AccessibleDialog";
import {
  confirmStructuredResume,
  createConfirmationOperationId,
  createConfirmationRequest,
  type ConfirmationClientErrorCategory,
} from "./client";
import {
  createDiscardOperationId,
  createDiscardRequest,
  discardImportDraft,
  type DraftLifecycleErrorCategory,
} from "./client";
import { actionableReviewItems } from "./actionable-review-items";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary } from "./focus-management";
import { useTranslation } from "../../i18n/LocaleProvider";

export function ConfirmationStep(props: {
  readonly importId: string;
  readonly draft: ReviewDraftReadResponse;
  readonly onConfirmed: (resumeUrl: string, message: string) => void;
  readonly onDiscarded: (message: string) => void;
  readonly onStaleReview: () => Promise<void>;
  readonly disabled: boolean;
}) {
  const { t } = useTranslation();
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
    setMessage(t("review.confirm.status.creating"));
    const outcome = await confirmStructuredResume({
      importId: props.importId,
      request: createConfirmationRequest({
        operationId: createConfirmationOperationId(),
        expectedReviewRevision: props.draft.reviewRevision,
      }),
    });
    setPending(false);
    if (outcome.ok) {
      setMessage(t("review.confirm.status.ready"));
      props.onConfirmed(
        outcome.response.resumeUrl,
        t("review.confirm.status.ready"),
      );
      return;
    }
    if (outcome.category === "stale_review") {
      await props.onStaleReview();
      setError(t("review.error.stale"));
    } else {
      setError(confirmationErrorMessage(outcome.category, t));
    }
  }

  async function runDiscard() {
    if (pending) return;
    setPending(true);
    setError(undefined);
    setMessage(t("review.confirm.status.discarding"));
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
      props.onDiscarded(t("review.confirm.discarded"));
      return;
    }
    setError(discardErrorMessage(outcome.category, t));
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
          ? t("review.confirm.title.ready")
          : t("review.confirm.title.remaining")}
      </h2>
      <div role="status" aria-live="polite" aria-atomic="true">
        {pending ? message : message}
      </div>
      {error === undefined ? null : (
        <ErrorSummary
          ref={errorRef}
          heading={t("review.confirm.error.heading")}
          errors={[{ id: "confirmation-error", message: error }]}
        />
      )}
      {readyForConfirmation ? (
        <div className="message message-success">
          <p>{t("review.confirm.ready.description")}</p>
          <button
            ref={actionRef}
            type="button"
            className="primary-action"
            disabled={props.disabled || pending}
            onClick={runConfirmation}
          >
            {pending
              ? t("review.confirm.creating")
              : t("review.confirm.create")}
          </button>
        </div>
      ) : (
        <div className="message" aria-labelledby="blocked-confirmation-title">
          <h3 id="blocked-confirmation-title">
            {t("review.confirm.remaining.heading")}
          </h3>
          <p>
            {actionableItems.length === 1
              ? t("review.confirm.remaining.one")
              : `${actionableItems.length} ${t("review.confirm.remaining.many")}`}{" "}
            {t("review.confirm.remaining.instruction")}
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
          {t("review.confirm.discard")}
        </button>
      </div>
      <AccessibleDialog
        open={discardDialogOpen}
        label={t("review.confirm.discard")}
        describedBy="discard-dialog-description"
        closeOnEscape
        closeOnBackdropClick={false}
        destructive
        destructiveLabel={t("review.confirm.destructive")}
        initialFocus={discardPrimaryRef}
        onClose={closeDialog}
      >
        {!discardDialogOpen ? null : (
          <>
            <h3 id="discard-dialog-title">{t("review.confirm.discard")}</h3>
            <p id="discard-dialog-description">
              {t("review.confirm.dialog.description")}
            </p>
            <div className="action-row">
              <button
                ref={discardPrimaryRef}
                type="button"
                className="secondary-button danger-action"
                disabled={pending}
                onClick={runDiscard}
              >
                {pending
                  ? t("review.confirm.working")
                  : t("review.confirm.discard")}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={closeDialog}
              >
                {t("review.confirm.cancel")}
              </button>
            </div>
          </>
        )}
      </AccessibleDialog>
    </section>
  );
}

function confirmationErrorMessage(
  category: ConfirmationClientErrorCategory,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (category) {
    case "authentication_required":
      return t("review.confirm.error.authentication");
    case "not_found":
      return t("review.confirm.error.notFound");
    case "draft_not_ready":
      return t("review.confirm.error.notReady");
    case "unresolved_warnings":
      return t("review.confirm.error.unresolved");
    case "no_user_confirmed_field":
      return t("review.confirm.error.noConfirmedField");
    case "reviewed_content_not_mappable":
      return t("review.confirm.error.content");
    case "stale_update":
      return t("review.confirm.error.staleUpdate");
    case "expired":
      return t("review.confirm.error.expired");
    case "concurrent_confirmation":
      return t("review.confirm.error.concurrent");
    case "temporarily_unavailable":
      return t("review.confirm.error.unavailable");
    case "cancelled":
      return t("review.confirm.error.cancelled");
    default:
      return t("review.confirm.error.generic");
  }
}

function discardErrorMessage(
  category: DraftLifecycleErrorCategory,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (category) {
    case "authentication_required":
      return t("review.confirm.error.authentication");
    case "not_found":
      return t("review.confirm.error.notFound");
    case "stale_review":
      return t("review.error.stale");
    case "expired":
      return t("review.confirm.error.expired");
    case "temporarily_unavailable":
      return t("review.confirm.error.unavailable");
    case "cancelled":
      return t("review.confirm.error.cancelled");
    default:
      return t("review.confirm.error.generic");
  }
}
