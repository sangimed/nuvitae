"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicImportStatusResponse } from "@nuvitae/contracts";
import {
  ImportStatusLiveRegion,
  type ImportLiveRegionState,
  type ImportStatusAnnouncement,
} from "./ImportStatusLiveRegion";
import {
  ProviderRecoveryActions,
  type ProviderRecoveryState,
} from "./ProviderRecoveryActions";
import {
  initialImportState,
  transitionImportState,
  type ClientImportState,
} from "./state";
import { CreateResumeEntry } from "./CreateResumeEntry";
import { labelForStep, messageKeyForStep } from "./ProcessingStep";
import { ProcessingStep } from "./ProcessingStep";
import { UploadStep } from "./UploadStep";
import { pollImportStatus } from "./client";
import { startImportUpload } from "./client";
import { recordImportTiming } from "./client";
import { useTranslation } from "../../i18n/LocaleProvider";
import type { MessageKey } from "../../i18n/messages";
import { direction, translate } from "../../i18n/locale";

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

/**
 * T063 - maps a public import status to a normalized, provider-neutral live
 * announcement. Unknown or unmapped statuses fail safely to the generic
 * "unknown" announcement rather than exposing internal details.
 */
export function announcementForStatus(
  status: PublicImportStatusResponse,
  processingAnnounced: boolean,
  progressStep = labelForStep(status.currentStep),
): ImportStatusAnnouncement {
  switch (status.status) {
    case "processing":
      return processingAnnounced
        ? {
            state: "processing_progress",
            progressStep,
          }
        : { state: "processing_started" };
    case "draft_ready":
      return { state: "review_ready" };
    case "partial_extraction":
      return { state: "partial_draft_ready" };
    case "recoverable_timeout":
    case "validation_failure":
    case "terminal_processing_failure":
    case "expired":
      return { state: "processing_failed" };
    case "cancelled":
      return { state: "cancellation_completed" };
    case "authentication_required":
    case "connectivity_lost":
    case "not_found":
      return { state: "unknown" };
  }
}

/**
 * T063 - maps a provider recovery state to the closest safe announcement.
 * The flow uses this when a provider recovery panel appears; unmapped or
 * unexpected states fall back to the generic announcement.
 */
export function announcementForRecoveryState(
  state: ProviderRecoveryState,
): ImportLiveRegionState {
  switch (state) {
    case "no_provider":
    case "disconnected":
    case "authentication_expired":
    case "authentication_revoked":
      return "provider_connection_required";
    case "provider_unavailable":
    case "rate_limited":
    case "quota_exceeded":
    case "timeout":
      return "provider_unavailable";
    case "malformed_output":
    case "invalid_schema":
    case "invalid_evidence":
    case "ungrounded":
    case "invented":
    case "unsupported_capability":
      return "processing_failed";
    case "unknown":
      return "unknown";
  }
}

export function messageKeyForAnnouncement(
  state: ImportLiveRegionState,
): MessageKey {
  switch (state) {
    case "upload_accepted":
      return "import.status.uploadAccepted";
    case "validation_started":
      return "import.status.validationStarted";
    case "processing_started":
      return "import.status.processingStarted";
    case "processing_progress":
      return "import.status.processingProgress";
    case "provider_connection_required":
      return "import.status.providerConnectionRequired";
    case "provider_unavailable":
      return "import.status.providerUnavailable";
    case "limited_deterministic_fallback_started":
      return "import.status.limitedExtractionStarted";
    case "partial_draft_ready":
      return "import.status.partialDraftReady";
    case "review_ready":
      return "import.status.reviewReady";
    case "processing_failed":
      return "import.status.processingFailed";
    case "retry_started":
      return "import.status.retryStarted";
    case "cancellation_completed":
      return "import.status.cancellationCompleted";
    case "source_deletion_completed":
      return "import.status.sourceDeletionCompleted";
    case "unknown":
      return "import.status.unknown";
  }
}

/**
 * T063 - generic fail-safe recovery for unknown or malformed frontend import
 * states. It offers only explicitly safe actions (replacement upload and
 * manual entry) and is rendered with intentional focus by
 * ProviderRecoveryActions.
 */
export function UnknownImportRecovery(props: {
  readonly onReplaceUpload: () => void;
  readonly onManualEntry: () => void;
}) {
  return (
    <ProviderRecoveryActions
      state="unknown"
      recoveryActions={["replace_upload", "manual_entry"]}
      alternativeProviderAvailable={false}
      onReplaceUpload={props.onReplaceUpload}
      onManualEntry={props.onManualEntry}
    />
  );
}

export function ImportFlow(props: { readonly importId?: string }) {
  const { locale, t } = useTranslation();
  const [state, setState] = useState<ClientImportState>(() =>
    props.importId === undefined
      ? initialImportState
      : {
          state: "validating",
          importId: props.importId,
          progress: { known: false, label: "checking_document" },
        },
  );
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [announcement, setAnnouncement] = useState<
    ImportStatusAnnouncement | undefined
  >();
  const [status, setStatus] = useState<
    PublicImportStatusResponse | undefined
  >();
  const [connectivityMessage, setConnectivityMessage] = useState<
    string | undefined
  >();
  const uploadAbort = useRef<AbortController | null>(null);
  const uploadInFlight = useRef(false);
  const processingAnnouncedImportRef = useRef<string | null>(null);
  const announcedUnknownRef = useRef(false);
  const firstPollTimedImportRef = useRef<string | null>(null);
  const reviewAvailableTimedImportRef = useRef<string | null>(null);
  const reviewNavigationImportRef = useRef<string | null>(null);

  const activeImportId = useMemo(
    () => ("importId" in state ? state.importId : undefined),
    [state],
  );

  useEffect(() => {
    if (activeImportId === undefined) return;
    const controller = new AbortController();
    void pollImportStatus({
      importId: activeImportId,
      signal: controller.signal,
      onStatus: (next) => {
        setConnectivityMessage(undefined);
        setStatus(next);
        const processingAnnounced =
          processingAnnouncedImportRef.current === next.importId;
        setAnnouncement(
          announcementForStatus(
            next,
            processingAnnounced,
            translate(locale, messageKeyForStep(next.currentStep)),
          ),
        );
        if (next.status === "processing") {
          processingAnnouncedImportRef.current = next.importId;
        }
        if (next.status === "not_found") {
          window.history.replaceState(null, "", "/import-resume");
        }
        applyStatusState(next, setState);
        if (
          (next.status === "draft_ready" ||
            next.status === "partial_extraction") &&
          reviewNavigationImportRef.current !== next.importId
        ) {
          reviewNavigationImportRef.current = next.importId;
          window.location.assign(`/import-resume/${next.importId}/review`);
        }
      },
      onConnectivityLost: setConnectivityMessage,
      onTiming: (timing) => {
        if (
          timing.phase === "review_first_poll" &&
          firstPollTimedImportRef.current !== activeImportId
        ) {
          firstPollTimedImportRef.current = activeImportId;
          recordImportTiming({ importId: activeImportId, phase: timing.phase });
        }
        if (
          timing.phase === "review_available_to_client" &&
          reviewAvailableTimedImportRef.current !== activeImportId
        ) {
          reviewAvailableTimedImportRef.current = activeImportId;
          recordImportTiming({
            importId: activeImportId,
            phase: timing.phase,
            ...(timing.durationMs === undefined
              ? {}
              : { durationMs: timing.durationMs }),
          });
        }
      },
    });
    return () => controller.abort();
  }, [activeImportId, locale]);

  const unknownRecovery =
    state.state !== "initial_choice" &&
    state.state !== "upload_selection" &&
    !("importId" in state);
  const localizedAnnouncement =
    announcement?.state === "processing_progress" &&
    status?.status === "processing"
      ? {
          ...announcement,
          progressStep: t(messageKeyForStep(status.currentStep)),
        }
      : announcement;

  useEffect(() => {
    // Unknown or malformed frontend states fail safely: announce the generic
    // status once and render the generic recovery panel below.
    if (unknownRecovery && !announcedUnknownRef.current) {
      announcedUnknownRef.current = true;
      setAnnouncement({ state: "unknown" });
    }
  }, [unknownRecovery]);

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
    window.history.replaceState(
      null,
      "",
      `/import-resume/${outcome.response.importId}`,
    );
    setState(
      transitionImportState(state, {
        type: "start_validation",
        importId: outcome.response.importId,
      }) ?? state,
    );
    setAnnouncement({ state: "upload_accepted" });
  }

  function replaceUpload() {
    uploadAbort.current?.abort();
    setSelectedFile(undefined);
    setUploadError(undefined);
    setStatus(undefined);
    setAnnouncement(undefined);
    processingAnnouncedImportRef.current = null;
    firstPollTimedImportRef.current = null;
    reviewAvailableTimedImportRef.current = null;
    reviewNavigationImportRef.current = null;
    announcedUnknownRef.current = false;
    setState({ state: "upload_selection" });
  }

  function manualEntry() {
    window.location.assign("/resumes/new/manual");
  }

  let content;
  if (state.state === "initial_choice") {
    content = (
      <div lang={locale} dir={direction(locale)}>
        <CreateResumeEntry onChooseImport={chooseImport} />
      </div>
    );
  } else if (state.state === "upload_selection") {
    content = (
      <div lang={locale} dir={direction(locale)}>
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
      </div>
    );
  } else {
    const shownStatus =
      status ??
      ("importId" in state
        ? initialProcessingStatus(state.importId)
        : undefined);
    if (shownStatus !== undefined) {
      content = (
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
    } else {
      content = (
        <UnknownImportRecovery
          onReplaceUpload={replaceUpload}
          onManualEntry={manualEntry}
        />
      );
    }
  }

  return (
    <>
      {localizedAnnouncement === undefined ? null : (
        <ImportStatusLiveRegion
          {...localizedAnnouncement}
          defaultText={t(messageKeyForAnnouncement(localizedAnnouncement.state))}
        />
      )}
      {content}
    </>
  );
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
    if (status.status === "not_found") {
      return initialImportState;
    }
    return current;
  });
}
