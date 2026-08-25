"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  ConfirmedStructuredResumeReadResponse,
  StructuredResumeContentContract,
} from "@nuvitae/contracts";
import { ResponsiveVisualResumeEditor } from "../resume-editor/ResponsiveVisualResumeEditor";
import {
  readConfirmedStructuredResume,
  saveConfirmedStructuredResume,
} from "./client";
import { StructuredResumeProvenance } from "./StructuredResumeProvenance";
import { toEditableResumeContent } from "./editable-content";

type SaveState = "saved" | "unsaved" | "saving" | "failed" | "stale";

export function ConfirmedResumeView(props: { readonly resumeId: string }) {
  const [resume, setResume] = useState<
    ConfirmedStructuredResumeReadResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [content, setContent] = useState<
    StructuredResumeContentContract | undefined
  >();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveMessage, setSaveMessage] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void readConfirmedStructuredResume({
      resumeId: props.resumeId,
      signal: controller.signal,
    }).then((outcome) => {
      if (outcome.ok) {
        setResume(outcome.response);
        setContent(toEditableResumeContent(outcome.response.content));
        setError(undefined);
      } else if (outcome.category !== "cancelled") {
        setError(outcome.message);
      }
    });
    return () => controller.abort();
  }, [props.resumeId]);

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
    if (saveState === "failed" || saveState === "stale") {
      errorRef.current?.focus();
    }
  }, [saveState]);

  async function save() {
    if (resume === undefined || content === undefined || saveState === "saving")
      return;
    setSaveState("saving");
    const outcome = await saveConfirmedStructuredResume({
      resumeId: props.resumeId,
      expectedUpdatedAt: resume.updatedAt,
      content,
    });
    if (!outcome.ok) {
      setSaveState(outcome.category === "stale_update" ? "stale" : "failed");
      setSaveMessage(outcome.message);
      return;
    }
    setResume(outcome.response);
    setContent(toEditableResumeContent(outcome.response.content));
    setSaveState("saved");
    setSaveMessage(outcome.response.userMessage);
  }

  if (error !== undefined) {
    return (
      <section className="import-card" aria-labelledby="resume-error-title">
        <h1 id="resume-error-title">Resume unavailable</h1>
        <p role="alert">{error}</p>
      </section>
    );
  }
  if (resume === undefined || content === undefined) {
    return (
      <section className="import-card" aria-busy="true">
        <h1>Loading your resume</h1>
        <p role="status">Loading your resume.</p>
      </section>
    );
  }
  return (
    <section className="manual-panel" aria-labelledby="resume-title">
      <div className="manual-header">
        <div>
          <p className="eyebrow">Imported resume</p>
          <h1 id="resume-title">Edit your resume</h1>
        </div>
        <div className="save-cluster">
          <p className="save-status" aria-live="polite">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "unsaved"
                ? "Unsaved changes"
                : saveState === "stale"
                  ? "Error — reload required"
                  : saveState === "failed"
                    ? "Error — retry"
                    : "Saved"}
          </p>
          <button
            className="primary-action"
            type="button"
            disabled={saveState === "saved" || saveState === "saving"}
            onClick={() => {
              if (saveState === "stale") window.location.reload();
              else void save();
            }}
          >
            {saveState === "stale"
              ? "Reload resume"
              : saveState === "failed"
                ? "Retry save"
                : "Save resume"}
          </button>
        </div>
      </div>
      {saveState === "failed" || saveState === "stale" ? (
        <div className="message message-error" ref={errorRef} tabIndex={-1}>
          {saveMessage}
        </div>
      ) : null}
      <StructuredResumeProvenance resume={resume} />
      <div className="resume-actions">
        <Link
          className="primary-action"
          href={`/resumes/${props.resumeId}/export`}
        >
          Export PDF
        </Link>
        <Link className="secondary-action" href="/resumes">
          My resumes
        </Link>
      </div>
      <ResponsiveVisualResumeEditor
        value={content}
        disabled={saveState === "saving"}
        onChange={(next) => {
          setContent(next);
          setSaveState("unsaved");
        }}
      />
    </section>
  );
}
