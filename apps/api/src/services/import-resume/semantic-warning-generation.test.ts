import { describe, expect, it } from "vitest";
import type { NuvitaeSemanticExtractionResponse } from "@nuvitae/contracts";
import { buildExtractionDraft } from "@nuvitae/domain";
import { createPrivacySafeSemanticProviderError } from "@nuvitae/import-application";
import type { SemanticValidationDiagnostic } from "@nuvitae/import-application";
import type { ImportedDocument } from "@nuvitae/domain";
import type { SemanticCandidateMappingResult } from "./semantic-candidates-to-draft.js";
import {
  generateSemanticWarnings,
  semanticWarningCategories,
} from "./semantic-warning-generation.js";

const fragmentHash = "a".repeat(64);
const now = new Date("2026-08-01T09:30:00.000Z");

function document(): ImportedDocument {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 42,
    storageKey: "users/a/imports/b/source/c",
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-08T09:30:00.000Z"),
    detectedLanguage: "english",
  };
}

function diag(
  category: SemanticValidationDiagnostic["category"],
  code: string,
  path: readonly (string | number)[] = [],
): SemanticValidationDiagnostic {
  return {
    code,
    category,
    path: [...path],
    fragmentId: null,
    fragmentHash: null,
    line: null,
    coordinate: null,
    retryable: false,
    requiresReview: false,
  };
}

function value(text: string, overrides: Record<string, unknown> = {}) {
  return {
    value: text,
    normalizedValue: null,
    evidence: [
      {
        line: 1,
        start: 0,
        end: text.length,
        fragmentHash,
        fragmentId: "fragment-1",
      },
    ],
    classification: "explicit",
    confidence: "high",
    ...overrides,
  };
}

function responseWith(
  values: {
    readonly lowConfidence?: boolean;
    readonly inferred?: boolean;
    readonly safeDetail?: string;
  } = {},
): NuvitaeSemanticExtractionResponse {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v1",
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [],
    },
    sections: {
      contact: {
        fullName: value("Jordan Avery"),
        email: null,
        phone: null,
        location: null,
        website: null,
      },
      headline: null,
      summary: null,
      workExperience: [],
      education: [],
      skills: [
        {
          candidateId: "skill-1",
          name: value("TypeScript", {
            ...(values.inferred === true ? { classification: "inferred" } : {}),
            ...(values.lowConfidence === true ? { confidence: "low" } : {}),
          }),
          category: null,
        },
      ],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

describe("generateSemanticWarnings (T173)", () => {
  it("maps T157-T160 diagnostic outcomes to stable categories and severity", () => {
    const result = generateSemanticWarnings({
      diagnostics: [
        diag("schema", "schema_violation", ["sections"]),
        diag("schema", "malformed_flattened_evidence", ["sections"]),
        diag("evidence", "foreign_fragment", ["sections", "skills", 0]),
        diag("grounding", "fragment_hash_mismatch", ["sections", "skills", 0]),
        diag("no_invention", "unsupported_semantic_value", [
          "sections",
          "skills",
          0,
        ]),
        diag("absence", "explicit_absence_conflict", ["sections", "contact"]),
        diag("ambiguity", "ambiguous_date", ["sections", "workExperience", 0]),
        diag("conflict", "conflicting_dates", [
          "sections",
          "workExperience",
          0,
        ]),
        diag("conflict", "duplicate_diagnostic", ["sections", "skills", 0]),
        diag("review", "inferred_fact_requires_review", [
          "sections",
          "skills",
          0,
        ]),
      ],
    });
    const categories = result.warnings.map((warning) => warning.category);
    expect(new Set(categories)).toEqual(
      new Set([
        "ambiguous",
        "duplicate",
        "conflicting",
        "inferred",
        "invalid_schema",
        "invalid_evidence",
        "ungrounded",
        "invented",
      ]),
    );
    expect(
      new Set(
        result.warnings
          .filter((warning) => warning.severity === "blocking")
          .map((warning) => warning.category),
      ),
    ).toEqual(
      new Set([
        "conflicting",
        "invalid_schema",
        "invalid_evidence",
        "ungrounded",
        "invented",
      ]),
    );
    expect(
      new Set(
        result.warnings
          .filter((warning) => warning.severity === "review_required")
          .map((warning) => warning.category),
      ),
    ).toEqual(new Set(["ambiguous", "duplicate", "conflicting", "inferred"]));
  });

  it("maps T151 provider error outcomes to blocking warnings with provider-neutral recovery actions", () => {
    const result = generateSemanticWarnings({
      providerError: createPrivacySafeSemanticProviderError("not_configured"),
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        category: "no_provider",
        severity: "blocking",
        recoveryActions: ["choose_another_provider", "manual_entry"],
      }),
    ]);
    expect(result.draftWarnings).toEqual([]);
    expect(result.blockingCount).toBe(1);

    const cases: ReadonlyArray<
      [Parameters<typeof createPrivacySafeSemanticProviderError>[0], string]
    > = [
      ["authentication_expired", "authentication_expired"],
      ["provider_unavailable", "provider_unavailable"],
      ["rate_limited", "rate_limited"],
      ["quota_exceeded", "quota_exceeded"],
      ["timeout", "timeout"],
      ["invalid_provider_response", "malformed_output"],
      ["schema_violation", "invalid_schema"],
      ["malformed_flattened_evidence", "invalid_evidence"],
      ["invalid_grounding", "ungrounded"],
      ["invented_fact", "invented"],
      ["unsupported_capability", "unsupported"],
    ];
    for (const [code, expectedCategory] of cases) {
      const outcome = generateSemanticWarnings({
        providerError: createPrivacySafeSemanticProviderError(code),
      });
      expect(outcome.warnings).toEqual([
        expect.objectContaining({
          category: expectedCategory,
          severity: "blocking",
        }),
      ]);
    }
  });

  it("keeps limited deterministic fallback advertised for rate_limited only", () => {
    const rateLimited = generateSemanticWarnings({
      providerError: createPrivacySafeSemanticProviderError("rate_limited"),
    });
    expect(rateLimited.warnings[0]?.recoveryActions).toEqual([
      "retry",
      "choose_another_provider",
      "limited_deterministic_partial_extraction",
      "manual_entry",
    ]);

    const unsupportedCapability = generateSemanticWarnings({
      providerError: createPrivacySafeSemanticProviderError(
        "unsupported_capability",
      ),
    });
    expect(unsupportedCapability.warnings[0]?.recoveryActions).toEqual([
      "choose_another_provider",
      "manual_entry",
    ]);
    expect(unsupportedCapability.warnings[0]?.recoveryActions).not.toContain(
      "limited_deterministic_partial_extraction",
    );
  });

  it("does not generate a warning for intentional cancellation", () => {
    const result = generateSemanticWarnings({
      providerError: createPrivacySafeSemanticProviderError("cancelled"),
    });
    expect(result.warnings).toEqual([]);
    expect(result.blockingCount).toBe(0);
  });

  it("distinguishes blocking, review-required, and informational warnings", () => {
    const response = responseWith();
    response.ambiguityDiagnostics = [
      {
        code: "ambiguous_date",
        message: "unused message",
        severity: "warning",
        evidence: [],
        safeDetail: null,
      },
    ];
    response.privacyWarnings = [
      {
        code: "source_contains_sensitive_personal_data",
        message: "unused message",
        severity: "info",
        evidence: [],
        safeDetail: "unused safe detail",
      },
    ];
    const result = generateSemanticWarnings({
      response,
      diagnostics: [
        diag("no_invention", "unsupported_semantic_value", [
          "sections",
          "skills",
          0,
        ]),
      ],
    });
    expect(result.blockingCount).toBe(1);
    expect(result.reviewRequiredCount).toBe(1);
    expect(result.informationalCount).toBe(1);
    expect(result.draftWarnings).toEqual([
      expect.objectContaining({
        warningType: "ambiguous",
        requiresResolution: true,
      }),
      expect.objectContaining({
        warningType: "unsupported",
        requiresResolution: false,
      }),
    ]);
    expect(result.warnings).not.toContainEqual(
      expect.objectContaining({
        category: "invented",
        severity: "review_required",
      }),
    );
  });

  it("deduplicates repeated diagnostics and mapping duplicates", () => {
    const mapping: SemanticCandidateMappingResult = {
      fields: [],
      evidence: [],
      candidateIdentities: {},
      relationships: [],
      duplicates: [
        {
          section: "skills",
          keptFieldPath: "skills.0.name",
          duplicateFieldPath: "skills.1.name",
          value: { kind: "text", value: "TypeScript" },
        },
      ],
      duplicateSuppressed: 1,
      rejected: [],
      reviewRequired: [],
    };
    const result = generateSemanticWarnings({
      diagnostics: [
        diag("conflict", "duplicate_diagnostic", [
          "sections",
          "skills",
          1,
          "name",
        ]),
      ],
      mapping,
    });
    const duplicateWarnings = result.warnings.filter(
      (warning) => warning.category === "duplicate",
    );
    expect(duplicateWarnings).toHaveLength(1);
    expect(duplicateWarnings[0]?.fieldPath).toBe("skills.1.name");
    expect(duplicateWarnings[0]?.severity).toBe("review_required");
  });

  it("orders warnings deterministically by stable category order", () => {
    const diagnostics = [
      diag("no_invention", "unsupported_semantic_value", [
        "sections",
        "skills",
        0,
      ]),
      diag("ambiguity", "ambiguous_date", ["sections", "workExperience", 0]),
      diag("schema", "schema_violation", ["sections"]),
      diag("conflict", "conflicting_dates", ["sections", "workExperience", 0]),
      diag("review", "inferred_fact_requires_review", [
        "sections",
        "skills",
        0,
      ]),
    ];
    const first = generateSemanticWarnings({ diagnostics });
    const second = generateSemanticWarnings({ diagnostics });
    const categories = first.warnings.map((warning) => warning.category);
    expect(categories).toEqual(
      [...categories].sort((left, right) => {
        const leftIndex = semanticWarningCategories.indexOf(left);
        const rightIndex = semanticWarningCategories.indexOf(right);
        return leftIndex - rightIndex;
      }),
    );
    expect(first.warnings.map((warning) => warning.sortKey)).toEqual(
      categories.map((category) => semanticWarningCategories.indexOf(category)),
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("exposes only sanitized safeDetail and never resume text, prompts, payloads, or raw errors", () => {
    const response = responseWith();
    response.ambiguityDiagnostics = [
      {
        code: "ambiguous_date",
        message: "Jordan Avery worked 2019/2021",
        severity: "warning",
        evidence: [],
        safeDetail: "The end date could be read as a range or a single year.",
      },
    ];
    const result = generateSemanticWarnings({
      response,
      providerError: createPrivacySafeSemanticProviderError(
        "provider_unavailable",
      ),
      diagnostics: [
        diag("ambiguity", "ambiguous_date", ["ambiguityDiagnostics", 0]),
      ],
    });
    const serialized = JSON.stringify(result.warnings);
    expect(serialized).not.toContain("Jordan Avery");
    expect(serialized).not.toContain("2019/2021");
    expect(serialized).not.toContain("worked");
    expect(serialized).not.toContain("codex");
    expect(serialized).not.toContain("openai");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("raw");
    expect(serialized).toContain(
      "The end date could be read as a range or a single year.",
    );
    expect(serialized).toContain(plainMessages().provider_unavailable);
  });

  it("emits review-required warnings for low-confidence and inferred values from the response", () => {
    const result = generateSemanticWarnings({
      response: responseWith({ lowConfidence: true, inferred: true }),
    });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "low_confidence",
          severity: "review_required",
          fieldPath: "skills.0.name",
        }),
        expect.objectContaining({
          category: "inferred",
          severity: "review_required",
          fieldPath: "skills.0.name",
        }),
      ]),
    );
  });

  it("produces draft warnings accepted by the existing review-draft model", () => {
    const response = responseWith({ lowConfidence: true });
    response.ambiguityDiagnostics = [
      {
        code: "ambiguous_date",
        message: "unused",
        severity: "warning",
        evidence: [],
        safeDetail: null,
      },
    ];
    const result = generateSemanticWarnings({
      response,
      diagnostics: [
        diag("ambiguity", "ambiguous_date", ["ambiguityDiagnostics", 0]),
      ],
    });
    const draft = buildExtractionDraft({
      importedDocument: document(),
      fields: [],
      warnings: result.draftWarnings,
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "draft-1",
        fieldId: () => "field-1",
        warningId: () => "warning-1",
      },
      now,
    });
    expect(draft.draft).toBeUndefined();
    const withFields = buildExtractionDraft({
      importedDocument: document(),
      fields: [
        {
          section: "skills",
          fieldPath: "skills.0.name",
          value: { kind: "text", value: "TypeScript" },
          sourceLocation: {
            kind: "minimal",
            label: "imported_from_initial_resume",
            confirmedByUser: false,
            sourceDeletedAt: undefined,
            documentId: document().id,
          },
          confidence: "low",
          inferenceStatus: "not_inferred",
          sourceOrder: 0,
        },
      ],
      warnings: result.draftWarnings,
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "draft-1",
        fieldId: () => "field-1",
        warningId: () => "warning-1",
      },
      now,
    });
    expect(withFields.draft?.warnings).toEqual([
      expect.objectContaining({
        warningType: "ambiguous",
        reviewStatus: "needs_review",
        requiresResolution: true,
        severity: "needs_attention",
      }),
      expect.objectContaining({
        warningType: "low_confidence",
        reviewStatus: "needs_review",
        requiresResolution: true,
        severity: "needs_attention",
      }),
    ]);
  });
});

function plainMessages(): Record<string, string> {
  return {
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
}
