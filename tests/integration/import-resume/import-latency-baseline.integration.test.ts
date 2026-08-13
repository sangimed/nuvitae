import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DeterministicLanguageDetector,
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  fragmentsFromDocx,
  fragmentsFromPdf,
  type DocxParagraph,
  type ExtractionRequest,
  type ExtractionSourceReader,
  type PdfPageText,
} from "@nuvitae/extraction";
import { createDeterministicSemanticParserProvider } from "@nuvitae/import-application/testing";
import type { ImportedDocument } from "@nuvitae/domain";
import { buildSemanticParseRequest } from "../../../apps/worker/src/import-resume/build-semantic-parse-request.js";
import { auditProviderRequestShape } from "../../../packages/import-application/src/providers/provider-payload-shape-audit.js";
import { semanticParserInstructions } from "../../../packages/import-application/src/validation/semantic-parser-instructions.js";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const fixtureDirectory = resolve(process.cwd(), "tests/fixtures/resumes");
const fixtureDefinitions = [
  {
    id: "simple-1-page-pdf",
    filename: "anonymous-selectable-resume.pdf",
    format: "pdf" as const,
  },
  {
    id: "realistic-2-page-pdf",
    filename: "anonymous-realistic-2-page-resume.pdf",
    format: "pdf" as const,
  },
  {
    id: "docx",
    filename: "semantic-vertical-slice-maya-chen.docx",
    format: "docx" as const,
  },
  {
    id: "supported-complex-layout",
    filename: "anonymous-bilingual-resume.pdf",
    format: "pdf" as const,
  },
];

const sourceReader: ExtractionSourceReader = {
  async readSource(input) {
    const bytes = await readFile(input.sourceStorageKey);
    return bytes.byteLength > input.maximumBytes
      ? bytes.subarray(0, input.maximumBytes + 1)
      : bytes;
  },
};

const pdfAdapter = new PdfJsPdfAdapter(sourceReader, {
  maximumFileSizeBytes: 10 * 1024 * 1024,
  maximumPageCount: 5,
});
const docxAdapter = new OoxmlDocxAdapter(sourceReader, {
  maximumArchiveSizeBytes: 10 * 1024 * 1024,
  maximumEntryCount: 200,
  maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
  maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
  maximumCompressionRatio: 200,
  maximumXmlDepth: 80,
});
const languageDetector = new DeterministicLanguageDetector();
const deterministicProvider = createDeterministicSemanticParserProvider();

describe("offline import latency baseline", () => {
  it("measures deterministic stages without making provider/network calls", async () => {
    const results = [] as Array<{
      readonly fixtureId: string;
      readonly format: "pdf" | "docx";
      readonly inputBytes: number;
      readonly renderedPageCount: number | undefined;
      readonly language: string;
      readonly fragmentCount: number;
      readonly provider: {
        readonly kind: "deterministic_local";
        readonly outcome: string;
      };
      readonly requestShape: ReturnType<typeof auditProviderRequestShape>;
      readonly stageSamplesMs: ReturnType<typeof summarizeStages>;
    }>;
    for (const fixture of fixtureDefinitions) {
      const samples = [] as Awaited<ReturnType<typeof measureFixture>>[];
      for (let sample = 0; sample < 3; sample += 1) {
        samples.push(await measureFixture(fixture));
      }
      const first = samples[0]!;
      results.push({
        fixtureId: first.fixtureId,
        format: first.format,
        inputBytes: first.inputBytes,
        renderedPageCount: first.renderedPageCount,
        language: first.language,
        fragmentCount: first.fragmentCount,
        provider: {
          kind: first.provider.kind,
          outcome: first.provider.outcome,
        },
        requestShape: first.requestShape,
        stageSamplesMs: summarizeStages(samples),
      });
    }

    expect(results).toHaveLength(4);
    expect(results.map((result) => result.fixtureId)).toEqual(
      fixtureDefinitions.map((fixture) => fixture.id),
    );
    for (const result of results) {
      for (const stage of Object.values(result.stageSamplesMs)) {
        expect(stage.p50Ms).toBeGreaterThanOrEqual(0);
        expect(stage.p95Ms).toBeGreaterThanOrEqual(stage.p50Ms);
      }
      expect(result.inputBytes).toBeGreaterThan(0);
    }
    // The deterministic provider is a local test double. It must never be
    // mistaken for a live provider baseline.
    expect(
      results.every((result) => result.provider.kind === "deterministic_local"),
    ).toBe(true);
    console.log(
      JSON.stringify({
        benchmark: "import-resume-latency-offline",
        providerActivity: "none",
        fixtures: results,
      }),
    );
  });
});

async function measureFixture(fixture: (typeof fixtureDefinitions)[number]) {
  const path = resolve(fixtureDirectory, fixture.filename);
  const bytes = await readFile(path);
  const request: ExtractionRequest = {
    importId: "22222222-2222-4222-8222-222222222222",
    ownerUserId,
    sourceStorageKey: path,
    format: fixture.format,
  };
  const document = documentFor(fixture, path, bytes.byteLength);

  const validationStarted = now();
  const validation =
    fixture.format === "pdf"
      ? await validatePdf(request)
      : await validateDocx(request);
  const validationMs = elapsedMs(validationStarted);
  if (!validation.ok) throw new Error(`${fixture.id}: validation failed`);

  const extractionStarted = now();
  const extracted =
    fixture.format === "pdf"
      ? await pdfAdapter.extractSelectableText(request)
      : await docxAdapter.extractText(request);
  const extractionMs = elapsedMs(extractionStarted);
  if (!extracted.ok) throw new Error(`${fixture.id}: extraction failed`);

  const normalizationStarted = now();
  const fragments =
    fixture.format === "pdf"
      ? fragmentsFromPdf(extracted.value as readonly PdfPageText[])
      : fragmentsFromDocx(extracted.value as readonly DocxParagraph[]);
  const normalizationMs = elapsedMs(normalizationStarted);

  const requestStarted = now();
  const semanticRequest = buildSemanticParseRequest(
    {
      ...document,
      detectedLanguage: validation.language,
      ...(validation.renderedPageCount === undefined
        ? {}
        : { renderedPageCount: validation.renderedPageCount }),
    },
    fragments,
    document.id,
  );
  const requestSetupMs = elapsedMs(requestStarted);

  const providerStarted = now();
  const providerResult = await deterministicProvider.parse(semanticRequest);
  const providerMs = elapsedMs(providerStarted);

  return {
    fixtureId: fixture.id,
    format: fixture.format,
    inputBytes: bytes.byteLength,
    renderedPageCount: validation.renderedPageCount,
    language: validation.language,
    fragmentCount: fragments.length,
    provider: {
      kind: "deterministic_local" as const,
      outcome: providerResult.ok ? "accepted" : providerResult.error.code,
      durationMs: providerMs,
    },
    requestShape: auditProviderRequestShape({
      request: semanticRequest,
      instructions: `${semanticParserInstructions} Use minified JSON serialization.`,
    }),
    stages: {
      validationMs,
      extractionMs,
      normalizationMs,
      requestSetupMs,
      providerMs,
    },
  };
}

function summarizeStages(
  samples: readonly Awaited<ReturnType<typeof measureFixture>>[],
) {
  const stageNames = [
    "validationMs",
    "extractionMs",
    "normalizationMs",
    "requestSetupMs",
    "providerMs",
  ] as const;
  return Object.fromEntries(
    stageNames.map((stage) => {
      const values = samples
        .map((sample) => sample.stages[stage])
        .sort((a, b) => a - b);
      return [
        stage,
        {
          p50Ms: values[Math.floor(values.length / 2)]!,
          p95Ms:
            values[
              Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)
            ]!,
        },
      ];
    }),
  ) as Record<(typeof stageNames)[number], { p50Ms: number; p95Ms: number }>;
}

async function validatePdf(request: ExtractionRequest) {
  const pageCount = await pdfAdapter.countPages(request);
  const text = await pdfAdapter.extractSelectableText(request);
  if (!pageCount.ok || !text.ok) return { ok: false as const };
  const detection = await languageDetector.detectLanguage(request, text.value);
  if (!detection.ok) return { ok: false as const };
  return {
    ok: true as const,
    renderedPageCount: pageCount.value.renderedPageCount,
    language: detection.value.language,
  };
}

async function validateDocx(request: ExtractionRequest) {
  const text = await docxAdapter.extractText(request);
  if (!text.ok) return { ok: false as const };
  const detection = await languageDetector.detectLanguage(request, text.value);
  if (!detection.ok) return { ok: false as const };
  return {
    ok: true as const,
    // LibreOffice rendered-page counting is intentionally separate from this
    // workspace benchmark; the worker-only parser boundary is measured in the
    // bounded Docker validation run rather than faked here.
    renderedPageCount: undefined,
    language: detection.value.language,
  };
}

function documentFor(
  fixture: (typeof fixtureDefinitions)[number],
  path: string,
  sizeBytes: number,
): ImportedDocument {
  const now = new Date("2026-08-12T10:00:00.000Z");
  return {
    id: "22222222-2222-4222-8222-222222222222",
    ownerUserId,
    visibleFilename: fixture.filename,
    contentType:
      fixture.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileExtension: fixture.format,
    sizeBytes,
    storageKey: path,
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
}

function now(): bigint {
  return process.hrtime.bigint();
}

function elapsedMs(started: bigint): number {
  return Number(process.hrtime.bigint() - started) / 1_000_000;
}
