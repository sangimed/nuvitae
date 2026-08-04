import type { NuvitaeSemanticExtractionResponse } from "@nuvitae/contracts";
import type {
  DeterministicResumeSection,
  DeterministicWarningCandidate,
} from "@nuvitae/domain";
import type { SemanticValidationDiagnostic } from "../validation/validation-types.js";
import type { PrivacySafeSemanticProviderError } from "./provider-errors.js";
import type {
  SemanticProviderErrorCode,
  SemanticProviderRecoveryAction,
} from "./provider-errors.js";
import {
  candidateFieldPath,
  sectionFromPath,
  type SemanticCandidateMappingResult,
} from "./semantic-candidates-to-draft.js";

export const semanticWarningCategories = [
  "inferred",
  "ambiguous",
  "unsupported",
  "duplicate",
  "conflicting",
  "low_confidence",
  "malformed_output",
  "invalid_schema",
  "invalid_evidence",
  "ungrounded",
  "invented",
  "no_provider",
  "authentication_expired",
  "provider_unavailable",
  "rate_limited",
  "quota_exceeded",
  "timeout",
] as const;

export type SemanticWarningCategory =
  (typeof semanticWarningCategories)[number];
export type SemanticWarningSeverity =
  "blocking" | "review_required" | "informational";

export interface SemanticWarning {
  readonly category: SemanticWarningCategory;
  readonly severity: SemanticWarningSeverity;
  readonly message: string;
  readonly section?: DeterministicResumeSection;
  readonly fieldPath?: string;
  readonly recoveryActions: readonly SemanticProviderRecoveryAction[];
  readonly sortKey: number;
}

export interface SemanticWarningGenerationInput {
  readonly response?: NuvitaeSemanticExtractionResponse;
  readonly diagnostics?: readonly SemanticValidationDiagnostic[];
  readonly providerError?: PrivacySafeSemanticProviderError;
  readonly mapping?: SemanticCandidateMappingResult;
}

export interface SemanticWarningGenerationResult {
  readonly warnings: readonly SemanticWarning[];
  readonly draftWarnings: readonly DeterministicWarningCandidate[];
  readonly blockingCount: number;
  readonly reviewRequiredCount: number;
  readonly informationalCount: number;
}

const plainLanguageMessages: Record<SemanticWarningCategory, string> = {
  inferred: "Some imported information was inferred and needs your review.",
  ambiguous: "Some imported information is ambiguous and needs your review.",
  unsupported: "Some imported content is not supported and was not included.",
  duplicate: "Duplicate imported information needs your review.",
  conflicting: "Conflicting imported information needs your review.",
  low_confidence:
    "Some imported information was extracted with low confidence and needs your review.",
  malformed_output:
    "The AI provider returned malformed output, so the import could not be completed.",
  invalid_schema:
    "The AI provider returned output that does not match the expected format.",
  invalid_evidence:
    "The AI provider returned information without valid source evidence.",
  ungrounded:
    "The AI provider returned information that could not be linked to the document.",
  invented:
    "The AI provider returned information not present in the document; it was not included.",
  no_provider:
    "No AI provider is configured. Reliable full semantic parsing is unavailable.",
  authentication_expired:
    "The AI provider connection has expired. Reconnect and try again.",
  provider_unavailable: "The AI provider is unavailable. Try again later.",
  rate_limited: "The AI provider is rate limited. Try again later.",
  quota_exceeded: "The AI provider subscription quota is exhausted.",
  timeout: "The AI provider took too long and the request timed out.",
};

const defaultRecoveryByCategory: Record<
  SemanticWarningCategory,
  readonly SemanticProviderRecoveryAction[]
> = {
  inferred: [],
  ambiguous: [],
  unsupported: [],
  duplicate: [],
  conflicting: [],
  low_confidence: [],
  malformed_output: ["retry", "choose_another_provider", "manual_entry"],
  invalid_schema: ["retry", "choose_another_provider", "manual_entry"],
  invalid_evidence: ["retry", "choose_another_provider", "manual_entry"],
  ungrounded: ["retry", "choose_another_provider", "manual_entry"],
  invented: ["manual_entry"],
  no_provider: ["choose_another_provider", "manual_entry"],
  authentication_expired: [
    "reconnect_provider",
    "choose_another_provider",
    "manual_entry",
  ],
  provider_unavailable: [
    "retry",
    "choose_another_provider",
    "limited_deterministic_partial_extraction",
    "manual_entry",
  ],
  rate_limited: [
    "retry",
    "choose_another_provider",
    "limited_deterministic_partial_extraction",
    "manual_entry",
  ],
  quota_exceeded: ["choose_another_provider", "manual_entry"],
  timeout: ["retry", "choose_another_provider", "manual_entry"],
};

const providerCategoryByCode: Partial<
  Record<SemanticProviderErrorCode, SemanticWarningCategory>
> = {
  not_configured: "no_provider",
  disconnected: "provider_unavailable",
  authentication_expired: "authentication_expired",
  provider_unavailable: "provider_unavailable",
  rate_limited: "rate_limited",
  quota_exceeded: "quota_exceeded",
  unsupported_capability: "unsupported",
  timeout: "timeout",
  invalid_provider_response: "malformed_output",
  schema_violation: "invalid_schema",
  unsupported_contract_version: "invalid_schema",
  malformed_flattened_evidence: "invalid_evidence",
  request_too_large: "unsupported",
  response_too_large: "malformed_output",
  invalid_grounding: "ungrounded",
  ambiguous_output: "ambiguous",
  conflicting_output: "conflicting",
  explicit_absence_mismatch: "conflicting",
  invented_fact: "invented",
  unknown_provider_failure: "provider_unavailable",
};

const draftTypeByCategory: Partial<
  Record<SemanticWarningCategory, DeterministicWarningCandidate["warningType"]>
> = {
  inferred: "inferred",
  ambiguous: "ambiguous",
  unsupported: "unsupported",
  duplicate: "duplicate",
  conflicting: "conflicting",
  low_confidence: "low_confidence",
};

export function generateSemanticWarnings(
  input: SemanticWarningGenerationInput,
): SemanticWarningGenerationResult {
  const candidates: SemanticWarning[] = [];
  const seen = new Set<string>();

  const push = (warning: SemanticWarning): void => {
    const key = `${warning.category}:${warning.fieldPath ?? ""}:${warning.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(warning);
  };

  if (input.providerError !== undefined) {
    const warning = warningFromProviderError(input.providerError);
    if (warning !== undefined) push(warning);
  }

  if (input.response !== undefined) {
    input.response.ambiguityDiagnostics.forEach((_item, index) =>
      push({
        category: "ambiguous",
        severity: "review_required",
        message: _item.safeDetail ?? plainLanguageMessages.ambiguous,
        section: sectionFromPath(["ambiguityDiagnostics", index]),
        ...spreadFieldPath(candidateFieldPath(["ambiguityDiagnostics", index])),
        recoveryActions: [],
        sortKey: 0,
      }),
    );
    input.response.conflictDiagnostics.forEach((item, index) =>
      push({
        category:
          item.code === "duplicate_candidate" ? "duplicate" : "conflicting",
        severity: "review_required",
        message:
          item.code === "duplicate_candidate"
            ? (item.safeDetail ?? plainLanguageMessages.duplicate)
            : (item.safeDetail ?? plainLanguageMessages.conflicting),
        section: sectionFromPath(["conflictDiagnostics", index]),
        ...spreadFieldPath(candidateFieldPath(["conflictDiagnostics", index])),
        recoveryActions: [],
        sortKey: 0,
      }),
    );
    input.response.privacyWarnings.forEach((_item, index) =>
      push({
        category: "unsupported",
        severity: "informational",
        message: _item.safeDetail ?? plainLanguageMessages.unsupported,
        section: sectionFromPath(["privacyWarnings", index]),
        ...spreadFieldPath(candidateFieldPath(["privacyWarnings", index])),
        recoveryActions: [],
        sortKey: 0,
      }),
    );
    walkSemanticValues(input.response.sections, (value, path) => {
      if (value.classification !== "inferred") return;
      push({
        category: "inferred",
        severity: "review_required",
        message: plainLanguageMessages.inferred,
        section: sectionFromPath(path),
        ...spreadFieldPath(candidateFieldPath(path)),
        recoveryActions: [],
        sortKey: 0,
      });
    });
    walkSemanticValues(input.response.sections, (value, path) => {
      if (value.confidence !== "low") return;
      push({
        category: "low_confidence",
        severity: "review_required",
        message: plainLanguageMessages.low_confidence,
        section: sectionFromPath(path),
        ...spreadFieldPath(candidateFieldPath(path)),
        recoveryActions: [],
        sortKey: 0,
      });
    });
  }

  const diagnostics = input.diagnostics ?? [];
  if (diagnostics.length > 0) {
    for (const item of diagnostics) {
      if (
        input.response !== undefined &&
        (item.category === "ambiguity" || item.category === "conflict")
      ) {
        continue;
      }
      const warning = warningFromDiagnostic(item);
      if (warning !== undefined) push(warning);
    }
  }

  if (input.mapping !== undefined) {
    for (const duplicate of input.mapping.duplicates) {
      push({
        category: "duplicate",
        severity: "review_required",
        message: plainLanguageMessages.duplicate,
        section: duplicate.section,
        fieldPath: duplicate.duplicateFieldPath,
        recoveryActions: [],
        sortKey: 0,
      });
    }
  }

  const ordered = [...candidates].sort(compareWarnings);
  const warnings = ordered.map((warning) => ({
    ...warning,
    sortKey: semanticWarningCategories.indexOf(warning.category),
  }));
  const draftWarnings: DeterministicWarningCandidate[] = [];
  for (const warning of warnings) {
    const warningType = draftTypeByCategory[warning.category];
    if (warningType === undefined) continue;
    draftWarnings.push({
      warningType,
      section: warning.section ?? "summary",
      ...(warning.fieldPath === undefined
        ? {}
        : { fieldPath: warning.fieldPath }),
      message: warning.message,
      requiresResolution: warning.severity === "review_required",
    });
  }

  return {
    warnings,
    draftWarnings,
    blockingCount: warnings.filter((warning) => warning.severity === "blocking")
      .length,
    reviewRequiredCount: warnings.filter(
      (warning) => warning.severity === "review_required",
    ).length,
    informationalCount: warnings.filter(
      (warning) => warning.severity === "informational",
    ).length,
  };
}

function warningFromProviderError(
  error: PrivacySafeSemanticProviderError,
): SemanticWarning | undefined {
  const category = providerCategoryByCode[error.code];
  if (category === undefined) return undefined;
  return {
    category,
    severity: "blocking",
    message: plainLanguageMessages[category],
    ...spreadFieldPath(undefined),
    recoveryActions:
      error.recoveryActions.length > 0
        ? [...error.recoveryActions]
        : defaultRecoveryByCategory[category],
    sortKey: 0,
  };
}

function warningFromDiagnostic(
  item: SemanticValidationDiagnostic,
): SemanticWarning | undefined {
  const fieldPath = candidateFieldPath(item.path);
  const section = sectionFromPath(item.path);
  const base = {
    section,
    ...spreadFieldPath(fieldPath),
    sortKey: 0,
  };
  switch (item.category) {
    case "schema":
      if (item.code === "malformed_flattened_evidence") {
        return {
          ...base,
          category: "invalid_evidence",
          severity: "blocking",
          message: plainLanguageMessages.invalid_evidence,
          recoveryActions: defaultRecoveryByCategory.invalid_evidence,
        };
      }
      if (item.code === "response_too_large") {
        return {
          ...base,
          category: "malformed_output",
          severity: "blocking",
          message: plainLanguageMessages.malformed_output,
          recoveryActions: defaultRecoveryByCategory.malformed_output,
        };
      }
      return {
        ...base,
        category: "invalid_schema",
        severity: "blocking",
        message: plainLanguageMessages.invalid_schema,
        recoveryActions: defaultRecoveryByCategory.invalid_schema,
      };
    case "evidence":
      return {
        ...base,
        category: "invalid_evidence",
        severity: "blocking",
        message: plainLanguageMessages.invalid_evidence,
        recoveryActions: defaultRecoveryByCategory.invalid_evidence,
      };
    case "grounding":
      return {
        ...base,
        category: "ungrounded",
        severity: "blocking",
        message: plainLanguageMessages.ungrounded,
        recoveryActions: defaultRecoveryByCategory.ungrounded,
      };
    case "no_invention":
      return {
        ...base,
        category: "invented",
        severity: "blocking",
        message: plainLanguageMessages.invented,
        recoveryActions: defaultRecoveryByCategory.invented,
      };
    case "absence":
      return {
        ...base,
        category: "conflicting",
        severity: "blocking",
        message: plainLanguageMessages.conflicting,
        recoveryActions: defaultRecoveryByCategory.conflicting,
      };
    case "ambiguity":
      return {
        ...base,
        category: "ambiguous",
        severity: "review_required",
        message: plainLanguageMessages.ambiguous,
        recoveryActions: [],
      };
    case "conflict":
      return {
        ...base,
        category:
          item.code === "duplicate_diagnostic" ||
          item.code === "duplicate_candidate"
            ? "duplicate"
            : "conflicting",
        severity: "review_required",
        message:
          item.code === "duplicate_diagnostic" ||
          item.code === "duplicate_candidate"
            ? plainLanguageMessages.duplicate
            : plainLanguageMessages.conflicting,
        recoveryActions: [],
      };
    case "injection":
      return {
        ...base,
        category: "unsupported",
        severity: "informational",
        message: plainLanguageMessages.unsupported,
        recoveryActions: [],
      };
    case "review":
      return {
        ...base,
        category:
          item.code === "forbidden_factual_inference"
            ? "unsupported"
            : "inferred",
        severity: "review_required",
        message:
          item.code === "forbidden_factual_inference"
            ? plainLanguageMessages.unsupported
            : plainLanguageMessages.inferred,
        recoveryActions: [],
      };
    default:
      return undefined;
  }
}

function compareWarnings(
  left: SemanticWarning,
  right: SemanticWarning,
): number {
  const leftOrder = semanticWarningCategories.indexOf(left.category);
  const rightOrder = semanticWarningCategories.indexOf(right.category);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const leftPath = left.fieldPath ?? "";
  const rightPath = right.fieldPath ?? "";
  if (leftPath !== rightPath) return leftPath.localeCompare(rightPath, "en");
  return left.message.localeCompare(right.message, "en");
}

function spreadFieldPath(fieldPath: string | undefined): {
  readonly fieldPath?: string;
} {
  return fieldPath === undefined ? {} : { fieldPath };
}

function walkSemanticValues(
  value: unknown,
  visit: (
    value: {
      readonly classification: string;
      readonly confidence: string;
    },
    path: readonly (string | number)[],
  ) => void,
  path: readonly (string | number)[] = ["sections"],
): void {
  if (isSemanticValueLike(value)) {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkSemanticValues(item, visit, [...path, index]),
    );
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, item]) =>
      walkSemanticValues(item, visit, [...path, key]),
    );
  }
}

function isSemanticValueLike(value: unknown): value is {
  readonly classification: string;
  readonly confidence: string;
  readonly value: string;
  readonly evidence: readonly unknown[];
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof value.value === "string" &&
    "classification" in value &&
    typeof value.classification === "string" &&
    "confidence" in value &&
    typeof value.confidence === "string" &&
    "evidence" in value &&
    Array.isArray(value.evidence)
  );
}
