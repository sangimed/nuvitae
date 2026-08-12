import type {
  ExtractedField,
  ExtractedValue,
  FieldId,
  ImportDraft,
  ImportWarning,
  ResumeSection,
  UserCorrection,
  UserId,
  WarningId,
  WarningReviewState,
  WorkExperience,
} from "./types.js";
import { findUnresolvedRequiredWarnings } from "./validation.js";

export type ReviewAction =
  | "confirm"
  | "edit"
  | "remove"
  | "add"
  | "complete"
  | "exclude"
  | "intentionally_leave";

export type ReviewCommand =
  | {
      readonly type: "confirm_field";
      readonly operationId: string;
      readonly fieldId: FieldId;
    }
  | {
      readonly type: "edit_field";
      readonly operationId: string;
      readonly fieldId: FieldId;
      readonly value: ExtractedValue;
    }
  | {
      readonly type: "remove_field";
      readonly operationId: string;
      readonly fieldId: FieldId;
    }
  | {
      readonly type: "add_field";
      readonly operationId: string;
      readonly fieldId: FieldId;
      readonly section: ResumeSection;
      readonly fieldPath: string;
      readonly value: ExtractedValue;
    }
  | {
      readonly type: "complete_missing_field";
      readonly operationId: string;
      readonly warningId: WarningId;
      readonly fieldId: FieldId;
      readonly section: ResumeSection;
      readonly fieldPath: string;
      readonly value: ExtractedValue;
    }
  | {
      readonly type: "resolve_warning";
      readonly operationId: string;
      readonly warningId: WarningId;
      readonly resolution: Exclude<WarningReviewState, "needs_review">;
    }
  | {
      readonly type: "exclude_section";
      readonly operationId: string;
      readonly section: ResumeSection;
    };

export type ReviewDomainErrorCode =
  | "draft_not_reviewable"
  | "field_not_found"
  | "warning_not_found"
  | "section_not_found"
  | "invalid_field_value"
  | "invalid_field_path"
  | "invalid_warning_transition"
  | "invalid_field_transition"
  | "invalid_operation_id";

export type ReviewCommandResult =
  | {
      readonly ok: true;
      readonly draft: ImportDraft;
      readonly correction: UserCorrection;
    }
  | {
      readonly ok: false;
      readonly code: ReviewDomainErrorCode;
      readonly message: string;
    };

export interface ApplyReviewCommandInput {
  readonly draft: ImportDraft;
  readonly ownerUserId: UserId;
  readonly command: ReviewCommand;
  readonly now: Date;
}

const reviewableDraftStatuses = new Set<ImportDraft["status"]>([
  "review_required",
  "ready_to_confirm",
]);
const validWarningResolutions = new Set<WarningReviewState>([
  "confirmed",
  "edited",
  "excluded",
  "intentionally_left",
]);
const fieldPathPattern = /^[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_-]+)*$/;
const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function applyReviewCommand(
  input: ApplyReviewCommandInput,
): ReviewCommandResult {
  if (!operationIdPattern.test(input.command.operationId)) {
    return failure("invalid_operation_id", "The review action is invalid.");
  }
  if (!reviewableDraftStatuses.has(input.draft.status)) {
    return failure(
      "draft_not_reviewable",
      "This import is not ready for review.",
    );
  }

  switch (input.command.type) {
    case "confirm_field":
      return updateField(input, input.command.fieldId, (field) => {
        if (field.reviewStatus === "excluded") {
          return failure(
            "invalid_field_transition",
            "Excluded information must be added again before confirmation.",
          );
        }
        return fieldResult(
          input,
          field,
          {
            ...field,
            reviewStatus: "confirmed",
            inferenceStatus:
              field.inferenceStatus === "inferred_needs_review"
                ? "confirmed_inference"
                : field.inferenceStatus,
            updatedAt: input.now,
          },
          "confirm",
        );
      });
    case "edit_field": {
      const command = input.command;
      return updateField(input, command.fieldId, (field) => {
        const value = validateExtractedValue(command.value);
        if (!value.ok) return value;
        return fieldResult(
          input,
          field,
          withoutNormalized({
            ...field,
            value: command.value,
            sourceStatus: "user_edited",
            confidenceStatus: "not_applicable",
            inferenceStatus: "not_inferred",
            reviewStatus: "edited",
            updatedAt: input.now,
          }),
          "edit",
          command.value,
        );
      });
    }
    case "remove_field":
      return updateField(input, input.command.fieldId, (field) =>
        fieldResult(
          input,
          field,
          { ...field, reviewStatus: "excluded", updatedAt: input.now },
          "remove",
        ),
      );
    case "add_field": {
      const command = input.command;
      const validation = validateNewField(
        command.section,
        command.fieldPath,
        command.value,
      );
      if (!validation.ok) return validation;
      if (input.draft.fields.some((field) => field.id === command.fieldId)) {
        return failure(
          "invalid_field_transition",
          "This information already exists.",
        );
      }
      const field: ExtractedField = {
        id: command.fieldId,
        importDraftId: input.draft.id,
        section: command.section,
        fieldPath: command.fieldPath,
        value: command.value,
        sourceStatus: "user_added",
        confidenceStatus: "not_applicable",
        inferenceStatus: "not_inferred",
        reviewStatus: "edited",
        createdAt: input.now,
        updatedAt: input.now,
      };
      return success(
        input,
        [...input.draft.fields, field],
        input.draft.warnings,
        {
          id: input.command.operationId,
          importDraftId: input.draft.id,
          targetType: "extracted_field",
          targetId: field.id,
          action: "add",
          newValue: command.value,
          createdAt: input.now,
          createdByUserId: input.ownerUserId,
        },
      );
    }
    case "complete_missing_field": {
      const command = input.command;
      const warning = input.draft.warnings.find(
        (item) => item.id === command.warningId,
      );
      if (warning === undefined)
        return failure("warning_not_found", "That warning is not available.");
      if (warning.reviewStatus !== "needs_review") {
        return warningCorrectionResult(
          input,
          warning,
          warning.reviewStatus,
          "edit",
        );
      }
      const validation = validateNewField(
        command.section,
        command.fieldPath,
        command.value,
      );
      if (!validation.ok) return validation;
      const existing = input.draft.fields.find(
        (field) =>
          field.section === command.section &&
          field.fieldPath === command.fieldPath &&
          field.reviewStatus !== "excluded",
      );
      const fields =
        existing === undefined
          ? [
              ...input.draft.fields,
              {
                id: command.fieldId,
                importDraftId: input.draft.id,
                section: command.section,
                fieldPath: command.fieldPath,
                value: command.value,
                sourceStatus: "user_added" as const,
                confidenceStatus: "not_applicable" as const,
                inferenceStatus: "not_inferred" as const,
                reviewStatus: "edited" as const,
                warningId: warning.id,
                createdAt: input.now,
                updatedAt: input.now,
              },
            ]
          : input.draft.fields.map((field) =>
              field.id === existing.id
                ? withoutNormalized({
                    ...field,
                    value: command.value,
                    sourceStatus: "user_edited" as const,
                    confidenceStatus: "not_applicable" as const,
                    inferenceStatus: "not_inferred" as const,
                    reviewStatus: "edited" as const,
                    updatedAt: input.now,
                  })
                : field,
            );
      const warnings = resolveWarning(
        input.draft.warnings,
        warning.id,
        "edited",
        input.now,
      );
      return success(input, fields, warnings, {
        id: input.command.operationId,
        importDraftId: input.draft.id,
        targetType: "import_warning",
        targetId: warning.id,
        action: "edit",
        ...(existing === undefined ? {} : { previousValue: existing.value }),
        newValue: command.value,
        createdAt: input.now,
        createdByUserId: input.ownerUserId,
      });
    }
    case "resolve_warning": {
      const command = input.command;
      if (!validWarningResolutions.has(command.resolution)) {
        return failure(
          "invalid_warning_transition",
          "That warning cannot be resolved that way.",
        );
      }
      const warning = input.draft.warnings.find(
        (item) => item.id === command.warningId,
      );
      if (warning === undefined)
        return failure("warning_not_found", "That warning is not available.");
      return warningCorrectionResult(
        input,
        warning,
        command.resolution,
        actionForResolution(command.resolution),
      );
    }
    case "exclude_section": {
      const command = input.command;
      const hasSection =
        input.draft.fields.some((field) => field.section === command.section) ||
        input.draft.warnings.some(
          (warning) => warning.section === command.section,
        );
      if (!hasSection)
        return failure("section_not_found", "That section is not available.");
      const fields = input.draft.fields.map((field) =>
        field.section === command.section && field.reviewStatus !== "excluded"
          ? {
              ...field,
              reviewStatus: "excluded" as const,
              updatedAt: input.now,
            }
          : field,
      );
      const warnings = input.draft.warnings.map((warning) =>
        warning.section === command.section &&
        warning.reviewStatus === "needs_review"
          ? {
              ...warning,
              reviewStatus: "excluded" as const,
              resolvedAt: input.now,
            }
          : warning,
      );
      return success(input, fields, warnings, {
        id: input.command.operationId,
        importDraftId: input.draft.id,
        targetType: "section",
        targetId: command.section,
        action: "exclude",
        createdAt: input.now,
        createdByUserId: input.ownerUserId,
      });
    }
  }
}

export function recomputeReviewStatus(
  fields: readonly ExtractedField[],
  warnings: readonly ImportWarning[],
): ImportDraft["status"] {
  if (findUnresolvedRequiredWarnings(warnings).length > 0) {
    return "review_required";
  }
  const hasReviewedActiveField = fields.some(
    (field) =>
      field.reviewStatus !== "excluded" &&
      (field.reviewStatus === "confirmed" || field.reviewStatus === "edited"),
  );
  return hasReviewedActiveField ? "ready_to_confirm" : "review_required";
}

export function allowedFieldActions(
  field: ExtractedField,
): readonly ReviewAction[] {
  if (field.reviewStatus === "excluded") return ["add"];
  return ["confirm", "edit", "remove"];
}

export function allowedWarningActions(
  warning: ImportWarning,
): readonly ReviewAction[] {
  if (warning.reviewStatus !== "needs_review") return [];
  return ["confirm", "edit", "exclude", "intentionally_leave"];
}

export function formatOngoingRoleEndDate(role: {
  readonly isOngoing: boolean;
}): string {
  return role.isOngoing ? "Present" : "";
}

export function groupExplicitWorkExperiences(
  experiences: readonly WorkExperience[],
): readonly WorkExperience[] {
  return experiences.map((experience) => ({
    ...experience,
    roles: [...experience.roles].map((role) => ({
      ...role,
      responsibilities: [...role.responsibilities],
      achievements: [...role.achievements],
    })),
  }));
}

function updateField(
  input: ApplyReviewCommandInput,
  fieldId: FieldId,
  update: (field: ExtractedField) => ReviewCommandResult,
): ReviewCommandResult {
  const field = input.draft.fields.find((item) => item.id === fieldId);
  if (field === undefined)
    return failure("field_not_found", "That information is not available.");
  return update(field);
}

function withoutNormalized(field: ExtractedField): ExtractedField {
  const rest: Record<string, unknown> = { ...field };
  delete rest.normalizedValue;
  return rest as unknown as ExtractedField;
}

function fieldResult(
  input: ApplyReviewCommandInput,
  previous: ExtractedField,
  next: ExtractedField,
  action: UserCorrection["action"],
  newValue?: ExtractedValue,
): ReviewCommandResult {
  return success(
    input,
    input.draft.fields.map((field) =>
      field.id === previous.id ? next : field,
    ),
    input.draft.warnings,
    {
      id: input.command.operationId,
      importDraftId: input.draft.id,
      targetType: "extracted_field",
      targetId: previous.id,
      action,
      previousValue: previous.value,
      ...(newValue === undefined ? {} : { newValue }),
      createdAt: input.now,
      createdByUserId: input.ownerUserId,
    },
  );
}

function warningCorrectionResult(
  input: ApplyReviewCommandInput,
  warning: ImportWarning,
  resolution: Exclude<WarningReviewState, "needs_review">,
  action: UserCorrection["action"],
): ReviewCommandResult {
  if (warning.reviewStatus === resolution) {
    return success(input, input.draft.fields, input.draft.warnings, {
      id: input.command.operationId,
      importDraftId: input.draft.id,
      targetType: "import_warning",
      targetId: warning.id,
      action,
      createdAt: input.now,
      createdByUserId: input.ownerUserId,
    });
  }
  if (warning.reviewStatus !== "needs_review") {
    return failure(
      "invalid_warning_transition",
      "That warning has already been resolved.",
    );
  }
  return success(
    input,
    input.draft.fields,
    resolveWarning(input.draft.warnings, warning.id, resolution, input.now),
    {
      id: input.command.operationId,
      importDraftId: input.draft.id,
      targetType: "import_warning",
      targetId: warning.id,
      action,
      createdAt: input.now,
      createdByUserId: input.ownerUserId,
    },
  );
}

function resolveWarning(
  warnings: readonly ImportWarning[],
  warningId: string,
  resolution: Exclude<WarningReviewState, "needs_review">,
  now: Date,
): ImportWarning[] {
  return warnings.map((warning) =>
    warning.id === warningId
      ? {
          ...warning,
          reviewStatus: resolution,
          resolvedAt: warning.resolvedAt ?? now,
        }
      : warning,
  );
}

function success(
  input: ApplyReviewCommandInput,
  fields: readonly ExtractedField[],
  warnings: readonly ImportWarning[],
  correction: UserCorrection,
): ReviewCommandResult {
  const status = recomputeReviewStatus(fields, warnings);
  return {
    ok: true,
    draft: {
      ...input.draft,
      status,
      fields,
      warnings,
      lastReviewedAt: input.now,
    },
    correction,
  };
}

function validateNewField(
  section: ResumeSection,
  fieldPath: string,
  value: ExtractedValue,
): { readonly ok: true } | ReviewCommandResult {
  if (!fieldPath.startsWith(`${section}.`) && fieldPath !== section) {
    return failure("invalid_field_path", "The information target is invalid.");
  }
  if (fieldPath.length > 512 || !fieldPathPattern.test(fieldPath)) {
    return failure("invalid_field_path", "The information target is invalid.");
  }
  return validateExtractedValue(value);
}

function validateExtractedValue(
  value: ExtractedValue,
): { readonly ok: true } | ReviewCommandResult {
  switch (value.kind) {
    case "text":
      return value.value.trim().length > 0 && value.value.length <= 4_000
        ? { ok: true }
        : failure("invalid_field_value", "Enter a valid value.");
    case "text_list":
      return value.values.length <= 80 &&
        value.values.every(
          (item) => item.trim().length > 0 && item.length <= 400,
        )
        ? { ok: true }
        : failure("invalid_field_value", "Enter valid list items.");
    case "date":
      return value.value.precision === "present" ||
        (value.value.year !== undefined &&
          value.value.year >= 1900 &&
          value.value.year <= 2100)
        ? { ok: true }
        : failure("invalid_field_value", "Enter a valid date.");
    case "date_range":
      return value.isOngoing ||
        value.endDate !== undefined ||
        value.startDate !== undefined
        ? { ok: true }
        : failure("invalid_field_value", "Enter a valid date range.");
    case "link":
      try {
        new URL(value.url);
        return { ok: true };
      } catch {
        return failure("invalid_field_value", "Enter a valid link.");
      }
    case "language":
      return value.name.trim().length > 0
        ? { ok: true }
        : failure("invalid_field_value", "Enter a valid language.");
  }
}

function actionForResolution(
  resolution: Exclude<WarningReviewState, "needs_review">,
): UserCorrection["action"] {
  switch (resolution) {
    case "confirmed":
      return "confirm";
    case "edited":
      return "edit";
    case "excluded":
      return "exclude";
    case "intentionally_left":
      return "intentionally_leave";
  }
}

function failure(
  code: ReviewDomainErrorCode,
  message: string,
): ReviewCommandResult {
  return { ok: false, code, message };
}
