"use client";

import { useEffect, useId, useRef } from "react";
import type { LimitedDeterministicFallbackDisclosure } from "@nuvitae/contracts";
import { ErrorSummary } from "./ErrorSummary";
import { focusErrorSummary, focusRecoverySection } from "./focus-management";

/**
 * T176 - provider recovery UI.
 *
 * Provider-neutral recovery panel for self-hosted import. It renders only
 * recovery actions returned by the backend (T167/T173/T187/T188 contracts)
 * and maps each provider-neutral recovery state to plain-language UI content.
 * It never reimplements backend recovery decisions and never exposes provider
 * configuration, model names, prompts, OAuth implementation, credentials,
 * session references, storage paths, raw diagnostics, or internal capability
 * identifiers.
 */

export const manualEntryUrl = "/resumes/new/manual" as const;

export type ProviderRecoveryState =
  | "no_provider"
  | "disconnected"
  | "authentication_expired"
  | "authentication_revoked"
  | "provider_unavailable"
  | "rate_limited"
  | "quota_exceeded"
  | "timeout"
  | "malformed_output"
  | "invalid_schema"
  | "invalid_evidence"
  | "ungrounded"
  | "invented"
  | "unsupported_capability"
  | "unknown";

export type ProviderRecoveryAction =
  | "retry"
  | "reconnect_provider"
  | "choose_another_provider"
  | "limited_deterministic_partial_extraction"
  | "replace_upload"
  | "manual_entry";

export interface ProviderRecoveryActionsProps {
  readonly state: ProviderRecoveryState;
  readonly recoveryActions: readonly ProviderRecoveryAction[];
  readonly alternativeProviderAvailable: boolean;
  readonly fallbackDisclosure?: LimitedDeterministicFallbackDisclosure;
  readonly busy?: boolean;
  readonly error?: string | undefined;
  readonly onRetry?: () => void;
  readonly onReconnect?: () => void;
  readonly onChooseAnotherProvider?: () => void;
  readonly onContinueLimitedExtraction?: () => void;
  readonly onReplaceUpload?: () => void;
  readonly onManualEntry: () => void;
}

interface RecoveryStateContent {
  readonly title: string;
  readonly explanation: string;
  readonly primaryAction?: ProviderRecoveryAction;
  readonly allowedActions: ReadonlySet<ProviderRecoveryAction>;
}

const actionSet = (
  ...actions: readonly ProviderRecoveryAction[]
): ReadonlySet<ProviderRecoveryAction> => new Set(actions);

/**
 * Single provider-neutral frontend mapping from existing public recovery
 * categories to UI content. Allowed actions mirror the T167/T173/T187/T188
 * contracts: retry only for retryable failures, reconnect only for
 * connection/authentication states, limited deterministic extraction only for
 * executable T188 triggers, and no fallback for unsupported capability or
 * revoked authentication.
 */
const recoveryStateContent: Readonly<
  Record<ProviderRecoveryState, RecoveryStateContent>
> = {
  no_provider: {
    title: "No AI provider connected",
    explanation:
      "Connect an AI provider to analyse your resume. Reliable analysis needs a connected, compatible AI provider.",
    primaryAction: "choose_another_provider",
    allowedActions: actionSet(
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  disconnected: {
    title: "Your AI provider is disconnected",
    explanation:
      "Your AI provider connection is disconnected. Reconnect it to continue, or choose another provider.",
    primaryAction: "reconnect_provider",
    allowedActions: actionSet(
      "reconnect_provider",
      "choose_another_provider",
      "manual_entry",
    ),
  },
  authentication_expired: {
    title: "Your provider session has expired",
    explanation:
      "Your provider session has expired. Reconnect it to continue, or choose another provider.",
    primaryAction: "reconnect_provider",
    allowedActions: actionSet(
      "reconnect_provider",
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  authentication_revoked: {
    title: "Your provider connection is no longer valid",
    explanation:
      "Your provider connection is no longer valid. Reconnect it to continue, or choose another provider.",
    primaryAction: "reconnect_provider",
    allowedActions: actionSet(
      "reconnect_provider",
      "choose_another_provider",
      "manual_entry",
    ),
  },
  provider_unavailable: {
    title: "The AI provider is temporarily unavailable",
    explanation:
      "The AI provider is temporarily unavailable. You can try again later, choose another provider, or continue with a limited extraction.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  rate_limited: {
    title: "The AI provider is receiving too many requests",
    explanation:
      "The AI provider is receiving too many requests right now. You can try again later or continue with a limited extraction.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  quota_exceeded: {
    title: "The AI provider subscription quota is exhausted",
    explanation:
      "The AI provider subscription quota is exhausted. Choose another provider or continue with a limited extraction.",
    primaryAction: "choose_another_provider",
    allowedActions: actionSet(
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  timeout: {
    title: "The AI provider took too long to respond",
    explanation:
      "The AI provider took too long to analyse your resume. You can try again or choose another provider.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  malformed_output: {
    title: "The AI provider returned an unexpected response",
    explanation:
      "The AI provider returned a response that could not be used. You can try again or choose another provider.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ),
  },
  invalid_schema: {
    title: "The AI provider returned an unexpected format",
    explanation:
      "The AI provider returned information in an unexpected format. You can try again or choose another provider.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "manual_entry",
    ),
  },
  invalid_evidence: {
    title: "The AI provider returned information without valid source evidence",
    explanation:
      "The AI provider returned information that could not be tied to your resume. You can try again or choose another provider.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "manual_entry",
    ),
  },
  ungrounded: {
    title: "The AI provider returned information that could not be verified",
    explanation:
      "Some provider output could not be linked to your resume. You can try again or choose another provider.",
    primaryAction: "retry",
    allowedActions: actionSet(
      "retry",
      "choose_another_provider",
      "manual_entry",
    ),
  },
  invented: {
    title: "The AI provider returned information not in your resume",
    explanation:
      "The AI provider suggested information that is not present in your resume, so it was not included. You can enter your resume manually to continue.",
    allowedActions: actionSet("manual_entry"),
  },
  unsupported_capability: {
    title: "The AI provider cannot analyse this resume",
    explanation:
      "The connected AI provider does not support the analysis this resume needs. Choose another provider or enter your resume manually.",
    primaryAction: "choose_another_provider",
    allowedActions: actionSet("choose_another_provider", "manual_entry"),
  },
  unknown: {
    title: "We could not prepare this resume for review",
    explanation:
      "Something went wrong while preparing your resume. You can try again, upload a different file, or enter your resume manually.",
    allowedActions: actionSet("retry", "replace_upload", "manual_entry"),
  },
};

const actionOrder: readonly ProviderRecoveryAction[] = [
  "retry",
  "reconnect_provider",
  "choose_another_provider",
  "limited_deterministic_partial_extraction",
  "replace_upload",
];

const actionLabels: Readonly<Record<ProviderRecoveryAction, string>> = {
  retry: "Try again",
  reconnect_provider: "Reconnect AI provider",
  choose_another_provider: "Choose another provider",
  limited_deterministic_partial_extraction: "Continue with limited extraction",
  replace_upload: "Upload a different file",
  manual_entry: "Enter manually",
};

export function ProviderRecoveryActions(props: ProviderRecoveryActionsProps) {
  const titleId = useId();
  const fallbackTitleId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const previousStateRef = useRef<ProviderRecoveryState | undefined>(undefined);
  const previousErrorRef = useRef<string | undefined>(undefined);
  const content = recoveryStateContent[props.state];
  const offered = offeredActions(props);

  const primaryAction =
    content.primaryAction !== undefined &&
    offered.includes(content.primaryAction)
      ? content.primaryAction
      : offered[0];

  useEffect(() => {
    // Newly rendered recovery panels receive focus only when the recovery
    // state appears or transitions, so repeated renders never steal focus.
    if (previousStateRef.current !== props.state) {
      previousStateRef.current = props.state;
      focusRecoverySection(sectionRef.current);
    }
  }, [props.state]);

  useEffect(() => {
    if (props.error !== undefined && props.error !== previousErrorRef.current) {
      focusErrorSummary(summaryRef.current);
    }
    previousErrorRef.current = props.error;
  }, [props.error]);

  return (
    <section
      className="import-card"
      aria-labelledby={titleId}
      aria-describedby={
        props.fallbackDisclosure === undefined ? undefined : fallbackTitleId
      }
      ref={sectionRef}
      tabIndex={-1}
    >
      <p className="eyebrow">Resume import</p>
      <h2 id={titleId}>{content.title}</h2>
      <p>{content.explanation}</p>

      <ErrorSummary
        ref={summaryRef}
        heading="The recovery action could not be completed"
        errors={
          props.error === undefined
            ? []
            : [
                {
                  id: "provider-recovery-error",
                  message: props.error,
                },
              ]
        }
      />

      {props.fallbackDisclosure === undefined ? null : (
        <div className="message" aria-labelledby={fallbackTitleId}>
          <h3 id={fallbackTitleId}>{props.fallbackDisclosure.title}</h3>
          <p>{props.fallbackDisclosure.summary}</p>
          <p>Extracted fields are unconfirmed and need your review.</p>
        </div>
      )}

      <div className="action-row">
        {offered.map((action) => {
          const handler = actionHandler(action, props);
          if (handler === undefined) return null;
          return (
            <button
              key={action}
              type="button"
              className={
                action === primaryAction ? "primary-action" : "secondary-button"
              }
              disabled={props.busy}
              onClick={handler}
            >
              {actionLabels[action]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function offeredActions(
  props: ProviderRecoveryActionsProps,
): readonly ProviderRecoveryAction[] {
  const content = recoveryStateContent[props.state];
  const offered: ProviderRecoveryAction[] = [];
  for (const action of actionOrder) {
    if (
      props.recoveryActions.includes(action) &&
      isOfferedAction(action, content, props.alternativeProviderAvailable)
    ) {
      offered.push(action);
    }
  }
  // Unknown states fail safely: replacement upload and manual entry are always
  // available, while retry is rendered only when the backend explicitly
  // permits it.
  if (props.state === "unknown" && !offered.includes("replace_upload")) {
    offered.push("replace_upload");
  }
  offered.push("manual_entry");
  return offered;
}

function isOfferedAction(
  action: ProviderRecoveryAction,
  content: RecoveryStateContent,
  alternativeProviderAvailable: boolean,
): boolean {
  if (!content.allowedActions.has(action)) return false;
  if (action === "choose_another_provider" && !alternativeProviderAvailable) {
    return false;
  }
  return true;
}

function actionHandler(
  action: ProviderRecoveryAction,
  props: ProviderRecoveryActionsProps,
): (() => void) | undefined {
  switch (action) {
    case "retry":
      return props.onRetry;
    case "reconnect_provider":
      return props.onReconnect;
    case "choose_another_provider":
      return props.onChooseAnotherProvider;
    case "limited_deterministic_partial_extraction":
      return props.onContinueLimitedExtraction;
    case "replace_upload":
      return props.onReplaceUpload;
    case "manual_entry":
      return props.onManualEntry;
  }
}
