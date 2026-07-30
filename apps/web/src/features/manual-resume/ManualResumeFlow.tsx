"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  updateManualDraftRequestSchema,
  type ManualDraftResponse,
} from "@nuvitae/contracts";
import type { StructuredResumeContentContract } from "@nuvitae/contracts";
import { StructuredResumeSections } from "../resume-editor/StructuredResumeSections";
import {
  createManualDraft,
  readManualDraft,
  saveManualDraft,
  type ManualDraftClientOutcome,
} from "../../services/manual-resume/manual-draft-client";
import { createBrowserUuid } from "../../services/browser-ids";

type SaveState = "saved" | "unsaved" | "saving" | "stale-conflict" | "failed";

export function ManualResumeFlow() {
  const [draft, setDraft] = useState<
    ManualDraftResponse["draft"] | undefined
  >();
  const [content, setContent] = useState<
    StructuredResumeContentContract | undefined
  >();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [loadState, setLoadState] = useState<
    | "loading"
    | "authentication-required"
    | "not-found"
    | "connection-failure"
    | "ready"
  >("loading");
  const [message, setMessage] = useState<string>(
    "Preparing your resume draft.",
  );
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const initialized = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const controller = new AbortController();
    void initialize(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (saveState !== "unsaved") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  useEffect(() => {
    if (saveState === "failed" || saveState === "stale-conflict") {
      errorSummaryRef.current?.focus();
    }
  }, [saveState, message]);

  const statusCopy = useMemo(() => {
    switch (saveState) {
      case "unsaved":
        return "You have unsaved changes.";
      case "saving":
        return "Saving your resume draft.";
      case "saved":
        return "Your resume draft is saved.";
      case "stale-conflict":
        return "This draft changed elsewhere. Reload before saving again.";
      case "failed":
        return "Your changes could not be saved.";
    }
  }, [saveState]);

  async function initialize(signal: AbortSignal) {
    const url = new URL(window.location.href);
    const existingDraftId = url.searchParams.get("draftId");
    const outcome =
      existingDraftId === null
        ? await createManualDraft({
            creationKey: ensureCreationKey(url),
            signal,
          })
        : await readManualDraft({ draftId: existingDraftId, signal });
    if (signal.aborted) return;
    applyLoadOutcome(outcome);
  }

  function applyLoadOutcome(outcome: ManualDraftClientOutcome) {
    if (!outcome.ok) {
      setMessage(outcome.message);
      setLoadState(
        outcome.category === "authentication_required"
          ? "authentication-required"
          : outcome.category === "not_found"
            ? "not-found"
            : "connection-failure",
      );
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("creationKey");
    url.searchParams.set("draftId", outcome.response.draft.draftId);
    window.history.replaceState(null, "", url);
    setDraft(outcome.response.draft);
    setContent(outcome.response.draft.content);
    setSaveState("saved");
    setLoadState("ready");
    setMessage(outcome.response.userMessage);
  }

  async function createReplacementDraft() {
    setLoadState("loading");
    setMessage("Preparing a new resume draft.");
    const url = new URL(window.location.href);
    url.searchParams.delete("draftId");
    url.searchParams.delete("creationKey");
    const creationKey = ensureCreationKey(url);
    const controller = new AbortController();
    const outcome = await createManualDraft({
      creationKey,
      signal: controller.signal,
    });
    applyLoadOutcome(outcome);
  }

  async function save() {
    if (draft === undefined || content === undefined || saving) return;
    const validation = updateManualDraftRequestSchema.safeParse({
      expectedUpdatedAt: draft.updatedAt,
      content,
    });
    if (!validation.success) {
      setValidationErrors(errorMapFromIssues(validation.error.issues));
      setMessage("Fix the highlighted fields before saving.");
      setSaveState("failed");
      return;
    }
    setSaving(true);
    setSaveState("saving");
    const outcome = await saveManualDraft({
      draftId: draft.draftId,
      expectedUpdatedAt: draft.updatedAt,
      content,
    });
    setSaving(false);
    if (!outcome.ok) {
      setMessage(outcome.message);
      setSaveState(
        outcome.category === "stale_update" ? "stale-conflict" : "failed",
      );
      return;
    }
    setValidationErrors({});
    setDraft(outcome.response.draft);
    setContent(outcome.response.draft.content);
    setSaveState("saved");
    setMessage(outcome.response.userMessage);
  }

  if (loadState === "loading") {
    return (
      <section className="manual-panel" aria-live="polite">
        <h1>Manual resume draft</h1>
        <p>{message}</p>
      </section>
    );
  }

  if (loadState === "authentication-required") {
    return (
      <section className="manual-panel">
        <h1>Manual resume draft</h1>
        <div className="message message-error" role="status">
          {message}
        </div>
      </section>
    );
  }

  if (loadState === "not-found") {
    return (
      <section className="manual-panel">
        <h1>Manual resume draft</h1>
        <div className="message message-error" role="status">
          {message}
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={() => void createReplacementDraft()}
        >
          Create a new draft
        </button>
      </section>
    );
  }

  if (loadState === "connection-failure" || content === undefined) {
    return (
      <section className="manual-panel">
        <h1>Manual resume draft</h1>
        <div className="message message-error" role="status">
          {message}
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setLoadState("loading");
            void initialize(new AbortController().signal);
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="manual-panel" aria-labelledby="manual-title">
      <div className="manual-header">
        <div>
          <p className="eyebrow">Manual entry</p>
          <h1 id="manual-title">Manual resume draft</h1>
        </div>
        <div className="save-cluster">
          <p className="save-status" aria-live="polite">
            {statusCopy}
          </p>
          <button
            className="primary-action"
            type="button"
            disabled={saving || saveState === "saved"}
            onClick={save}
          >
            Save draft
          </button>
        </div>
      </div>

      {saveState === "stale-conflict" || saveState === "failed" ? (
        <div
          className="message message-error"
          tabIndex={-1}
          ref={errorSummaryRef}
        >
          {message}
        </div>
      ) : null}

      <StructuredResumeSections
        value={content}
        mode="manual"
        disabled={saving}
        onChange={(next) => {
          setContent(next);
          setValidationErrors({});
          setSaveState("unsaved");
        }}
        validationErrors={validationErrors}
      />
    </section>
  );
}

function ensureCreationKey(url: URL): string {
  const current = url.searchParams.get("creationKey");
  if (current !== null && /^[A-Za-z0-9._:-]{16,96}$/.test(current)) {
    return current;
  }
  const key = `manual-${createBrowserUuid()}`;
  url.searchParams.set("creationKey", key);
  window.history.replaceState(null, "", url);
  return key;
}

function errorMapFromIssues(
  issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey> }>,
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path
      .filter((part) => part !== "content" && part !== "value")
      .map(String)
      .join(".");
    if (path.length > 0) {
      errors[path] = "This field is too long or uses an unsupported value.";
    }
  }
  return errors;
}
