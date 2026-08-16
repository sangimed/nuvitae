"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ReviewDraftReadResponse,
  ReviewField,
  ReviewMutationAction,
} from "@nuvitae/contracts";
import {
  createReviewMutationRequest,
  createReviewOperationId,
  projectOptimisticReview,
  readReviewDraft,
  sendReviewMutation,
} from "../../services/import-resume/review-client";
import { ConfirmationStep } from "./ConfirmationStep";
import { ErrorSummary } from "./ErrorSummary";
import { FieldProvenance } from "./FieldProvenance";
import {
  focusErrorSummary,
  focusNextLogicalHeading,
  focusTarget,
} from "./focus-management";
import { ReviewWarning } from "./ReviewWarning";
import { formatReviewDate, formatReviewDateRange } from "./review-date";
import { recordImportTiming } from "../../services/import-resume/import-timing-client";

export function ReviewStep(props: { readonly importId: string }) {
  const [draft, setDraft] = useState<ReviewDraftReadResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [finalized, setFinalized] = useState<
    | {
        readonly kind: "confirmed";
        readonly resumeUrl: string;
        readonly message: string;
      }
    | { readonly kind: "discarded"; readonly message: string }
    | undefined
  >();
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const finalizedRef = useRef<HTMLDivElement | null>(null);
  const previousErrorRef = useRef<string | undefined>(undefined);
  const renderedTimingRef = useRef(false);

  useEffect(() => {
    if (draft === undefined || renderedTimingRef.current) return;
    renderedTimingRef.current = true;
    recordImportTiming({
      importId: props.importId,
      phase: "review_rendered",
    });
  }, [draft, props.importId]);

  useEffect(() => {
    if (finalized !== undefined) {
      focusTarget(finalizedRef.current);
    }
  }, [finalized]);

  useEffect(() => {
    if (error !== undefined && error !== previousErrorRef.current) {
      focusErrorSummary(summaryRef.current);
    }
    previousErrorRef.current = error;
  }, [error]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void readReviewDraft({
      importId: props.importId,
      signal: controller.signal,
    }).then((outcome) => {
      setLoading(false);
      if (outcome.ok) {
        setDraft(outcome.response);
        setMessage(outcome.response.userMessage);
        setError(undefined);
      } else if (outcome.category !== "cancelled") {
        setError(outcome.message);
      }
    });
    return () => controller.abort();
  }, [props.importId]);

  async function refreshDraft() {
    const refreshed = await readReviewDraft({ importId: props.importId });
    if (refreshed.ok) setDraft(refreshed.response);
  }

  async function mutate(action: ReviewMutationAction) {
    if (draft === undefined || pending) return;
    const snapshot = draft;
    setPending(true);
    setError(undefined);
    setMessage("Saving review change.");
    setDraft(projectOptimisticReview(draft, action));
    const request = createReviewMutationRequest({
      operationId: createReviewOperationId(),
      expectedReviewRevision: draft.reviewRevision,
      action,
    });
    const outcome = await sendReviewMutation({
      importId: props.importId,
      request,
    });
    setPending(false);
    if (outcome.ok) {
      setDraft(outcome.response.draft);
      setMessage(outcome.response.userMessage);
      focusNextLogicalHeading(shellRef.current);
      return;
    }
    setDraft(snapshot);
    if (outcome.category === "stale_review") {
      const refreshed = await readReviewDraft({ importId: props.importId });
      if (refreshed.ok) setDraft(refreshed.response);
      setError("The review changed. Current server data has been reloaded.");
    } else {
      setError(outcome.message);
    }
  }

  if (loading) {
    return (
      <section className="import-card" aria-busy="true">
        <h1>Loading import review</h1>
        <p role="status">Loading the private review draft.</p>
      </section>
    );
  }

  if (draft === undefined) {
    return (
      <section className="import-card" aria-labelledby="review-error-title">
        <h1 id="review-error-title">Review unavailable</h1>
        <ErrorSummary
          ref={summaryRef}
          errors={[
            {
              id: "review-load-error",
              message: error ?? "This import is not ready for review yet.",
            },
          ]}
        />
      </section>
    );
  }

  return (
    <section
      className="review-shell"
      aria-labelledby="review-title"
      ref={shellRef}
    >
      <p className="eyebrow">Import review</p>
      <h1 id="review-title">Review imported resume</h1>
      <div
        ref={liveRef}
        tabIndex={-1}
        className="status-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pending ? "Saving review change." : message}
      </div>
      {finalized === undefined ? null : finalized.kind === "confirmed" ? (
        <div
          ref={finalizedRef}
          className="message message-success"
          role="status"
          tabIndex={-1}
        >
          {finalized.message}{" "}
          <a href={finalized.resumeUrl}>Open structured resume</a>
        </div>
      ) : (
        <div
          ref={finalizedRef}
          className="message message-success"
          role="status"
          tabIndex={-1}
        >
          <p>{finalized.message}</p>
          <div className="action-row">
            <a href="/import-resume">Start a new import</a>
            <a href="/resumes/new/manual">Continue manually</a>
          </div>
        </div>
      )}
      {error === undefined ? null : (
        <ErrorSummary
          ref={summaryRef}
          heading="The review change could not be saved"
          errors={[
            {
              id: "review-error",
              message: error,
            },
          ]}
        />
      )}

      <dl className="status-list compact">
        <div>
          <dt>Active fields</dt>
          <dd>{draft.activeFieldCount}</dd>
        </div>
        <div>
          <dt>Needs review</dt>
          <dd>{draft.unresolvedWarningCount}</dd>
        </div>
        <div>
          <dt>Review revision</dt>
          <dd>{draft.reviewRevision}</dd>
        </div>
      </dl>

      <ConfirmationStep
        importId={props.importId}
        draft={draft}
        disabled={pending || finalized !== undefined}
        onConfirmed={(resumeUrl, userMessage) => {
          setFinalized({ kind: "confirmed", resumeUrl, message: userMessage });
          setPending(false);
          window.history.replaceState(null, "", resumeUrl);
        }}
        onDiscarded={(userMessage) => {
          setFinalized({ kind: "discarded", message: userMessage });
          setPending(false);
        }}
        onStaleReview={refreshDraft}
      />

      {draft.sections.map((section) => (
        <section
          className="review-section"
          key={section.section}
          aria-labelledby={`${section.section}-review-heading`}
        >
          <h2 id={`${section.section}-review-heading`}>{section.label}</h2>
          {section.fields.length === 0 ? (
            <p>No imported information is active in this section.</p>
          ) : null}
          {section.fields.map((field) => (
            <ReviewFieldRow
              key={field.fieldId}
              field={field}
              pending={pending || finalized !== undefined}
              onAction={mutate}
            />
          ))}
          {section.warnings.map((warning) => (
            <ReviewWarning
              key={warning.warningId}
              warning={warning}
              pending={pending || finalized !== undefined}
              onResolve={(resolution) =>
                mutate({
                  type: "resolve_warning",
                  warningId: warning.warningId,
                  resolution,
                })
              }
            />
          ))}
          <div className="action-row">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                mutate({
                  type: "add_field",
                  section: section.section,
                  fieldPath: `${section.section}.manual`,
                  value: { kind: "text", value: "Added information" },
                })
              }
            >
              Add information
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                mutate({ type: "exclude_section", section: section.section })
              }
            >
              Exclude section
            </button>
          </div>
        </section>
      ))}
    </section>
  );
}

function ReviewFieldRow(props: {
  readonly field: ReviewField;
  readonly pending: boolean;
  readonly onAction: (action: ReviewMutationAction) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(valueToText(props.field.value));
  const statusId = `${props.field.fieldId}-status`;

  return (
    <article
      className="review-field"
      aria-labelledby={`${props.field.fieldId}-label`}
    >
      <h3 id={`${props.field.fieldId}-label`}>
        {fieldLabel(props.field.fieldPath)}
      </h3>
      <p id={statusId}>
        Review state: {props.field.reviewStatus.replaceAll("_", " ")}.
        Confidence: {props.field.confidenceStatus.replaceAll("_", " ")}.
        Inference: {props.field.inferenceStatus.replaceAll("_", " ")}.
      </p>
      <p>
        <FieldProvenance
          provenance={props.field.provenance}
          inferenceStatus={props.field.inferenceStatus}
        />
      </p>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim() === "") return;
            props.onAction({
              type: "edit_field",
              fieldId: props.field.fieldId,
              value: { kind: "text", value: text.trim() },
            });
            setEditing(false);
          }}
        >
          <label htmlFor={`${props.field.fieldId}-edit`}>Edit value</label>
          <textarea
            id={`${props.field.fieldId}-edit`}
            value={text}
            aria-describedby={statusId}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="action-row">
            <button
              type="submit"
              disabled={props.pending || text.trim() === ""}
            >
              Save change
            </button>
            <button
              type="button"
              disabled={props.pending}
              onClick={() => {
                setText(valueToText(props.field.value));
                setEditing(false);
              }}
            >
              Cancel edit
            </button>
          </div>
        </form>
      ) : (
        <>
          <p aria-describedby={statusId}>{valueToText(props.field.value)}</p>
          <div className="action-row">
            <button
              type="button"
              disabled={props.pending}
              onClick={() =>
                props.onAction({
                  type: "confirm_field",
                  fieldId: props.field.fieldId,
                })
              }
            >
              Confirm field
            </button>
            <button
              type="button"
              disabled={props.pending}
              onClick={() => setEditing(true)}
            >
              Edit field
            </button>
            <button
              type="button"
              disabled={props.pending}
              onClick={() =>
                props.onAction({
                  type: "remove_field",
                  fieldId: props.field.fieldId,
                })
              }
            >
              Remove from draft
            </button>
          </div>
          <p className="message">
            Removing affects this review draft only. It does not change the
            uploaded source.
          </p>
        </>
      )}
    </article>
  );
}

function fieldLabel(fieldPath: string): string {
  const parts = fieldPath.split(".");
  return parts[parts.length - 1]?.replaceAll("_", " ") ?? fieldPath;
}

function valueToText(value: ReviewField["value"]): string {
  switch (value.kind) {
    case "text":
      return value.value;
    case "text_list":
      return value.values.join(", ");
    case "date":
      return formatReviewDate(value.value);
    case "date_range":
      return formatReviewDateRange(value);
    case "link":
      return value.label === undefined
        ? value.url
        : `${value.label}: ${value.url}`;
    case "language":
      return value.proficiency === undefined
        ? value.name
        : `${value.name}, ${value.proficiency}`;
  }
}
