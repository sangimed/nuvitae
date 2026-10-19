"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ConfirmedStructuredResumeReadResponse } from "@nuvitae/contracts";
import {
  createResumeRenderingModel,
  ProfessionalResume,
} from "../resume-renderer";
import { readConfirmedStructuredResume } from "../import-resume/client";
import { recordCommunityFunnelEvent } from "../../services/community-funnel";
import { useTranslation } from "../../i18n/LocaleProvider";

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
  const { t } = useTranslation();
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
        recordCommunityFunnelEvent({
          funnelEvent: "pdf_export.failed",
          failureCategory: "preparation_timeout",
        });
        setState({
          kind: "error",
          message: t("resume.export.error.safe"),
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
        recordCommunityFunnelEvent({
          funnelEvent: "pdf_export.failed",
          failureCategory: "load_failed",
        });
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
        <h1>{t("resume.export.loading.title")}</h1>
        <p role="status">{t("resume.export.loading.status")}</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="import-card" aria-labelledby="export-error-title">
        <h1 id="export-error-title">{t("resume.export.error.title")}</h1>
        <p role="alert">{t("resume.export.error.safe")}</p>
        <div className="resume-actions">
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("resume.export.retry")}
          </button>
          <Link href={`/resumes/${props.resumeId}`}>
            {t("resume.export.back")}
          </Link>
        </div>
      </section>
    );
  }

  const openPrintDialog = () => {
    setState({ ...state, printStatus: "opening" });
    printTimer.current = window.setTimeout(() => {
      try {
        window.print();
        recordCommunityFunnelEvent({
          funnelEvent: "pdf_export.succeeded",
        });
        setState((current) =>
          current.kind === "ready"
            ? { ...current, printStatus: "complete" }
            : current,
        );
      } catch {
        recordCommunityFunnelEvent({
          funnelEvent: "pdf_export.failed",
          failureCategory: "print_failed",
        });
        setState({
          kind: "error",
          message: t("resume.export.error.safe"),
        });
      }
    }, 0);
  };

  return (
    <section className="resume-export-view" aria-labelledby="export-title">
      <div className="export-controls">
        <p className="eyebrow">{t("resume.export.eyebrow")}</p>
        <h1 id="export-title">{t("resume.export.title")}</h1>
        <p>{t("resume.export.instructions")}</p>
        <div className="resume-actions">
          <button
            type="button"
            onClick={openPrintDialog}
            disabled={state.printStatus === "opening"}
          >
            {state.printStatus === "opening"
              ? t("resume.export.opening")
              : t("resume.export.save")}
          </button>
          <Link href={`/resumes/${props.resumeId}`}>
            {t("resume.export.back")}
          </Link>
        </div>
        <p role="status" aria-live="polite">
          {state.printStatus === "idle"
            ? t("resume.export.status.ready")
            : state.printStatus === "opening"
              ? t("resume.export.status.opening")
              : t("resume.export.status.complete")}
        </p>
      </div>
      <ProfessionalResume
        model={createResumeRenderingModel(state.resume.content)}
      />
    </section>
  );
}
