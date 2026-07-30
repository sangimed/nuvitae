"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import {
  initialImportState,
  transitionImportState,
  type ClientImportState,
} from "./state";
import { CreateResumeEntry } from "./CreateResumeEntry";
import { UploadStep } from "./UploadStep";
import { ProcessingStep } from "./ProcessingStep";
import { pollImportStatus } from "../../services/import-resume/import-status-client";
import { startImportUpload } from "../../services/import-resume/start-import-client";

const initialProcessingStatus = (
  importId: string,
): PublicImportStatusResponse => ({
  version: "2026-07-28",
  requestId: "00000000-0000-4000-8000-000000000000",
  importId,
  status: "processing",
  currentStep: "checking_document",
  progressKnown: false,
  allowedRecoveryActions: ["manual_entry"],
  userMessage: "Checking that your document can be imported.",
});

export function ImportFlow() {
  const [state, setState] = useState<ClientImportState>(initialImportState);
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [status, setStatus] = useState<
    PublicImportStatusResponse | undefined
  >();
  const [connectivityMessage, setConnectivityMessage] = useState<
    string | undefined
  >();
  const uploadAbort = useRef<AbortController | null>(null);
  const uploadInFlight = useRef(false);

  const activeImportId = useMemo(
    () => ("importId" in state ? state.importId : undefined),
    [state],
  );

  useEffect(() => {
    if (activeImportId === undefined) return;
    if (
      status !== undefined &&
      status.importId === activeImportId &&
      status.status !== "processing"
    )
      return;
    const controller = new AbortController();
    void pollImportStatus({
      importId: activeImportId,
      signal: controller.signal,
      onStatus: (next) => {
        setConnectivityMessage(undefined);
        setStatus(next);
        applyStatusState(next, setState);
      },
      onConnectivityLost: setConnectivityMessage,
    });
    return () => controller.abort();
  }, [activeImportId, status]);

  function chooseImport() {
    setState(
      transitionImportState(state, {
        type: "choose_import",
        authenticated: true,
      }) ?? state,
    );
  }

  async function submit(file: File) {
    if (uploadInFlight.current) return;
    uploadInFlight.current = true;
    setUploading(true);
    setUploadError(undefined);
    const controller = new AbortController();
    uploadAbort.current = controller;
    const outcome = await startImportUpload({
      file,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      if (uploadAbort.current === controller) uploadAbort.current = null;
      uploadInFlight.current = false;
      setUploading(false);
      return;
    }
    setUploading(false);
    if (uploadAbort.current === controller) uploadAbort.current = null;
    uploadInFlight.current = false;
    if (!outcome.ok) {
      setUploadError(outcome.message);
      return;
    }
    setSelectedFile(undefined);
    setState(
      transitionImportState(state, {
        type: "start_validation",
        importId: outcome.response.importId,
      }) ?? state,
    );
    setStatus(initialProcessingStatus(outcome.response.importId));
  }

  function replaceUpload() {
    uploadAbort.current?.abort();
    setSelectedFile(undefined);
    setUploadError(undefined);
    setStatus(undefined);
    setState({ state: "upload_selection" });
  }

  function manualEntry() {
    window.location.assign("/resumes/new/manual");
  }

  if (state.state === "initial_choice") {
    return <CreateResumeEntry onChooseImport={chooseImport} />;
  }

  if (state.state === "upload_selection") {
    return (
      <UploadStep
        {...(selectedFile === undefined ? {} : { selectedFile })}
        busy={uploading}
        serverError={uploadError}
        onBack={() => setState(initialImportState)}
        onFileSelected={(file) => {
          setSelectedFile(file);
          setUploadError(undefined);
          if (file !== undefined) {
            setState(
              transitionImportState(state, {
                type: "select_file",
                fileName: file.name,
              }) ?? state,
            );
          }
        }}
        onSubmit={submit}
      />
    );
  }

  const shownStatus =
    status ??
    ("importId" in state ? initialProcessingStatus(state.importId) : undefined);

  if (shownStatus !== undefined) {
    return (
      <ProcessingStep
        status={shownStatus}
        connectivityMessage={connectivityMessage}
        onManualEntry={manualEntry}
        onReplaceUpload={replaceUpload}
        onReview={(importId) =>
          window.location.assign(`/import-resume/${importId}/review`)
        }
      />
    );
  }

  return <CreateResumeEntry onChooseImport={chooseImport} />;
}

function applyStatusState(
  status: PublicImportStatusResponse,
  setState: (
    update:
      ClientImportState | ((current: ClientImportState) => ClientImportState),
  ) => void,
) {
  setState((current) => {
    if (!("importId" in current) || current.importId !== status.importId) {
      return current;
    }
    if (status.status === "processing") {
      return {
        state: "extracting",
        importId: status.importId,
        progress:
          status.progressKnown && status.progressPercent !== undefined
            ? {
                known: true,
                label: status.currentStep ?? "reading_content",
                percent: status.progressPercent,
              }
            : { known: false, label: status.currentStep ?? "reading_content" },
        retryAvailable: false,
      };
    }
    if (status.status === "draft_ready" && status.draftSummary !== undefined) {
      return {
        state: "review_ready",
        importId: status.importId,
        draftId: status.draftSummary.draftId,
        unresolvedWarningCount: status.draftSummary.warningCount,
      };
    }
    if (
      status.status === "partial_extraction" &&
      status.draftSummary !== undefined
    ) {
      return {
        state: "partial_result",
        importId: status.importId,
        draftId: status.draftSummary.draftId,
        missingOrUnprocessedSections: ["review"],
        recoveryActions: ["replace_upload", "manual_entry"],
      };
    }
    if (status.status === "recoverable_timeout") {
      return {
        state: "recoverable_timeout",
        importId: status.importId,
        ...(status.draftSummary === undefined
          ? {}
          : { draftId: status.draftSummary.draftId }),
        recoveryActions: ["replace_upload", "manual_entry"],
      };
    }
    if (status.status === "validation_failure") {
      return {
        state: "retryable_failure",
        importId: status.importId,
        reason: "unsupported_file",
        recoveryActions: ["replace_upload", "manual_entry"],
      };
    }
    if (status.status === "terminal_processing_failure") {
      return {
        state: "terminal_failure",
        importId: status.importId,
        reason: "unexpected",
        recoveryActions: ["replace_upload", "manual_entry"],
      };
    }
    if (status.status === "expired") {
      return {
        state: "expired",
        importId: status.importId,
        recoveryActions: ["replace_upload", "manual_entry"],
      };
    }
    return current;
  });
}
