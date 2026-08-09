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
    delete (malformed as { conflicts?: unknown }).conflicts;
    const result = canonicalizeSemanticExtractionV2({
      response: malformed,
      sourceRegistry: registry,
      importId: "import-1",
    });
    expect(result).toEqual({
      ok: false,
      reason: "invalid_top_level_envelope",
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
});
