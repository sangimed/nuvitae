import { describe, expect, it } from "vitest";

import { canonicalizeSemanticExtractionV2 } from "./semantic-extraction-v2-canonicalizer.js";
import {
  evaluateSemanticV2Completeness,
  inventorySemanticV2SourceSections,
} from "./semantic-v2-source-section-inventory.js";
import { createSourceRegistry } from "./source-registry.js";
import { mapSemanticV2CandidatesToDraft } from "./semantic-v2-candidates-to-draft.js";

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
const request = { sourceFragments } as const;
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

  it("keeps an invented Summary rejected by grounding when Summary is not expected", () => {
    const value = response();
    const result = canonical({
      ...value,
      sections: {
        ...value.sections,
        summary: {
          value: "Invented profile",
          sourceRefs: [{ fragmentId: "fragment-2", quote: "Invented profile" }],
        },
      },
    });
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["sections", "summary"],
          code: "quote_not_found_in_fragment",
        }),
      ]),
    );
  });

  it("marks expected Education omitted, but accepts grounded Education", () => {
    const inventory = inventorySemanticV2SourceSections(request);
    const full = response();
    const compactSections: Record<string, unknown> = { ...full.sections };
    delete compactSections.education;
    const compact = canonical({ ...full, sections: compactSections });
    expect(
      evaluateSemanticV2Completeness({
        sourceInventory: inventory,
        canonical: compact,
      }),
    ).toContainEqual({
      kind: "expected_section_omitted",
      section: "education",
    });
    const accepted = canonical(
      response([
        {
          institution: atom("Example University"),
          degree: atom("Master of Engineering"),
          fieldOfStudy: null,
          startDate: null,
          endDate: null,
          location: null,
        },
      ]),
    );
    expect(accepted.candidates.map((candidate) => candidate.fieldPath)).toEqual(
      expect.arrayContaining(["education.0.institution", "education.0.degree"]),
    );
    expect(
      evaluateSemanticV2Completeness({
        sourceInventory: inventory,
        canonical: accepted,
      }),
    ).not.toContainEqual({
      kind: "expected_section_omitted",
      section: "education",
    });
  });

  it.each([
    [
      "Education content stops at Skills",
      ["EDUCATION", "Example University", "SKILLS", "TypeScript"],
      { education: true },
    ],
    [
      "Education heading has no content before Skills",
      ["EDUCATION", "SKILLS", "TypeScript"],
      { education: false },
    ],
    [
      "Summary heading has no content before Work Experience",
      ["SUMMARY", "WORK EXPERIENCE", "Example Corp"],
      { summary: false, workExperience: true },
    ],
    [
      "Profile content stops at Experience",
      ["PROFILE", "Experienced engineer", "EXPERIENCE", "Example Corp"],
      { summary: true, workExperience: true },
    ],
    [
      "French Education content stops at Competences",
      ["FORMATION", "Université Exemple", "COMPÉTENCES", "TypeScript"],
      { education: true },
    ],
    [
      "French Education heading has no content before Competences",
      ["FORMATION", "COMPÉTENCES", "TypeScript"],
      { education: false },
    ],
  ] as const)(
    "recognizes bounded section content: %s",
    (_label, source, expected) => {
      const inventory = inventorySemanticV2SourceSections({
        sourceFragments: source.map((text, order) => ({
          order,
          line: order + 1,
          text,
        })),
      });
      expect(inventory).toMatchObject(expected);
    },
  );

  it("accepts an institution-only Education entry with nullable optional members", () => {
    const accepted = canonical(
      response([
        {
          institution: atom("Example University"),
          degree: null,
          fieldOfStudy: null,
          startDate: null,
          endDate: null,
          location: null,
        },
      ]),
    );

    expect(accepted.rejected).toEqual([]);
    expect(accepted.candidates).toEqual([
      expect.objectContaining({
        fieldPath: "education.0.institution",
        value: "Example University",
      }),
    ]);
  });

  it("does not require Education when its source heading and entries are absent", () => {
    expect(
      inventorySemanticV2SourceSections({
        sourceFragments: [{ order: 0, line: 1, text: "Skills" }],
      }).education,
    ).toBe(false);
  });

  it("distinguishes a rejected expected Education section from an omission", () => {
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

  it("keeps expected-section diagnostics privacy-safe", () => {
    const diagnostics = evaluateSemanticV2Completeness({
      sourceInventory: inventorySemanticV2SourceSections(request),
      canonical: canonical(response()),
    });
    expect(JSON.stringify(diagnostics)).not.toContain("Example University");
    expect(JSON.stringify(diagnostics)).not.toContain("Master of Engineering");
  });

  it("maps an expected Education omission to a persisted privacy-safe warning", () => {
    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: [],
      rejected: [],
      signals: [],
      completenessDiagnostics: [
        { kind: "expected_section_omitted", section: "education" },
      ],
      document: { id: "synthetic" } as never,
    });
    expect(mapped.warnings).toContainEqual({
      warningType: "missing",
      section: "education",
      fieldPath: "education",
      message:
        "A source-supported resume section was omitted and needs review.",
      requiresResolution: true,
    });
  });
});
