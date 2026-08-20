"use client";

import { useEffect, useState } from "react";
import type { ConfirmedStructuredResumeReadResponse } from "@nuvitae/contracts";
import { readConfirmedStructuredResume } from "../../services/import-resume/confirmation-client";
import {
  StructuredFieldProvenance,
  StructuredResumeProvenance,
} from "./StructuredResumeProvenance";

export function ConfirmedResumeView(props: { readonly resumeId: string }) {
  const [resume, setResume] = useState<
    ConfirmedStructuredResumeReadResponse | undefined
  >();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    void readConfirmedStructuredResume({
      resumeId: props.resumeId,
      signal: controller.signal,
    }).then((outcome) => {
      if (outcome.ok) {
        setResume(outcome.response);
        setError(undefined);
      } else if (outcome.category !== "cancelled") {
        setError(outcome.message);
      }
    });
    return () => controller.abort();
  }, [props.resumeId]);

  if (error !== undefined) {
    return (
      <section className="import-card" aria-labelledby="resume-error-title">
        <h1 id="resume-error-title">Resume unavailable</h1>
        <p role="alert">{error}</p>
      </section>
    );
  }
  if (resume === undefined) {
    return (
      <section className="import-card" aria-busy="true">
        <h1>Loading your resume</h1>
        <p role="status">Loading your resume.</p>
      </section>
    );
  }
  return (
    <section className="resume-read-view" aria-labelledby="resume-title">
      <p className="eyebrow">Resume</p>
      <h1 id="resume-title">Your resume is ready</h1>
      <p>{resume.userMessage}</p>
      <StructuredResumeProvenance resume={resume} />
      <ResumeSection title="Personal" values={resume.content.personal} />
      <ResumeSection title="Contact" values={resume.content.contact} />
      {resume.content.headline === undefined ? null : (
        <ResumeSection title="Headline" values={[resume.content.headline]} />
      )}
      {resume.content.summary === undefined ? null : (
        <ResumeSection
          title="Professional summary"
          values={[resume.content.summary]}
        />
      )}
      <ResumeSection
        title="Skills"
        values={resume.content.skills.map((item) => item.name)}
      />
      <ResumeSection
        title="Languages"
        values={resume.content.languages.map((item) => item.name)}
      />
      <ResumeSection
        title="Professional links"
        values={resume.content.professionalLinks.map((item) => item.url)}
      />
    </section>
  );
}

function ResumeSection(props: {
  readonly title: string;
  readonly values: readonly ConfirmedStructuredResumeReadResponse["content"]["personal"][number][];
}) {
  return (
    <section
      className="review-section"
      aria-labelledby={`${props.title}-heading`}
    >
      <h2 id={`${props.title}-heading`}>{props.title}</h2>
      {props.values.length === 0 ? <p>No confirmed content.</p> : null}
      {props.values.map((value, index) => (
        <article className="review-field" key={`${props.title}-${index}`}>
          <p>{value.value}</p>
          <p>
            <StructuredFieldProvenance provenance={value.provenance} />
          </p>
        </article>
      ))}
    </section>
  );
}
