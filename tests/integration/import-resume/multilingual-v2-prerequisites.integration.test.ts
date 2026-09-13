import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { resumeSemanticParseRequestSchema } from "@nuvitae/contracts";
import { buildExtractionDraft } from "@nuvitae/domain";
import { OoxmlDocxAdapter, fragmentsFromDocx } from "@nuvitae/extraction";
import {
  buildSemanticParseRequest,
  canonicalizeSemanticExtractionV2,
  createSourceRegistryFromSemanticParseRequest,
  mapSemanticV2CandidatesToDraft,
  runLimitedDeterministicPartialFallback,
  semanticParserInstructions,
} from "@nuvitae/import-application";
import {
  multilingualV2Fixtures,
  multilingualV2Lines,
  type MultilingualV2Fixture,
} from "@nuvitae/test-fixtures";
import {
  buildDocx,
  documentXml,
  paragraphXml,
} from "../../../packages/extraction/src/testing/test-document-builders.js";
import { evaluateSemanticBenchmarkGate } from "../../../packages/import-application/src/semantic-parser/semantic-benchmark-gate.js";
import { inventorySemanticV2SourceSections } from "../../../packages/import-application/src/semantic-parser/semantic-v2-source-section-inventory.js";
import {
  addDocument,
  createValidationHarness,
  importedDocument,
  validateOwned,
} from "./validation-test-harness.js";

async function extractedFixture(
  fixture: MultilingualV2Fixture,
  extraLines: string[] = [],
) {
  const lines = [...multilingualV2Lines(fixture), ...extraLines];
  const bytes = await buildDocx({
    documentXml: documentXml(
      lines.map((line) => paragraphXml(`<w:t>${line}</w:t>`)).join(""),
    ),
  });
  const document = importedDocument({
    id: "00000000-0000-4000-8000-000000000330",
    source: bytes,
    format: "docx",
  });
  const extracted = await new OoxmlDocxAdapter(
    { readSource: async () => bytes },
    {
      maximumArchiveSizeBytes: 1_000_000,
      maximumEntryCount: 50,
      maximumEntryUncompressedSizeBytes: 500_000,
      maximumTotalUncompressedSizeBytes: 1_000_000,
      maximumCompressionRatio: 200,
      maximumXmlDepth: 50,
    },
  ).extractText({
    importId: document.id,
    ownerUserId: document.ownerUserId,
    sourceStorageKey: "synthetic-docx",
    format: "docx",
  });
  if (!extracted.ok) throw new Error("synthetic DOCX extraction failed");
  const fragments = fragmentsFromDocx(extracted.value);
  const request = buildSemanticParseRequest(document, fragments);
  const registry = createSourceRegistryFromSemanticParseRequest(request);
  const atom = (rawValue: string) => {
    const value = rawValue.normalize("NFKC");
    const fragment = registry.all().find((item) => item.text.includes(value));
    if (!fragment) throw new Error("synthetic fact absent from source");
    return {
      value,
      sourceRefs: [{ fragmentId: fragment.fragmentId, quote: value }],
    };
  };
  // A controlled V2 proposal, not a live/model-generated response. The test
  // verifies host acceptance/grounding and mapping, not semantic classification.
  const response = {
    schemaVersion: "nuvitae.semantic-extraction.v2",
    sections: {
      contact: {
        fullName: atom(fixture.name),
        email: atom(fixture.email),
        location: atom(fixture.location),
      },
      headline: atom(fixture.headline),
      summary: atom(fixture.summary),
      workExperience: [
        {
          employerName: atom(fixture.employer),
          roles: [
            {
              title: atom(fixture.role),
              startDate: atom(fixture.start),
              endDate: atom(fixture.end),
              responsibilities: [atom(fixture.responsibility)],
              achievements: [atom(fixture.achievement)],
            },
          ],
        },
      ],
      education: [
        {
          institution: atom(fixture.institution),
          degree: atom(fixture.degree),
        },
      ],
      skills: [{ name: atom(fixture.skill) }],
      languages: [
        {
          name: atom(fixture.language),
          proficiency: atom(fixture.proficiency),
        },
      ],
      projects: [
        { name: atom(fixture.project), description: atom(fixture.description) },
      ],
      certifications: [{ name: atom(fixture.certification) }],
      professionalLinks: [atom(fixture.link)],
    },
  };
  const canonicalize = () =>
    canonicalizeSemanticExtractionV2({
      response,
      sourceRegistry: registry,
      importId: document.id,
    });
  return {
    bytes,
    document,
    lines,
    fragments,
    request,
    registry,
    response,
    atom,
    canonicalize,
  };
}

describe.each(multilingualV2Fixtures)(
  "$id prerequisite boundary",
  (fixture) => {
    it("preserves physical text, unknown direction, source wording and UTF-16 evidence through V2 draft mapping", async () => {
      const context = await extractedFixture(fixture);
      expect(context.fragments.map((fragment) => fragment.text)).toEqual(
        context.lines,
      );
      expect(context.request.normalizedTranscript.text).toBe(
        context.lines.join("\n").normalize("NFKC"),
      );
      expect(context.request.languageContext).toEqual({
        detectedLanguage: "unknown",
        confidence: null,
        textDirection: null,
      });
      expect(
        resumeSemanticParseRequestSchema.safeParse(context.request).success,
      ).toBe(true);
      const canonical = context.canonicalize();
      expect(canonical).toEqual(context.canonicalize());
      expect(canonical.ok).toBe(true);
      if (!canonical.ok) return;
      expect(canonical.rejected).toEqual([]);
      expect(canonical.signals).toEqual([]);
      const expected = [
        fixture.name,
        fixture.email,
        fixture.location,
        fixture.headline,
        fixture.summary,
        fixture.employer,
        fixture.role,
        fixture.start,
        fixture.end,
        fixture.responsibility,
        fixture.achievement,
        fixture.institution,
        fixture.degree,
        fixture.skill,
        fixture.language,
        fixture.proficiency,
        fixture.project,
        fixture.description,
        fixture.certification,
        fixture.link,
      ].map((value) => value.normalize("NFKC"));
      expect(
        canonical.candidates.map((candidate) => candidate.value).sort(),
      ).toEqual([...expected].sort());
      for (const candidate of canonical.candidates) {
        expect(candidate.evidence).toHaveLength(1);
        for (const evidence of candidate.evidence) {
          const source = context.request.sourceFragments[evidence.line - 1];
          expect(source?.text.slice(evidence.start, evidence.end)).toBe(
            candidate.value,
          );
          expect(evidence.quote).toBe(candidate.value);
          expect(evidence.fragmentHash).toBe(
            createHash("sha256").update(source!.text).digest("hex"),
          );
        }
      }
      const mapped = mapSemanticV2CandidatesToDraft({
        ...canonical,
        document: context.document,
      });
      expect(mapped.fields).toHaveLength(19); // start/end become one date_range
      for (const value of expected.filter(
        (value) =>
          value !== fixture.start &&
          value !== fixture.end &&
          value !== fixture.link,
      )) {
        expect(
          mapped.fields.some(
            (field) =>
              (field.value.kind === "text" && field.value.value === value) ||
              (field.value.kind === "language" && field.value.name === value),
          ),
        ).toBe(true);
      }
      expect(
        mapped.fields.find((field) => field.value.kind === "date_range")?.value,
      ).toEqual({
        kind: "date_range",
        startDate: {
          year: Number(fixture.start),
          precision: "year",
          originalText: fixture.start,
        },
        endDate: {
          year: Number(fixture.end),
          precision: "year",
          originalText: fixture.end,
        },
        isOngoing: false,
      });
      expect(
        mapped.fields.find((field) => field.value.kind === "link")?.value,
      ).toMatchObject({
        kind: "link",
        url: new URL(fixture.link).toString(),
      });
      // Unreviewed source inventory must not mark fidelity predicates N/A.
      // Fixture truth, not the provider or detector, says these sections exist.
      expect(inventorySemanticV2SourceSections(context.request)).toEqual({
        summary: null,
        workExperience: null,
        education: null,
      });
      let id = 1;
      const nextId = () =>
        `20000000-0000-4000-8000-${String(id++).padStart(12, "0")}`;
      const draft = buildExtractionDraft({
        importedDocument: { ...context.document, validationStatus: "accepted" },
        fields: mapped.fields,
        warnings: mapped.warnings,
        missingOrUnprocessedSections: [],
        ids: { draftId: nextId, fieldId: nextId, warningId: nextId },
        now: new Date("2026-07-29T08:01:00.000Z"),
      });
      // Unknown language is also blocked by the domain threshold. Mapping
      // preserved the facts above; it does not mean a review draft is admitted.
      expect(draft).toMatchObject({ category: "no_supported_field" });
      expect(draft.draft).toBeUndefined();
      const gateInput = {
        responseCompletedReceived: true,
        semanticV2EnvelopeAccepted: canonical.ok,
        deterministicFallbackUsed: false,
        canonicalDraftProduced: draft.draft !== undefined,
        sourceSectionInventory: {
          summary: true,
          workExperience: true,
          education: true,
        },
        summaryFidelity: "intact" as const,
        educationFidelity: "intact" as const,
        workFidelity: "substantially_present" as const,
        noMaterialInvention: true,
        noMaterialTruncation: true,
        diagnostics: {
          warningCount: mapped.warnings.length,
          rejectedFieldCount: canonical.rejected.length,
          rejectionCategories: [],
        },
      };
      expect(evaluateSemanticBenchmarkGate(gateInput)).toMatchObject({
        overall: "FAIL",
        failures: ["canonical_draft_not_produced"],
      });
      expect(
        evaluateSemanticBenchmarkGate({
          ...gateInput,
          deterministicFallbackUsed: true,
        }).failures,
      ).toContain("deterministic_fallback_used");
    });

    it("still rejects production upload admission rather than advertising multilingual support", async () => {
      const context = await extractedFixture(fixture);
      const harness = createValidationHarness();
      addDocument(harness, context.document, context.bytes);
      const result = await validateOwned(harness, context.document.id);
      expect(result).toMatchObject({
        accepted: false,
        failure: { code: "unsupported_language" },
      });
      expect(JSON.stringify(harness.logs)).not.toContain(fixture.summary);
    });

    it("rejects translated, foreign-fragment and invented values even beside a translation instruction", async () => {
      const context = await extractedFixture(fixture, [fixture.instruction]);
      expect(context.request.normalizedTranscript.text).toContain(
        fixture.instruction.normalize("NFKC"),
      );
      context.response.sections.headline.value = "Senior software engineer";
      context.response.sections.summary.sourceRefs[0]!.fragmentId =
        "fragment-1";
      context.response.sections.skills.push({
        name: {
          value: "Kubernetes",
          sourceRefs: [{ fragmentId: "fragment-1", quote: "Kubernetes" }],
        },
      });
      const result = context.canonicalize();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.rejected.map((item) => item.code)).toEqual(
        expect.arrayContaining([
          "value_not_grounded",
          "quote_not_found_in_fragment",
        ]),
      );
      expect(
        result.candidates.some(
          (item) =>
            item.fieldPath === "headline" ||
            item.fieldPath === "summary" ||
            item.value === "Kubernetes",
        ),
      ).toBe(false);
      expect(
        result.candidates.find((item) => item.fieldPath === "contact.fullName")
          ?.value,
      ).toBe(fixture.name);
    });

    it("keeps the deterministic fallback partial and its accepted values grounded", async () => {
      const context = await extractedFixture(fixture);
      const input = {
        ...context.request,
        trigger: "no_provider" as const,
        alternativeProviderAvailable: false,
      };
      const outcome = runLimitedDeterministicPartialFallback(input);
      expect(outcome).toEqual(runLimitedDeterministicPartialFallback(input));
      expect(outcome.disclosure).toMatchObject({
        isPartial: true,
        notReliableFullSemanticParsing: true,
      });
      expect(outcome.recoveryActions).toContain("manual_entry");
      expect(outcome.acceptedCandidates.length).toBeGreaterThan(0);
      for (const candidate of outcome.acceptedCandidates) {
        expect([fixture.email, fixture.link]).toContain(candidate.value);
        expect(candidate.evidence).toHaveLength(1);
        for (const evidence of candidate.evidence) {
          const fragment = context.request.sourceFragments[evidence.line - 1]!;
          expect(fragment.text.slice(evidence.start, evidence.end)).toBe(
            candidate.value,
          );
        }
      }
    });

    it.each(fixture.localizedDates)(
      "handles localized date %s without guessing or dropping unrelated facts",
      async (date) => {
        const context = await extractedFixture(fixture, [date]);
        context.response.sections.workExperience[0]!.roles[0]!.startDate =
          context.atom(date.normalize("NFKC"));
        const result = context.canonicalize();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const acceptedNormalizedDate = acceptedLocalizedDate(date);
        const startDate = result.candidates.find((item) =>
          item.fieldPath.endsWith(".startDate"),
        );
        if (acceptedNormalizedDate === undefined) {
          expect(result.rejected).toContainEqual({
            path: ["sections", "workExperience", 0, "roles", 0, "startDate"],
            code: "unsupported_typed_value",
          });
          expect(startDate).toBeUndefined();
        } else {
          expect(startDate).toMatchObject({
            value: date.normalize("NFKC"),
            normalizedValue: acceptedNormalizedDate,
          });
        }
        expect(
          result.candidates.find((item) => item.fieldPath === "summary")?.value,
        ).toBe(fixture.summary.normalize("NFKC"));
        const mapped = mapSemanticV2CandidatesToDraft({
          ...result,
          document: context.document,
        });
        if (acceptedNormalizedDate === undefined) {
          expect(
            mapped.warnings.some((warning) => warning.requiresResolution),
          ).toBe(true);
        }
      },
    );
  },
);

function acceptedLocalizedDate(date: string): string | undefined {
  switch (date.normalize("NFKC")) {
    case "enero de 2021":
      return "2021-01";
    case "actualidad":
    case "حتى الآن":
      return "current";
    case "٢٠٢٠/٠٥":
      return "2020-05";
    case "2019年7月":
      return "2019-07";
    default:
      return undefined;
  }
}

it.each([
  ["Enero de 2020", "2020-01", { year: 2020, month: 1, precision: "month" }],
  ["septiembre 2021", "2021-09", { year: 2021, month: 9, precision: "month" }],
  ["diciembre ٢٠٢٢", "2022-12", { year: 2022, month: 12, precision: "month" }],
  ["actualidad", "current", { precision: "present" }],
  ["presente", "current", { precision: "present" }],
  ["حتى الآن", "current", { precision: "present" }],
  ["حاليًا", "current", { precision: "present" }],
  ["۲۰۲۱/۱۱", "2021-11", { year: 2021, month: 11, precision: "month" }],
  ["٢٠١٨", "2018", { year: 2018, precision: "year" }],
  ["2023年2月", "2023-02", { year: 2023, month: 2, precision: "month" }],
] as const)(
  "retains localized end date %s through typed draft mapping",
  async (date, normalizedValue, typed) => {
    const context = await extractedFixture(multilingualV2Fixtures[0]!, [date]);
    context.response.sections.workExperience[0]!.roles[0]!.endDate =
      context.atom(date);
    const result = context.canonicalize();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const candidate = result.candidates.find((item) =>
      item.fieldPath.endsWith(".endDate"),
    );
    expect(candidate).toMatchObject({
      value: date,
      normalizedValue,
      reviewStatus: "unreviewed",
    });
    const evidence = candidate!.evidence[0]!;
    expect(
      context.request.sourceFragments[evidence.line - 1]!.text.slice(
        evidence.start,
        evidence.end,
      ),
    ).toBe(date);
    const mapped = mapSemanticV2CandidatesToDraft({
      ...result,
      document: context.document,
    });
    expect(
      mapped.fields.find((field) => field.value.kind === "date_range")?.value,
    ).toMatchObject({
      endDate: { ...typed, originalText: date },
      isOngoing: normalizedValue === "current",
    });
  },
);

it.each([
  "03/04/2020",
  "٠٣/٠٤/٢٠٢٠",
  "2020/13",
  "2020年0月",
  "١٤٤٥/٠٩",
  "1445年9月",
  "2567/01",
  "令和5年4月",
  "2020年農暦7月",
  "มกราคม 2020",
  "२०२०/०५",
])(
  "rejects ambiguous, invalid or unsupported calendar/date %s with required review",
  async (date) => {
    const context = await extractedFixture(multilingualV2Fixtures[0]!, [date]);
    context.response.sections.workExperience[0]!.roles[0]!.endDate =
      context.atom(date);
    const result = context.canonicalize();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toContainEqual({
      path: ["sections", "workExperience", 0, "roles", 0, "endDate"],
      code: "unsupported_typed_value",
    });
    expect(
      result.candidates.some((item) => item.fieldPath.endsWith(".endDate")),
    ).toBe(false);
    const mapped = mapSemanticV2CandidatesToDraft({
      ...result,
      document: context.document,
    });
    expect(mapped.warnings).toContainEqual(
      expect.objectContaining({ requiresResolution: true }),
    );
    expect(
      result.candidates.find((item) => item.fieldPath === "summary")?.value,
    ).toBe(multilingualV2Fixtures[0]!.summary);
  },
);

it("keeps multilingual preservation and untrusted-source instructions provider-neutral", () => {
  expect(semanticParserInstructions).toContain(
    "never translate, transliterate, romanize, remove diacritics",
  );
  expect(semanticParserInstructions).toContain(
    "never reverse strings or reorder characters",
  );
  expect(semanticParserInstructions).toContain(
    "Application UI locale must never determine resume content",
  );
  expect(semanticParserInstructions).toContain(
    "do not translate month names, guess day/month ordering, convert calendars",
  );
});

it("distinguishes normalized UTF-16 offsets from raw DOCX offsets and code point positions", async () => {
  const fixture = multilingualV2Fixtures[0];
  // NFKC composes e + accent, expands a ligature, folds fullwidth Latin, and
  // collapses NBSP. The astral symbol takes two UTF-16 code units, not one.
  const raw = "🧭 e\u0301 ﬃ Ａ\u00a0ليلى — 中文";
  const context = await extractedFixture(fixture, [raw]);
  const physical = context.fragments.at(-1)!;
  expect(physical.text).toBe(raw);
  expect(physical.location).toMatchObject({
    characterOffsetStart: 0,
    characterOffsetEnd: 19,
  });
  const normalized = context.request.sourceFragments.at(-1)!;
  expect(normalized.text).toBe("🧭 é ffi A ليلى — 中文");
  expect(normalized.bounds).toMatchObject({ start: 0, end: 20 });
  const resolution = context.registry.resolve({
    fragmentId: `fragment-${normalized.order + 1}`,
    quote: "ليلى",
  });
  expect(resolution).toMatchObject({
    ok: true,
    quote: "ليلى",
    start: 11,
    end: 15,
  });
  if (!resolution.ok) return;
  expect(normalized.text.slice(resolution.start, resolution.end)).toBe("ليلى");
  expect(
    context.registry.resolve({
      fragmentId: `fragment-${normalized.order + 1}`,
      quote: "Layla",
    }),
  ).toEqual({ ok: false, reason: "quote_not_found_in_fragment" });
});
