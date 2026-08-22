"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ConfirmedStructuredResumeReadResponse } from "@nuvitae/contracts";
import {
  createResumeRenderingModel,
  ProfessionalResume,
} from "../resume-renderer";
import { readConfirmedStructuredResume } from "../import-resume/client";

const exportPreparationTimeoutMs = 15_000;

type ExportState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly resume: ConfirmedStructuredResumeReadResponse;
      readonly printStatus: "idle" | "opening" | "complete";
    }
  | { readonly kind: "error"; readonly message: string };

export function ResumeExportView(props: { readonly resumeId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ExportState>({ kind: "loading" });
  const printTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ kind: "loading" });

    const timeout = window.setTimeout(() => {
      controller.abort();
      if (active) {
        setState({
          kind: "error",
          message:
            "PDF preparation took too long. Your resume is unchanged. Please try again.",
        });
      }
    }, exportPreparationTimeoutMs);

    void readConfirmedStructuredResume({
      resumeId: props.resumeId,
      signal: controller.signal,
    }).then((outcome) => {
      if (!active) return;
      window.clearTimeout(timeout);
      if (outcome.ok) {
        setState({
          kind: "ready",
          resume: outcome.response,
          printStatus: "idle",
        });
      } else if (outcome.category !== "cancelled") {
        setState({ kind: "error", message: outcome.message });
      }
    });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt, props.resumeId]);

  useEffect(
    () => () => {
      if (printTimer.current !== undefined) {
        window.clearTimeout(printTimer.current);
      }
    },
    [],
  );

  if (state.kind === "loading") {
    return (
      <section className="import-card" aria-busy="true">
        <h1>Preparing your PDF</h1>
        <p role="status">Loading your resume for PDF export.</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="import-card" aria-labelledby="export-error-title">
        <h1 id="export-error-title">PDF export unavailable</h1>
        <p role="alert">{state.message}</p>
        <div className="resume-actions">
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
          <Link href={`/resumes/${props.resumeId}`}>Back to resume</Link>
        </div>
      </section>
    );
  }

  const openPrintDialog = () => {
    setState({ ...state, printStatus: "opening" });
    printTimer.current = window.setTimeout(() => {
      window.print();
      setState((current) =>
        current.kind === "ready"
          ? { ...current, printStatus: "complete" }
          : current,
      );
    }, 0);
  };

  return (
    <section className="resume-export-view" aria-labelledby="export-title">
      <div className="export-controls">
        <p className="eyebrow">PDF export</p>
        <h1 id="export-title">Your PDF is ready to save</h1>
        <p>
          Choose <strong>Save as PDF</strong> in the print dialog. Text remains
          selectable and follows the preview&apos;s reading order.
        </p>
        <div className="resume-actions">
          <button
            type="button"
            onClick={openPrintDialog}
            disabled={state.printStatus === "opening"}
          >
            {state.printStatus === "opening" ? "Opening…" : "Save as PDF"}
          </button>
          <Link href={`/resumes/${props.resumeId}`}>Back to resume</Link>
        </div>
        <p role="status" aria-live="polite">
          {state.printStatus === "idle"
            ? "PDF export is ready."
            : state.printStatus === "opening"
              ? "Opening the print dialog."
              : "The print dialog closed. Your resume remains unchanged."}
        </p>
      </div>
      <ProfessionalResume
        model={createResumeRenderingModel(state.resume.content)}
      />
    </section>
  );
}
