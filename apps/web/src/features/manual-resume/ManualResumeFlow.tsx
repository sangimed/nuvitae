"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  updateManualDraftRequestSchema,
  type ManualDraftResponse,
} from "@nuvitae/contracts";
import type { StructuredResumeContentContract } from "@nuvitae/contracts";
import { ResponsiveVisualResumeEditor } from "../resume-editor/ResponsiveVisualResumeEditor";
import {
  createManualDraft,
  readManualDraft,
  saveManualDraft,
  type ManualDraftClientOutcome,
} from "./client";
import { createBrowserUuid } from "../../services/browser-ids";
import { recordCommunityFunnelEvent } from "../../services/community-funnel";

type SaveState = "saved" | "unsaved" | "saving" | "stale-conflict" | "failed";

export function ManualResumeFlow(props: { readonly draftId?: string }) {
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
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void initialize(controller.signal);
    return () => controller.abort();
  }, [props.draftId]);

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
        return "Unsaved changes";
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "stale-conflict":
        return "Error — reload required";
      case "failed":
        return "Error — retry";
    }
  }, [saveState]);

  async function initialize(signal: AbortSignal) {
    const url = new URL(window.location.href);
    const existingDraftId = props.draftId ?? url.searchParams.get("draftId");
    const outcome =
      existingDraftId === null
        ? await createManualDraft({
            creationKey: ensureCreationKey(url),
            signal,
          })
        : await readManualDraft({ draftId: existingDraftId, signal });
    if (signal.aborted) return;
    if (outcome.ok && existingDraftId !== null) {
      recordCommunityFunnelEvent({ funnelEvent: "resume.reopened" });
    }
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
    window.history.replaceState(
      null,
      "",
      `/resumes/drafts/${outcome.response.draft.draftId}`,
    );
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
          <Link className="secondary-action" href="/resumes">
            My resumes
          </Link>
          <p className="save-status" aria-live="polite">
            {statusCopy}
          </p>
          <button
            className="secondary-button"
            type="button"
            disabled={
              saving || saveState === "saved" || saveState === "stale-conflict"
            }
            onClick={() => {
              if (draft === undefined) return;
              setContent(draft.content);
              setValidationErrors({});
              setSaveState("saved");
              setMessage("Changes undone to the last saved version.");
            }}
          >
            Undo to saved
          </button>
          <button
            className="primary-action"
            type="button"
            disabled={saving || saveState === "saved"}
            onClick={() => {
              if (saveState === "stale-conflict") {
                window.location.reload();
                return;
              }
              void save();
            }}
          >
            {saveState === "stale-conflict"
              ? "Reload draft"
              : saveState === "failed"
                ? "Retry save"
                : "Save draft"}
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

      <ResponsiveVisualResumeEditor
        value={content}
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
