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
} from "./client";
import { ConfirmationStep } from "./ConfirmationStep";
import {
  actionableReviewItems,
  needsExplicitConfirmation,
} from "./actionable-review-items";
import { ErrorSummary } from "./ErrorSummary";
import { FieldProvenance } from "./FieldProvenance";
import { focusErrorSummary, focusTarget } from "./focus-management";
import { ReviewWarning } from "./ReviewWarning";
import { formatReviewDate, formatReviewDateRange } from "./review-date";
import { reviewFieldLabel, reviewSectionLabel } from "./review-labels";
import { recordImportTiming } from "./client";

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
  const [openedSections, setOpenedSections] = useState<
    ReadonlySet<string> | undefined
  >();
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    setOpenedSections(undefined);
  }, [props.importId]);

  async function refreshDraft() {
    const refreshed = await readReviewDraft({ importId: props.importId });
    if (refreshed.ok) setDraft(refreshed.response);
  }

  async function persistMutation(
    currentDraft: ReviewDraftReadResponse,
    action: ReviewMutationAction,
    focusAfterSave = true,
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
      if (focusAfterSave) focusNextReviewItem(outcome.response.draft);
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
    let updated = await persistMutation(
      draft,
      {
        type: "confirm_field",
        fieldId: field.fieldId,
      },
      false,
    );
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
      const current = await persistMutation(
        updated,
        {
          type: "resolve_warning",
          warningId: warning.warningId,
          resolution: "confirmed",
        },
        false,
      );
      if (current === undefined) {
        setError(
          "Your confirmation was saved, but one related review item still needs attention.",
        );
        return;
      }
      updated = current;
    }
    focusNextReviewItem(updated);
  }

  function focusNextReviewItem(updatedDraft: ReviewDraftReadResponse) {
    const next = actionableReviewItems(updatedDraft)[0];
    if (next !== undefined) {
      setOpenedSections((current) => {
        const nextOpened = new Set(current ?? []);
        nextOpened.add(next.section);
        return nextOpened;
      });
    }
    const schedule =
      typeof window === "undefined" ||
      window.requestAnimationFrame === undefined
        ? (callback: FrameRequestCallback) => window.setTimeout(callback, 0)
        : window.requestAnimationFrame;
    schedule(() => {
      focusReviewTarget(
        next === undefined
          ? document.getElementById("confirmation-title")
          : document.getElementById(next.href.slice(1)),
      );
    });
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

  const initialOpenSection = firstAttentionSection(draft);

  return (
    <section className="review-shell" aria-labelledby="review-title">
      <p className="eyebrow">Resume review</p>
      <h1 id="review-title">
        Check the information Nuvitae needs you to confirm
      </h1>
      <p className="review-source-note">
        You are reviewing a structured draft. Your uploaded file stays
        unchanged.
      </p>
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

      <div className="review-edit-pane">
        <ReviewSummary
          draft={draft}
          pending={pending || finalized !== undefined}
          onAcceptAll={(fieldIds) =>
            mutate({ type: "confirm_inferred_fields", fieldIds })
          }
        />

        <ReviewNavigation draft={draft} />

        {draft.sections.map((section) => (
          <details
            className="review-section"
            key={section.section}
            open={
              openedSections?.has(section.section) ??
              initialOpenSection === section.section
            }
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpenedSections((current) => {
                const next = new Set(
                  current ??
                    (initialOpenSection === undefined
                      ? []
                      : [initialOpenSection]),
                );
                if (isOpen) next.add(section.section);
                else next.delete(section.section);
                return next;
              });
            }}
          >
            <summary>
              <h2
                className="review-section-title"
                id={`${section.section}-review-heading`}
              >
                <span>
                  {reviewSectionLabel(section.section, section.label)}
                </span>
                <span className="review-section-meta">
                  {section.fields.length === 0
                    ? "No information"
                    : `${section.fields.length} ${section.fields.length === 1 ? "item" : "items"}`}
                </span>
              </h2>
              {sectionAttentionCount(section) === 0 ? (
                <span className="review-section-status">Ready</span>
              ) : (
                <span className="review-section-count">
                  {sectionAttentionCount(section)} to review
                </span>
              )}
            </summary>
            <div className="review-section-content">
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
                    mutate({
                      type: "exclude_section",
                      section: section.section,
                    })
                  }
                >
                  Exclude section
                </button>
              </div>
            </div>
          </details>
        ))}
      </div>
      <ConfirmationStep
        importId={props.importId}
        draft={draft}
        disabled={pending || finalized !== undefined}
        onConfirmed={(resumeUrl, userMessage) => {
          setFinalized({
            kind: "confirmed",
            resumeUrl,
            message: userMessage,
          });
          setPending(false);
          window.history.replaceState(null, "", resumeUrl);
        }}
        onDiscarded={(userMessage) => {
          setFinalized({ kind: "discarded", message: userMessage });
          setPending(false);
        }}
        onStaleReview={refreshDraft}
      />
    </section>
  );
}

function focusReviewTarget(target: HTMLElement | null) {
  if (target === null) return;
  if (focusTarget(target)) return;
  if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
  focusTarget(target);
}

function ReviewSummary(props: {
  readonly draft: ReviewDraftReadResponse;
  readonly pending: boolean;
  readonly onAcceptAll: (fieldIds: string[]) => Promise<unknown>;
}) {
  const needsConfirmation = props.draft.sections.flatMap((section) =>
    section.fields.filter(needsExplicitConfirmation),
  );
  return (
    <section className="review-summary" aria-labelledby="review-summary-title">
      <h2 id="review-summary-title">
        {needsConfirmation.length === 0
          ? "Your imported information is ready"
          : `${needsConfirmation.length} ${needsConfirmation.length === 1 ? "detail needs" : "details need"} your confirmation`}
      </h2>
      <p>
        {needsConfirmation.length === 0
          ? "The remaining imported information is ready to carry into your resume. You can still make changes below."
          : "These are grounded suggestions, not text copied exactly from your document. Review them below, or accept them together and keep editing anything you want to change."}
      </p>
      {needsConfirmation.length === 0 ? null : (
        <button
          type="button"
          className="primary-action"
          disabled={props.pending}
          onClick={() =>
            props.onAcceptAll(needsConfirmation.map((field) => field.fieldId))
          }
        >
          Accept all {needsConfirmation.length} suggested details
        </button>
      )}
    </section>
  );
}

function ReviewNavigation(props: { readonly draft: ReviewDraftReadResponse }) {
  const sectionsWithAttention = props.draft.sections.filter(
    sectionNeedsAttention,
  );
  if (sectionsWithAttention.length === 0) return null;
  return (
    <nav className="review-navigation" aria-label="Sections to review">
      <span>Jump to:</span>
      {sectionsWithAttention.map((section) => (
        <a key={section.section} href={`#${section.section}-review-heading`}>
          {reviewSectionLabel(section.section, section.label)}
          <span className="visually-hidden">, </span>
          <span aria-hidden="true">({sectionAttentionCount(section)})</span>
        </a>
      ))}
    </nav>
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
      <details className="review-field-provenance">
        <summary>Why am I seeing this?</summary>
        <FieldProvenance
          provenance={props.field.provenance}
          inferenceStatus={props.field.inferenceStatus}
        />
      </details>
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
        </>
      )}
    </article>
  );
}

function sectionAttentionCount(
  section: ReviewDraftReadResponse["sections"][number],
) {
  return (
    section.fields.filter(needsExplicitConfirmation).length +
    section.warnings.filter(
      (warning) => warning.reviewStatus === "needs_review",
    ).length
  );
}

function sectionNeedsAttention(
  section: ReviewDraftReadResponse["sections"][number],
) {
  return sectionAttentionCount(section) > 0;
}

function firstAttentionSection(
  draft: ReviewDraftReadResponse,
): string | undefined {
  return draft.sections.find(sectionNeedsAttention)?.section;
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
