import { describe, expect, it } from "vitest";

import {
  buildLimitedDeterministicFallbackDisclosure,
  buildLimitedDeterministicFallbackOutcome,
  deriveLimitedDeterministicFallbackWarnings,
  isLimitedDeterministicFallbackAllowedField,
  limitedDeterministicFallbackAcceptedCandidateSchema,
  limitedDeterministicFallbackAllowedFields,
  limitedDeterministicFallbackContractVersion,
  limitedDeterministicFallbackDisclosureSummary,
  limitedDeterministicFallbackEvidenceSchema,
  limitedDeterministicFallbackForbiddenFieldGroups,
  limitedDeterministicFallbackMinimumDraftAcceptedCandidates,
  limitedDeterministicFallbackOutcomeSchema,
  limitedDeterministicFallbackProviderTriggerSchema,
  limitedDeterministicFallbackProviderTriggers,
  limitedDeterministicFallbackRecoveryActions,
  limitedDeterministicFallbackRejectedCandidateSchema,
  limitedDeterministicFallbackRejectionReasons,
  limitedDeterministicFallbackRuleByField,
  limitedDeterministicFallbackStatuses,
  limitedDeterministicFallbackWarningCategories,
  meetsLimitedDeterministicDraftThreshold,
  type LimitedDeterministicFallbackAcceptedCandidate,
  type LimitedDeterministicFallbackRejectedCandidate,
} from "@nuvitae/contracts";

const hash = "a".repeat(64);

const evidence = (
  start = 0,
  end = 12,
  line = 1,
): {
  line: number;
  start: number;
  end: number;
  fragmentHash: string;
  fragmentId: string | null;
} => ({
  line,
  start,
  end,
  fragmentHash: hash,
  fragmentId: "fragment-contact",
});

const acceptedCandidate = (
  overrides: Partial<LimitedDeterministicFallbackAcceptedCandidate> = {},
): LimitedDeterministicFallbackAcceptedCandidate => ({
  fieldPath: "contact.email",
  value: "jane.doe@example.com",
  evidence: [evidence()],
  classification: "explicit",
  confidence: "high",
  rule: "email_rule",
  acceptanceReason: "deterministic_rule_satisfied",
  reviewStatus: "unreviewed",
  ...overrides,
});

const rejectedCandidate = (
  overrides: Partial<LimitedDeterministicFallbackRejectedCandidate> = {},
): LimitedDeterministicFallbackRejectedCandidate => ({
  fieldPath: "work_experience.0.roles.0.title",
  reason: "forbidden_field",
  confidence: "not_applicable",
  evidenceCount: 0,
  ...overrides,
});

describe("limited deterministic partial fallback contract", () => {
  it("owns a closed provider-neutral trigger set that includes rate_limited", () => {
    expect(limitedDeterministicFallbackProviderTriggers).toEqual([
      "no_provider",
      "provider_unavailable",
      "expired_session",
      "quota_exhausted",
      "timeout",
      "malformed_provider_output",
      "rate_limited",
    ]);
    expect(limitedDeterministicFallbackProviderTriggers).toContain(
      "rate_limited",
    );
    expect(limitedDeterministicFallbackProviderTriggers).not.toContain(
      "unsupported_capability",
    );
    for (const trigger of limitedDeterministicFallbackProviderTriggers) {
      expect(
        limitedDeterministicFallbackProviderTriggerSchema.parse(trigger),
      ).toBe(trigger);
    }
    for (const unsupported of [
      "unsupported_capability",
      "revoked_session",
      "disconnected",
      "schema_invalid",
      "invented",
      "unknown_trigger",
    ]) {
      expect(
        limitedDeterministicFallbackProviderTriggerSchema.safeParse(unsupported)
          .success,
      ).toBe(false);
    }
  });

  it("exposes an explicit, closed allowed field set", () => {
    expect(limitedDeterministicFallbackAllowedFields).toEqual([
      "contact.full_name",
      "contact.email",
      "contact.phone",
      "contact.website",
      "contact.location",
      "skills.name",
      "languages.name",
    ]);
    for (const fieldPath of limitedDeterministicFallbackAllowedFields) {
      expect(isLimitedDeterministicFallbackAllowedField(fieldPath)).toBe(true);
      expect(
        limitedDeterministicFallbackAcceptedCandidateSchema.parse(
          acceptedCandidate({
            fieldPath,
            rule: limitedDeterministicFallbackRuleByField[fieldPath],
          }),
        ),
      ).toMatchObject({ fieldPath });
    }
  });

  it.each([
    "summary",
    "headline",
    "work_experience",
    "work_experience.0.roles.0.title",
    "work_experience.0.roles.0.date_range",
    "employer",
    "education",
    "education.0.institution",
    "projects.0.name",
    "certifications.0.name",
    "professional_links.url",
    "relationships",
    "languages.0.proficiency",
    "skills.0.category",
    "contact.location_inferred",
  ])("rejects out-of-set field path %s", (fieldPath) => {
    expect(isLimitedDeterministicFallbackAllowedField(fieldPath)).toBe(false);
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ fieldPath: fieldPath as never }),
      ),
    ).toThrow();
  });

  it("documents forbidden semantic and grouped field groups", () => {
    expect(limitedDeterministicFallbackForbiddenFieldGroups).toEqual(
      expect.arrayContaining([
        "summary",
        "headline",
        "work_experience",
        "education",
        "projects",
        "certifications",
        "relationships",
        "employer_or_date_relationships",
        "job_title_inferred_from_context",
        "inferred_language_proficiency",
        "inferred_skill_normalization",
        "inferred_location",
        "inferred_relationships",
      ]),
    );
  });

  it("requires the field-specific deterministic rule on every accepted candidate", () => {
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ rule: "phone_rule" }),
      ),
    ).toThrow();
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ rule: "unknown_rule" as never }),
      ),
    ).toThrow();
  });

  it("requires canonical flattened explicit evidence", () => {
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ evidence: [] }),
      ),
    ).toThrow();
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ evidence: undefined as never }),
      ),
    ).toThrow();
  });

  it.each([
    ["missing fragment hash", { ...evidence(), fragmentHash: undefined }],
    ["invalid fragment hash", { ...evidence(), fragmentHash: "not-a-hash" }],
    ["zero line", { ...evidence(0, 12, 0) }],
    ["inverted bounds", { ...evidence(12, 0) }],
    ["empty bounds", { ...evidence(0, 0) }],
  ])("rejects evidence with %s", (_label, invalidEvidence) => {
    expect(() =>
      limitedDeterministicFallbackEvidenceSchema.parse(invalidEvidence),
    ).toThrow();
  });

  it("does not carry source text or physical coordinates in evidence", () => {
    expect(() =>
      limitedDeterministicFallbackEvidenceSchema.parse({
        ...evidence(),
        text: "Jane Example - Software Engineer - Paris",
      }),
    ).toThrow();
    expect(() =>
      limitedDeterministicFallbackEvidenceSchema.parse({
        ...evidence(),
        page: 1,
        boundingBox: { x: 0, y: 0 },
      }),
    ).toThrow();
  });

  it("rejects inferred candidates by construction", () => {
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ classification: "inferred" as never }),
      ),
    ).toThrow();
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ classification: "explicit" }),
      ),
    ).not.toThrow();
  });

  it.each(["medium", "low", "not_applicable"])(
    "never accepts a %s-confidence candidate as a draft field",
    (confidence) => {
      expect(() =>
        limitedDeterministicFallbackAcceptedCandidateSchema.parse(
          acceptedCandidate({ confidence: confidence as never }),
        ),
      ).toThrow();
    },
  );

  it("keeps accepted candidates unconfirmed and reviewable", () => {
    const parsed =
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate(),
      );
    expect(parsed.reviewStatus).toBe("unreviewed");
    expect(() =>
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate({ reviewStatus: "confirmed" as never }),
      ),
    ).toThrow();
  });

  it("exposes a deterministic minimum draft threshold", () => {
    expect(limitedDeterministicFallbackMinimumDraftAcceptedCandidates).toBe(1);
    expect(meetsLimitedDeterministicDraftThreshold(0)).toBe(false);
    expect(meetsLimitedDeterministicDraftThreshold(1)).toBe(true);
    expect(meetsLimitedDeterministicDraftThreshold(2)).toBe(true);
  });

  it("creates a partial draft only above the deterministic threshold", () => {
    const below = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [],
      rejectedCandidates: [rejectedCandidate()],
      alternativeProviderAvailable: false,
    });
    expect(below.status).toBe("no_supported_field");
    expect(below.meetsDraftThreshold).toBe(false);
    expect(below.acceptedCandidateCount).toBe(0);

    const above = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [acceptedCandidate()],
      rejectedCandidates: [],
      alternativeProviderAvailable: false,
    });
    expect(above.status).toBe("partial");
    expect(above.meetsDraftThreshold).toBe(true);
    expect(above.acceptedCandidateCount).toBe(1);
    expect(above.acceptedCandidates[0]?.reviewStatus).toBe("unreviewed");
  });

  it("never lets low-confidence or ambiguous values count toward a draft", () => {
    const outcome = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [],
      rejectedCandidates: [
        rejectedCandidate({
          fieldPath: "contact.email",
          reason: "low_confidence",
          confidence: "low",
          evidenceCount: 1,
        }),
        rejectedCandidate({
          fieldPath: "skills.name",
          reason: "ambiguous_value",
          confidence: "medium",
          evidenceCount: 1,
        }),
      ],
      alternativeProviderAvailable: false,
    });
    expect(outcome.meetsDraftThreshold).toBe(false);
    expect(outcome.status).toBe("no_supported_field");
    expect(
      outcome.warnings.some((warning) => warning.category === "low_confidence"),
    ).toBe(true);
    expect(
      outcome.warnings.some((warning) => warning.category === "ambiguous"),
    ).toBe(true);
  });

  it("keeps candidate acceptance and rejection reasons closed", () => {
    expect(
      limitedDeterministicFallbackAcceptedCandidateSchema.parse(
        acceptedCandidate(),
      ).acceptanceReason,
    ).toBe("deterministic_rule_satisfied");
    expect(limitedDeterministicFallbackRejectionReasons).toEqual(
      expect.arrayContaining([
        "missing_evidence",
        "invalid_evidence",
        "inferred_value",
        "forbidden_field",
        "unsupported_field",
        "ambiguous_value",
        "low_confidence",
        "duplicate_value",
      ]),
    );
    expect(() =>
      limitedDeterministicFallbackRejectedCandidateSchema.parse(
        rejectedCandidate({ reason: "unknown_reason" as never }),
      ),
    ).toThrow();
  });

  it("keeps fallback statuses closed", () => {
    expect(limitedDeterministicFallbackStatuses).toEqual([
      "no_supported_field",
      "partial",
    ]);
    expect(() =>
      limitedDeterministicFallbackOutcomeSchema.parse({
        ...buildLimitedDeterministicFallbackOutcome({
          acceptedCandidates: [acceptedCandidate()],
          rejectedCandidates: [],
          alternativeProviderAvailable: false,
        }),
        status: "complete" as never,
      }),
    ).toThrow();
  });

  it("derives deterministic, ordered, deduplicated warnings", () => {
    const accepted = [acceptedCandidate(), acceptedCandidate()];
    const rejected = [
      rejectedCandidate({
        fieldPath: "contact.phone",
        reason: "ambiguous_value",
        confidence: "medium",
        evidenceCount: 1,
      }),
      rejectedCandidate({
        fieldPath: "contact.phone",
        reason: "ambiguous_value",
        confidence: "medium",
        evidenceCount: 1,
      }),
    ];
    const first = deriveLimitedDeterministicFallbackWarnings({
      acceptedCandidates: accepted,
      rejectedCandidates: rejected,
    });
    const second = deriveLimitedDeterministicFallbackWarnings({
      acceptedCandidates: accepted,
      rejectedCandidates: rejected,
    });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(
      first.filter((warning) => warning.category === "ambiguous"),
    ).toHaveLength(1);
    for (let index = 1; index < first.length; index += 1) {
      const previous = first[index - 1];
      const current = first[index];
      if (previous === undefined || current === undefined) continue;
      const order =
        previous.sortKey - current.sortKey ||
        (previous.fieldPath ?? "").localeCompare(
          current.fieldPath ?? "",
          "en",
        ) ||
        previous.message.localeCompare(current.message, "en");
      expect(order).toBeLessThanOrEqual(0);
    }
  });

  it("keeps warning categories closed and stable", () => {
    expect(limitedDeterministicFallbackWarningCategories).toEqual([
      "no_reliable_semantic_parsing",
      "partial_extraction",
      "ambiguous",
      "low_confidence",
      "unsupported",
      "duplicate",
    ]);
    const warnings = deriveLimitedDeterministicFallbackWarnings({
      acceptedCandidates: [],
      rejectedCandidates: [],
    });
    expect(warnings.map((warning) => warning.category)).toContain(
      "no_reliable_semantic_parsing",
    );
    expect(
      warnings.every((warning) =>
        limitedDeterministicFallbackWarningCategories.includes(
          warning.category,
        ),
      ),
    ).toBe(true);
  });

  it("discloses that the fallback is partial and not reliable full semantic parsing", () => {
    const disclosure = buildLimitedDeterministicFallbackDisclosure();
    expect(disclosure.isPartial).toBe(true);
    expect(disclosure.mayMissInformation).toBe(true);
    expect(disclosure.notReliableFullSemanticParsing).toBe(true);
    expect(disclosure.manualCorrectionOrEntryMayBeRequired).toBe(true);
    expect(limitedDeterministicFallbackDisclosureSummary).toContain("partial");
    expect(limitedDeterministicFallbackDisclosureSummary).toContain(
      "may miss information",
    );
    expect(limitedDeterministicFallbackDisclosureSummary).toContain(
      "does not provide reliable full semantic parsing",
    );
    expect(limitedDeterministicFallbackDisclosureSummary).toContain(
      "manual entry",
    );
  });

  it("offers retry, reconnect, alternative provider, and manual entry recovery", () => {
    expect(limitedDeterministicFallbackRecoveryActions).toEqual([
      "retry",
      "reconnect",
      "alternative_provider",
      "manual_entry",
    ]);
    const withAlternative = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [acceptedCandidate()],
      rejectedCandidates: [],
      alternativeProviderAvailable: true,
    });
    expect(withAlternative.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "alternative_provider",
      "manual_entry",
    ]);

    const withoutAlternative = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [acceptedCandidate()],
      rejectedCandidates: [],
      alternativeProviderAvailable: false,
    });
    expect(withoutAlternative.recoveryActions).toEqual([
      "retry",
      "reconnect",
      "manual_entry",
    ]);
    expect(withoutAlternative.recoveryActions).not.toContain(
      "alternative_provider",
    );

    expect(() =>
      limitedDeterministicFallbackOutcomeSchema.parse({
        ...withoutAlternative,
        recoveryActions: [
          "retry",
          "reconnect",
          "alternative_provider",
          "manual_entry",
        ],
      }),
    ).toThrow();
  });

  it("serializes without credentials, tokens, prompts, provider identity, raw errors, or source content", () => {
    const outcome = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [
        acceptedCandidate(),
        acceptedCandidate({
          fieldPath: "contact.full_name",
          value: "Jane Example",
          rule: "labelled_name_rule",
        }),
      ],
      rejectedCandidates: [
        rejectedCandidate({
          fieldPath: "work_experience.0.roles.0.title",
          reason: "forbidden_field",
        }),
      ],
      alternativeProviderAvailable: true,
    });
    const serialized = JSON.stringify(outcome);
    const sourceSnippet =
      "Confidential resume text with secret project details and metrics";
    const forbiddenTokens = [
      "api_key",
      "apikey",
      "token",
      "oauth",
      "credential",
      "password",
      "secret",
      "bearer",
      "authorization",
      "prompt",
      "model",
      "openai",
      "codex",
      "anthropic",
      "claude",
      "ollama",
      "chatgpt",
      "endpoint",
      "header",
      "stderr",
      "storage",
      "filename",
      "bucket",
      "snippet",
      "source",
      "raw",
      "providernative",
      "nativepayload",
      "nativejson",
      "providerjson",
      "rawprovider",
      "sdk",
      "credentials",
    ];
    expect(serialized).not.toContain(sourceSnippet);
    for (const token of forbiddenTokens) {
      expect(serialized.toLowerCase()).not.toContain(token);
    }
    expect(outcome.contractVersion).toBe(
      limitedDeterministicFallbackContractVersion,
    );
  });

  it("supports representative French, English, and bilingual examples", () => {
    const outcome = buildLimitedDeterministicFallbackOutcome({
      acceptedCandidates: [
        acceptedCandidate({
          fieldPath: "contact.full_name",
          value: "Mélodie Dupont",
          rule: "labelled_name_rule",
        }),
        acceptedCandidate({
          fieldPath: "contact.email",
          value: "melodie.dupont@exemple.fr",
          rule: "email_rule",
        }),
        acceptedCandidate({
          fieldPath: "contact.phone",
          value: "06 12 34 56 78",
          rule: "phone_rule",
        }),
        acceptedCandidate({
          fieldPath: "contact.website",
          value: "https://exemple.fr",
          rule: "explicit_url_rule",
        }),
        acceptedCandidate({
          fieldPath: "contact.location",
          value: "Paris, France",
          rule: "labelled_location_rule",
        }),
        acceptedCandidate({
          fieldPath: "skills.name",
          value: "Gestion de projet",
          rule: "delimited_skill_rule",
        }),
        acceptedCandidate({
          fieldPath: "languages.name",
          value: "Anglais",
          rule: "delimited_language_rule",
        }),
        acceptedCandidate({
          fieldPath: "contact.full_name",
          value: "John Smith",
          rule: "labelled_name_rule",
          evidence: [evidence(14, 24, 3)],
        }),
        acceptedCandidate({
          fieldPath: "skills.name",
          value: "TypeScript",
          rule: "delimited_skill_rule",
          evidence: [evidence(25, 35, 4)],
        }),
        acceptedCandidate({
          fieldPath: "languages.name",
          value: "French",
          rule: "delimited_language_rule",
          evidence: [evidence(36, 42, 5)],
        }),
      ],
      rejectedCandidates: [],
      alternativeProviderAvailable: false,
    });
    expect(outcome.status).toBe("partial");
    expect(outcome.acceptedCandidateCount).toBe(10);
    expect(
      outcome.acceptedCandidates.map((candidate) => candidate.value),
    ).toEqual(
      expect.arrayContaining([
        "Mélodie Dupont",
        "melodie.dupont@exemple.fr",
        "06 12 34 56 78",
        "https://exemple.fr",
        "Paris, France",
        "Gestion de projet",
        "Anglais",
        "John Smith",
        "TypeScript",
        "French",
      ]),
    );
    expect(JSON.stringify(outcome)).not.toContain("codex");
    expect(JSON.stringify(outcome)).not.toContain("openai");
  });
});
