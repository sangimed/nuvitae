export type RecoveryAction =
  "retry" | "replace_upload" | "discard" | "delete_source" | "manual_entry";

export interface ImportRouteShell {
  readonly route: "/import-resume" | "/resumes/new/manual";
  readonly manualEntryUrl: "/resumes/new/manual";
  readonly requiresAuthenticationForUpload: true;
}

export type ImportProgress =
  | {
      readonly known: false;
      readonly label:
        | "checking_document"
        | "reading_content"
        | "organizing_resume_sections"
        | "preparing_review";
    }
  | {
      readonly known: true;
      readonly label:
        | "checking_document"
        | "reading_content"
        | "organizing_resume_sections"
        | "preparing_review";
      readonly percent: number;
    };

export type ClientImportState =
  | {
      readonly state: "initial_choice";
      readonly recommendedAction: "import";
      readonly manualEntryUrl: "/resumes/new/manual";
    }
  | {
      readonly state: "authentication_required";
      readonly returnTo: "/import-resume";
    }
  | { readonly state: "upload_selection"; readonly selectedFileName?: string }
  | {
      readonly state: "validating";
      readonly importId: string;
      readonly progress: ImportProgress;
    }
  | {
      readonly state: "queued";
      readonly importId: string;
      readonly recoveryActions: readonly RecoveryAction[];
    }
  | {
      readonly state: "extracting";
      readonly importId: string;
      readonly progress: ImportProgress;
      readonly retryAvailable: boolean;
    }
  | {
      readonly state: "recoverable_timeout";
      readonly importId: string;
      readonly draftId?: string;
      readonly recoveryActions: readonly RecoveryAction[];
    }
  | {
      readonly state: "partial_result";
      readonly importId: string;
      readonly draftId: string;
      readonly missingOrUnprocessedSections: readonly string[];
      readonly recoveryActions: readonly RecoveryAction[];
    }
  | {
      readonly state: "unsupported_language_contact_preview";
      readonly importId: string;
      readonly previewId: string;
      readonly contactFieldCount: number;
      readonly recoveryActions: readonly (
        "replace_upload" | "discard" | "manual_entry"
      )[];
    }
  | {
      readonly state: "review_ready";
      readonly importId: string;
      readonly draftId: string;
      readonly unresolvedWarningCount: number;
    }
  | {
      readonly state: "cancellation";
      readonly importId: string;
      readonly deletionJobId?: string;
      readonly cancellable: boolean;
    }
  | {
      readonly state: "retryable_failure";
      readonly importId?: string;
      readonly reason:
        | "unsupported_file"
        | "no_usable_extraction"
        | "processing_failure"
        | "rate_limited"
        | "password_protected"
        | "malformed_or_corrupted";
      readonly recoveryActions: readonly RecoveryAction[];
    }
  | {
      readonly state: "terminal_failure";
      readonly importId?: string;
      readonly reason:
        "unsafe_content" | "ambiguous_mixed_content" | "unexpected";
      readonly recoveryActions: readonly ("replace_upload" | "manual_entry")[];
    }
  | {
      readonly state: "expired";
      readonly importId: string;
      readonly recoveryActions: readonly ("replace_upload" | "manual_entry")[];
    }
  | {
      readonly state: "manual_entry_handoff";
      readonly source:
        "initial_choice" | "failure_recovery" | "contact_preview_transfer";
    };

export type ClientImportEvent =
  | { readonly type: "choose_import"; readonly authenticated: boolean }
  | { readonly type: "choose_manual_entry" }
  | { readonly type: "select_file"; readonly fileName: string }
  | { readonly type: "start_validation"; readonly importId: string }
  | { readonly type: "validation_accepted" }
  | { readonly type: "queued" }
  | { readonly type: "extraction_started" }
  | { readonly type: "timeout"; readonly draftId?: string }
  | {
      readonly type: "partial_ready";
      readonly draftId: string;
      readonly missingOrUnprocessedSections: readonly string[];
    }
  | {
      readonly type: "draft_ready";
      readonly draftId: string;
      readonly unresolvedWarningCount: number;
    }
  | {
      readonly type: "unsupported_language_contact_preview";
      readonly previewId: string;
      readonly contactFieldCount: number;
    }
  | { readonly type: "retry" }
  | { readonly type: "replace_upload" }
  | { readonly type: "cancel"; readonly deletionJobId?: string }
  | {
      readonly type: "fail_retryable";
      readonly reason: Extract<
        ClientImportState,
        { readonly state: "retryable_failure" }
      >["reason"];
    }
  | {
      readonly type: "fail_terminal";
      readonly reason: Extract<
        ClientImportState,
        { readonly state: "terminal_failure" }
      >["reason"];
    }
  | { readonly type: "expire" };

export const initialImportState: ClientImportState = {
  state: "initial_choice",
  recommendedAction: "import",
  manualEntryUrl: "/resumes/new/manual",
};

export function transitionImportState(
  current: ClientImportState,
  event: ClientImportEvent,
): ClientImportState | undefined {
  if (event.type === "choose_manual_entry") {
    return {
      state: "manual_entry_handoff",
      source:
        current.state === "unsupported_language_contact_preview"
          ? "contact_preview_transfer"
          : current.state === "initial_choice"
            ? "initial_choice"
            : "failure_recovery",
    };
  }

  if (event.type === "replace_upload") {
    return { state: "upload_selection" };
  }

  if (
    event.type === "expire" &&
    "importId" in current &&
    typeof current.importId === "string"
  ) {
    return {
      state: "expired",
      importId: current.importId,
      recoveryActions: ["replace_upload", "manual_entry"],
    };
  }

  switch (current.state) {
    case "initial_choice":
      if (event.type === "choose_import") {
        return event.authenticated
          ? { state: "upload_selection" }
          : { state: "authentication_required", returnTo: "/import-resume" };
      }
      return undefined;
    case "authentication_required":
      if (event.type === "choose_import" && event.authenticated) {
        return { state: "upload_selection" };
      }
      return undefined;
    case "upload_selection":
      if (event.type === "select_file") {
        return { state: "upload_selection", selectedFileName: event.fileName };
      }
      if (event.type === "start_validation") {
        return {
          state: "validating",
          importId: event.importId,
          progress: { known: false, label: "checking_document" },
        };
      }
      return undefined;
    case "validating":
      if (event.type === "validation_accepted" || event.type === "queued") {
        return {
          state: "queued",
          importId: current.importId,
          recoveryActions: ["discard", "manual_entry"],
        };
      }
      if (event.type === "fail_retryable") {
        return {
          state: "retryable_failure",
          importId: current.importId,
          reason: event.reason,
          recoveryActions: ["replace_upload", "manual_entry"],
        };
      }
      return undefined;
    case "queued":
      if (event.type === "extraction_started") {
        return {
          state: "extracting",
          importId: current.importId,
          progress: { known: false, label: "reading_content" },
          retryAvailable: false,
        };
      }
      if (event.type === "cancel") {
        return {
          state: "cancellation",
          importId: current.importId,
          ...(event.deletionJobId === undefined
            ? {}
            : { deletionJobId: event.deletionJobId }),
          cancellable: true,
        };
      }
      return undefined;
    case "extracting":
      if (event.type === "timeout") {
        return {
          state: "recoverable_timeout",
          importId: current.importId,
          ...(event.draftId === undefined ? {} : { draftId: event.draftId }),
          recoveryActions: ["retry", "replace_upload", "manual_entry"],
        };
      }
      if (event.type === "partial_ready") {
        return {
          state: "partial_result",
          importId: current.importId,
          draftId: event.draftId,
          missingOrUnprocessedSections: event.missingOrUnprocessedSections,
          recoveryActions: ["retry", "replace_upload", "manual_entry"],
        };
      }
      if (event.type === "draft_ready") {
        return {
          state: "review_ready",
          importId: current.importId,
          draftId: event.draftId,
          unresolvedWarningCount: event.unresolvedWarningCount,
        };
      }
      if (event.type === "unsupported_language_contact_preview") {
        return {
          state: "unsupported_language_contact_preview",
          importId: current.importId,
          previewId: event.previewId,
          contactFieldCount: event.contactFieldCount,
          recoveryActions: ["replace_upload", "discard", "manual_entry"],
        };
      }
      if (event.type === "fail_retryable") {
        return {
          state: "retryable_failure",
          importId: current.importId,
          reason: event.reason,
          recoveryActions: ["retry", "replace_upload", "manual_entry"],
        };
      }
      if (event.type === "fail_terminal") {
        return {
          state: "terminal_failure",
          importId: current.importId,
          reason: event.reason,
          recoveryActions: ["replace_upload", "manual_entry"],
        };
      }
      return undefined;
    case "recoverable_timeout":
    case "partial_result":
    case "retryable_failure":
      if (event.type === "retry") {
        return current.importId === undefined
          ? undefined
          : {
              state: "queued",
              importId: current.importId,
              recoveryActions: ["discard", "manual_entry"],
            };
      }
      return undefined;
    case "review_ready":
      if (event.type === "cancel") {
        return {
          state: "cancellation",
          importId: current.importId,
          ...(event.deletionJobId === undefined
            ? {}
            : { deletionJobId: event.deletionJobId }),
          cancellable: true,
        };
      }
      return undefined;
    case "unsupported_language_contact_preview":
    case "cancellation":
    case "terminal_failure":
    case "expired":
    case "manual_entry_handoff":
      return undefined;
  }
}

export function isTransitionAllowed(
  current: ClientImportState,
  event: ClientImportEvent,
): boolean {
  return transitionImportState(current, event) !== undefined;
}
