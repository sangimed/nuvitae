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
  readReviewDraft,
  sendReviewMutation,
} from "../../services/import-resume/review-client";
import { ConfirmationStep } from "./ConfirmationStep";
import { needsExplicitConfirmation } from "./actionable-review-items";
import { ErrorSummary } from "./ErrorSummary";
import { FieldProvenance } from "./FieldProvenance";
import {
  focusErrorSummary,
  focusNextLogicalHeading,
  focusTarget,
} from "./focus-management";
import { ReviewWarning } from "./ReviewWarning";
import { formatReviewDate, formatReviewDateRange } from "./review-date";
import { reviewFieldLabel, reviewSectionLabel } from "./review-labels";
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

  async function persistMutation(
    currentDraft: ReviewDraftReadResponse,
    action: ReviewMutationAction,
  ) {
    setPending(true);
    setError(undefined);
    setMessage("Saving review change.");
    const request = createReviewMutationRequest({
      operationId: createReviewOperationId(),
      expectedReviewRevision: currentDraft.reviewRevision,
      action,
    });
    const outcome = await sendReviewMutation({
      importId: props.importId,
      request,
    });
    if (outcome.ok) {
      setDraft(outcome.response.draft);
      setMessage(outcome.response.userMessage);
      setPending(false);
      focusNextLogicalHeading(shellRef.current);
      return outcome.response.draft;
    }
    if (outcome.category === "stale_review") {
      const refreshed = await readReviewDraft({ importId: props.importId });
      if (refreshed.ok) setDraft(refreshed.response);
      setError("Your review has changed. We reloaded the latest information.");
    } else {
      setError(outcome.message);
    }
    setPending(false);
    return undefined;
  }

  async function mutate(action: ReviewMutationAction) {
    if (draft === undefined || pending) return undefined;
    return persistMutation(draft, action);
  }

  async function confirmReviewRequiredField(field: ReviewField) {
    if (pending || draft === undefined) return;
    let updated = await persistMutation(draft, {
      type: "confirm_field",
      fieldId: field.fieldId,
    });
    if (updated === undefined) return;

    // T259 keeps proposal/evidence and the field-bound review record separate.
    // Resolve only the warnings explicitly linked by the canonical read model,
    // using the existing warning-confirmation command and the persisted revision.
    const linkedWarnings = updated.sections
      .flatMap((section) => section.warnings)
      .filter(
        (warning) =>
          field.warningIds.includes(warning.warningId) &&
          warning.reviewStatus === "needs_review",
      );
    for (const warning of linkedWarnings) {
      const current = await persistMutation(updated, {
        type: "resolve_warning",
        warningId: warning.warningId,
        resolution: "confirmed",
      });
      if (current === undefined) {
        setError(
          "Your confirmation was saved, but one related review item still needs attention.",
        );
        return;
      }
      updated = current;
    }
  }

  if (loading) {
    return (
      <section className="import-card" aria-busy="true">
        <h1>Loading import review</h1>
        <p role="status">Loading your resume information.</p>
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
      <p className="eyebrow">Resume review</p>
      <h1 id="review-title">
        Check the information Nuvitae needs you to confirm
      </h1>
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
          {finalized.message} <a href={finalized.resumeUrl}>Open my resume</a>
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

      <ReviewSummary draft={draft} />

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
          <h2 id={`${section.section}-review-heading`}>
            {reviewSectionLabel(section.section, section.label)}
          </h2>
          {section.fields.length === 0 ? (
            <p>No imported information is active in this section.</p>
          ) : null}
          <SectionFields
            fields={section.fields}
            section={section.section}
            pending={pending || finalized !== undefined}
            onAction={mutate}
            onConfirmReviewRequired={confirmReviewRequiredField}
          />
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

function ReviewSummary(props: { readonly draft: ReviewDraftReadResponse }) {
  const needsConfirmation = props.draft.sections.flatMap((section) =>
    section.fields.filter(needsExplicitConfirmation),
  );
  return (
    <section className="review-summary" aria-labelledby="review-summary-title">
      <h2 id="review-summary-title">
        {needsConfirmation.length === 0
          ? "Your imported information is ready"
          : "A few details need your confirmation"}
      </h2>
      <p>
        {needsConfirmation.length === 0
          ? "The remaining imported information is ready to carry into your resume. You can still make changes below."
          : "Nuvitae found these details in your resume. Confirm them, edit them, or leave them out before continuing."}
      </p>
      {needsConfirmation.length === 0 ? null : (
        <ul className="review-summary-list">
          {needsConfirmation.map((field) => (
            <li key={field.fieldId}>
              <a href={`#${field.fieldId}-label`}>
                {reviewFieldLabel(field.fieldPath)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectionFields(props: {
  readonly fields: readonly ReviewField[];
  readonly section: string;
  readonly pending: boolean;
  readonly onAction: (action: ReviewMutationAction) => Promise<unknown>;
  readonly onConfirmReviewRequired: (field: ReviewField) => Promise<void>;
}) {
  if (props.section !== "work_experience") {
    return props.fields.map((field) => (
      <ReviewFieldRow
        key={field.fieldId}
        field={field}
        pending={props.pending}
        onAction={props.onAction}
        onConfirmReviewRequired={props.onConfirmReviewRequired}
      />
    ));
  }
  return groupWorkFields(props.fields).map((group) => (
    <section
      className="work-review-group"
      key={group.key}
      aria-label={group.label}
    >
      <h3>{group.label}</h3>
      {group.roles.map((role) => (
        <section
          className="work-review-role"
          key={role.key}
          aria-label={role.label}
        >
          <h4>{role.label}</h4>
          {role.fields.map((field) => (
            <ReviewFieldRow
              key={field.fieldId}
              field={field}
              pending={props.pending}
              onAction={props.onAction}
              onConfirmReviewRequired={props.onConfirmReviewRequired}
            />
          ))}
        </section>
      ))}
    </section>
  ));
}

function ReviewFieldRow(props: {
  readonly field: ReviewField;
  readonly pending: boolean;
  readonly onAction: (action: ReviewMutationAction) => Promise<unknown>;
  readonly onConfirmReviewRequired: (field: ReviewField) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(valueToText(props.field.value));
  const statusId = `${props.field.fieldId}-status`;

  return (
    <article
      className={`review-field ${needsExplicitConfirmation(props.field) ? "review-field-needs-confirmation" : "review-field-accepted"}`}
      aria-labelledby={`${props.field.fieldId}-label`}
    >
      <h3 id={`${props.field.fieldId}-label`}>
        {reviewFieldLabel(props.field.fieldPath)}
      </h3>
      <p id={statusId} className="review-field-status" role="status">
        {fieldStatus(props.field)}
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
            {needsExplicitConfirmation(props.field) ? (
              <button
                type="button"
                className="primary-action"
                disabled={props.pending}
                onClick={() => props.onConfirmReviewRequired(props.field)}
              >
                Confirm this information
              </button>
            ) : null}
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
              Leave out
            </button>
          </div>
          <p className="message">
            This only changes the information shown here. It does not change
            your uploaded file.
          </p>
        </>
      )}
    </article>
  );
}

function fieldStatus(field: ReviewField): string {
  if (needsExplicitConfirmation(field)) {
    return "Confirmation needed before this information is used.";
  }
  if (field.reviewStatus === "confirmed" || field.reviewStatus === "edited") {
    return "Accepted for your resume.";
  }
  if (field.reviewStatus === "excluded") return "Left out of your resume.";
  return "Imported from your resume.";
}

function groupWorkFields(fields: readonly ReviewField[]) {
  const groups = new Map<
    string,
    {
      label: string;
      roles: Map<string, { label: string; fields: ReviewField[] }>;
    }
  >();
  for (const field of fields) {
    const match = /^work_experience\.(\d+)(?:\.roles\.(\d+))?/.exec(
      field.fieldPath,
    );
    const employerKey = match?.[1] ?? "ungrouped";
    const roleKey = match?.[2] ?? "details";
    const group = groups.get(employerKey) ?? {
      label: `Employer ${Number(employerKey) + 1 || "details"}`,
      roles: new Map(),
    };
    if (field.fieldPath.endsWith(".employer"))
      group.label = valueToText(field.value);
    const role = group.roles.get(roleKey) ?? {
      label:
        roleKey === "details"
          ? "Employment details"
          : `Role ${Number(roleKey) + 1}`,
      fields: [],
    };
    if (field.fieldPath.endsWith(".title"))
      role.label = valueToText(field.value);
    role.fields.push(field);
    group.roles.set(roleKey, role);
    groups.set(employerKey, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    roles: [...group.roles.entries()].map(([roleKey, role]) => ({
      ...role,
      key: roleKey,
    })),
  }));
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
