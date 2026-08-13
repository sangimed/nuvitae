import { describe, expect, it } from "vitest";

import { nuvitaeSemanticExtractionV2EnvelopeSchema } from "@nuvitae/contracts";

import { canonicalizeSemanticExtractionV2 } from "./semantic-extraction-v2-canonicalizer.js";
import { createSourceRegistry } from "./source-registry.js";

const contactSource = "Alex Martin | alex.martin@example.test | Lyon";
const sourceRegistry = createSourceRegistry([
  { order: 0, line: 1, text: contactSource },
  { order: 1, line: 2, text: "Platform Engineer" },
  { order: 2, line: 3, text: "https://example.test/alex" },
]);

function atom(fragmentId: number, value: string) {
  return {
    value,
    sourceRefs: [{ fragmentId: `fragment-${fragmentId}`, quote: value }],
  };
}

function validContact() {
  return {
    fullName: atom(1, "Alex Martin"),
    email: atom(1, "alex.martin@example.test"),
    phone: null,
    location: atom(1, "Lyon"),
    website: null,
  };
}

function envelope(contact: Record<string, unknown> = validContact()) {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2" as const,
    sections: {
      contact,
      headline: atom(2, "Platform Engineer"),
      summary: null,
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      projects: [],
      certifications: [],
      professionalLinks: [atom(3, "https://example.test/alex")],
    },
    relationships: [],
    ambiguities: [],
    conflicts: [],
  };
}

const contactWrapperFixtures = {
  valid: () => envelope(),
  unknownKey: () => envelope({ ...validContact(), address: atom(1, "Lyon") }),
  misplacedHeadline: () =>
    envelope({ ...validContact(), headline: atom(2, "Platform Engineer") }),
  alias: () =>
    envelope({ ...validContact(), full_name: atom(1, "Alex Martin") }),
} as const;

function canonical(response: unknown) {
  return canonicalizeSemanticExtractionV2({
    response,
    sourceRegistry,
    importId: "anonymous-contact-contract",
  });
}

describe("semantic-extraction.v2 contact wrapper contract", () => {
  it("accepts the valid five-key contact fixture", () => {
    const response = contactWrapperFixtures.valid();

    expect(
      nuvitaeSemanticExtractionV2EnvelopeSchema.safeParse(response).success,
    ).toBe(true);
    expect(canonical(response)).toMatchObject({ ok: true });
  });

  it.each([
    ["unknown key", contactWrapperFixtures.unknownKey],
    ["misplaced headline", contactWrapperFixtures.misplacedHeadline],
    ["unsupported full-name alias", contactWrapperFixtures.alias],
  ] as const)("rejects %s at the envelope boundary", (_name, make) => {
    const result = canonical(make());

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid_top_level_envelope",
      failureCategory: "invalid_section_shape",
      rejected: [],
    });
  });

  it("accepts headline and professional links only in their own sections", () => {
    const result = canonical(contactWrapperFixtures.valid());

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "headline" }),
        expect.objectContaining({ fieldPath: "professionalLinks.0" }),
      ]),
    );
  });

  it("keeps valid siblings only when the envelope itself is valid", () => {
    const valid = canonical(contactWrapperFixtures.valid());
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "contact.fullName" }),
        expect.objectContaining({ fieldPath: "headline" }),
      ]),
    );

    const invalid = canonical(contactWrapperFixtures.unknownKey());
    expect(invalid).toMatchObject({ ok: false, rejected: [] });
  });
});
