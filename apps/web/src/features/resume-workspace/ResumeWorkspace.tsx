"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ResumeWorkspaceListResponse } from "@nuvitae/contracts";
import { listResumes } from "./client";

export function ResumeWorkspace() {
  const [response, setResponse] = useState<
    ResumeWorkspaceListResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    void listResumes({ signal: controller.signal }).then((outcome) => {
      if (outcome.ok) {
        setResponse(outcome.response);
        setError(undefined);
      } else if (!outcome.cancelled) setError(outcome.message);
    });
    return () => controller.abort();
  }, []);

  if (error !== undefined) {
    return (
      <section
        className="panel resume-workspace"
        aria-labelledby="resumes-title"
      >
        <p className="eyebrow">Workspace</p>
        <h1 id="resumes-title">My resumes</h1>
        <p className="message message-error" role="alert">
          {error}
        </p>
      </section>
    );
  }
  if (response === undefined) {
    return (
      <section className="panel resume-workspace" aria-busy="true">
        <h1>My resumes</h1>
        <p role="status">Loading your resumes.</p>
      </section>
    );
  }
  return (
    <section className="panel resume-workspace" aria-labelledby="resumes-title">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="resumes-title">My resumes</h1>
          <p>Open a saved resume and continue where you left off.</p>
        </div>
        <Link className="primary-action" href="/import-resume">
          Create a resume
        </Link>
      </div>
      {response.resumes.length === 0 ? (
        <div className="workspace-empty">
          <h2>Create your first resume</h2>
          <p>
            Import an existing resume or start with a blank structured draft.
          </p>
          <div className="choice-grid">
            <Link className="primary-action" href="/import-resume">
              Import an existing resume
            </Link>
            <Link className="secondary-action" href="/resumes/new/manual">
              Create a resume manually
            </Link>
          </div>
        </div>
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
    </section>
  );
}
