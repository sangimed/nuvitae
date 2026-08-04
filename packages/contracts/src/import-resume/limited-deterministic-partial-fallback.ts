import { z } from "zod";

/**
 * T187 - limited deterministic partial extraction fallback contract.
 *
 * Provider-neutral contract for the deliberately limited deterministic
 * fallback used when no semantic provider can be used. The fallback is always
 * partial: it never claims reliable full semantic parsing. Orchestration that
 * consumes this contract (extraction, draft creation, provider routing) is
 * owned by T188 and is deliberately not implemented here.
 */

export const limitedDeterministicFallbackContractVersion =
  "nuvitae.limited-deterministic-partial-fallback.v1" as const;

/**
 * Deterministic minimum number of accepted candidates required before a
 * partial fallback draft may be created. Aligned with FR-013: at least one
 * supported candidate with required document evidence. Rejected candidates
 * never count toward this threshold.
 */
export const limitedDeterministicFallbackMinimumDraftAcceptedCandidates = 1;

export const maxLimitedDeterministicFallbackAcceptedCandidates = 200;
export const maxLimitedDeterministicFallbackRejectedCandidates = 200;
export const maxLimitedDeterministicFallbackWarnings = 50;

/**
 * The closed allowed field set. Values are narrow and deterministically
 * extractable from normalized text only: explicit label+value boundaries,
 * exact contact tokens, and full explicit URLs. No field requiring semantic
 * grouping, section classification, or relationship inference is allowed.
 */
export const limitedDeterministicFallbackAllowedFields = [
  "contact.full_name",
  "contact.email",
  "contact.phone",
  "contact.website",
  "contact.location",
  "skills.name",
  "languages.name",
] as const;

export type LimitedDeterministicFallbackAllowedField =
  (typeof limitedDeterministicFallbackAllowedFields)[number];

export const limitedDeterministicFallbackAllowedFieldSchema = z.enum(
  limitedDeterministicFallbackAllowedFields,
);

/**
 * Documented forbidden groups. These require semantic interpretation or
 * grouping and can never be produced by the deterministic fallback.
 */
export const limitedDeterministicFallbackForbiddenFieldGroups = [
  "summary",
  "headline",
  "work_experience",
  "education",
  "projects",
  "certifications",
  "professional_links_grouping",
  "relationships",
  "employer_or_date_relationships",
  "job_title_inferred_from_context",
  "inferred_language_proficiency",
  "inferred_skill_normalization",
  "inferred_location",
  "inferred_relationships",
] as const;

export type LimitedDeterministicFallbackForbiddenFieldGroup =
  (typeof limitedDeterministicFallbackForbiddenFieldGroups)[number];

/**
 * Field-specific deterministic rules. An accepted candidate must name the
 * exact rule that proves its value and label boundary in normalized text.
 */
export const limitedDeterministicFallbackFieldRules = [
  "email_rule",
  "phone_rule",
  "explicit_url_rule",
  "labelled_name_rule",
  "labelled_location_rule",
  "delimited_skill_rule",
  "delimited_language_rule",
] as const;

export type LimitedDeterministicFallbackFieldRule =
  (typeof limitedDeterministicFallbackFieldRules)[number];

export const limitedDeterministicFallbackRuleByField: Readonly<
  Record<
    LimitedDeterministicFallbackAllowedField,
    LimitedDeterministicFallbackFieldRule
  >
> = {
  "contact.full_name": "labelled_name_rule",
  "contact.email": "email_rule",
  "contact.phone": "phone_rule",
  "contact.website": "explicit_url_rule",
  "contact.location": "labelled_location_rule",
  "skills.name": "delimited_skill_rule",
  "languages.name": "delimited_language_rule",
};

export const limitedDeterministicFallbackConfidenceCategories = [
  "high",
  "medium",
  "low",
  "not_applicable",
] as const;

export type LimitedDeterministicFallbackConfidenceCategory =
  (typeof limitedDeterministicFallbackConfidenceCategories)[number];

export const limitedDeterministicFallbackConfidenceCategorySchema = z.enum(
  limitedDeterministicFallbackConfidenceCategories,
);

/**
 * Inferred values are prohibited. The accepted candidate schema only
 * represents explicit classification, so inferred candidates are rejected by
 * construction rather than silently downgraded.
 */
export const limitedDeterministicFallbackProhibitedClassifications = [
  "inferred",
] as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Canonical flattened source evidence over the normalized extraction
 * transcript (FR-009c, FR-009f). No physical coordinates and no source text
 * are part of the public contract.
 */
export const limitedDeterministicFallbackEvidenceSchema = z
  .object({
    line: z.number().int().min(1).max(5_000),
    start: z.number().int().min(0).max(20_000),
    end: z.number().int().min(1).max(20_000),
    fragmentHash: sha256Schema,
    fragmentId: z.string().min(1).max(120).nullable(),
  })
  .strict()
  .refine((value) => value.end > value.start, {
    message: "end must be greater than start",
    path: ["end"],
  });

export const limitedDeterministicFallbackAcceptanceReasons = [
  "deterministic_rule_satisfied",
] as const;

export type LimitedDeterministicFallbackAcceptanceReason =
  (typeof limitedDeterministicFallbackAcceptanceReasons)[number];

export const limitedDeterministicFallbackRejectionReasons = [
  "missing_evidence",
  "invalid_evidence",
  "inferred_value",
  "forbidden_field",
  "unsupported_field",
  "ambiguous_value",
  "low_confidence",
  "duplicate_value",
] as const;

export type LimitedDeterministicFallbackRejectionReason =
  (typeof limitedDeterministicFallbackRejectionReasons)[number];

export const limitedDeterministicFallbackRejectionReasonSchema = z.enum(
  limitedDeterministicFallbackRejectionReasons,
);

/**
 * Accepted fallback candidate. Every accepted candidate:
 * - belongs to the closed allowed field set;
 * - satisfies exactly one field-specific deterministic rule;
 * - carries at least one canonical flattened evidence entry;
 * - is explicit (never inferred);
 * - has high confidence (a fully proven deterministic match);
 * - remains unconfirmed and reviewable by the user.
 */
export const limitedDeterministicFallbackAcceptedCandidateSchema = z
  .object({
    fieldPath: limitedDeterministicFallbackAllowedFieldSchema,
    value: z.string().min(1).max(2_000),
    evidence: z.array(limitedDeterministicFallbackEvidenceSchema).min(1).max(8),
    classification: z.literal("explicit"),
    confidence: z.literal("high"),
    rule: z.enum(limitedDeterministicFallbackFieldRules),
    acceptanceReason: z.literal("deterministic_rule_satisfied"),
    reviewStatus: z.literal("unreviewed"),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.rule !==
      limitedDeterministicFallbackRuleByField[candidate.fieldPath]
    ) {
      context.addIssue({
        code: "custom",
        message: "rule must be the field-specific deterministic rule",
        path: ["rule"],
      });
    }
  });

export const limitedDeterministicFallbackRejectedCandidateSchema = z
  .object({
    fieldPath: z.string().min(1).max(512),
    reason: limitedDeterministicFallbackRejectionReasonSchema,
    confidence: limitedDeterministicFallbackConfidenceCategorySchema,
    evidenceCount: z.number().int().min(0).max(8),
  })
  .strict();

export const limitedDeterministicFallbackStatuses = [
  "no_supported_field",
  "partial",
] as const;

export type LimitedDeterministicFallbackStatus =
  (typeof limitedDeterministicFallbackStatuses)[number];

export const limitedDeterministicFallbackWarningCategories = [
  "no_reliable_semantic_parsing",
  "partial_extraction",
  "ambiguous",
  "low_confidence",
  "unsupported",
  "duplicate",
] as const;

export type LimitedDeterministicFallbackWarningCategory =
  (typeof limitedDeterministicFallbackWarningCategories)[number];

export const limitedDeterministicFallbackWarningSeverities = [
  "blocking",
  "review_required",
  "informational",
] as const;

export type LimitedDeterministicFallbackWarningSeverity =
  (typeof limitedDeterministicFallbackWarningSeverities)[number];

export const limitedDeterministicFallbackWarningSchema = z
  .object({
    category: z.enum(limitedDeterministicFallbackWarningCategories),
    severity: z.enum(limitedDeterministicFallbackWarningSeverities),
    message: z.string().min(1).max(500),
    fieldPath: z.string().min(1).max(512).optional(),
    sortKey: z.number().int().nonnegative(),
    requiresResolution: z.boolean(),
  })
  .strict();

export const limitedDeterministicFallbackDisclosureTitle =
  "Limited automatic extraction" as const;

export const limitedDeterministicFallbackDisclosureSummary =
  `This automatic extraction is partial. It may miss information and does not provide reliable full semantic parsing. Review everything, correct any mistakes, or continue with manual entry.` as const;

export const limitedDeterministicFallbackDisclosureSchema = z
  .object({
    title: z.literal(limitedDeterministicFallbackDisclosureTitle),
    summary: z.literal(limitedDeterministicFallbackDisclosureSummary),
    isPartial: z.literal(true),
    mayMissInformation: z.literal(true),
    notReliableFullSemanticParsing: z.literal(true),
    manualCorrectionOrEntryMayBeRequired: z.literal(true),
  })
  .strict();

export const limitedDeterministicFallbackRecoveryActions = [
  "retry",
  "reconnect",
  "alternative_provider",
  "manual_entry",
] as const;

export type LimitedDeterministicFallbackRecoveryAction =
  (typeof limitedDeterministicFallbackRecoveryActions)[number];

const alwaysOfferedRecoveryActions: readonly LimitedDeterministicFallbackRecoveryAction[] =
  ["retry", "reconnect", "manual_entry"];

const recoveryActionsWithAlternativeProvider: readonly LimitedDeterministicFallbackRecoveryAction[] =
  ["retry", "reconnect", "alternative_provider", "manual_entry"];

export const limitedDeterministicFallbackOutcomeSchema = z
  .object({
    contractVersion: z.literal(limitedDeterministicFallbackContractVersion),
    status: z.enum(limitedDeterministicFallbackStatuses),
    acceptedCandidates: z
      .array(limitedDeterministicFallbackAcceptedCandidateSchema)
      .max(maxLimitedDeterministicFallbackAcceptedCandidates),
    rejectedCandidates: z
      .array(limitedDeterministicFallbackRejectedCandidateSchema)
      .max(maxLimitedDeterministicFallbackRejectedCandidates),
    warnings: z
      .array(limitedDeterministicFallbackWarningSchema)
      .max(maxLimitedDeterministicFallbackWarnings),
    disclosure: limitedDeterministicFallbackDisclosureSchema,
    recoveryActions: z
      .array(z.enum(limitedDeterministicFallbackRecoveryActions))
      .min(3)
      .max(4),
    alternativeProviderAvailable: z.boolean(),
    meetsDraftThreshold: z.boolean(),
    acceptedCandidateCount: z.number().int().nonnegative(),
    rejectedCandidateCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((outcome, context) => {
    if (outcome.acceptedCandidateCount !== outcome.acceptedCandidates.length) {
      context.addIssue({
        code: "custom",
        message: "acceptedCandidateCount must mirror acceptedCandidates",
        path: ["acceptedCandidateCount"],
      });
    }
    if (outcome.rejectedCandidateCount !== outcome.rejectedCandidates.length) {
      context.addIssue({
        code: "custom",
        message: "rejectedCandidateCount must mirror rejectedCandidates",
        path: ["rejectedCandidateCount"],
      });
    }
    const expectedThreshold =
      outcome.acceptedCandidates.length >=
      limitedDeterministicFallbackMinimumDraftAcceptedCandidates;
    if (outcome.meetsDraftThreshold !== expectedThreshold) {
      context.addIssue({
        code: "custom",
        message: "meetsDraftThreshold must follow the deterministic threshold",
        path: ["meetsDraftThreshold"],
      });
    }
    const expectedStatus = expectedThreshold ? "partial" : "no_supported_field";
    if (outcome.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        message: "status must follow the deterministic draft threshold",
        path: ["status"],
      });
    }
    const expectedRecovery = outcome.alternativeProviderAvailable
      ? recoveryActionsWithAlternativeProvider
      : alwaysOfferedRecoveryActions;
    if (outcome.recoveryActions.join(",") !== expectedRecovery.join(",")) {
      context.addIssue({
        code: "custom",
        message:
          "recoveryActions must include retry, reconnect, manual entry, and " +
          "alternative_provider only when an alternative provider is available",
        path: ["recoveryActions"],
      });
    }
  });

export type LimitedDeterministicFallbackEvidence = z.infer<
  typeof limitedDeterministicFallbackEvidenceSchema
>;
export type LimitedDeterministicFallbackAcceptedCandidate = z.infer<
  typeof limitedDeterministicFallbackAcceptedCandidateSchema
>;
export type LimitedDeterministicFallbackRejectedCandidate = z.infer<
  typeof limitedDeterministicFallbackRejectedCandidateSchema
>;
export type LimitedDeterministicFallbackWarning = z.infer<
  typeof limitedDeterministicFallbackWarningSchema
>;
export type LimitedDeterministicFallbackDisclosure = z.infer<
  typeof limitedDeterministicFallbackDisclosureSchema
>;
export type LimitedDeterministicFallbackOutcome = z.infer<
  typeof limitedDeterministicFallbackOutcomeSchema
>;

export function isLimitedDeterministicFallbackAllowedField(
  fieldPath: string,
): fieldPath is LimitedDeterministicFallbackAllowedField {
  return (
    limitedDeterministicFallbackAllowedFields as readonly string[]
  ).includes(fieldPath);
}

export function meetsLimitedDeterministicDraftThreshold(
  acceptedCandidateCount: number,
): boolean {
  return (
    acceptedCandidateCount >=
    limitedDeterministicFallbackMinimumDraftAcceptedCandidates
  );
}

export function buildLimitedDeterministicFallbackDisclosure(): LimitedDeterministicFallbackDisclosure {
  return {
    title: limitedDeterministicFallbackDisclosureTitle,
    summary: limitedDeterministicFallbackDisclosureSummary,
    isPartial: true,
    mayMissInformation: true,
    notReliableFullSemanticParsing: true,
    manualCorrectionOrEntryMayBeRequired: true,
  };
}

const warningMessages: Readonly<
  Record<
    LimitedDeterministicFallbackWarningCategory,
    (fieldPath: string | undefined) => string
  >
> = {
  no_reliable_semantic_parsing: () =>
    "No semantic provider is available, so this import used limited automatic " +
    "extraction. This extraction is partial: it may miss information and does " +
    "not provide reliable full semantic parsing. Review everything and correct " +
    "or complete it, or continue with manual entry.",
  partial_extraction: () =>
    "Only a limited set of information could be extracted automatically. " +
    "Review the imported fields and add anything missing.",
  ambiguous: (fieldPath) =>
    `The value for ${fieldPath ?? "a field"} is ambiguous and was not imported.`,
  low_confidence: (fieldPath) =>
    `The value for ${fieldPath ?? "a field"} could not be verified ` +
    "deterministically and was not imported.",
  unsupported: (fieldPath) =>
    `The content for ${fieldPath ?? "a field"} is not supported by limited ` +
    "automatic extraction and was not imported.",
  duplicate: (fieldPath) =>
    `The value for ${fieldPath ?? "a field"} was duplicated and kept only once.`,
};

const warningSortKeyByCategory: Readonly<
  Record<LimitedDeterministicFallbackWarningCategory, number>
> = {
  no_reliable_semantic_parsing: 0,
  partial_extraction: 1,
  ambiguous: 2,
  low_confidence: 3,
  unsupported: 4,
  duplicate: 5,
};

/**
 * Deterministic warning derivation. Given the same accepted and rejected
 * candidates, the returned warnings are identical: fixed category ordering,
 * stable sort by field path and message, and deduplication.
 */
export function deriveLimitedDeterministicFallbackWarnings(input: {
  readonly acceptedCandidates: readonly LimitedDeterministicFallbackAcceptedCandidate[];
  readonly rejectedCandidates: readonly LimitedDeterministicFallbackRejectedCandidate[];
}): readonly LimitedDeterministicFallbackWarning[] {
  const warnings: LimitedDeterministicFallbackWarning[] = [
    {
      category: "no_reliable_semantic_parsing",
      severity: "informational",
      message: warningMessages.no_reliable_semantic_parsing(undefined),
      sortKey: warningSortKeyByCategory.no_reliable_semantic_parsing,
      requiresResolution: false,
    },
  ];

  if (input.acceptedCandidates.length > 0) {
    warnings.push({
      category: "partial_extraction",
      severity: "review_required",
      message: warningMessages.partial_extraction(undefined),
      sortKey: warningSortKeyByCategory.partial_extraction,
      requiresResolution: true,
    });
  }

  const rejectionSeverity: Readonly<
    Record<
      LimitedDeterministicFallbackRejectionReason,
      {
        readonly category: LimitedDeterministicFallbackWarningCategory;
        readonly severity: LimitedDeterministicFallbackWarningSeverity;
        readonly requiresResolution: boolean;
      }
    >
  > = {
    missing_evidence: {
      category: "unsupported",
      severity: "informational",
      requiresResolution: false,
    },
    invalid_evidence: {
      category: "unsupported",
      severity: "informational",
      requiresResolution: false,
    },
    inferred_value: {
      category: "unsupported",
      severity: "informational",
      requiresResolution: false,
    },
    forbidden_field: {
      category: "unsupported",
      severity: "informational",
      requiresResolution: false,
    },
    unsupported_field: {
      category: "unsupported",
      severity: "informational",
      requiresResolution: false,
    },
    ambiguous_value: {
      category: "ambiguous",
      severity: "review_required",
      requiresResolution: true,
    },
    low_confidence: {
      category: "low_confidence",
      severity: "review_required",
      requiresResolution: true,
    },
    duplicate_value: {
      category: "duplicate",
      severity: "review_required",
      requiresResolution: true,
    },
  };

  for (const rejected of input.rejectedCandidates) {
    const mapping = rejectionSeverity[rejected.reason];
    warnings.push({
      category: mapping.category,
      severity: mapping.severity,
      message: warningMessages[mapping.category](rejected.fieldPath),
      fieldPath: rejected.fieldPath,
      sortKey: warningSortKeyByCategory[mapping.category],
      requiresResolution: mapping.requiresResolution,
    });
  }

  const seen = new Set<string>();
  const unique: LimitedDeterministicFallbackWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.category}:${warning.fieldPath ?? ""}:${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(warning);
  }

  return [...unique].sort(
    (left, right) =>
      left.sortKey - right.sortKey ||
      (left.fieldPath ?? "").localeCompare(right.fieldPath ?? "", "en") ||
      left.message.localeCompare(right.message, "en"),
  );
}

export function buildLimitedDeterministicFallbackOutcome(input: {
  readonly acceptedCandidates: readonly LimitedDeterministicFallbackAcceptedCandidate[];
  readonly rejectedCandidates: readonly LimitedDeterministicFallbackRejectedCandidate[];
  readonly alternativeProviderAvailable: boolean;
}): LimitedDeterministicFallbackOutcome {
  const acceptedCandidates = [...input.acceptedCandidates];
  const rejectedCandidates = [...input.rejectedCandidates];
  const warnings = deriveLimitedDeterministicFallbackWarnings({
    acceptedCandidates,
    rejectedCandidates,
  });
  const acceptedCandidateCount = acceptedCandidates.length;
  const meetsDraftThreshold = meetsLimitedDeterministicDraftThreshold(
    acceptedCandidateCount,
  );
  const recoveryActions = input.alternativeProviderAvailable
    ? recoveryActionsWithAlternativeProvider
    : alwaysOfferedRecoveryActions;

  return limitedDeterministicFallbackOutcomeSchema.parse({
    contractVersion: limitedDeterministicFallbackContractVersion,
    status: meetsDraftThreshold ? "partial" : "no_supported_field",
    acceptedCandidates,
    rejectedCandidates,
    warnings,
    disclosure: buildLimitedDeterministicFallbackDisclosure(),
    recoveryActions,
    alternativeProviderAvailable: input.alternativeProviderAvailable,
    meetsDraftThreshold,
    acceptedCandidateCount,
    rejectedCandidateCount: rejectedCandidates.length,
  });
}
