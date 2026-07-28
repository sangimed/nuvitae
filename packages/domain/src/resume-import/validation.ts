import type {
  ConfidenceCategory,
  DetectedLanguage,
  ExtractedField,
  FieldReviewStatus,
  ImportDraft,
  ImportWarning,
  SourceDeletionStatus,
  SupportedDocumentFormat,
  WarningReviewState,
} from "./types.js";

export interface ImportProcessingLimits {
  readonly maxUploadSizeBytes: number;
  readonly maxRenderedPageCount: number;
  readonly foregroundTimeoutSeconds: number;
  readonly parserMemoryLimitMiB: number;
  readonly maxActiveJobsPerUser: number;
  readonly maxQueuedJobsPerUser: number;
  readonly rollingAttemptLimit: number;
  readonly rollingAttemptWindowSeconds: number;
}

export type ValidationResult<ReasonCode extends string, Value = true> =
  | { readonly ok: true; readonly value: Value }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: "validation";
        readonly code: ReasonCode;
        readonly message: string;
      };
    };

export type ProgrammingValidationResult<
  ReasonCode extends string,
  Value = true,
> =
  | ValidationResult<ReasonCode, Value>
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: "programming_error";
        readonly code: "invalid_time_value" | "invalid_limit_configuration";
        readonly message: string;
      };
    };

export type UploadEligibilityFailureCode =
  | "authentication_required"
  | "unsupported_format"
  | "file_too_large"
  | "empty_file";

export type PageCountFailureCode =
  "rendered_page_count_missing" | "rendered_page_count_exceeds_limit";
export type SelectableTextFailureCode =
  "selectable_text_required" | "document_has_no_selectable_text";
export type DraftThresholdFailureCode =
  | "unsupported_language"
  | "no_explicitly_sourced_supported_field"
  | "source_location_required";
export type ConfirmationFailureCode =
  | "draft_expired"
  | "draft_not_reviewable"
  | "unresolved_required_warnings"
  | "unreviewed_field_warnings"
  | "no_user_confirmed_supported_field"
  | "source_deleted_review_not_confirmable";
export type RetentionFailureCode =
  | "retention_deadline_before_upload"
  | "retention_deadline_too_late"
  | "already_expired";

export interface UploadEligibilityInput {
  readonly isAuthenticated: boolean;
  readonly format: string;
  readonly sizeBytes: number;
}

export interface PartialExtractionSummary {
  readonly category: "complete" | "partial" | "no_supported_field";
  readonly mayCreateDraft: boolean;
  readonly missingOrUnprocessedSections: readonly string[];
}

export interface UnsupportedLanguageHandling {
  readonly action: "reject_without_draft" | "contact_only_preview";
  readonly mayCreateImportDraft: false;
  readonly manualEntryRecoveryExpected: true;
}

export interface ConfirmationValidationValue {
  readonly confirmedFieldCount: number;
  readonly addressedWarningCount: number;
}

export const supportedDocumentFormats = [
  "pdf",
  "docx",
] as const satisfies readonly SupportedDocumentFormat[];
export const supportedLanguages = [
  "english",
  "french",
  "bilingual_french_english",
] as const;
export const addressedWarningStates = [
  "confirmed",
  "edited",
  "excluded",
  "intentionally_left",
] as const satisfies readonly WarningReviewState[];
export const userConfirmedFieldStates = [
  "confirmed",
  "edited",
] as const satisfies readonly FieldReviewStatus[];

export function isSupportedFormat(
  format: string,
): format is SupportedDocumentFormat {
  return supportedDocumentFormats.includes(format as SupportedDocumentFormat);
}

export function isSupportedLanguage(
  language: DetectedLanguage,
): language is (typeof supportedLanguages)[number] {
  return supportedLanguages.includes(
    language as (typeof supportedLanguages)[number],
  );
}

export function validateUploadEligibility(
  input: UploadEligibilityInput,
  limits: Pick<ImportProcessingLimits, "maxUploadSizeBytes">,
): ValidationResult<UploadEligibilityFailureCode> {
  if (!input.isAuthenticated) {
    return validationFailure(
      "authentication_required",
      "Sign in before uploading a resume.",
    );
  }
  if (!isSupportedFormat(input.format)) {
    return validationFailure(
      "unsupported_format",
      "Upload a PDF or DOCX resume.",
    );
  }
  if (input.sizeBytes <= 0) {
    return validationFailure(
      "empty_file",
      "Choose a non-empty resume document.",
    );
  }
  if (input.sizeBytes > limits.maxUploadSizeBytes) {
    return validationFailure(
      "file_too_large",
      "Choose a resume within the upload size limit.",
    );
  }

  return { ok: true, value: true };
}

export function validateRenderedPageCount(
  renderedPageCount: number | undefined,
  limits: Pick<ImportProcessingLimits, "maxRenderedPageCount">,
): ValidationResult<PageCountFailureCode> {
  if (renderedPageCount === undefined) {
    return validationFailure(
      "rendered_page_count_missing",
      "The document page count could not be checked.",
    );
  }
  if (renderedPageCount > limits.maxRenderedPageCount) {
    return validationFailure(
      "rendered_page_count_exceeds_limit",
      "Choose a resume within the page limit.",
    );
  }

  return { ok: true, value: true };
}

export function validateSelectableText(
  hasSelectableText: boolean,
): ValidationResult<SelectableTextFailureCode> {
  if (!hasSelectableText) {
    return validationFailure(
      "document_has_no_selectable_text",
      "Choose a resume with selectable text.",
    );
  }

  return { ok: true, value: true };
}

export function canCreateImportDraft(
  fields: readonly ExtractedField[],
  detectedLanguage: DetectedLanguage,
): ValidationResult<DraftThresholdFailureCode> {
  if (!isSupportedLanguage(detectedLanguage)) {
    return validationFailure(
      "unsupported_language",
      "This language is not supported for resume import.",
    );
  }

  const sourcedSupportedFields = fields.filter(
    isExplicitlySourcedSupportedField,
  );
  if (sourcedSupportedFields.length === 0) {
    return validationFailure(
      "no_explicitly_sourced_supported_field",
      "No supported resume field could be connected to the document.",
    );
  }

  if (
    sourcedSupportedFields.some((field) => field.sourceLocation === undefined)
  ) {
    return validationFailure(
      "source_location_required",
      "A review draft needs source locations.",
    );
  }

  return { ok: true, value: true };
}

export function summarizeExtractionThreshold(
  fields: readonly ExtractedField[],
  missingOrUnprocessedSections: readonly string[],
  detectedLanguage: DetectedLanguage,
): PartialExtractionSummary {
  const draftThreshold = canCreateImportDraft(fields, detectedLanguage);
  if (!draftThreshold.ok) {
    return {
      category: "no_supported_field",
      mayCreateDraft: false,
      missingOrUnprocessedSections,
    };
  }

  return {
    category: missingOrUnprocessedSections.length > 0 ? "partial" : "complete",
    mayCreateDraft: true,
    missingOrUnprocessedSections,
  };
}

export function evaluateUnsupportedLanguageHandling(
  detectedLanguage: DetectedLanguage,
  contactFields: readonly ExtractedField[],
): UnsupportedLanguageHandling | undefined {
  if (isSupportedLanguage(detectedLanguage)) {
    return undefined;
  }

  const hasContactPreviewFields = contactFields.some(
    (field) =>
      field.section === "personal" ||
      field.section === "contact" ||
      field.section === "professional_links",
  );

  return {
    action: hasContactPreviewFields
      ? "contact_only_preview"
      : "reject_without_draft",
    mayCreateImportDraft: false,
    manualEntryRecoveryExpected: true,
  };
}

export function isWarningAddressed(reviewState: WarningReviewState): boolean {
  return addressedWarningStates.includes(
    reviewState as (typeof addressedWarningStates)[number],
  );
}

export function findUnresolvedRequiredWarnings(
  warnings: readonly ImportWarning[],
): readonly ImportWarning[] {
  return warnings.filter(
    (warning) =>
      warning.requiresResolution && !isWarningAddressed(warning.reviewStatus),
  );
}

export function hasConfirmationBlockingWarning(
  warnings: readonly ImportWarning[],
): boolean {
  return findUnresolvedRequiredWarnings(warnings).length > 0;
}

export function validateStructuredResumeConfirmation(
  draft: ImportDraft,
  now: Date,
  options: {
    readonly sourceDeletionStatus: SourceDeletionStatus;
    readonly sourceArtifactsAvailable: boolean;
  },
): ProgrammingValidationResult<
  ConfirmationFailureCode,
  ConfirmationValidationValue
> {
  const expiry = validateNotExpired(draft.retentionExpiresAt, now);
  if (!expiry.ok) {
    if (expiry.error.kind === "programming_error") {
      return programmingFailure(expiry.error.code, expiry.error.message);
    }

    return validationFailure("draft_expired", "This import has expired.");
  }

  if (
    draft.status !== "review_required" &&
    draft.status !== "ready_to_confirm" &&
    draft.status !== "source_deleted_limited_review"
  ) {
    return validationFailure(
      "draft_not_reviewable",
      "This import is not ready for confirmation.",
    );
  }

  const unresolvedWarnings = findUnresolvedRequiredWarnings(draft.warnings);
  if (unresolvedWarnings.length > 0) {
    return validationFailure(
      "unresolved_required_warnings",
      "Review every warning before creating the structured resume.",
    );
  }

  if (
    draft.fields.some(
      (field) =>
        field.warningId !== undefined && field.reviewStatus === "unreviewed",
    )
  ) {
    return validationFailure(
      "unreviewed_field_warnings",
      "Review each field that needs attention.",
    );
  }

  const confirmedFieldCount = draft.fields.filter(
    isUserConfirmedSupportedField,
  ).length;
  if (confirmedFieldCount === 0) {
    return validationFailure(
      "no_user_confirmed_supported_field",
      "Confirm at least one supported field before creating a structured resume.",
    );
  }

  if (
    options.sourceDeletionStatus === "deleted" &&
    !options.sourceArtifactsAvailable
  ) {
    const hasOnlyAddressableWarnings = draft.warnings.every((warning) =>
      isWarningAddressed(warning.reviewStatus),
    );
    if (
      !hasOnlyAddressableWarnings ||
      draft.status !== "source_deleted_limited_review"
    ) {
      return validationFailure(
        "source_deleted_review_not_confirmable",
        "This import cannot be confirmed after source deletion.",
      );
    }
  }

  return {
    ok: true,
    value: {
      confirmedFieldCount,
      addressedWarningCount: draft.warnings.filter((warning) =>
        isWarningAddressed(warning.reviewStatus),
      ).length,
    },
  };
}

export function calculateRetentionExpiresAt(
  uploadedAt: Date,
  retentionDays: number,
): Date {
  return new Date(uploadedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function validateRetentionDeadline(
  uploadedAt: Date,
  retentionExpiresAt: Date,
  retentionDays: number,
): ProgrammingValidationResult<RetentionFailureCode> {
  if (!isFiniteDate(uploadedAt) || !isFiniteDate(retentionExpiresAt)) {
    return programmingFailure(
      "invalid_time_value",
      "Retention validation requires valid dates.",
    );
  }
  if (retentionDays <= 0 || !Number.isFinite(retentionDays)) {
    return programmingFailure(
      "invalid_limit_configuration",
      "Retention days must be a positive finite number.",
    );
  }

  const expectedDeadline = calculateRetentionExpiresAt(
    uploadedAt,
    retentionDays,
  ).getTime();
  if (retentionExpiresAt.getTime() < uploadedAt.getTime()) {
    return validationFailure(
      "retention_deadline_before_upload",
      "The retention deadline is before upload.",
    );
  }
  if (retentionExpiresAt.getTime() > expectedDeadline) {
    return validationFailure(
      "retention_deadline_too_late",
      "The retention deadline exceeds the allowed period.",
    );
  }

  return { ok: true, value: true };
}

export function validateNotExpired(
  retentionExpiresAt: Date,
  now: Date,
): ProgrammingValidationResult<"already_expired"> {
  if (!isFiniteDate(retentionExpiresAt) || !isFiniteDate(now)) {
    return programmingFailure(
      "invalid_time_value",
      "Expiry validation requires valid dates.",
    );
  }

  if (now.getTime() > retentionExpiresAt.getTime()) {
    return validationFailure("already_expired", "This import has expired.");
  }

  return { ok: true, value: true };
}

export function isSourceDeleted(deletionStatus: SourceDeletionStatus): boolean {
  return deletionStatus === "deleted";
}

function isExplicitlySourcedSupportedField(field: ExtractedField): boolean {
  return (
    field.sourceStatus === "explicit_source" &&
    field.sourceLocation !== undefined
  );
}

function isUserConfirmedSupportedField(field: ExtractedField): boolean {
  return (
    userConfirmedFieldStates.includes(
      field.reviewStatus as (typeof userConfirmedFieldStates)[number],
    ) && field.sourceStatus !== "inferred"
  );
}

function validationFailure<ReasonCode extends string>(
  code: ReasonCode,
  message: string,
): {
  readonly ok: false;
  readonly error: {
    readonly kind: "validation";
    readonly code: ReasonCode;
    readonly message: string;
  };
} {
  return {
    ok: false,
    error: {
      kind: "validation",
      code,
      message,
    },
  };
}

function programmingFailure(
  code: "invalid_time_value" | "invalid_limit_configuration",
  message: string,
): {
  readonly ok: false;
  readonly error: {
    readonly kind: "programming_error";
    readonly code: "invalid_time_value" | "invalid_limit_configuration";
    readonly message: string;
  };
} {
  return {
    ok: false,
    error: {
      kind: "programming_error",
      code,
      message,
    },
  };
}

function isFiniteDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

export function confidenceRequiresReview(
  confidence: ConfidenceCategory,
): boolean {
  return confidence === "low";
}
