import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  nuvitaeSemanticExtractionResponseVersion,
  resumeSemanticParserContractVersion,
} from "@nuvitae/contracts";
import { validateSemanticResponse } from "../validation/semantic-validation.js";
import {
  inspectFlattenedEvidence,
  validateSemanticExtractionResponse,
} from "./validate-semantic-response.js";

const source = "Ada Lovelace";
const hash = createHash("sha256").update(source).digest("hex");
const evidence = {
  line: 1,
  start: 0,
  end: source.length,
  fragmentHash: hash,
  fragmentId: "fragment-1",
};

const value = (text = source) => ({
  value: text,
  normalizedValue: null,
  evidence: [evidence],
  classification: "explicit" as const,
  confidence: "high" as const,
});

function response() {
  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english" as const,
      confidence: "high" as const,
      evidence: [],
    },
    sections: {
      contact: {
        fullName: value(),
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

function request() {
  return {
    contractVersion: resumeSemanticParserContractVersion,
    importId: "import-1",
    correlationId: null,
    documentFormat: "plain_text" as const,
    languageContext: {
      detectedLanguage: "english" as const,
      confidence: "high" as const,
      textDirection: "ltr" as const,
    },
    normalizedTranscript: {
      text: source,
      sha256: hash,
      lineCount: 1,
    },
    sourceFragments: [
      {
        order: 0,
        line: 1,
        text: source,
        hash,
        bounds: { lineStart: 1, lineEnd: 1, start: 0, end: source.length },
      },
    ],
    fragmentHashes: [hash],
    formatMetadata: {
      sourceFormat: "plain_text" as const,
      extractionMode: "plain_text" as const,
      renderedPageCount: null,
      parserVersion: "test",
    },
  };
}

function issueCodes(candidate: unknown): readonly string[] {
  const result = validateSemanticExtractionResponse(candidate);
  if (result.ok) return [];
  return result.error.validationIssues.map((issue) => issue.code);
}

describe("canonical flattened-evidence contract", () => {
  it("A: accepts a valid flattened evidence response", () => {
    expect(validateSemanticExtractionResponse(response()).ok).toBe(true);
  });

  it("B: rejects a nested evidence object with structural categories", () => {
    const candidate = response();
    candidate.sections.contact.fullName = {
      ...value(),
      evidence: { reference: evidence },
    } as never;
    expect(issueCodes(candidate)).toEqual(
      expect.arrayContaining(["evidence_wrong_type", "evidence_shape_nested"]),
    );
  });

  it("C: rejects an evidence string", () => {
    const candidate = response();
    candidate.sections.contact.fullName = {
      ...value(),
      evidence: "fragment-1",
    } as never;
    expect(issueCodes(candidate)).toContain("evidence_wrong_type");
  });

  it("D: reports a missing fragment-id field without exposing values", () => {
    const candidate = response();
    const withoutId = { ...evidence };
    delete withoutId.fragmentId;
    candidate.sections.contact.fullName = {
      ...value(),
      evidence: [withoutId],
    } as never;
    const result = validateSemanticExtractionResponse(candidate);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "malformed_flattened_evidence" },
    });
    expect(issueCodes(candidate)).toContain("evidence_fragment_id_missing");
    expect(JSON.stringify(result)).not.toContain(source);
  });

  it("E: rejects an unknown fragment id during request-bound grounding", () => {
    const candidate = response();
    candidate.sections.contact.fullName = {
      ...value(),
      evidence: [{ ...evidence, fragmentId: "fragment-99" }],
    } as never;
    const result = validateSemanticResponse({
      request: request(),
      response: candidate,
    });
    expect(result.schemaValid).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain(
      "evidence_fragment_id_unknown",
    );
  });

  it("F: rejects an invalid range", () => {
    const candidate = response();
    candidate.sections.contact.fullName = {
      ...value(),
      evidence: [{ ...evidence, end: 0 }],
    } as never;
    expect(issueCodes(candidate)).toContain("evidence_range_invalid");
  });

  it("G: rejects evidence placed on a candidate object", () => {
    const candidate = response();
    candidate.sections.education = [
      {
        candidateId: "education-1",
        institution: null,
        degree: null,
        fieldOfStudy: null,
        startDate: null,
        endDate: null,
        location: null,
        details: [],
        evidence,
      },
    ] as never;
    expect(issueCodes(candidate)).toContain("evidence_shape_nested");
  });

  it("H: accepts multiple values when each value owns its evidence", () => {
    const candidate = response();
    candidate.sections.contact.email = value("Ada Lovelace");
    candidate.sections.professionalLinks = [value()];
    expect(validateSemanticExtractionResponse(candidate).ok).toBe(true);
  });

  it("I: accepts skills and languages with per-item evidence", () => {
    const candidate = response();
    candidate.sections.skills = [
      { candidateId: "skill-1", name: value("Ada Lovelace"), category: null },
    ];
    candidate.sections.languages = [
      {
        candidateId: "language-1",
        name: value("Ada Lovelace"),
        proficiency: null,
      },
    ];
    expect(validateSemanticExtractionResponse(candidate).ok).toBe(true);
  });

  it("J: accepts education degree, institution, and end year independently", () => {
    const candidate = response();
    candidate.sections.education = [
      {
        candidateId: "education-1",
        institution: value(),
        degree: value(),
        fieldOfStudy: null,
        startDate: null,
        endDate: value("1843"),
        location: null,
        details: [],
      },
    ];
    expect(validateSemanticExtractionResponse(candidate).ok).toBe(true);
  });

  it("K: fails closed for missing evidence and never returns a usable response", () => {
    const candidate = response();
    candidate.sections.contact.fullName = {
      value: source,
      normalizedValue: null,
      classification: "explicit",
      confidence: "high",
    } as never;
    const issues = inspectFlattenedEvidence(candidate);
    const result = validateSemanticExtractionResponse(candidate);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "evidence_missing" }),
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "malformed_flattened_evidence" },
    });
  });
});
