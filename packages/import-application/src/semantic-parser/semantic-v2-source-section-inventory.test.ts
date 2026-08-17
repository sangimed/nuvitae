import { describe, expect, it } from "vitest";

import { canonicalizeSemanticExtractionV2 } from "./semantic-extraction-v2-canonicalizer.js";
import {
  evaluateSemanticV2Completeness,
  inventorySemanticV2SourceSections,
} from "./semantic-v2-source-section-inventory.js";
import { createSourceRegistry } from "./source-registry.js";

const sourceLines = [
  "EDUCATION",
  "Example University — Master of Engineering",
  "WORK EXPERIENCE",
  "Example Corp — Engineer",
];
const sourceFragments = sourceLines.map((text, order) => ({
  order,
  line: order + 1,
  text,
}));
const sourceRegistry = createSourceRegistry(sourceFragments);
const atom = (value: string, fragmentId = "fragment-2") => ({
  value,
  sourceRefs: [{ fragmentId, quote: value }],
});

function response(education: unknown[] = [], workExperience: unknown[] = []) {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2" as const,
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
      workExperience,
      education,
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

function canonical(value: unknown) {
  const result = canonicalizeSemanticExtractionV2({
    response: value,
    sourceRegistry,
    importId: "synthetic",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("synthetic envelope rejected");
  return result;
}

describe("Semantic V2 source-aware completeness", () => {
  it("does not require Summary without recognizable source evidence", () => {
    const inventory = inventorySemanticV2SourceSections({ sourceFragments });

    expect(inventory).toEqual({
      summary: false,
      workExperience: true,
      education: true,
    });
    expect(
      evaluateSemanticV2Completeness({
        sourceInventory: inventory,
        canonical: canonical(response()),
      }),
    ).toEqual(
      expect.arrayContaining([
        { kind: "source_section_not_expected", section: "summary" },
        { kind: "expected_section_omitted", section: "education" },
        { kind: "expected_section_omitted", section: "workExperience" },
      ]),
    );
  });

  it("passes expected Education and Work when grounded candidates exist", () => {
    const result = evaluateSemanticV2Completeness({
      sourceInventory: inventorySemanticV2SourceSections({ sourceFragments }),
      canonical: canonical(
        response(
          [
            {
              institution: atom("Example University"),
              degree: atom("Master of Engineering"),
              fieldOfStudy: null,
              startDate: null,
              endDate: null,
              location: null,
            },
          ],
          [
            {
              employerName: atom("Example Corp", "fragment-4"),
              employerLocation: null,
              roles: [
                {
                  title: atom("Engineer", "fragment-4"),
                  location: null,
                  startDate: null,
                  endDate: null,
                  responsibilities: [],
                  achievements: [],
                },
              ],
            },
          ],
        ),
      ),
    });

    expect(result).toEqual([
      { kind: "source_section_not_expected", section: "summary" },
    ]);
  });

  it("distinguishes expected omission from provider rejection", () => {
    const rejected = canonical(
      response([
        {
          institution: "not-an-atom",
          degree: null,
          fieldOfStudy: null,
          startDate: null,
          endDate: null,
          location: null,
        },
      ]),
    );

    expect(
      evaluateSemanticV2Completeness({
        sourceInventory: inventorySemanticV2SourceSections({ sourceFragments }),
        canonical: rejected,
      }),
    ).toContainEqual({
      kind: "provider_section_rejected",
      section: "education",
    });
  });

  it.each([
    ["empty Education heading", ["EDUCATION", "WORK EXPERIENCE"], false],
    [
      "French Education heading",
      ["FORMATION", "Université", "COMPÉTENCES"],
      true,
    ],
  ] as const)("bounds source sections: %s", (_label, lines, expected) => {
    expect(
      inventorySemanticV2SourceSections({
        sourceFragments: lines.map((text, order) => ({
          order,
          line: order + 1,
          text,
        })),
      }).education,
    ).toBe(expected);
  });
});
