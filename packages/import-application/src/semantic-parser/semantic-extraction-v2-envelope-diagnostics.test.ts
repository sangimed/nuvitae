import { describe, expect, it } from "vitest";

import {
  diagnoseSemanticExtractionV2Envelope,
  type SemanticExtractionV2EnvelopeDiagnostic,
} from "./semantic-extraction-v2-envelope-diagnostics.js";

function validEnvelope() {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2",
    sections: {
      contact: {
        fullName: null,
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
    ambiguities: [],
    conflicts: [],
  };
}

function diagnostic(
  response: unknown,
  semanticJsonParseSucceeded = true,
): SemanticExtractionV2EnvelopeDiagnostic {
  return diagnoseSemanticExtractionV2Envelope({
    response,
    semanticJsonParseSucceeded,
    canonicalizerReached: semanticJsonParseSucceeded,
    failureStage: semanticJsonParseSucceeded
      ? "v2_envelope"
      : "semantic_json_parse",
  });
}

describe("semantic-extraction.v2 envelope diagnostics", () => {
  it("projects only structural allowlisted metadata for a malformed object", () => {
    const response = {
      ...validEnvelope(),
      secretValue: "PRIVATE-RESUME-VALUE",
      response: { prompt: "PRIVATE-PROMPT" },
    };
    delete (response as { conflicts?: unknown }).conflicts;

    const result = diagnostic(response);

    expect(result).toMatchObject({
      semanticJsonParseSucceeded: true,
      canonicalizerReached: true,
      failureStage: "v2_envelope",
      topLevelValueCategory: "object",
      schemaVersionCategory: "exact_v2",
      missingTopLevelKeys: ["conflicts"],
      unexpectedTopLevelKeys: ["response"],
      unrecognizedTopLevelKeyPresent: true,
      sectionsValueCategory: "object",
      relationshipsValueCategory: "array",
      ambiguitiesValueCategory: "array",
      conflictsValueCategory: "missing",
      firstZodPath: ["conflicts"],
      issueCountBucket: "0-4",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE-RESUME-VALUE");
    expect(JSON.stringify(result)).not.toContain("PRIVATE-PROMPT");
  });

  it("distinguishes parse failure from a parsed non-object", () => {
    expect(diagnostic(undefined, false)).toMatchObject({
      semanticJsonParseSucceeded: false,
      canonicalizerReached: false,
      failureStage: "semantic_json_parse",
      topLevelValueCategory: "unparseable",
      schemaVersionCategory: "not_observed",
      sectionsValueCategory: "not_observed",
      firstZodPath: [],
      issueCountBucket: "0-4",
    });

    expect(diagnostic([])).toMatchObject({
      semanticJsonParseSucceeded: true,
      canonicalizerReached: true,
      topLevelValueCategory: "array",
      schemaVersionCategory: "not_observed",
      sectionsValueCategory: "not_observed",
      firstZodPath: [],
    });

    expect(diagnostic({ response: validEnvelope() })).toMatchObject({
      topLevelValueCategory: "object",
      topLevelKeys: [],
      missingTopLevelKeys: [
        "schemaVersion",
        "sections",
        "relationships",
        "ambiguities",
        "conflicts",
      ],
      unexpectedTopLevelKeys: ["response"],
      unrecognizedTopLevelKeyPresent: false,
    });
  });

  it("reports exact schema version and allowlisted Zod paths", () => {
    const response = validEnvelope();
    response.schemaVersion = "nuvitae.semantic-extraction.v1";
    response.sections = {
      ...response.sections,
      skills: null as never,
    };

    const result = diagnostic(response);

    expect(result.schemaVersionCategory).toBe("other_string");
    expect(result.firstZodIssueCode).toBeDefined();
    expect(result.firstZodPath).toEqual(["schemaVersion"]);
    expect(result.issueCountBucket).toBe("0-4");
  });
});
