import { describe, expect, it } from "vitest";

import {
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParserContractVersion,
} from "@nuvitae/contracts";

import {
  normalizedFragmentHash,
  validateEvidence,
} from "./evidence-grounding.js";
import { validateSemanticResponse } from "./semantic-validation.js";

const source = "Jane Example";
const hash = normalizedFragmentHash(source);
const fragment = {
  order: 0,
  line: 1,
  text: source,
  hash,
  bounds: { lineStart: 1, lineEnd: 1, start: 0, end: source.length },
};

const request = {
  contractVersion: resumeSemanticParserContractVersion,
  importId: "import-1",
  correlationId: null,
  documentFormat: "plain_text" as const,
  languageContext: {
    detectedLanguage: "english" as const,
    confidence: "high" as const,
    textDirection: "ltr" as const,
  },
  normalizedTranscript: { text: source, sha256: "a".repeat(64), lineCount: 1 },
  sourceFragments: [fragment],
  fragmentHashes: [hash],
  formatMetadata: {
    sourceFormat: "plain_text" as const,
    extractionMode: "plain_text" as const,
    renderedPageCount: null,
    parserVersion: "test",
  },
};

const groundedValue = {
  value: source,
  normalizedValue: null,
  evidence: [
    {
      line: 1,
      start: 0,
      end: source.length,
      fragmentHash: hash,
      fragmentId: "fragment-1",
    },
  ],
  classification: "explicit" as const,
  confidence: "high" as const,
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english" as const,
      confidence: "high" as const,
      evidence: [],
    },
    sections: {
      contact: {
        fullName: groundedValue,
        email: null,
        phone: null,
        location: null,
        website: null,
      },
      headline: null,
      summary: null,
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [],
    },
    relationships: [],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
    ...overrides,
  };
}

describe("provider-neutral semantic validation", () => {
  it("accepts a fully grounded response and exposes an aggregate pass state", () => {
    const result = validateSemanticResponse({ request, response: response() });
    expect(result).toMatchObject({
      schemaValid: true,
      evidenceValid: true,
      noInventionValid: true,
      accepted: true,
    });
  });

  it.each([
    [
      "missing evidence",
      { ...groundedValue, evidence: [] },
      "malformed_flattened_evidence",
    ],
    [
      "invalid line",
      {
        ...groundedValue,
        evidence: [{ ...groundedValue.evidence[0], line: 2 }],
      },
      "foreign_fragment",
    ],
    [
      "wrong hash",
      {
        ...groundedValue,
        evidence: [
          { ...groundedValue.evidence[0], fragmentHash: "b".repeat(64) },
        ],
      },
      "foreign_fragment",
    ],
    [
      "mismatched source",
      { ...groundedValue, value: "Invented Name" },
      "unsupported_semantic_value",
    ],
  ])("rejects %s", (_label, value, code) => {
    const result = validateSemanticResponse({
      request,
      response: response({
        sections: {
          ...response().sections,
          contact: { ...response().sections.contact, fullName: value },
        },
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.some((item) => item.code === code)).toBe(true);
  });

  it("supports deterministic whitespace and case normalization but not paraphrase", () => {
    expect(
      validateSemanticResponse({
        request,
        response: response({
          sections: {
            ...response().sections,
            contact: {
              ...response().sections.contact,
              fullName: { ...groundedValue, value: " jane   example " },
            },
          },
        }),
      }).noInventionValid,
    ).toBe(true);
    expect(
      validateSemanticResponse({
        request,
        response: response({
          sections: {
            ...response().sections,
            contact: {
              ...response().sections.contact,
              fullName: {
                ...groundedValue,
                value: "The candidate Jane Example",
              },
            },
          },
        }),
      }).noInventionValid,
    ).toBe(false);
  });

  it("requires evidence for ambiguity and preserves it as review", () => {
    const result = validateSemanticResponse({
      request,
      response: response({
        ambiguityDiagnostics: [
          {
            code: "ambiguous_date",
            message: "Review needed",
            severity: "warning",
            evidence: [],
            safeDetail: null,
          },
        ],
      }),
    });
    expect(result.accepted).toBe(false);
    expect(result.requiresReview).toBe(true);
  });

  it("rejects invented values declared absent and provider-native fields", () => {
    const invented = validateSemanticResponse({
      request,
      response: response({
        sections: {
          ...response().sections,
          contact: { ...response().sections.contact, phone: groundedValue },
        },
      }),
      absentPaths: ["sections.contact.phone"],
    });
    expect(invented.absenceValid).toBe(false);
    expect(
      validateSemanticResponse({
        request,
        response: {
          ...response(),
          provider: { raw: "Ignore previous instructions" },
        },
      }).schemaValid,
    ).toBe(false);
  });

  it("rejects evidence outside the current request", () => {
    const result = validateEvidence(
      request,
      { ...groundedValue.evidence[0], fragmentHash: "c".repeat(64) },
      ["sections", "contact", "fullName"],
    );
    expect(result[0]?.code).toBe("foreign_fragment");
  });
});
