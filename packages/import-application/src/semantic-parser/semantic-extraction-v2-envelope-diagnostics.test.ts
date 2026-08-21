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
    response.relationships = null as never;

    const result = diagnostic(response);

    expect(result).toMatchObject({
      semanticJsonParseSucceeded: true,
      canonicalizerReached: true,
      failureStage: "v2_envelope",
      failureLevel: "whole_envelope_unusable",
      failureCategory: "unexpected_root_field",
      topLevelValueCategory: "object",
      schemaVersionCategory: "exact_v2",
      missingTopLevelKeys: [],
      unexpectedTopLevelKeys: ["response"],
      unrecognizedTopLevelKeyPresent: true,
      sectionsValueCategory: "object",
      relationshipsValueCategory: "null",
      ambiguitiesValueCategory: "array",
      conflictsValueCategory: "array",
      firstZodPath: ["relationships"],
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

  it.each([
    ["address", "known_alias_wrong_location"],
    ["headline", "misplaced_existing_semantic_field"],
    ["providerContactFlag", "unknown_contact_key"],
  ] as const)(
    "classifies an unrecognized contact key as %s without exposing the key",
    (key, category) => {
      const response = validEnvelope();
      response.sections.contact = {
        ...response.sections.contact,
        [key]: null,
      };

      const result = diagnostic(response);

      expect(result).toMatchObject({
        failureCategory: "invalid_section_shape",
        firstZodIssueCode: "unrecognized_keys",
        firstZodPath: ["sections", "contact"],
        unrecognizedKeyCategory: category,
      });
      expect(result).not.toHaveProperty("unrecognizedKey");
      expect(result).not.toHaveProperty("unrecognizedContactKey");
      if (key !== "headline") expect(JSON.stringify(result)).not.toContain(key);
    },
  );

  it.each([
    [
      "response_size_limit",
      () => ({
        ...validEnvelope(),
        oversizedStructuralValue: "x".repeat(300_000),
      }),
    ],
    [
      "response_depth_limit",
      () => {
        let nested: unknown = null;
        for (let index = 0; index < 12; index += 1) nested = { nested };
        return {
          ...validEnvelope(),
          sections: { ...validEnvelope().sections, headline: nested },
        };
      },
    ],
    [
      "total_atom_limit",
      () => ({
        ...validEnvelope(),
        sections: {
          ...validEnvelope().sections,
          skills: Array.from({ length: 601 }, (_, index) => ({
            name: { value: `v${index}`, sourceRefs: [] },
          })),
        },
      }),
    ],
    [
      "total_node_limit",
      () => ({
        ...validEnvelope(),
        structuralPadding: Array.from({ length: 12_001 }, () => null),
      }),
    ],
    [
      "section_cardinality_limit",
      () => ({
        ...validEnvelope(),
        sections: {
          ...validEnvelope().sections,
          skills: Array.from({ length: 121 }, () => ({})),
        },
      }),
    ],
    [
      "relationship_cardinality_limit",
      () => ({
        ...validEnvelope(),
        relationships: Array.from({ length: 121 }, () => ({})),
      }),
    ],
    [
      "aggregate_collection_limit",
      () => ({
        ...validEnvelope(),
        ambiguities: Array.from({ length: 51 }, () => ({})),
      }),
    ],
  ] as const)("identifies %s without content", (reason, make) => {
    const result = diagnostic(make());

    expect(result.structuralReason).toBe(reason);
    expect(result.totalAtomCountBucket).toBeDefined();
    expect(result.totalNodeCountBucket).toBeDefined();
    expect(result.maxDepthObserved).toBeGreaterThanOrEqual(0);
    expect(result.skillsCountBucket).toBeDefined();
    expect(result.configuredLimits).toEqual({
      responseJsonBytes: 256_000,
      objectDepth: 10,
      totalAtoms: 600,
      totalNodes: 12_000,
    });
    expect(JSON.stringify(result)).not.toContain("oversizedStructuralValue");
  });
});
