"use client";

import { useEffect, useState } from "react";
import type { ConfirmedStructuredResumeReadResponse } from "@nuvitae/contracts";
import {
  createResumeRenderingModel,
  ProfessionalResume,
} from "../resume-renderer";
import { readConfirmedStructuredResume } from "./client";
import { StructuredResumeProvenance } from "./StructuredResumeProvenance";

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
      <ProfessionalResume model={createResumeRenderingModel(resume.content)} />
    </section>
  );
}
