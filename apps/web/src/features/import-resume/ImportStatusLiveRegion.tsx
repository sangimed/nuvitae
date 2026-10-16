"use client";

import { useEffect, useRef, useState } from "react";

/**
 * T061 - import status live region.
 *
 * Reusable announcement surface for important import state changes. It
 * receives an already normalized public status and optional plain-language
 * message from the caller; it never recreates backend decision logic. All
 * default announcements are provider-neutral, deterministic, and free of
 * technical codes, diagnostics, credentials, and fabricated percentages.
 */

export type ImportLiveRegionState =
  | "upload_accepted"
  | "validation_started"
  | "processing_started"
  | "processing_progress"
  | "provider_connection_required"
  | "provider_unavailable"
  | "limited_deterministic_fallback_started"
  | "partial_draft_ready"
  | "review_ready"
  | "processing_failed"
  | "retry_started"
  | "cancellation_completed"
  | "source_deletion_completed"
  | "unknown";

export const defaultAnnouncementText: Readonly<
  Record<ImportLiveRegionState, string>
> = {
  upload_accepted: "Your file was accepted for import.",
  validation_started: "Nuvitae is checking that your document can be imported.",
  processing_started: "Nuvitae is preparing your resume for review.",
  processing_progress: "Nuvitae is still preparing your resume for review.",
  provider_connection_required:
    "A connected AI provider is needed to analyse your resume.",
  provider_unavailable:
    "The AI provider is temporarily unavailable. You can try again or continue with limited extraction.",
  limited_deterministic_fallback_started:
    "Limited automatic extraction has started. It may miss information.",
  partial_draft_ready:
    "A partial draft is ready for review. Some information may be missing.",
  review_ready: "Your resume draft is ready for review.",
  processing_failed:
    "Your resume could not be prepared for review. You can try again or enter the information manually.",
  retry_started: "Nuvitae is trying to prepare your resume again.",
  cancellation_completed: "The import was cancelled.",
  source_deletion_completed: "The uploaded source has been removed.",
  unknown: "The import status changed.",
};

/**
 * Assertive announcements are reserved for blocking or urgent failures.
 * Everything else stays polite.
 */
export const assertiveAnnouncementStates: ReadonlySet<ImportLiveRegionState> =
  new Set(["processing_failed"]);

export interface ImportStatusAnnouncement {
  readonly state: ImportLiveRegionState;
  /**
   * Optional plain-language message already normalized by the caller. It is
   * announced only when it passes the public plain-text guard; otherwise the
   * deterministic default for the state is used so technical content never
   * reaches assistive technology.
   */
  readonly message?: string;
  /** Public step label, e.g. "checking the document". */
  readonly progressStep?: string;
}

export interface ImportStatusLiveRegionProps extends ImportStatusAnnouncement {
  readonly assertive?: boolean;
  readonly id?: string;
  /**
   * Localized safe default for the normalized state. Caller-provided messages
   * remain subject to the public-text guard and are never translated here.
   */
  readonly defaultText?: string;
}

const publicAnnouncementTextPattern = /^[\p{L}\p{N}\s.,!?'’"()\-—%]+$/u;

const maximumPublicMessageLength = 240;

/**
 * Guards against announcing internal diagnostics: control characters, paths,
 * URLs, key-value syntax, and other technical markers are rejected and the
 * deterministic default announcement is used instead.
 */
export function toPublicAnnouncement(
  state: ImportLiveRegionState,
  message: string | undefined,
): string | undefined {
  if (message === undefined) return undefined;
  const trimmed = message.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maximumPublicMessageLength ||
    !publicAnnouncementTextPattern.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

export function normalizeState(
  state: ImportLiveRegionState,
): ImportLiveRegionState {
  return state in defaultAnnouncementText ? state : "unknown";
}

export function composeAnnouncement(
  input: ImportStatusAnnouncement,
  defaultText?: string,
): string {
  const state = normalizeState(input.state);
  const base =
    toPublicAnnouncement(state, input.message) ??
    defaultText ??
    defaultAnnouncementText[state];
  if (state !== "processing_progress") return base;

  const parts = [base];
  if (input.progressStep !== undefined && input.progressStep.trim() !== "") {
    parts.push(input.progressStep.trim());
  }
  return parts.join(" ");
}

/**
 * Stable key used to suppress repeated identical announcements. Identical
 * state and message with the same progress inputs produce the same key, so
 * re-renders do not re-announce the same state.
 */
export function announcementKey(input: ImportStatusAnnouncement): string {
  return [
    normalizeState(input.state),
    input.message ?? "",
    input.progressStep ?? "",
  ].join("\u0000");
}

export function ImportStatusLiveRegion(props: ImportStatusLiveRegionProps) {
  const { assertive, defaultText, id, ...announcement } = props;
  const state = normalizeState(announcement.state);
  const key = `${announcementKey(announcement)}\u0000${defaultText ?? ""}`;
  const [displayText, setDisplayText] = useState(() =>
    composeAnnouncement(announcement, defaultText),
  );
  const lastKeyRef = useRef(key);

  useEffect(() => {
    const nextKey = `${announcementKey(announcement)}\u0000${defaultText ?? ""}`;
    if (lastKeyRef.current === nextKey) return;
    lastKeyRef.current = nextKey;
    setDisplayText(composeAnnouncement(announcement, defaultText));
  }, [announcement, defaultText]);

  const urgent = assertive ?? assertiveAnnouncementStates.has(state);
  const role = urgent ? "alert" : "status";
  const live = urgent ? "assertive" : "polite";

  return (
    <div
      {...(id === undefined ? {} : { id })}
      role={role}
      aria-live={live}
      aria-atomic="true"
      className="status-live import-status-live-region"
    >
      {displayText}
    </div>
  );
}
