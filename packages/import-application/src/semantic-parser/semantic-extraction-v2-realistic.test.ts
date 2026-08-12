import { describe, expect, it } from "vitest";

import {
  canonicalizeSemanticExtractionV2,
  inspectSemanticExtractionV2Structure,
} from "./semantic-extraction-v2-canonicalizer.js";
import { createSourceRegistry } from "./source-registry.js";

type TestAtom = {
  readonly value: string;
  readonly sourceRefs: readonly [
    { readonly fragmentId: string; readonly quote: string },
  ];
};

function realisticEnvelope() {
  const sourceLines: Array<{ order: number; line: number; text: string }> = [];
  let nextFragment = 1;
  const atom = (value: string): TestAtom => {
    const fragmentId = `fragment-${nextFragment}`;
    sourceLines.push({
      order: sourceLines.length,
      line: sourceLines.length + 1,
      text: value,
    });
    nextFragment += 1;
    return { value, sourceRefs: [{ fragmentId, quote: value }] };
  };

  const workExperience = Array.from({ length: 4 }, (_, experienceIndex) => ({
    employerName: atom(`Employer ${experienceIndex + 1}`),
    employerLocation: atom(`City ${experienceIndex + 1}`),
    roles: Array.from({ length: 2 }, (_, roleIndex) => ({
      title: atom(
        `Principal Platform Engineer ${experienceIndex + 1}-${roleIndex + 1}`,
      ),
      location: atom(`Remote Region ${experienceIndex + 1}-${roleIndex + 1}`),
      startDate: atom(`${2010 + experienceIndex + roleIndex}`),
      endDate: atom(`${2012 + experienceIndex + roleIndex}`),
      responsibilities: Array.from({ length: 5 }, (_, bulletIndex) =>
        atom(
          `Responsibility ${experienceIndex + 1}-${roleIndex + 1}-${bulletIndex + 1}`,
        ),
      ),
      achievements: Array.from({ length: 5 }, (_, bulletIndex) =>
        atom(
          `Achievement ${experienceIndex + 1}-${roleIndex + 1}-${bulletIndex + 1}`,
        ),
      ),
    })),
  }));

  const education = Array.from({ length: 2 }, (_, index) => ({
    institution: atom(`Institute ${index + 1}`),
    degree: atom(`Master Degree ${index + 1}`),
    fieldOfStudy: atom(`Computer Engineering ${index + 1}`),
    startDate: atom(`${2000 + index}`),
    endDate: atom(`${2004 + index}`),
    location: atom(`Education City ${index + 1}`),
  }));

  const response = {
    schemaVersion: "nuvitae.semantic-extraction.v2" as const,
    sections: {
      contact: {
        fullName: atom("Anonymous Candidate"),
        email: atom("candidate@example.test"),
        phone: atom("+00 000 000 000"),
        location: atom("Example Region"),
        website: null,
      },
      headline: atom("Senior Platform Engineer"),
      summary: atom(
        "Platform engineer focused on reliable distributed systems",
      ),
      workExperience,
      education,
      skills: Array.from({ length: 24 }, (_, index) => ({
        name: atom(`Skill ${index + 1}`),
      })),
      languages: ["English", "French", "Spanish"].map((language, index) => ({
        name: atom(language),
        proficiency: atom(`Professional ${index + 1}`),
      })),
      projects: Array.from({ length: 3 }, (_, index) => ({
        name: atom(`Project ${index + 1}`),
        description: atom(`Project description ${index + 1}`),
      })),
      certifications: Array.from({ length: 2 }, (_, index) => ({
        name: atom(`Certification ${index + 1}`),
        issuer: atom(`Issuer ${index + 1}`),
      })),
      professionalLinks: [
        atom("https://example.test/profile/one"),
        atom("https://example.test/profile/two"),
        atom("https://example.test/profile/three"),
      ],
    },
    relationships: [],
    ambiguities: [],
    conflicts: [],
  };

  return {
    response,
    sourceRegistry: createSourceRegistry(sourceLines),
  };
}

function canonical(
  response: unknown,
  sourceRegistry = createSourceRegistry([]),
) {
  return canonicalizeSemanticExtractionV2({
    response,
    sourceRegistry,
    importId: "offline-realistic-test",
  });
}

function repeatedTextFixture() {
  const sourceLines = [
    "Northstar Systems | Paris, France",
    "Senior Backend Engineer | 2022 - Present",
    "Example University — MSc Computer Science — Software Engineering",
    "Northstar Systems | Paris, France",
    "Senior Backend Engineer | 2019 - 2021",
    "Example University",
  ];
  const sourceRegistry = createSourceRegistry(
    sourceLines.map((text, order) => ({ order, line: order + 1, text })),
  );
  const atom = (fragmentId: number, value: string) => ({
    value,
    sourceRefs: [{ fragmentId: `fragment-${fragmentId}`, quote: value }],
  });

  return {
    sourceRegistry,
    response: {
      schemaVersion: "nuvitae.semantic-extraction.v2" as const,
      sections: {
        contact: {
          fullName: null,
          email: null,
          phone: null,
          location: atom(1, "Paris, France"),
          website: null,
        },
        headline: atom(2, "Senior Backend Engineer"),
        summary: null,
        workExperience: [
          {
            employerName: atom(1, "Northstar Systems"),
            employerLocation: atom(1, "Paris, France"),
            roles: [
              {
                title: atom(2, "Senior Backend Engineer"),
                location: null,
                startDate: null,
                endDate: null,
                responsibilities: [],
                achievements: [],
              },
            ],
          },
          {
            employerName: atom(4, "Northstar Systems"),
            employerLocation: atom(4, "Paris, France"),
            roles: [
              {
                title: atom(5, "Senior Backend Engineer"),
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
            institution: atom(3, "Example University"),
            degree: atom(3, "MSc Computer Science"),
            fieldOfStudy: atom(3, "Software Engineering"),
            startDate: null,
            endDate: null,
            location: null,
          },
          {
            institution: atom(6, "Example University"),
            degree: null,
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            location: null,
          },
        ],
        skills: [],
        languages: [],
        projects: [],
        certifications: [],
        professionalLinks: [],
      },
      relationships: [],
      ambiguities: [],
      conflicts: [],
    },
  };
}

describe("semantic-extraction.v2 realistic structural limits", () => {
  it("keeps realistic repeated city, employer, role, and university text anchored", () => {
    const fixture = repeatedTextFixture();
    const result = canonical(fixture.response, fixture.sourceRegistry);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
    expect(
      result.rejected.some(
        (item) => item.code === "missing_required_group_field",
      ),
    ).toBe(false);
    expect(
      result.candidates.filter((item) =>
        item.fieldPath.startsWith("workExperience."),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "workExperience.0.employerName" }),
        expect.objectContaining({
          fieldPath: "workExperience.0.roles.0.title",
        }),
        expect.objectContaining({ fieldPath: "workExperience.1.employerName" }),
        expect.objectContaining({
          fieldPath: "workExperience.1.roles.0.title",
        }),
      ]),
    );
    expect(
      result.candidates.filter((item) =>
        item.fieldPath.startsWith("education."),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "education.0.institution" }),
        expect.objectContaining({ fieldPath: "education.0.degree" }),
        expect.objectContaining({ fieldPath: "education.0.fieldOfStudy" }),
        expect.objectContaining({ fieldPath: "education.1.institution" }),
      ]),
    );
  });

  it("accepts an anonymous senior-engineer CV substantially larger than the smoke fixture", () => {
    const fixture = realisticEnvelope();
    const result = canonical(fixture.response, fixture.sourceRegistry);

    expect(
      inspectSemanticExtractionV2Structure(fixture.response).maxDepth,
    ).toBe(10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates.length).toBeGreaterThan(100);
      expect(result.rejected).toEqual([]);
    }
  });

  it.each([
    [
      "response size",
      () => ({
        ...realisticEnvelope().response,
        oversizedStructuralValue: "x".repeat(300_000),
      }),
      "response_too_large",
    ],
    [
      "response depth",
      () => {
        let nested: unknown = null;
        for (let index = 0; index < 12; index += 1) nested = { nested };
        const fixture = realisticEnvelope().response;
        return {
          ...fixture,
          sections: { ...fixture.sections, headline: nested },
        };
      },
      "response_depth_limit",
    ],
    [
      "total atoms",
      () => {
        const fixture = realisticEnvelope().response;
        return {
          ...fixture,
          sections: {
            ...fixture.sections,
            skills: Array.from({ length: 601 }, (_, index) => ({
              name: { value: `v${index}`, sourceRefs: [] },
            })),
          },
        };
      },
      "total_atom_limit",
    ],
    [
      "total nodes",
      () => ({
        ...realisticEnvelope().response,
        structuralPadding: Array.from({ length: 12_001 }, () => null),
      }),
      "total_node_limit",
    ],
  ] as const)(
    "rejects adversarial %s before field canonicalization",
    (_name, make, reason) => {
      const result = canonical(make());
      expect(result).toMatchObject({ ok: false, reason, rejected: [] });
    },
  );
});
