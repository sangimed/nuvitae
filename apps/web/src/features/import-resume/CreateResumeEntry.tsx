"use client";

import Link from "next/link";

export function CreateResumeEntry(props: {
  readonly onChooseImport: () => void;
}) {
  return (
    <section className="import-card" aria-labelledby="import-entry-title">
      <p className="eyebrow">Recommended</p>
      <h1 id="import-entry-title">Start from your existing resume</h1>
      <p className="lead">
        Upload a PDF or DOCX resume and Nuvitae will prepare a draft for you to
        review before any structured resume is created.
      </p>

      <div className="choice-grid" aria-label="Resume creation choices">
        <article className="choice-card choice-card-primary">
          <p className="badge">Recommended path</p>
          <h2>Import a resume</h2>
          <p>
            Best if you already have a resume. You stay in control and review
            the imported information before using it.
          </p>
          <button
            className="primary-action"
            type="button"
            onClick={props.onChooseImport}
          >
            Import my resume
          </button>
        </article>

        <article className="choice-card">
          <h2>Enter it manually</h2>
          <p>
            Use this if you prefer to start with a blank resume and fill in each
            section yourself.
          </p>
          <Link className="secondary-action" href="/resumes/new/manual">
            Enter manually
          </Link>
        </article>
      </div>
    </section>
  );
}
