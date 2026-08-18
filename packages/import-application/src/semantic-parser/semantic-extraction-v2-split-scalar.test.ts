import { describe, expect, it } from "vitest";

import {
  canonicalizeSemanticExtractionV2,
  type V2CanonicalizationResult,
} from "./semantic-extraction-v2-canonicalizer.js";
import { mapSemanticV2CandidatesToDraft } from "./semantic-v2-candidates-to-draft.js";
import { createSourceRegistry } from "./source-registry.js";

type Continuation = "none" | "space" | null;

interface FragmentFixture {
  readonly fragmentId?: string;
  readonly order: number;
  readonly line: number;
  readonly text: string;
  readonly continuationToNext?: Continuation;
}

function registry(fragments: readonly FragmentFixture[]) {
  return createSourceRegistry(fragments);
}

function atom(
  value: string,
  refs: readonly { readonly fragmentId: string; readonly quote: string }[],
) {
  return { value, sourceRefs: refs };
}

function ref(fragment: number, quote: string) {
  return { fragmentId: `fragment-${fragment}`, quote };
}

function sections(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function response(sectionOverrides: Record<string, unknown>) {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2",
    sections: sections(sectionOverrides),
    relationships: [],
    ambiguities: [],
    conflicts: [],
  };
}

function canonical(input: {
  readonly fragments: readonly FragmentFixture[];
  readonly sectionOverrides: Record<string, unknown>;
  readonly importId?: string;
}): Extract<V2CanonicalizationResult, { readonly ok: true }> {
  const result = canonicalizeSemanticExtractionV2({
    response: response(input.sectionOverrides),
    sourceRegistry: registry(input.fragments),
    importId: input.importId ?? "split-scalar",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function values(result: Extract<V2CanonicalizationResult, { ok: true }>) {
  return result.candidates.map((candidate) => candidate.value);
}

const document = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerUserId: "10000000-0000-4000-8000-000000000002",
  visibleFilename: "synthetic-split-scalar.pdf",
  contentType: "application/pdf",
  fileExtension: "pdf" as const,
  sizeBytes: 1_000,
  renderedPageCount: 1,
  detectedLanguage: "english" as const,
  uploadStatus: "stored" as const,
  validationStatus: "accepted" as const,
  processingStatus: "semantic_parsing_running" as const,
  deletionStatus: "retained" as const,
  createdAt: new Date("2026-08-18T10:00:00.000Z"),
  retentionExpiresAt: new Date("2026-08-25T10:00:00.000Z"),
};

describe("grounded split-scalar evidence", () => {
  it("A: preserves single-fragment scalar behavior", () => {
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: "Senior Backend Engineer" }],
      sectionOverrides: {
        headline: atom("Senior Backend Engineer", [
          ref(1, "Senior Backend Engineer"),
        ]),
      },
    });

    expect(values(result)).toContain("Senior Backend Engineer");
  });

  it.each([
    [
      "B: two fragments",
      [
        {
          order: 0,
          line: 1,
          text: "Senior Backend",
          continuationToNext: "space" as const,
        },
        { order: 1, line: 1, text: "Engineer" },
      ],
      "Senior Backend Engineer",
      [ref(1, "Senior Backend"), ref(2, "Engineer")],
    ],
    [
      "C: three fragments",
      [
        {
          order: 0,
          line: 1,
          text: "Master of",
          continuationToNext: "space" as const,
        },
        {
          order: 1,
          line: 1,
          text: "Software",
          continuationToNext: "space" as const,
        },
        { order: 2, line: 1, text: "Engineering" },
      ],
      "Master of Software Engineering",
      [ref(1, "Master of"), ref(2, "Software"), ref(3, "Engineering")],
    ],
  ])(
    "accepts %s only across proven boundaries",
    (_name, fragments, value, refs) => {
      const result = canonical({
        fragments,
        sectionOverrides: { headline: atom(value, refs) },
      });

      expect(result.rejected).toEqual([]);
      expect(result.candidates).toContainEqual(
        expect.objectContaining({
          fieldPath: "headline",
          value,
          evidence: refs.map((item) =>
            expect.objectContaining({ fragmentId: item.fragmentId }),
          ),
        }),
      );
      expect(
        result.candidates
          .find((candidate) => candidate.fieldPath === "headline")
          ?.evidence.map((item) => item.continuationToNext),
      ).toEqual([
        ...fragments
          .slice(0, -1)
          .map((fragment) => fragment.continuationToNext),
        undefined,
      ]);
    },
  );

  it("D: rejects valid fragments supplied in the wrong order", () => {
    const result = canonical({
      fragments: [
        {
          order: 0,
          line: 1,
          text: "Senior Backend",
          continuationToNext: "space",
        },
        { order: 1, line: 1, text: "Engineer" },
      ],
      sectionOverrides: {
        headline: atom("Engineer Senior Backend", [
          ref(2, "Engineer"),
          ref(1, "Senior Backend"),
        ]),
      },
    });

    expect(values(result)).not.toContain("Engineer Senior Backend");
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "ambiguous_source_refs" }),
    );
  });

  it("E: rejects adjacent but structurally unrelated fragments", () => {
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Example Employer" },
        { order: 1, line: 2, text: "2022" },
      ],
      sectionOverrides: {
        headline: atom("Example Employer 2022", [
          ref(1, "Example Employer"),
          ref(2, "2022"),
        ]),
      },
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "ambiguous_source_refs" }),
    );
  });

  it("F: accepts one uniquely anchored repeated sequence and rejects alternatives", () => {
    const fragments = [
      {
        order: 0,
        line: 1,
        text: "Senior Backend",
        continuationToNext: "space" as const,
      },
      { order: 1, line: 1, text: "Engineer" },
      {
        order: 2,
        line: 3,
        text: "Senior Backend",
        continuationToNext: "space" as const,
      },
      { order: 3, line: 3, text: "Engineer" },
    ];
    const accepted = canonical({
      fragments,
      sectionOverrides: {
        headline: atom("Senior Backend Engineer", [
          ref(3, "Senior Backend"),
          ref(4, "Engineer"),
        ]),
      },
    });
    const ambiguous = canonical({
      fragments,
      sectionOverrides: {
        headline: atom("Senior Backend Engineer Senior Backend", [
          ref(1, "Senior Backend"),
          ref(2, "Engineer"),
          ref(3, "Senior Backend"),
        ]),
      },
    });

    expect(values(accepted)).toContain("Senior Backend Engineer");
    expect(ambiguous.candidates).toHaveLength(0);
  });

  it("G: rejects duplicate and overlapping refs", () => {
    const fragments = [
      {
        order: 0,
        line: 1,
        text: "Senior Backend",
        continuationToNext: "space" as const,
      },
      { order: 1, line: 1, text: "Engineer" },
    ];
    const duplicate = canonical({
      fragments,
      sectionOverrides: {
        headline: atom("Senior Backend Senior Backend", [
          ref(1, "Senior Backend"),
          ref(1, "Senior Backend"),
        ]),
      },
    });
    const overlap = canonical({
      fragments: [
        {
          order: 0,
          line: 1,
          text: "Senior Backend Engineer",
          continuationToNext: "none",
        },
      ],
      sectionOverrides: {
        headline: atom("Senior BackendBackend Engineer", [
          ref(1, "Senior Backend"),
          ref(1, "Backend Engineer"),
        ]),
      },
    });

    expect(duplicate.rejected).toContainEqual(
      expect.objectContaining({ code: "duplicate_source_ref" }),
    );
    expect(overlap.rejected).toContainEqual(
      expect.objectContaining({ code: "overlapping_source_refs" }),
    );
  });

  it.each([
    ["H: source-proven normalized space", "space", "Platform Engineer", true],
    ["H: source-proven no-space boundary", "none", "TypeScript", true],
    ["H: unsupported wrap boundary", null, "Platform Engineer", false],
    ["I: unsupported hyphenated wrap", null, "Platform Engineer", false],
  ] as const)("%s", (_name, continuationToNext, value, accepted) => {
    const firstText = _name.startsWith("I:")
      ? "Platform-"
      : value === "TypeScript"
        ? "Type"
        : "Platform";
    const secondText = _name.startsWith("I:")
      ? "Engineer"
      : value === "TypeScript"
        ? "Script"
        : "Engineer";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: firstText, continuationToNext },
        {
          order: 1,
          line: continuationToNext === null ? 2 : 1,
          text: secondText,
        },
      ],
      sectionOverrides: {
        headline: atom(value, [ref(1, firstText), ref(2, secondText)]),
      },
    });

    expect(values(result).includes(value)).toBe(accepted);
  });

  it("J/K/L: applies one scalar rule to Work, Education, and headline", () => {
    const fragments = [
      { order: 0, line: 1, text: "Example Employer" },
      {
        order: 1,
        line: 2,
        text: "Senior Backend",
        continuationToNext: "space" as const,
      },
      { order: 2, line: 2, text: "Engineer" },
      { order: 3, line: 3, text: "Sibling Employer" },
      { order: 4, line: 4, text: "Designer" },
      {
        order: 5,
        line: 5,
        text: "University of",
        continuationToNext: "space" as const,
      },
      { order: 6, line: 5, text: "Example" },
      { order: 7, line: 6, text: "Other Institute" },
    ];
    const splitTitle = atom("Senior Backend Engineer", [
      ref(2, "Senior Backend"),
      ref(3, "Engineer"),
    ]);
    const result = canonical({
      fragments,
      sectionOverrides: {
        headline: splitTitle,
        workExperience: [
          {
            employerName: atom("Example Employer", [
              ref(1, "Example Employer"),
            ]),
            employerLocation: null,
            roles: [
              {
                title: splitTitle,
                location: null,
                startDate: null,
                endDate: null,
                responsibilities: [],
                achievements: [],
              },
            ],
          },
          {
            employerName: atom("Sibling Employer", [
              ref(4, "Sibling Employer"),
            ]),
            employerLocation: null,
            roles: [
              {
                title: atom("Designer", [ref(5, "Designer")]),
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
            institution: atom("University of Example", [
              ref(6, "University of"),
              ref(7, "Example"),
            ]),
            degree: null,
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            location: null,
          },
          {
            institution: atom("Other Institute", [ref(8, "Other Institute")]),
            degree: null,
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            location: null,
          },
        ],
      },
    });

    expect(result.rejected).toEqual([]);
    expect(values(result)).toEqual(
      expect.arrayContaining([
        "Senior Backend Engineer",
        "Example Employer",
        "Sibling Employer",
        "Designer",
        "University of Example",
        "Other Institute",
      ]),
    );
    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: result.candidates,
      rejected: result.rejected,
      signals: result.signals,
      document,
    });
    expect(mapped.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "headline",
          value: { kind: "text", value: "Senior Backend Engineer" },
        }),
        expect.objectContaining({
          fieldPath: "work_experience.0.roles.0.title",
          value: { kind: "text", value: "Senior Backend Engineer" },
        }),
        expect.objectContaining({
          fieldPath: "education.0.institution",
          value: { kind: "text", value: "University of Example" },
        }),
      ]),
    );
  });

  it("M: rejects one malformed child while valid siblings survive", () => {
    const result = canonical({
      fragments: [
        {
          order: 0,
          line: 1,
          text: "Senior Backend",
          continuationToNext: "space",
        },
        { order: 1, line: 1, text: "Engineer" },
        { order: 2, line: 2, text: "TypeScript" },
      ],
      sectionOverrides: {
        headline: atom("Senior Backend Engineer Extra", [
          ref(1, "Senior Backend"),
          ref(2, "Engineer"),
          ref(3, "TypeScript"),
        ]),
        skills: [{ name: atom("TypeScript", [ref(3, "TypeScript")]) }],
      },
    });

    expect(values(result)).toEqual(["TypeScript"]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ path: ["sections", "headline"] }),
    );
  });
});

describe("split-scalar metamorphic properties", () => {
  const fragments = [
    { fragmentId: "source-a", order: 0, line: 1, text: "Employer A" },
    { fragmentId: "source-b", order: 1, line: 2, text: "Engineer" },
    { fragmentId: "source-c", order: 2, line: 3, text: "Employer B" },
    { fragmentId: "source-d", order: 3, line: 4, text: "Designer" },
  ] as const;

  const work = (employer: string, title: string) => ({
    employerName: atom(employer, [
      {
        fragmentId: employer === "Employer A" ? "source-a" : "source-c",
        quote: employer,
      },
    ]),
    employerLocation: null,
    roles: [
      {
        title: atom(title, [
          {
            fragmentId: title === "Engineer" ? "source-b" : "source-d",
            quote: title,
          },
        ]),
        location: null,
        startDate: null,
        endDate: null,
        responsibilities: [],
        achievements: [],
      },
    ],
  });

  it("keeps independent Work eligibility stable under group reordering and addition", () => {
    const first = canonical({
      fragments,
      sectionOverrides: { workExperience: [work("Employer A", "Engineer")] },
    });
    const reordered = canonical({
      fragments,
      sectionOverrides: {
        workExperience: [
          work("Employer B", "Designer"),
          work("Employer A", "Engineer"),
        ],
      },
    });

    expect(new Set(values(first))).toEqual(new Set(["Employer A", "Engineer"]));
    expect(new Set(values(reordered))).toEqual(
      new Set(["Employer A", "Engineer", "Employer B", "Designer"]),
    );
  });

  it("keeps eligibility invariant when fragment IDs change with provenance", () => {
    const make = (ids: readonly [string, string]) =>
      canonical({
        fragments: [
          {
            fragmentId: ids[0],
            order: 0,
            line: 1,
            text: "Senior Backend",
            continuationToNext: "space",
          },
          { fragmentId: ids[1], order: 1, line: 1, text: "Engineer" },
        ],
        sectionOverrides: {
          headline: atom("Senior Backend Engineer", [
            { fragmentId: ids[0], quote: "Senior Backend" },
            { fragmentId: ids[1], quote: "Engineer" },
          ]),
        },
      });

    expect(values(make(["first-a", "first-b"]))).toEqual(
      values(make(["second-a", "second-b"])),
    );
  });

  it("does not invalidate required siblings when an optional field is removed", () => {
    const fragments = [
      { order: 0, line: 1, text: "Example University" },
      { order: 1, line: 2, text: "Software Engineering" },
    ];
    const withOptional = canonical({
      fragments,
      sectionOverrides: {
        education: [
          {
            institution: atom("Example University", [
              ref(1, "Example University"),
            ]),
            degree: atom("Software Engineering", [
              ref(2, "Software Engineering"),
            ]),
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            location: null,
          },
        ],
      },
    });
    const withoutOptional = canonical({
      fragments,
      sectionOverrides: {
        education: [
          {
            institution: atom("Example University", [
              ref(1, "Example University"),
            ]),
            degree: null,
            fieldOfStudy: null,
            startDate: null,
            endDate: null,
            location: null,
          },
        ],
      },
    });

    expect(values(withOptional)).toContain("Example University");
    expect(values(withoutOptional)).toEqual(["Example University"]);
  });

  it("rejects a wrong-order or extra unrelated ref and does not manufacture evidence", () => {
    const split = [
      {
        order: 0,
        line: 1,
        text: "Senior Backend",
        continuationToNext: "space" as const,
      },
      { order: 1, line: 1, text: "Engineer" },
      { order: 2, line: 2, text: "TypeScript" },
    ];
    for (const refs of [
      [ref(2, "Engineer"), ref(1, "Senior Backend")],
      [ref(1, "Senior Backend"), ref(2, "Engineer"), ref(3, "TypeScript")],
    ]) {
      const result = canonical({
        fragments: split,
        sectionOverrides: {
          headline: atom("Senior Backend Engineer", refs),
          skills: [{ name: atom("TypeScript", [ref(3, "TypeScript")]) }],
        },
      });
      expect(values(result)).toEqual(["TypeScript"]);
    }
  });
});
