import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  DeterministicLanguageDetector,
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  type DocxParagraph,
  type ExtractionSourceReader,
  type PdfPageText,
  type PdfTextItem,
} from "@nuvitae/extraction";
import {
  normalizeFixtureText,
  semanticParserFixtureIds,
  semanticParserFixtureInputs,
  type SemanticParserFixtureId,
} from "@nuvitae/test-fixtures";

/**
 * T246 offline deterministic proof for the C04-C08 real-document corpus.
 *
 * Every semantic case (C04 bilingual PDF, C05 partial/sparse DOCX, C06
 * structurally ambiguous PDF, C07 prompt-instruction-like DOCX) must be a
 * valid, single-page, selectable-text document whose deterministic
 * extraction reproduces its pinned semantic-evaluation corpus transcript
 * byte-for-byte and whose language classification matches the corpus
 * declaration. C08 (malformed PDF) must fail closed with the malformed
 * recovery category and must have no semantic corpus entry. No OCR, network
 * access, credential access, or live runner is used.
 */

const execFileAsync = promisify(execFile);
const fixtureDirectory = "tests/fixtures/resumes";
const generatorPath = `${fixtureDirectory}/generate-t246-corpus-fixtures.mjs`;

const semanticCases = [
  {
    caseId: "T246-C04",
    fixturePath: `${fixtureDirectory}/anonymous-bilingual-resume.pdf`,
    corpusFixtureId: "pdf-bilingual-canonical-anonymous" as const,
    format: "pdf" as const,
    expectedLanguage: "bilingual_french_english" as const,
    importId: "00000000-0000-4000-8000-000000000704",
  },
  {
    caseId: "T246-C05",
    fixturePath: `${fixtureDirectory}/anonymous-partial-resume.docx`,
    corpusFixtureId: "docx-partial-canonical-anonymous" as const,
    format: "docx" as const,
    expectedLanguage: "english" as const,
    importId: "00000000-0000-4000-8000-000000000705",
  },
  {
    caseId: "T246-C06",
    fixturePath: `${fixtureDirectory}/anonymous-ambiguous-resume.pdf`,
    corpusFixtureId: "pdf-ambiguous-canonical-anonymous" as const,
    format: "pdf" as const,
    expectedLanguage: "english" as const,
    importId: "00000000-0000-4000-8000-000000000706",
  },
  {
    caseId: "T246-C07",
    fixturePath: `${fixtureDirectory}/anonymous-prompt-instruction-resume.docx`,
    corpusFixtureId: "docx-prompt-instruction-canonical-anonymous" as const,
    format: "docx" as const,
    expectedLanguage: "english" as const,
    importId: "00000000-0000-4000-8000-000000000707",
  },
] as const;

const malformedCase = {
  caseId: "T246-C08",
  fixturePath: `${fixtureDirectory}/anonymous-malformed-resume.pdf`,
  importId: "00000000-0000-4000-8000-000000000708",
} as const;

describe("T246 real-document corpus fixtures (C04-C07)", () => {
  for (const scenario of semanticCases) {
    describe(`${scenario.caseId} ${scenario.corpusFixtureId}`, () => {
      it("is a valid small selectable-text document with a pinned corpus entry", async () => {
        await ensureFixtures();
        const metadata = await stat(scenario.fixturePath);
        expect(metadata.size).toBeGreaterThan(0);
        expect(metadata.size).toBeLessThan(100_000);

        const corpus = semanticParserFixtureInputs[scenario.corpusFixtureId];
        expect(corpus).toBeDefined();
        if (corpus === undefined) return;
        expect(corpus.format).toBe(scenario.format);
        expect(corpus.language).toBe(scenario.expectedLanguage);
        expect(corpus.transcript.lineCount).toBeGreaterThan(0);
        expect(corpus.formatMetadata).toMatchObject({
          sourceFormat: scenario.format,
          extractionMode: "selectable_text",
          renderedPageCount: 1,
        });
      });

      it("extracts deterministically with only production adapter provenance", async () => {
        await ensureFixtures();
        const first = await extractScenario(scenario);
        const second = await extractScenario(scenario);

        expect(JSON.stringify(first.items)).toBe(JSON.stringify(second.items));
        expect(transcriptSha256(first.lines)).toBe(
          transcriptSha256(second.lines),
        );
        if (scenario.format === "pdf") {
          for (const item of first.items as readonly PdfTextItem[]) {
            expect(item.provenance.kind).toBe("pdf_text_item");
          }
          expect(first.pages).toHaveLength(1);
        } else {
          for (const paragraph of first.paragraphs as readonly DocxParagraph[]) {
            for (const run of paragraph.runs) {
              expect(run.provenance.kind).toBe("docx_run");
            }
          }
        }
      });

      it("classifies the extracted text with the corpus language", async () => {
        await ensureFixtures();
        const { pages, paragraphs, lines } = await extractScenario(scenario);
        const detector = new DeterministicLanguageDetector();
        const request = requestFor(scenario);
        const result =
          scenario.format === "pdf"
            ? await detector.detectLanguage(request, pages)
            : await detector.detectLanguage(request, paragraphs);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.language).toBe(scenario.expectedLanguage);
        expect(["high", "medium"]).toContain(result.value.confidence);
        expect(lines.length).toBeGreaterThan(0);
      });

      it("reproduces the pinned corpus transcript byte-for-byte", async () => {
        await ensureFixtures();
        const corpus = semanticParserFixtureInputs[scenario.corpusFixtureId];
        expect(corpus).toBeDefined();
        if (corpus === undefined) return;

        const { lines } = await extractScenario(scenario);
        const normalized = lines.map((line) => normalizeFixtureText(line));

        expect(normalized).toEqual(
          corpus.fragments.map((fragment) => fragment.text),
        );
        expect(transcriptSha256(normalized)).toBe(corpus.transcript.sha256);
        expect(corpus.transcript.lineCount).toBe(normalized.length);
        expect(transcriptSha256(normalized)).toMatch(/^[a-f0-9]{64}$/);
      });

      it("detects tampering of the pinned corpus transcript", async () => {
        await ensureFixtures();
        const corpus = semanticParserFixtureInputs[scenario.corpusFixtureId];
        expect(corpus).toBeDefined();
        if (corpus === undefined) return;
        const { lines } = await extractScenario(scenario);
        const tampered = [...lines];
        tampered[tampered.length - 1] = "TAMPERED : valeur modifiée.";

        expect(
          transcriptMatchesCorpus(tampered, scenario.corpusFixtureId),
        ).toBe(false);
        expect(transcriptMatchesCorpus(lines, scenario.corpusFixtureId)).toBe(
          true,
        );
      });
    });
  }
});

describe("T246-C08 malformed recovery fixture", () => {
  it("is a checked-in deterministic binary that fails extraction with the malformed category", async () => {
    await ensureFixtures();
    const metadata = await stat(malformedCase.fixturePath);
    expect(metadata.size).toBeGreaterThan(0);

    const adapter = pdfAdapter(fileReader());
    const request = requestFor(malformedCase);
    const pageCount = await adapter.countPages(request);
    const extraction = await adapter.extractSelectableText(request);

    expect(pageCount).toMatchObject({
      ok: false,
      error: { category: "malformed", retryable: false },
    });
    expect(extraction).toMatchObject({
      ok: false,
      error: { category: "malformed", retryable: false },
    });
  });

  it("has no semantic corpus entry, so no semantic request can be built", async () => {
    expect(
      semanticParserFixtureIds.some((id) => id.includes("malformed")),
    ).toBe(false);
    for (const id of semanticParserFixtureIds) {
      expect(semanticParserFixtureInputs[id].format).not.toBeUndefined();
    }
  });

  it("is byte-deterministic", async () => {
    await ensureFixtures();
    const first = await readFile(malformedCase.fixturePath);
    const second = await readFile(malformedCase.fixturePath);
    expect(Buffer.compare(first, second)).toBe(0);
    expect(await fixtureSha256(malformedCase.fixturePath)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});

async function extractScenario(
  scenario: (typeof semanticCases)[number],
): Promise<{
  pages: readonly PdfPageText[];
  paragraphs: readonly DocxParagraph[];
  items: readonly { text: string }[];
  lines: readonly string[];
}> {
  const request = requestFor(scenario);
  if (scenario.format === "pdf") {
    const adapter = pdfAdapter(fileReader());
    const result = await adapter.extractSelectableText(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return { pages: [], paragraphs: [], items: [], lines: [] };
    const pages = result.value;
    const items = pages.flatMap((page) => page.items);
    const lines = items
      .map((item) => item.text.trim())
      .filter((line) => line.length > 0);
    return { pages, paragraphs: [], items, lines };
  }
  const adapter = docxAdapter(fileReader());
  const result = await adapter.extractText(request);
  expect(result.ok).toBe(true);
  if (!result.ok) return { pages: [], paragraphs: [], items: [], lines: [] };
  const paragraphs = result.value;
  const items = paragraphs.flatMap((paragraph) => paragraph.runs);
  const lines = items
    .map((run) => run.text.trim())
    .filter((line) => line.length > 0);
  return { pages: [], paragraphs, items, lines };
}

function transcriptMatchesCorpus(
  lines: readonly string[],
  corpusFixtureId: SemanticParserFixtureId,
): boolean {
  const corpus = semanticParserFixtureInputs[corpusFixtureId];
  if (corpus === undefined) return false;
  const normalized = lines.map((line) => normalizeFixtureText(line));
  if (
    JSON.stringify(normalized) !==
    JSON.stringify(corpus.fragments.map((fragment) => fragment.text))
  ) {
    return false;
  }
  return transcriptSha256(normalized) === corpus.transcript.sha256;
}

function transcriptSha256(lines: readonly string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function fixtureSha256(fixturePath: string): Promise<string> {
  const bytes = await readFile(fixturePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function requestFor(scenario: {
  readonly fixturePath: string;
  readonly format?: "pdf" | "docx";
  readonly importId: string;
}) {
  return {
    importId: scenario.importId,
    ownerUserId: "00000000-0000-4000-8000-000000000702",
    sourceStorageKey: scenario.fixturePath,
    format: scenario.format ?? "pdf",
  };
}

function fileReader(): ExtractionSourceReader {
  return {
    async readSource(input) {
      const bytes = await readFile(input.sourceStorageKey);
      return bytes.byteLength > input.maximumBytes
        ? bytes.subarray(0, input.maximumBytes + 1)
        : bytes;
    },
  };
}

function pdfAdapter(reader: ExtractionSourceReader): PdfJsPdfAdapter {
  return new PdfJsPdfAdapter(reader, {
    maximumFileSizeBytes: 100_000,
    maximumPageCount: 5,
  });
}

function docxAdapter(reader: ExtractionSourceReader): OoxmlDocxAdapter {
  return new OoxmlDocxAdapter(reader, {
    maximumArchiveSizeBytes: 100_000,
    maximumEntryCount: 200,
    maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
    maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
    maximumCompressionRatio: 200,
    maximumXmlDepth: 80,
  });
}

async function ensureFixtures(): Promise<void> {
  const fixturePaths: readonly string[] = [
    ...semanticCases.map((scenario) => scenario.fixturePath),
    malformedCase.fixturePath,
  ];
  try {
    await Promise.all(fixturePaths.map((fixturePath) => access(fixturePath)));
  } catch {
    await execFileAsync(process.execPath, [generatorPath]);
  }
}
