import { describe, expect, it } from "vitest";

import {
  canonicalizeSemanticExtractionV2,
  type V2CanonicalizationResult,
} from "./semantic-extraction-v2-canonicalizer.js";
import { createSourceRegistry } from "./source-registry.js";

const fixtureLines = [
  "ALEX MARTIN",
  "Backend Engineer",
  "Name: Alex Martin",
  "Email: alex.martin@example.test",
  "Phone: +33 6 12 34 56 78",
  "Location: Lyon, France",
  "Title: Backend Engineer",
  "Education:",
  "Master of Software Engineering - Example University - 2022",
  "Skills:",
  "TypeScript, NestJS, PostgreSQL, Docker",
  "Languages:",
  "French, English",
  "Links:",
  "https://example.test/alex-martin",
];

const registry = createSourceRegistry(
  fixtureLines.map((text, order) => ({
    order,
    line: order + 1,
    text,
  })),
);

function atom(fragmentId: number, value: string, quote = value) {
  return {
    value,
    sourceRefs: [{ fragmentId: `fragment-${fragmentId}`, quote }],
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2",
    sections: {
      contact: {
        fullName: atom(3, "Alex Martin"),
        email: atom(4, "alex.martin@example.test"),
        phone: atom(5, "+33 6 12 34 56 78"),
        location: atom(6, "Lyon, France"),
        website: null,
      },
      headline: atom(2, "Backend Engineer"),
      summary: null,
      workExperience: [],
      education: [
        {
          institution: atom(9, "Example University"),
          degree: atom(9, "Master of Software Engineering"),
          fieldOfStudy: null,
          startDate: null,
          endDate: atom(9, "2022"),
          location: null,
        },
      ],
      skills: ["TypeScript", "NestJS", "PostgreSQL", "Docker"].map((value) => ({
        name: atom(11, value),
      })),
      languages: ["French", "English"].map((value) => ({
        name: atom(13, value),
        proficiency: null,
      })),
      projects: [],
      certifications: [],
      professionalLinks: [atom(15, "https://example.test/alex-martin")],
    },
    relationships: [],
    ambiguities: [],
    conflicts: [],
    ...overrides,
  };
}

function canonical(
  responseValue = response(),
): Extract<V2CanonicalizationResult, { ok: true }> {
  const result = canonicalizeSemanticExtractionV2({
    response: responseValue,
    sourceRegistry: registry,
    importId: "import-1",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`whole response rejected: ${result.reason}`);
  return result;
}

describe("semantic-extraction.v2 canonicalization", () => {
  it("accepts the anonymous selectable-resume semantics offline", () => {
    const result = canonical();
    const values = result.candidates.map((candidate) => candidate.value);

    expect(values).toEqual(
      expect.arrayContaining([
        "Alex Martin",
        "alex.martin@example.test",
        "+33 6 12 34 56 78",
        "Lyon, France",
        "Backend Engineer",
        "Master of Software Engineering",
        "Example University",
        "2022",
        "TypeScript",
        "NestJS",
        "PostgreSQL",
        "Docker",
        "French",
        "English",
        "https://example.test/alex-martin",
      ]),
    );
    expect(result.candidates).toHaveLength(15);
    expect(new Set(result.candidates.map((item) => item.fieldId)).size).toBe(
      15,
    );
    expect(
      new Set(result.candidates.map((item) => item.candidateId)).size,
    ).toBe(new Set(result.candidates.map((item) => item.groupPath)).size);
    expect(
      result.candidates.every(
        (item) => item.sourceStatus === "explicit_source",
      ),
    ).toBe(true);
  });

  it("reconstructs evidence and policy from the registry, not the provider", () => {
    const result = canonical();
    const email = result.candidates.find((item) =>
      item.fieldPath.endsWith("email"),
    );
    expect(email?.evidence[0]).toMatchObject({
      fragmentId: "fragment-4",
      line: 4,
      start: 7,
      end: 31,
    });
    expect(email?.evidence[0]?.fragmentHash).toBe(
      registry.get("fragment-4")?.hash,
    );
    expect(email?.confidence).toBe("high");
    expect(email?.normalizedValue).toBe("alex.martin@example.test");
  });

  it("ignores provider-owned atom metadata before strict grounding", () => {
    const value = response();
    const result = canonical({
      ...value,
      sections: {
        ...value.sections,
        headline: {
          ...atom(2, "Backend Engineer"),
          candidateId: "provider-owned-id",
          semanticCompleteness: "complete",
        },
      },
    });

    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        fieldPath: "headline",
        value: "Backend Engineer",
        sourceStatus: "explicit_source",
      }),
    );
    expect(result.rejected).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["sections", "headline"] }),
      ]),
    );
  });

  it("expands compact deterministic absence markers without changing semantics", () => {
    const full = canonical();
    const compact = structuredClone(response()) as {
      sections: {
        contact: Record<string, unknown>;
        education: Array<Record<string, unknown>>;
        languages: Array<Record<string, unknown>>;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };

    delete compact.sections.contact.website;
    delete compact.sections.summary;
    delete compact.sections.workExperience;
    delete compact.sections.projects;
    delete compact.sections.certifications;
    const education = compact.sections.education[0];
    if (education !== undefined) {
      delete education.fieldOfStudy;
      delete education.location;
    }
    const language = compact.sections.languages[0];
    if (language !== undefined) delete language.proficiency;
    delete compact.relationships;
    delete compact.ambiguities;
    delete compact.conflicts;

    const compactResult = canonical(compact);
    expect(compactResult).toEqual(full);
    expect(JSON.stringify(compact).length).toBeLessThan(
      JSON.stringify(response()).length,
    );
  });

  it("accepts a grounded institution-only education entry with null optionals", () => {
    const result = canonical(
      response({
        sections: {
          ...response().sections,
          education: [
            {
              institution: atom(9, "Example University"),
              degree: null,
              fieldOfStudy: null,
              startDate: null,
              endDate: null,
              location: null,
            },
          ],
        },
      }),
    );

    expect(result.rejected).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["sections", "education", 0],
          code: "missing_required_group_field",
        }),
      ]),
    );
    expect(
      result.candidates.filter((item) => item.groupPath === "education.0"),
    ).toEqual([
      expect.objectContaining({
        fieldPath: "education.0.institution",
        value: "Example University",
        sourceStatus: "explicit_source",
        evidence: [expect.objectContaining({ quote: "Example University" })],
      }),
    ]);
  });

  it("partially accepts independent fields when headline grounding is corrupt", () => {
    const corrupted = response({
      sections: {
        ...response().sections,
        headline: atom(2, "Backend Engineer", "not in this fragment"),
      },
    });
    const result = canonical(corrupted);
    expect(
      result.candidates.some((item) => item.fieldPath === "headline"),
    ).toBe(false);
    expect(
      result.candidates.some((item) => item.fieldPath.endsWith("email")),
    ).toBe(true);
    expect(result.candidates).toHaveLength(14);
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["sections", "headline"] }),
      ]),
    );
  });

  it.each([
    ["unknown fragment", atom(99, "Alex Martin")],
    ["wrong quote", atom(3, "Alex Martin", "Someone else")],
    ["invented value", atom(3, "Ada Lovelace")],
    ["missing sourceRefs", { value: "Alex Martin" }],
    ["malformed atom", { value: 42, sourceRefs: [] }],
  ])("rejects %s without discarding unrelated fields", (_name, invalid) => {
    const result = canonical(
      response({
        sections: {
          ...response().sections,
          headline: invalid,
        },
      }),
    );
    expect(
      result.candidates.some((item) => item.fieldPath.endsWith("email")),
    ).toBe(true);
    expect(
      result.candidates.some((item) => item.fieldPath === "headline"),
    ).toBe(false);
  });

  it("rejects repeated quotes and multiple refs instead of choosing first", () => {
    const repeatedRegistry = createSourceRegistry([
      { order: 0, line: 1, text: "TypeScript TypeScript" },
      { order: 1, line: 2, text: "Alex Martin" },
    ]);
    const repeated = canonicalizeSemanticExtractionV2({
      response: response({
        sections: {
          ...response().sections,
          headline: atom(1, "TypeScript"),
        },
      }),
      sourceRegistry: repeatedRegistry,
      importId: "import-1",
    });
    expect(repeated.ok).toBe(true);
    if (repeated.ok) {
      expect(
        repeated.candidates.some((item) => item.fieldPath === "headline"),
      ).toBe(false);
      expect(repeated.rejected).toContainEqual(
        expect.objectContaining({
          path: ["sections", "headline"],
          code: "quote_ambiguous_within_fragment",
        }),
      );
    }

    const ambiguous = canonical(
      response({
        sections: {
          ...response().sections,
          headline: {
            value: "Backend Engineer",
            sourceRefs: [
              { fragmentId: "fragment-2", quote: "Backend Engineer" },
              { fragmentId: "fragment-7", quote: "Backend Engineer" },
            ],
          },
        },
      }),
    );
    expect(
      ambiguous.candidates.some((item) => item.fieldPath === "headline"),
    ).toBe(false);
  });

  it("accepts a correctly anchored quote even when identical text exists elsewhere", () => {
    const duplicateRegistry = createSourceRegistry([
      { order: 0, line: 1, text: "Paris, France" },
      { order: 1, line: 2, text: "Senior Backend Engineer" },
      { order: 2, line: 3, text: "Northstar Systems | Paris, France" },
      { order: 3, line: 4, text: "Senior Backend Engineer | 2022 - Present" },
      {
        order: 4,
        line: 5,
        text: "Example University — MSc Computer Science — Software Engineering",
      },
      { order: 5, line: 6, text: "Example University" },
      { order: 6, line: 7, text: "Senior Backend Engineer" },
    ]);
    const duplicated = response({
      sections: {
        ...response().sections,
        contact: {
          ...response().sections.contact,
          fullName: null,
          email: null,
          phone: null,
          location: atom(1, "Paris, France"),
        },
        headline: atom(2, "Senior Backend Engineer"),
        workExperience: [
          {
            employerName: atom(3, "Northstar Systems"),
            employerLocation: atom(3, "Paris, France"),
            roles: [
              {
                title: atom(4, "Senior Backend Engineer"),
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
            institution: atom(5, "Example University"),
            degree: atom(5, "MSc Computer Science"),
            fieldOfStudy: atom(5, "Software Engineering"),
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
    });
    const result = canonicalizeSemanticExtractionV2({
      response: duplicated,
      sourceRegistry: duplicateRegistry,
      importId: "import-duplicates",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
    expect(result.candidates.map((item) => item.fieldPath)).toEqual(
      expect.arrayContaining([
        "contact.location",
        "headline",
        "workExperience.0.employerName",
        "workExperience.0.employerLocation",
        "workExperience.0.roles.0.title",
        "education.0.institution",
        "education.0.degree",
        "education.0.fieldOfStudy",
      ]),
    );
  });

  it.each([
    [
      "unknown fragment",
      {
        value: "Backend Engineer",
        sourceRefs: [{ fragmentId: "fragment-99", quote: "Backend Engineer" }],
      },
      "source_fragment_not_found",
    ],
    [
      "quote missing from referenced fragment",
      {
        value: "Backend Engineer",
        sourceRefs: [{ fragmentId: "fragment-3", quote: "Backend Engineer" }],
      },
      "quote_not_found_in_fragment",
    ],
    [
      "malformed source reference",
      {
        value: "Backend Engineer",
        sourceRefs: [{ fragmentId: null, quote: "Backend Engineer" }],
      },
      "malformed_source_ref",
    ],
  ] as const)(
    "rejects %s with a fragment-scoped reason",
    (_name, invalid, code) => {
      const result = canonical(
        response({
          sections: {
            ...response().sections,
            headline: invalid,
          },
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.rejected).toContainEqual(
        expect.objectContaining({ path: ["sections", "headline"], code }),
      );
    },
  );

  it("accepts duplicate summary phrases when each sourceRef anchors its own fragment", () => {
    const summaryRegistry = createSourceRegistry([
      {
        order: 0,
        line: 1,
        text: "Reliable platform delivery.",
        continuationToNext: "space",
      },
      { order: 1, line: 2, text: "Reliable platform delivery." },
    ]);
    const result = canonicalizeSemanticExtractionV2({
      response: response({
        sections: {
          ...response().sections,
          contact: {
            fullName: null,
            email: null,
            phone: null,
            location: null,
            website: null,
          },
          headline: null,
          summary: {
            value: "Reliable platform delivery. Reliable platform delivery.",
            sourceRefs: [
              {
                fragmentId: "fragment-1",
                quote: "Reliable platform delivery.",
              },
              {
                fragmentId: "fragment-2",
                quote: "Reliable platform delivery.",
              },
            ],
          },
          workExperience: [],
          education: [],
          skills: [],
          languages: [],
          projects: [],
          certifications: [],
          professionalLinks: [],
        },
      }),
      sourceRegistry: summaryRegistry,
      importId: "import-duplicate-summary",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([]);
    expect(
      result.candidates.find((item) => item.fieldPath === "summary"),
    ).toMatchObject({
      value: "Reliable platform delivery. Reliable platform delivery.",
      evidence: [{ fragmentId: "fragment-1" }, { fragmentId: "fragment-2" }],
    });
  });

  it("keeps valid array siblings when one item is malformed", () => {
    const result = canonical(
      response({
        sections: {
          ...response().sections,
          skills: [
            { name: atom(11, "TypeScript") },
            { name: { value: "Invented", sourceRefs: [] } },
            { name: atom(11, "NestJS") },
          ],
        },
      }),
    );
    expect(result.candidates.map((item) => item.value)).toEqual(
      expect.arrayContaining(["TypeScript", "NestJS"]),
    );
    expect(result.candidates.some((item) => item.value === "Invented")).toBe(
      false,
    );
  });

  it("requires meaningful grouped anchors but preserves valid optional children", () => {
    const result = canonical(
      response({
        sections: {
          ...response().sections,
          education: [
            {
              institution: atom(9, "Example University"),
              degree: { value: "bad", sourceRefs: [] },
              fieldOfStudy: null,
              startDate: null,
              endDate: atom(9, "2022"),
              location: null,
            },
            {
              institution: { value: "bad", sourceRefs: [] },
              degree: atom(9, "Master of Software Engineering"),
              fieldOfStudy: null,
              startDate: null,
              endDate: null,
              location: null,
            },
          ],
        },
      }),
    );
    expect(
      result.candidates
        .filter((item) => item.groupPath === "education.0")
        .map((item) => item.value),
    ).toEqual(["Example University", "2022"]);
    expect(
      result.candidates.some((item) => item.groupPath === "education.1"),
    ).toBe(false);
  });

  it("rejects malformed top-level envelopes as whole-response failures", () => {
    const malformed = response();
    delete (malformed as { sections?: unknown }).sections;
    const result = canonicalizeSemanticExtractionV2({
      response: malformed,
      sourceRegistry: registry,
      importId: "import-1",
    });
    expect(result).toEqual({
      ok: false,
      reason: "invalid_top_level_envelope",
      failureCategory: "missing_required_root_field",
      rejected: [],
    });
  });

  it("keeps candidate identity deterministic and provider-independent", () => {
    const first = canonical();
    const second = canonical(response());
    expect(first.candidates.map((item) => item.candidateId)).toEqual(
      second.candidates.map((item) => item.candidateId),
    );
    expect(
      first.candidates.every((item) => !item.candidateId.includes("Alex")),
    ).toBe(true);
  });

  it("reconstructs a complete summary from ordered supporting fragments", () => {
    const summaryRegistry = createSourceRegistry([
      {
        order: 0,
        line: 1,
        text: "I build dependable platform systems.",
        continuationToNext: "space",
      },
      {
        order: 1,
        line: 2,
        text: "I lead teams through complex migrations with measurable results.",
        continuationToNext: "space",
      },
      {
        order: 2,
        line: 3,
        text: "I care about accessibility, reliability, and clear ownership.",
      },
    ]);
    const summary =
      "I build dependable platform systems. I lead teams through complex migrations with measurable results. I care about accessibility, reliability, and clear ownership.";
    const result = canonicalizeSemanticExtractionV2({
      response: response({
        sections: {
          ...response().sections,
          summary: {
            value: summary,
            sourceRefs: [
              {
                fragmentId: "fragment-1",
                quote: "I build dependable platform systems.",
              },
              {
                fragmentId: "fragment-2",
                quote:
                  "I lead teams through complex migrations with measurable results.",
              },
              {
                fragmentId: "fragment-3",
                quote:
                  "I care about accessibility, reliability, and clear ownership.",
              },
            ],
          },
        },
      }),
      sourceRegistry: summaryRegistry,
      importId: "import-summary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.candidates.find((item) => item.fieldPath === "summary"),
    ).toMatchObject({
      value: summary,
      evidence: [
        { fragmentId: "fragment-1" },
        { fragmentId: "fragment-2" },
        { fragmentId: "fragment-3" },
      ],
    });
  });

  it("rejects a long-form value that omits a grounded source fragment", () => {
    const longFormRegistry = createSourceRegistry([
      {
        order: 0,
        line: 1,
        text: "First complete sentence.",
        continuationToNext: "space",
      },
      { order: 1, line: 2, text: "Second complete sentence." },
    ]);
    const result = canonicalizeSemanticExtractionV2({
      response: response({
        sections: {
          ...response().sections,
          summary: {
            value: "First complete sentence.",
            sourceRefs: [
              { fragmentId: "fragment-1", quote: "First complete sentence." },
              { fragmentId: "fragment-2", quote: "Second complete sentence." },
            ],
          },
        },
      }),
      sourceRegistry: longFormRegistry,
      importId: "import-summary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.some((item) => item.fieldPath === "summary")).toBe(
      false,
    );
    expect(result.rejected).toContainEqual(
      expect.objectContaining({
        path: ["sections", "summary"],
        code: "value_not_grounded",
      }),
    );
  });

  it.each([
    ["year", "2024", "2024"],
    ["month slash year", "03/2024", "2024-03"],
    ["year month", "2024-03", "2024-03"],
    ["year slash month", "2024/03", "2024-03"],
    ["month name", "March 2024", "2024-03"],
    ["Arabic-Indic year month", "٢٠٢٠/٠٥", "2020-05"],
    ["extended Arabic-Indic year month", "۲۰۲۰/۰۵", "2020-05"],
    ["Chinese year month", "2019年7月", "2019-07"],
    ["present", "Present", "current"],
  ] as const)(
    "normalizes %s without inventing date precision",
    (_name, value, normalized) => {
      const sourceLine = `Example Employer | Platform Role | ${value}`;
      const dateRegistry = createSourceRegistry([
        { order: 0, line: 1, text: sourceLine },
      ]);
      const dateResponse = response({
        sections: {
          ...response().sections,
          workExperience: [
            {
              employerName: atom(1, "Example Employer", sourceLine),
              employerLocation: null,
              roles: [
                {
                  title: atom(1, "Platform Role", sourceLine),
                  location: null,
                  startDate: atom(1, value),
                  endDate: null,
                  responsibilities: [],
                  achievements: [],
                },
              ],
            },
          ],
        },
      });
      const result = canonicalizeSemanticExtractionV2({
        response: dateResponse,
        sourceRegistry: dateRegistry,
        importId: "import-date",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(
        result.candidates.find((item) => item.fieldPath.endsWith("startDate")),
      ).toMatchObject({ normalizedValue: normalized });
    },
  );

  it("accepts labeled HTTPS links and preserves URL safety", () => {
    const linkRegistry = createSourceRegistry([
      {
        order: 0,
        line: 1,
        text: "LinkedIn: https://linkedin.example.test/alex",
      },
    ]);
    const result = canonicalizeSemanticExtractionV2({
      response: response({
        sections: {
          ...response().sections,
          professionalLinks: [
            {
              label: atom(1, "LinkedIn"),
              url: atom(1, "https://linkedin.example.test/alex"),
            },
          ],
        },
      }),
      sourceRegistry: linkRegistry,
      importId: "import-links",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toContainEqual(
      expect.objectContaining({
        fieldPath: "professionalLinks.0",
        normalizedValue: "https://linkedin.example.test/alex",
        linkLabel: "LinkedIn",
      }),
    );
  });

  it("does not turn a project section heading into a project", () => {
    const projectRegistry = createSourceRegistry([
      { order: 0, line: 1, text: "Open Source & Personal Projects" },
    ]);
    const result = canonicalizeSemanticExtractionV2({
      response: response({
        sections: {
          ...response().sections,
          projects: [
            {
              name: atom(1, "Open Source & Personal Projects"),
              description: null,
            },
          ],
        },
      }),
      sourceRegistry: projectRegistry,
      importId: "import-projects",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.candidates.some((item) => item.fieldPath.startsWith("projects.")),
    ).toBe(false);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ path: ["sections", "projects", 0] }),
    );
  });
});
