import { describe, expect, it } from "vitest";

import {
  nuvitaeSemanticExtractionV2ResponseSchema,
  nuvitaeSemanticExtractionV2ResponseVersion,
} from "./semantic-extraction-v2.js";

const atom = {
  value: "Alex Martin",
  sourceRefs: [{ fragmentId: "fragment-1", quote: "Alex Martin" }],
};

function response() {
  return {
    schemaVersion: nuvitaeSemanticExtractionV2ResponseVersion,
    sections: {
      contact: {
        fullName: atom,
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

describe("semantic-extraction.v2 contract", () => {
  it("accepts the minimal provider-owned atom and nullable absence", () => {
    expect(
      nuvitaeSemanticExtractionV2ResponseSchema.safeParse(response()).success,
    ).toBe(true);
  });

  it("rejects Nuvitae-owned identity, evidence, and policy fields", () => {
    expect(
      nuvitaeSemanticExtractionV2ResponseSchema.safeParse({
        ...response(),
        sections: {
          ...response().sections,
          contact: {
            ...response().sections.contact,
            fullName: {
              ...atom,
              candidateId: "provider-owned",
            },
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported historical fields instead of carrying them forward", () => {
    expect(
      nuvitaeSemanticExtractionV2ResponseSchema.safeParse({
        ...response(),
        sections: {
          ...response().sections,
          skills: [{ name: atom, category: null }],
        },
      }).success,
    ).toBe(false);
  });
});
