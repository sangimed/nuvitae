import { describe, expect, it } from "vitest";

import {
  applyReviewCommand,
  buildExtractionDraft,
  type ImportedDocument,
} from "@nuvitae/domain";

import {
  canonicalizeSemanticExtractionV2,
  type V2CanonicalizationResult,
} from "./semantic-extraction-v2-canonicalizer.js";
import { mapSemanticV2CandidatesToDraft } from "./semantic-v2-candidates-to-draft.js";
import { createSourceRegistry } from "./source-registry.js";

interface FragmentFixture {
  readonly fragmentId?: string;
  readonly order: number;
  readonly line: number;
  readonly text: string;
  readonly continuationToNext?: "none" | "space" | null;
}

const document: ImportedDocument = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerUserId: "10000000-0000-4000-8000-000000000002",
  visibleFilename: "synthetic-long-form.pdf",
  contentType: "application/pdf",
  fileExtension: "pdf",
  sizeBytes: 2_048,
  renderedPageCount: 1,
  detectedLanguage: "english",
  uploadStatus: "stored",
  validationStatus: "accepted",
  processingStatus: "semantic_parsing_running",
  deletionStatus: "retained",
  createdAt: new Date("2026-08-20T08:00:00.000Z"),
  retentionExpiresAt: new Date("2026-08-27T08:00:00.000Z"),
};

function ref(fragment: number | string, quote: string) {
  return { fragmentId: `fragment-${fragment}`, quote };
}

function atom(value: string, sourceRefs: readonly ReturnType<typeof ref>[]) {
  return { value, sourceRefs };
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

function response(
  sectionOverrides: Record<string, unknown>,
  options: {
    readonly ambiguities?: readonly unknown[];
    readonly conflicts?: readonly unknown[];
  } = {},
) {
  return {
    schemaVersion: "nuvitae.semantic-extraction.v2",
    sections: sections(sectionOverrides),
    relationships: [],
    ambiguities: options.ambiguities ?? [],
    conflicts: options.conflicts ?? [],
  };
}

function canonical(input: {
  readonly fragments: readonly FragmentFixture[];
  readonly sectionOverrides: Record<string, unknown>;
  readonly ambiguities?: readonly unknown[];
}): Extract<V2CanonicalizationResult, { readonly ok: true }> {
  const result = canonicalizeSemanticExtractionV2({
    response: response(input.sectionOverrides, {
      ambiguities: input.ambiguities,
    }),
    sourceRegistry: createSourceRegistry(input.fragments),
    importId: document.id,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function summaryCandidate(
  result: Extract<V2CanonicalizationResult, { readonly ok: true }>,
) {
  return result.candidates.find(
    (candidate) => candidate.fieldPath === "summary",
  );
}

describe("T259 long-form evidence stability", () => {
  it("C1 grounds a complete value embedded in a larger extraction fragment as review-required", () => {
    const value =
      "Builds resilient services and documents operational decisions.";
    const result = canonical({
      fragments: [
        {
          order: 0,
          line: 1,
          text: `Profile ${value} Unrelated contact details`,
        },
      ],
      sectionOverrides: { summary: atom(value, [ref(1, value)]) },
    });

    expect(summaryCandidate(result)?.value).toBe(value);
    expect(summaryCandidate(result)).toMatchObject({
      semanticCompleteness: "unknown",
      inferenceStatus: "inferred_needs_review",
    });
    expect(result.rejected).toEqual([]);
  });

  it("accepts an ordered source-proven multi-fragment long-form value", () => {
    const parts = [
      "Designed a fault-tolerant ingestion path.",
      "Added deterministic recovery and clear runbooks.",
      "Reduced recurring support work across the team.",
    ];
    const result = canonical({
      fragments: parts.map((text, order) => ({
        order,
        line: order + 1,
        text,
        continuationToNext: order === parts.length - 1 ? null : "space",
      })),
      sectionOverrides: {
        summary: atom(
          parts.join(" "),
          parts.map((part, index) => ref(index + 1, part)),
        ),
      },
    });

    expect(summaryCandidate(result)?.value).toBe(parts.join(" "));
    expect(summaryCandidate(result)?.evidence).toHaveLength(3);
  });

  it("rejects missing intermediate evidence even when submitted text omits it", () => {
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Established the delivery model." },
        {
          order: 1,
          line: 2,
          text: "Coached two product teams through adoption.",
        },
        { order: 2, line: 3, text: "Published the operating guide." },
      ],
      sectionOverrides: {
        summary: atom(
          "Established the delivery model. Published the operating guide.",
          [
            ref(1, "Established the delivery model."),
            ref(3, "Published the operating guide."),
          ],
        ),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "ambiguous_source_refs" }),
    );
  });

  it("C3 grounds a prefix without claiming completeness or material truncation", () => {
    const complete =
      "Led the migration from discovery through rollout and documented recovery procedures.";
    const prefix = "Led the migration from discovery through rollout";
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: complete }],
      sectionOverrides: { summary: atom(prefix, [ref(1, prefix)]) },
    });

    expect(summaryCandidate(result)).toMatchObject({
      value: prefix,
      semanticCompleteness: "unknown",
      inferenceStatus: "inferred_needs_review",
    });
    expect(result.rejected).toEqual([]);
  });

  it("C4 rejects partial grounding of the submitted value", () => {
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: "Grounded first sentence." }],
      sectionOverrides: {
        summary: atom("Grounded first sentence. Unsupported second sentence.", [
          ref(1, "Grounded first sentence."),
        ]),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "value_not_grounded" }),
    );
  });

  it("C5 rejects an invented token", () => {
    const grounded = "Grounded source sentence.";
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: grounded }],
      sectionOverrides: {
        summary: atom(`${grounded} Fabricated`, [ref(1, grounded)]),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "value_not_grounded" }),
    );
  });

  it.each([
    {
      label: "value_not_grounded",
      fragments: [{ order: 0, line: 1, text: "Grounded text." }],
      value: "Different submitted text.",
      refs: [ref(1, "Grounded text.")],
      code: "value_not_grounded",
    },
    {
      label: "partial submitted-value grounding",
      fragments: [{ order: 0, line: 1, text: "Grounded prefix." }],
      value: "Grounded prefix. Unsupported suffix.",
      refs: [ref(1, "Grounded prefix.")],
      code: "value_not_grounded",
    },
    {
      label: "invented token",
      fragments: [{ order: 0, line: 1, text: "Grounded narrative." }],
      value: "Grounded narrative. Invented",
      refs: [ref(1, "Grounded narrative.")],
      code: "value_not_grounded",
    },
    {
      label: "invalid ref",
      fragments: [{ order: 0, line: 1, text: "Grounded narrative." }],
      value: "Grounded narrative.",
      refs: [ref("missing", "Grounded narrative.")],
      code: "source_fragment_not_found",
    },
    {
      label: "non-unique provenance",
      fragments: [
        {
          order: 0,
          line: 1,
          text: "Repeated narrative. Repeated narrative.",
        },
      ],
      value: "Repeated narrative.",
      refs: [ref(1, "Repeated narrative.")],
      code: "quote_ambiguous_within_fragment",
    },
  ])("keeps Category C $label out of draft and review state", (scenario) => {
    const result = canonical({
      fragments: scenario.fragments,
      sectionOverrides: {
        summary: atom(scenario.value, scenario.refs),
      },
    });
    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: result.candidates,
      rejected: result.rejected,
      signals: result.signals,
      document,
    });
    const built = buildExtractionDraft({
      importedDocument: document,
      fields: mapped.fields,
      warnings: mapped.warnings,
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "20000000-0000-4000-8000-000000000099",
        fieldId: () => "30000000-0000-4000-8000-000000000099",
        warningId: () => "40000000-0000-4000-8000-000000000099",
      },
      now: new Date("2026-08-20T08:05:00.000Z"),
    });

    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: scenario.code }),
    );
    expect(mapped.fields).toEqual([]);
    expect(built.category).toBe("no_supported_field");
    expect(built.draft).toBeUndefined();
  });

  it("keeps malformed long-form evidence field-bounded from valid siblings", () => {
    const headline = "Platform Engineer";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: headline },
        { order: 1, line: 2, text: "Grounded summary fragment." },
      ],
      sectionOverrides: {
        headline: atom(headline, [ref(1, headline)]),
        summary: atom("Grounded summary fragment. Invented token", [
          ref(2, "Grounded summary fragment."),
        ]),
      },
    });

    expect(result.candidates.map((candidate) => candidate.fieldPath)).toEqual([
      "headline",
    ]);
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ path: ["sections", "summary"] }),
    );
  });

  it("marks a grounded ambiguous Summary review-required and field-bounds its warning", () => {
    const value = "Coordinates incident learning across service teams.";
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: value }],
      sectionOverrides: { summary: atom(value, [ref(1, value)]) },
      ambiguities: [
        {
          kind: "ambiguous_section",
          sourceRefs: [ref(1, value)],
        },
      ],
    });
    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: result.candidates,
      rejected: result.rejected,
      signals: result.signals,
      document,
    });

    expect(summaryCandidate(result)?.inferenceStatus).toBe(
      "inferred_needs_review",
    );
    expect(mapped.fields[0]?.inferenceStatus).toBe("inferred_needs_review");
    expect(mapped.warnings).toContainEqual(
      expect.objectContaining({
        warningType: "ambiguous",
        fieldPath: "summary",
      }),
    );
  });

  it("retains an otherwise grounded inferred sibling for explicit review", () => {
    const value = "Coordinates incident learning across service teams.";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Platform Engineer" },
        { order: 1, line: 2, text: value },
      ],
      sectionOverrides: {
        headline: atom("Platform Engineer", [ref(1, "Platform Engineer")]),
        summary: atom(value, [ref(2, value)]),
      },
    });
    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: result.candidates,
      rejected: result.rejected,
      signals: result.signals,
      document,
    });
    const fields = mapped.fields.map((field) =>
      field.fieldPath === "summary"
        ? { ...field, inferenceStatus: "inferred_needs_review" as const }
        : field,
    );
    const draft = buildExtractionDraft({
      importedDocument: document,
      fields,
      warnings: [],
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "20000000-0000-4000-8000-000000000001",
        fieldId: (() => {
          let next = 1;
          return () =>
            `30000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        warningId: () => "40000000-0000-4000-8000-000000000001",
      },
      now: new Date("2026-08-20T08:05:00.000Z"),
    });

    expect(draft.draft?.fields.map((field) => field.fieldPath)).toEqual([
      "headline",
      "summary",
    ]);
  });

  it("C6 canonicalizes valid whole and split refs for the same embedded region", () => {
    const value =
      "Plans durable migrations and publishes clear recovery guidance.";
    const fragments = [
      { order: 0, line: 1, text: `Summary: ${value} Skills: TypeScript` },
    ];
    const whole = canonical({
      fragments,
      sectionOverrides: { summary: atom(value, [ref(1, value)]) },
    });
    const split = canonical({
      fragments,
      sectionOverrides: {
        summary: atom(value, [
          ref(1, "Plans durable migrations"),
          ref(1, "and publishes clear recovery guidance."),
        ]),
      },
    });

    expect(summaryCandidate(split)).toEqual(summaryCandidate(whole));
  });

  it("C2 treats a value ending at a fragment boundary as neither complete nor truncated", () => {
    const value = "Grounded narrative ending at this extraction boundary.";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: value },
        { order: 1, line: 2, text: "Following fragment of unknown relation." },
      ],
      sectionOverrides: { summary: atom(value, [ref(1, value)]) },
    });

    expect(summaryCandidate(result)).toMatchObject({
      semanticCompleteness: "unknown",
      inferenceStatus: "inferred_needs_review",
    });
    expect(result.rejected).toEqual([]);
  });

  it.each([
    ["Summary", "summary"],
    ["Work responsibility", "responsibility"],
    ["Work achievement", "achievement"],
    ["Project description", "project"],
  ])("grounds the %s long-form path independently", (_label, kind) => {
    const value = `Complete ${kind} narrative with two deterministic sentences. The second sentence remains intact.`;
    const fragments = [{ order: 0, line: 1, text: value }];
    const longAtom = atom(value, [ref(1, value)]);
    const sectionOverrides =
      kind === "summary"
        ? { summary: longAtom }
        : kind === "project"
          ? {
              projects: [
                {
                  name: atom("Project Atlas", [
                    { fragmentId: "fragment-2", quote: "Project Atlas" },
                  ]),
                  description: longAtom,
                },
              ],
            }
          : {
              workExperience: [
                {
                  employerName: atom("Example Cooperative", [
                    {
                      fragmentId: "fragment-2",
                      quote: "Example Cooperative",
                    },
                  ]),
                  employerLocation: null,
                  roles: [
                    {
                      title: atom("Systems Lead", [
                        { fragmentId: "fragment-3", quote: "Systems Lead" },
                      ]),
                      location: null,
                      startDate: null,
                      endDate: null,
                      responsibilities:
                        kind === "responsibility" ? [longAtom] : [],
                      achievements: kind === "achievement" ? [longAtom] : [],
                    },
                  ],
                },
              ],
            };
    const result = canonical({
      fragments: [
        ...fragments,
        {
          order: 1,
          line: 2,
          text: kind === "project" ? "Project Atlas" : "Example Cooperative",
        },
        ...(kind === "summary" || kind === "project"
          ? []
          : [{ order: 2, line: 3, text: "Systems Lead" }]),
      ],
      sectionOverrides,
    });

    expect(result.rejected).toEqual([]);
    expect(
      result.candidates.some((candidate) => candidate.value === value),
    ).toBe(true);
  });

  it.each([
    [
      "duplicate refs",
      [
        ref(1, "Complete source narrative."),
        ref(1, "Complete source narrative."),
      ],
      "duplicate_source_ref",
    ],
    [
      "unsupported extra evidence",
      [
        ref(1, "Complete source narrative."),
        ref(2, "Unrelated appendix text."),
      ],
      "ambiguous_source_refs",
    ],
  ])("rejects %s", (_label, refs, code) => {
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Complete source narrative." },
        { order: 1, line: 2, text: "Unrelated appendix text." },
      ],
      sectionOverrides: {
        summary: atom("Complete source narrative.", refs),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(expect.objectContaining({ code }));
  });

  it("rejects refs reordered against authoritative source order", () => {
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "First sentence." },
        { order: 1, line: 2, text: "Second sentence." },
      ],
      sectionOverrides: {
        summary: atom("Second sentence. First sentence.", [
          ref(2, "Second sentence."),
          ref(1, "First sentence."),
        ]),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "ambiguous_source_refs" }),
    );
  });

  it("rejects repeated text with non-unique provenance inside one fragment", () => {
    const repeated = "Reviewed the recovery plan.";
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: `${repeated} ${repeated}` }],
      sectionOverrides: { summary: atom(repeated, [ref(1, repeated)]) },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "quote_ambiguous_within_fragment" }),
    );
  });

  it("rejects invalid source refs", () => {
    const value = "Grounded only when the referenced fragment exists.";
    const result = canonical({
      fragments: [{ order: 0, line: 1, text: value }],
      sectionOverrides: {
        summary: atom(value, [
          { fragmentId: "fragment-missing", quote: value },
        ]),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "source_fragment_not_found" }),
    );
  });

  it("accepts repeated text when the provider supplies unique fragment provenance", () => {
    const repeated = "Reviewed the recovery plan.";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: repeated },
        { order: 1, line: 2, text: repeated },
      ],
      sectionOverrides: { summary: atom(repeated, [ref(2, repeated)]) },
    });

    expect(summaryCandidate(result)?.evidence[0]?.fragmentId).toBe(
      "fragment-2",
    );
  });

  it("preserves outcome when opaque fragment IDs change", () => {
    const value =
      "Keeps source identity opaque while preserving grounded content.";
    const run = (fragmentId: string) =>
      canonicalizeSemanticExtractionV2({
        response: response({
          summary: atom(value, [{ fragmentId, quote: value }]),
        }),
        sourceRegistry: createSourceRegistry([
          { fragmentId, order: 0, line: 1, text: value },
        ]),
        importId: document.id,
      });
    const project = (result: V2CanonicalizationResult) =>
      result.ok
        ? {
            ok: true,
            values: result.candidates.map((candidate) => candidate.value),
            inference: result.candidates.map(
              (candidate) => candidate.inferenceStatus,
            ),
            rejected: result.rejected.map((item) => item.code),
          }
        : { ok: false, reason: result.reason };

    expect(project(run("opaque-alpha"))).toEqual(project(run("opaque-beta")));
  });

  it("C7 does not append unrelated text after a selected substring", () => {
    const value = "Maintains stable evidence under unrelated source growth.";
    const base = canonical({
      fragments: [{ order: 0, line: 1, text: value }],
      sectionOverrides: { summary: atom(value, [ref(1, value)]) },
    });
    const extended = canonical({
      fragments: [
        { order: 0, line: 1, text: value },
        { order: 1, line: 2, text: "Unrelated certification appendix." },
      ],
      sectionOverrides: { summary: atom(value, [ref(1, value)]) },
    });

    expect(summaryCandidate(extended)).toEqual(summaryCandidate(base));
  });

  it("C8 rejects unsupported cross-fragment expansion", () => {
    const first = "First grounded span.";
    const second = "Second grounded span.";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: first },
        { order: 1, line: 2, text: second },
      ],
      sectionOverrides: {
        summary: atom(`${first} ${second}`, [ref(1, first), ref(2, second)]),
      },
    });

    expect(summaryCandidate(result)).toBeUndefined();
    expect(result.rejected).toContainEqual(
      expect.objectContaining({ code: "ambiguous_source_refs" }),
    );
  });

  it("C9 keeps semantic ambiguity plus complete textual grounding in Category B", () => {
    const responsibility =
      "Owned release coordination across two service teams.";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Example Cooperative" },
        { order: 1, line: 2, text: "Systems Lead" },
        { order: 2, line: 3, text: responsibility },
      ],
      sectionOverrides: {
        workExperience: [
          {
            employerName: atom("Example Cooperative", [
              ref(1, "Example Cooperative"),
            ]),
            employerLocation: null,
            roles: [
              {
                title: atom("Systems Lead", [ref(2, "Systems Lead")]),
                location: null,
                startDate: null,
                endDate: null,
                responsibilities: [
                  atom(responsibility, [ref(3, responsibility)]),
                ],
                achievements: [],
              },
            ],
          },
        ],
      },
      ambiguities: [
        {
          kind: "ambiguous_grouping",
          sourceRefs: [ref(2, "Systems Lead")],
        },
      ],
    });
    const candidate = result.candidates.find(
      (item) => item.value === responsibility,
    );

    expect(candidate).toMatchObject({
      value: responsibility,
      inferenceStatus: "inferred_needs_review",
    });
  });

  it("field-bounds group ambiguity when repeated anchors have unique provenance", () => {
    const first = "Owned release coordination for the first service group.";
    const second = "Owned release coordination for the second service group.";
    const work = (offset: number, responsibility: string) => ({
      employerName: atom("Example Cooperative", [
        ref(offset, "Example Cooperative"),
      ]),
      employerLocation: null,
      roles: [
        {
          title: atom("Systems Lead", [ref(offset + 1, "Systems Lead")]),
          location: null,
          startDate: null,
          endDate: null,
          responsibilities: [
            atom(responsibility, [ref(offset + 2, responsibility)]),
          ],
          achievements: [],
        },
      ],
    });
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Example Cooperative" },
        { order: 1, line: 2, text: "Systems Lead" },
        { order: 2, line: 3, text: first },
        { order: 3, line: 4, text: "Example Cooperative" },
        { order: 4, line: 5, text: "Systems Lead" },
        { order: 5, line: 6, text: second },
      ],
      sectionOverrides: { workExperience: [work(1, first), work(4, second)] },
      ambiguities: [
        {
          kind: "ambiguous_grouping",
          sourceRefs: [ref(2, "Systems Lead")],
        },
      ],
    });
    const firstCandidate = result.candidates.find(
      (candidate) => candidate.value === first,
    );
    const secondCandidate = result.candidates.find(
      (candidate) => candidate.value === second,
    );

    expect(firstCandidate?.inferenceStatus).toBe("inferred_needs_review");
    expect(secondCandidate?.inferenceStatus).toBe("inferred_needs_review");
    expect(
      result.signals.find((signal) => signal.kind === "ambiguous_grouping")
        ?.affectedFieldPaths,
    ).toContain(firstCandidate?.fieldPath);
    expect(
      result.signals.find((signal) => signal.kind === "ambiguous_grouping")
        ?.affectedFieldPaths,
    ).not.toContain(secondCandidate?.fieldPath);
  });

  it("C10 records explicit confirmation without replacing proposal, uncertainty, or evidence", () => {
    const value = "Coordinates incident learning across service teams.";
    const result = canonical({
      fragments: [
        { order: 0, line: 1, text: "Platform Engineer" },
        { order: 1, line: 2, text: value },
      ],
      sectionOverrides: {
        headline: atom("Platform Engineer", [ref(1, "Platform Engineer")]),
        summary: atom(value, [ref(2, value)]),
      },
      ambiguities: [{ kind: "ambiguous_section", sourceRefs: [ref(2, value)] }],
    });
    const mapped = mapSemanticV2CandidatesToDraft({
      candidates: result.candidates,
      rejected: result.rejected,
      signals: result.signals,
      document,
    });
    const built = buildExtractionDraft({
      importedDocument: document,
      fields: mapped.fields,
      warnings: mapped.warnings,
      missingOrUnprocessedSections: [],
      ids: {
        draftId: () => "20000000-0000-4000-8000-000000000010",
        fieldId: (() => {
          let next = 10;
          return () =>
            `30000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
        })(),
        warningId: () => "40000000-0000-4000-8000-000000000010",
      },
      now: new Date("2026-08-20T08:05:00.000Z"),
    });
    const summary = built.draft?.fields.find(
      (field) => field.fieldPath === "summary",
    );
    expect(summary?.sourceLocation).toMatchObject({
      kind: "semantic",
      evidence: [expect.objectContaining({ fragmentId: "fragment-2" })],
    });
    if (built.draft === undefined || summary === undefined) return;
    const confirmed = applyReviewCommand({
      draft: built.draft,
      ownerUserId: document.ownerUserId,
      command: {
        type: "confirm_field",
        operationId: "50000000-0000-4000-8000-000000000010",
        fieldId: summary.id,
      },
      now: new Date("2026-08-20T08:06:00.000Z"),
    });

    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const transitioned = confirmed.draft.fields.find(
      (field) => field.id === summary.id,
    );
    expect(transitioned).toMatchObject({
      value: summary.value,
      sourceLocation: summary.sourceLocation,
      inferenceStatus: "confirmed_inference",
      reviewStatus: "confirmed",
    });
    expect(confirmed.correction).toMatchObject({
      action: "confirm",
      previousValue: summary.value,
    });
  });
});
