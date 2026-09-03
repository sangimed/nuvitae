"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  ConfirmedStructuredResumeReadResponse,
  ContextualResumeEditAction,
  ContextualResumeEditProposalResponse,
  ContextualResumeEditTarget,
  StructuredResumeContentContract,
} from "@nuvitae/contracts";
import { ResponsiveVisualResumeEditor } from "../resume-editor/ResponsiveVisualResumeEditor";
import type { ContextualAiEditingControls } from "../resume-editor/ContextualAiEditControl";
import {
  readConfirmedStructuredResume,
  saveConfirmedStructuredResume,
} from "./client";
import { StructuredResumeProvenance } from "./StructuredResumeProvenance";
import { DeleteSourceControl } from "./DeleteSourceControl";
import { toEditableResumeContent } from "./editable-content";
import { recordCommunityFunnelEvent } from "../../services/community-funnel";
import { createContextualResumeEditProposal } from "../../services/resume-workspace/contextual-editing-client";

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
  const [aiState, setAiState] = useState<ContextualAiEditingControls["state"]>({
    status: "idle",
  });
  const errorRef = useRef<HTMLDivElement>(null);
  const reopenedRecorded = useRef(false);

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
        if (!reopenedRecorded.current) {
          reopenedRecorded.current = true;
          recordCommunityFunnelEvent({ funnelEvent: "resume.reopened" });
        }
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

  async function refreshAfterSourceDeletion(message: string) {
    const outcome = await readConfirmedStructuredResume({
      resumeId: props.resumeId,
    });
    if (!outcome.ok) {
      setSaveState("failed");
      setSaveMessage(outcome.message);
      return;
    }
    setResume(outcome.response);
    setContent(toEditableResumeContent(outcome.response.content));
    setSaveMessage(message);
    setAiState({ status: "idle" });
  }

  async function requestAiEdit(
    target: ContextualResumeEditTarget,
    action: ContextualResumeEditAction,
  ) {
    if (resume === undefined || saveState !== "saved") {
      setAiState({
        status: "error",
        target,
        message: "Save or undo your current changes before using AI editing.",
      });
      return;
    }
    setAiState({ status: "generating", target });
    const outcome = await createContextualResumeEditProposal({
      resumeId: props.resumeId,
      expectedUpdatedAt: resume.updatedAt,
      action,
      target,
    });
    setAiState(
      outcome.ok
        ? { status: "proposal", proposal: outcome.response }
        : { status: "error", target, message: outcome.message },
    );
  }

  function acceptAiProposal(proposal: ContextualResumeEditProposalResponse) {
    setContent((current) =>
      current === undefined
        ? current
        : applyProposal(current, proposal.target, proposal.after),
    );
    setSaveState("unsaved");
    setAiState({ status: "idle" });
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
            className="secondary-button"
            type="button"
            disabled={
              saveState === "saved" ||
              saveState === "saving" ||
              saveState === "stale"
            }
            onClick={() => {
              setContent(toEditableResumeContent(resume.content));
              setSaveState("saved");
              setSaveMessage("Changes undone to the last saved version.");
              setAiState({ status: "idle" });
            }}
          >
            Undo to saved
          </button>
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
      {resume.sourceAvailability === "source_no_longer_available" ? null : (
        <DeleteSourceControl
          resumeId={props.resumeId}
          disabled={saveState !== "saved" || aiState.status === "generating"}
          onDeleted={refreshAfterSourceDeletion}
        />
      )}
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
        disabled={saveState === "saving" || aiState.status === "generating"}
        aiEditing={{
          state: aiState,
          disabled: saveState !== "saved" || aiState.status === "generating",
          request: (target, action) => void requestAiEdit(target, action),
          accept: acceptAiProposal,
          reject: () => setAiState({ status: "idle" }),
        }}
        onChange={(next) => {
          setContent(next);
          setSaveState("unsaved");
          setAiState({ status: "idle" });
        }}
      />
    </section>
  );
}

function applyProposal(
  content: StructuredResumeContentContract,
  target: ContextualResumeEditTarget,
  value: string,
): StructuredResumeContentContract {
  if (target.kind === "summary") {
    return content.summary === undefined
      ? content
      : { ...content, summary: { ...content.summary, value } };
  }
  if (target.kind === "project_description") {
    return {
      ...content,
      projects: content.projects.map((project) =>
        project.id !== target.projectId || project.description === undefined
          ? project
          : { ...project, description: { ...project.description, value } },
      ),
    };
  }
  return {
    ...content,
    workExperiences: content.workExperiences.map((experience) =>
      experience.id !== target.experienceId
        ? experience
        : {
            ...experience,
            roles: experience.roles.map((role) => {
              if (role.id !== target.roleId) return role;
              const field =
                target.kind === "work_responsibility"
                  ? "responsibilities"
                  : "achievements";
              return {
                ...role,
                [field]: role[field].map((item, index) =>
                  index === target.itemIndex ? { ...item, value } : item,
                ),
              };
            }),
          },
    ),
  };
}
