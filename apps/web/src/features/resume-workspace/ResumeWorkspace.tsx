"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ResumeWorkspaceListResponse } from "@nuvitae/contracts";
import {
  Button,
  ButtonLink,
  Panel,
  StatusState,
} from "../../components/community";
import { listResumes } from "./client";

export function ResumeWorkspace() {
  const [response, setResponse] = useState<
    ResumeWorkspaceListResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();

  const loadResumes = useCallback((signal?: AbortSignal) => {
    void listResumes({ ...(signal === undefined ? {} : { signal }) }).then(
      (outcome) => {
        if (outcome.ok) {
          setResponse(outcome.response);
          setError(undefined);
        } else if (!outcome.cancelled) setError(outcome.message);
      },
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadResumes(controller.signal);
    return () => controller.abort();
  }, [loadResumes]);

  if (error !== undefined) {
    return (
      <Panel className="resume-workspace" aria-labelledby="resumes-title">
        <p className="eyebrow">Workspace</p>
        <h1 id="resumes-title">My resumes</h1>
        <StatusState
          tone="error"
          title="Your resumes could not be loaded"
          action={<Button onClick={() => loadResumes()}>Try again</Button>}
        >
          {error}
        </StatusState>
      </Panel>
    );
  }
  if (response === undefined) {
    return (
      <Panel className="resume-workspace" aria-busy="true">
        <h1>My resumes</h1>
        <StatusState tone="loading" title="Loading your resumes">
          This will only take a moment.
        </StatusState>
      </Panel>
    );
  }
  return (
    <Panel className="resume-workspace" aria-labelledby="resumes-title">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="resumes-title">My resumes</h1>
          <p>Open a saved resume and continue where you left off.</p>
        </div>
        <ButtonLink href="/import-resume">Create a resume</ButtonLink>
      </div>
      {response.resumes.length === 0 ? (
        <StatusState
          tone="empty"
          title="Create your first resume"
          action={
            <div className="workspace-empty-actions">
              <ButtonLink href="/import-resume">Import a resume</ButtonLink>
              <ButtonLink href="/resumes/new/manual" variant="secondary">
                Start from scratch
              </ButtonLink>
            </div>
          }
        >
          Import an existing resume to get started quickly, or enter your
          details yourself.
        </StatusState>
      ) : (
        <ul className="resume-list">
          {response.resumes.map((resume) => (
            <li key={`${resume.kind}-${resume.id}`}>
              <div>
                <h2>{resume.title}</h2>
                <p>
                  {resume.kind === "manual_draft"
                    ? "Manual draft"
                    : "Imported resume"}
                  {" · Updated "}
                  <time dateTime={resume.updatedAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(resume.updatedAt))}
                  </time>
                </p>
              </div>
              <Link className="secondary-action" href={resume.editUrl}>
                Continue editing
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
