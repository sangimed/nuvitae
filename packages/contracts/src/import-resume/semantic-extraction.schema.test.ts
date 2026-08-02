import { describe, expect, it } from "vitest";

import {
  nuvitaeSemanticExtractionResponseSchema,
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParseRequestSchema,
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
} from "./semantic-extraction.js";

const hash = "a".repeat(64);

const evidence = {
  line: 1,
  start: 0,
  end: 12,
  fragmentHash: hash,
  fragmentId: "fragment-1",
};

const value = {
  value: "Jane Example",
  normalizedValue: null,
  evidence: [evidence],
  classification: "explicit",
  confidence: "high",
};

function validResponse(): NuvitaeSemanticExtractionResponse {
  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [],
    },
    sections: {
      contact: {
        fullName: value,
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
  };
}

function validRequest(
  documentFormat: ResumeSemanticParseRequest["documentFormat"],
): ResumeSemanticParseRequest {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: null,
    correlationId: "import-correlation-1",
    documentFormat,
    languageContext: {
      detectedLanguage: "english",
      confidence: "high",
      textDirection: "ltr",
    },
    normalizedTranscript: {
      text: "Jane Example",
      sha256: hash,
      lineCount: 1,
    },
    sourceFragments: [
      {
        order: 0,
        line: 1,
        text: "Jane Example",
        hash,
        bounds: {
          lineStart: 1,
          lineEnd: 1,
          start: 0,
          end: 12,
        },
      },
    ],
    fragmentHashes: [hash],
    formatMetadata: {
      sourceFormat: documentFormat,
      extractionMode:
        documentFormat === "plain_text" ? "plain_text" : "selectable_text",
      renderedPageCount: documentFormat === "plain_text" ? null : 1,
      parserVersion: "test-parser-v1",
    },
  };
}

describe("semantic parser request contract", () => {
  it.each(["pdf", "docx", "plain_text"] as const)(
    "accepts normalized %s inputs through the same provider-neutral shape",
    (documentFormat) => {
      expect(
        resumeSemanticParseRequestSchema.safeParse(validRequest(documentFormat))
          .success,
      ).toBe(true);
    },
  );

  it("rejects unknown request fields, raw paths, and provider-shaped metadata", () => {
    expect(
      resumeSemanticParseRequestSchema.safeParse({
        ...validRequest("pdf"),
        sourceStorageKey: "private/user/import.pdf",
      }).success,
    ).toBe(false);

    expect(
      resumeSemanticParseRequestSchema.safeParse({
        ...validRequest("pdf"),
        provider: { model: "provider-native" },
      }).success,
    ).toBe(false);
  });
});

describe("versioned Nuvitae semantic extraction response schema", () => {
  it("accepts explicit null scalar fields and empty absent collections", () => {
    const parsed =
      nuvitaeSemanticExtractionResponseSchema.parse(validResponse());

    expect(parsed.sections.contact.email).toBeNull();
    expect(parsed.sections.workExperience).toEqual([]);
    expect(parsed.ambiguityDiagnostics).toEqual([]);
  });

  it("rejects unknown response fields and provider-specific payloads", () => {
    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...validResponse(),
        rawProviderPayload: { unsafe: true },
      }).success,
    ).toBe(false);
  });

  it("rejects omitted required nullable properties", () => {
    const candidate = validResponse();
    const contactWithoutEmail: Partial<typeof candidate.sections.contact> = {
      ...candidate.sections.contact,
    };
    delete contactWithoutEmail.email;

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...candidate,
        sections: {
          ...candidate.sections,
          contact: contactWithoutEmail,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects null collections", () => {
    const candidate = validResponse();

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...candidate,
        sections: {
          ...candidate.sections,
          skills: null,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects model-produced physical provenance fields", () => {
    const candidate = validResponse();

    expect(
      nuvitaeSemanticExtractionResponseSchema.safeParse({
        ...candidate,
        sections: {
          ...candidate.sections,
          contact: {
            ...candidate.sections.contact,
            fullName: {
              ...value,
              evidence: [{ ...evidence, page: 1 }],
            },
          },
        },
      }).success,
    ).toBe(false);
  });
});
