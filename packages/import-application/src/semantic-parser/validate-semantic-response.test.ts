import { describe, expect, it } from "vitest";

import {
  maxSemanticExtractionResponseJsonBytes,
  maxSemanticParserRequestJsonBytes,
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParserContractVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";

import { serializeSemanticProviderError } from "./provider-errors.js";
import {
  validateSemanticExtractionResponse,
  validateSemanticParseRequest,
} from "./validate-semantic-response.js";

const hash = "b".repeat(64);
const sensitiveText = "Jane Example jane@example.test secret-token";

const evidence = {
  line: 1,
  start: 0,
  end: 12,
  fragmentHash: hash,
  fragmentId: "fragment-1",
};

const semanticValue = {
  value: "Jane Example",
  normalizedValue: null,
  evidence: [evidence],
  classification: "explicit",
  confidence: "high",
} as const;

function request(
  documentFormat: ResumeSemanticParseRequest["documentFormat"] = "pdf",
): ResumeSemanticParseRequest {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: "import-1",
    correlationId: null,
    documentFormat,
    languageContext: {
      detectedLanguage: "english",
      confidence: "high",
      textDirection: "ltr",
    },
    normalizedTranscript: {
      text: sensitiveText,
      sha256: hash,
      lineCount: 1,
    },
    sourceFragments: [
      {
        order: 0,
        line: 1,
        text: sensitiveText,
        hash,
        bounds: {
          lineStart: 1,
          lineEnd: 1,
          start: 0,
          end: sensitiveText.length,
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

function response(): NuvitaeSemanticExtractionResponse {
  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [],
    },
    sections: {
      contact: {
        fullName: semanticValue,
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

describe("semantic parser request validation boundary", () => {
  it.each(["pdf", "docx", "plain_text"] as const)(
    "accepts valid %s requests through the same contract",
    (documentFormat) => {
      expect(
        validateSemanticParseRequest(request(documentFormat)),
      ).toMatchObject({
        ok: true,
      });
    },
  );

  it("rejects unknown request fields before provider invocation", () => {
    const result = validateSemanticParseRequest({
      ...request(),
      credentials: "not allowed",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "schema_violation" },
    });
  });

  it("rejects unsupported request contract versions", () => {
    expect(
      validateSemanticParseRequest({
        ...request(),
        contractVersion: "nuvitae.resume-semantic-parser.v0",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported_contract_version" },
    });
  });

  it("rejects oversized requests without echoing resume text", () => {
    const result = validateSemanticParseRequest({
      ...request(),
      normalizedTranscript: {
        ...request().normalizedTranscript,
        text: "x".repeat(maxSemanticParserRequestJsonBytes + 1),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "request_too_large" },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveText);
  });
});

describe("semantic extraction response validation boundary", () => {
  it("accepts valid responses with explicit nulls and empty collections", () => {
    expect(validateSemanticExtractionResponse(response())).toMatchObject({
      ok: true,
    });
  });

  it("rejects unknown response fields and provider-native objects", () => {
    expect(
      validateSemanticExtractionResponse({
        ...response(),
        providerResponse: { model: "native-object" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "schema_violation" },
    });
  });

  it("rejects unsupported response schema versions", () => {
    expect(
      validateSemanticExtractionResponse({
        ...response(),
        schemaVersion: "nuvitae.semantic-extraction.v0",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "unsupported_contract_version" },
    });
  });

  it("rejects omitted required nullable properties", () => {
    const candidate = response();
    const contact: Partial<typeof candidate.sections.contact> = {
      ...candidate.sections.contact,
    };
    delete contact.phone;

    expect(
      validateSemanticExtractionResponse({
        ...candidate,
        sections: { ...candidate.sections, contact },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "schema_violation" },
    });
  });

  it("accepts explicit null scalar fields", () => {
    const result = validateSemanticExtractionResponse({
      ...response(),
      sections: {
        ...response().sections,
        headline: null,
        summary: null,
      },
    });

    expect(result.ok).toBe(true);
  });

  it("accepts empty arrays for absent collections and rejects null collections", () => {
    expect(
      validateSemanticExtractionResponse({
        ...response(),
        sections: { ...response().sections, skills: [] },
      }),
    ).toMatchObject({ ok: true });

    expect(
      validateSemanticExtractionResponse({
        ...response(),
        sections: { ...response().sections, skills: null },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "schema_violation" },
    });
  });

  it("rejects physical coordinate prediction in model output", () => {
    expect(
      validateSemanticExtractionResponse({
        ...response(),
        sections: {
          ...response().sections,
          contact: {
            ...response().sections.contact,
            fullName: {
              ...semanticValue,
              evidence: [{ ...evidence, page: 1, item: 3 }],
            },
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "schema_violation",
        validationIssues: [{ code: "physical_provenance_rejected" }],
      },
    });
  });

  it("rejects malformed flattened evidence", () => {
    expect(
      validateSemanticExtractionResponse({
        ...response(),
        sections: {
          ...response().sections,
          contact: {
            ...response().sections.contact,
            fullName: {
              ...semanticValue,
              evidence: [{ ...evidence, end: 0 }],
            },
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "malformed_flattened_evidence" },
    });
  });

  it("rejects oversized responses", () => {
    expect(
      validateSemanticExtractionResponse({
        ...response(),
        sections: {
          ...response().sections,
          summary: {
            ...semanticValue,
            value: "x".repeat(maxSemanticExtractionResponseJsonBytes + 1),
          },
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "response_too_large" },
    });
  });

  it("serializes only privacy-safe error categories and paths", () => {
    const result = validateSemanticExtractionResponse({
      ...response(),
      rawProviderPayload: {
        token: "provider-token",
        text: sensitiveText,
        stderr: "provider stderr",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const serialized = serializeSemanticProviderError(result.error);
      const serializedJson = JSON.stringify(serialized);

      expect(serializedJson).toContain("schema_violation");
      expect(serializedJson).not.toContain("provider-token");
      expect(serializedJson).not.toContain(sensitiveText);
      expect(serializedJson).not.toContain("provider stderr");
    }
  });
});
