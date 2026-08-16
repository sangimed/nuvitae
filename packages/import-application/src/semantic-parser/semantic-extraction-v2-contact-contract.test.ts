import { describe, expect, it } from "vitest";

import { nuvitaeSemanticExtractionV2EnvelopeSchema } from "@nuvitae/contracts";

import { canonicalizeSemanticExtractionV2 } from "./semantic-extraction-v2-canonicalizer.js";
import { createSourceRegistry } from "./source-registry.js";

const contactSource =
  "Alex Martin | alex.martin@example.test | +33 6 12 34 56 78 | Lyon | https://alex.example";
const sourceRegistry = createSourceRegistry([
  { order: 0, line: 1, text: contactSource },
  { order: 1, line: 2, text: "Platform Engineer — Northstar Systems — Lyon" },
  { order: 2, line: 3, text: "Summary: Builds reliable systems." },
  { order: 3, line: 4, text: "Example University — Master of Engineering" },
  { order: 4, line: 5, text: "Portfolio: https://example.test/alex" },
  { order: 5, line: 6, text: "Alex's website" },
]);

function atom(fragmentId: number, value: string) {
  return {
    value,
    sourceRefs: [{ fragmentId: `fragment-${fragmentId}`, quote: value }],
  };
}

function fullyPopulatedContact() {
  return {
    fullName: atom(1, "Alex Martin"),
    email: atom(1, "alex.martin@example.test"),
    phone: atom(1, "+33 6 12 34 56 78"),
    location: atom(1, "Lyon"),
    website: atom(1, "https://alex.example"),
  };
}

function partiallyPopulatedContact() {
  return {
    fullName: atom(1, "Alex Martin"),
    email: atom(1, "alex.martin@example.test"),
    phone: null,
    location: atom(1, "Lyon"),
    website: null,
  };
}

function envelope(
  contact: Record<string, unknown> = fullyPopulatedContact(),
  overrides: Record<string, unknown> = {},
) {
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
      professionalLinks: [atom(5, "https://example.test/alex")],
      ...overrides,
    },
    relationships: [],
    ambiguities: [],
    conflicts: [],
  };
}

const contactWrapperFixtures = {
  valid: () => envelope(),
  partial: () => envelope(partiallyPopulatedContact()),
  emailOnly: () => envelope({ email: atom(1, "alex.martin@example.test") }),
  locationOnly: () => envelope({ location: atom(1, "Lyon") }),
  absent: () => envelope({}),
  unknownKey: () =>
    envelope({ ...partiallyPopulatedContact(), address: atom(1, "Lyon") }),
  misplacedHeadline: () =>
    envelope({
      ...partiallyPopulatedContact(),
      headline: atom(2, "Platform Engineer"),
    }),
  alias: () =>
    envelope({
      ...partiallyPopulatedContact(),
      full_name: atom(1, "Alex Martin"),
    }),
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

  it("preserves a partially populated contact with explicit nullable absence", () => {
    const result = canonical(contactWrapperFixtures.partial());

    expect(result).toMatchObject({ ok: true, rejected: [] });
    if (!result.ok) return;
    expect(result.candidates.map((candidate) => candidate.fieldPath)).toEqual(
      expect.arrayContaining([
        "contact.fullName",
        "contact.email",
        "contact.location",
      ]),
    );
    expect(
      result.candidates.some(
        (candidate) => candidate.fieldPath === "contact.phone",
      ),
    ).toBe(false);
  });

  it.each([
    ["email-only source", contactWrapperFixtures.emailOnly, "contact.email"],
    [
      "location-only source",
      contactWrapperFixtures.locationOnly,
      "contact.location",
    ],
    ["absent nullable values", contactWrapperFixtures.absent, undefined],
  ] as const)(
    "restores compact contact absence for %s",
    (_name, make, expectedPath) => {
      const result = canonical(make());

      expect(result).toMatchObject({ ok: true, rejected: [] });
      if (!result.ok) return;
      expect(result.candidates.map((candidate) => candidate.fieldPath)).toEqual(
        expectedPath === undefined
          ? expect.not.arrayContaining(["contact.email"])
          : expect.arrayContaining([expectedPath]),
      );
    },
  );

  it("keeps sourceRefs and reconstructed evidence for every accepted contact value", () => {
    const result = canonical(contactWrapperFixtures.valid());

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(
      result.candidates
        .filter((candidate) => candidate.fieldPath.startsWith("contact."))
        .map((candidate) => candidate.evidence),
    ).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ fragmentId: "fragment-1", line: 1 }),
        ]),
      ]),
    );
    expect(
      result.candidates.every((candidate) => candidate.evidence.length > 0),
    ).toBe(true);
  });

  it("rejects invented or unsupported contact atoms without moving them elsewhere", () => {
    const result = canonical(
      envelope({
        ...partiallyPopulatedContact(),
        phone: atom(1, "+1 555 010 9999"),
        website: atom(6, "Alex's website"),
      }),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["sections", "contact", "phone"],
          code: "quote_not_found_in_fragment",
        }),
        expect.objectContaining({
          path: ["sections", "contact", "website"],
          code: "unsupported_typed_value",
        }),
      ]),
    );
    expect(
      result.candidates.some((candidate) => candidate.value.includes("9999")),
    ).toBe(false);
    expect(
      result.candidates.some((candidate) =>
        candidate.value.includes("website"),
      ),
    ).toBe(false);
  });

  it("keeps Summary, Work, and Education in their own sections", () => {
    const result = canonical(
      envelope(fullyPopulatedContact(), {
        summary: atom(3, "Builds reliable systems."),
        workExperience: [
          {
            employerName: atom(2, "Northstar Systems"),
            employerLocation: atom(2, "Lyon"),
            roles: [
              {
                title: atom(2, "Platform Engineer"),
                location: null,
                startDate: null,
                endDate: null,
                responsibilities: [],
                achievements: [],
              },
            ],
          },
        ],
        education: [
          {
            institution: atom(4, "Example University"),
            degree: atom(4, "Master of Engineering"),
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            location: null,
          },
        ],
      }),
    );

    expect(result).toMatchObject({ ok: true, rejected: [] });
    if (!result.ok) return;
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "contact.email" }),
        expect.objectContaining({ fieldPath: "summary" }),
        expect.objectContaining({ fieldPath: "workExperience.0.employerName" }),
        expect.objectContaining({ fieldPath: "education.0.institution" }),
        expect.objectContaining({ fieldPath: "professionalLinks.0" }),
      ]),
    );
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

  it.each([
    [
      "missing contact wrapper",
      () => {
        const value = envelope();
        delete value.sections.contact;
        return value;
      },
    ],
    ["null contact wrapper", () => envelope(null as never)],
    ["array contact wrapper", () => envelope([] as never)],
  ] as const)(
    "rejects %s as an incompatible required contact structure",
    (_name, make) => {
      expect(canonical(make())).toMatchObject({
        ok: false,
        reason: "invalid_top_level_envelope",
        failureCategory: "invalid_section_shape",
        rejected: [],
      });
    },
  );

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
