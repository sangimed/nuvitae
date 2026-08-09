import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  DeterministicLanguageDetector,
  PdfJsPdfAdapter,
  type ExtractionSourceReader,
  type PdfPageText,
  type PdfTextItem,
} from "@nuvitae/extraction";
import {
  normalizeFixtureText,
  semanticParserFixtureInputs,
} from "@nuvitae/test-fixtures";
import { buildPdf } from "../../../packages/extraction/src/testing/test-document-builders.js";

/**
 * T248 deterministic offline proof for the canonical French PDF fixture.
 *
 * The canonical real-document fixture
 * (`tests/fixtures/resumes/anonymous-french-resume.pdf`) must be a valid,
 * single-page, selectable-text PDF whose deterministic extraction is
 * meaningful, classifies as French, and reproduces the pinned
 * `pdf-french-canonical-anonymous` semantic-evaluation corpus transcript
 * byte-for-byte. No OCR is used and no network access is required. Every
 * check here fails closed; the same checks are re-run by the sanitized
 * T248 evidence verifier in `spikes/codex-direct-oauth/`.
 */

const execFileAsync = promisify(execFile);
const fixturePath = "tests/fixtures/resumes/anonymous-french-resume.pdf";
const generatorPath =
  "tests/fixtures/resumes/generate-anonymous-french-resume.mjs";
const corpusFixtureId = "pdf-french-canonical-anonymous";

describe("T248 canonical French PDF fixture evaluation", () => {
  it("is a valid one-page PDF with meaningful selectable text and no OCR", async () => {
    await ensurePdfFixture();
    const metadata = await stat(fixturePath);
    expect(metadata.size).toBeGreaterThan(0);
    expect(metadata.size).toBeLessThan(100_000);

    const { pages, items, lines } = await extractFixture();
    expect(pages).toHaveLength(1);
    expect(items).toHaveLength(41);
    expect(lines).toHaveLength(21);

    // Every text item comes from the deterministic selectable-text path, so
    // no OCR (or image transcription) can be involved.
    for (const item of items) {
      expect(item.provenance.kind).toBe("pdf_text_item");
    }

    const joined = items.map((item) => item.text).join("\n");
    expect(joined).toContain("RÉSUMÉ");
    expect(joined).toContain("EXPÉRIENCE");
    expect(joined).toContain("FORMATION");
    expect(joined).toContain("COMPÉTENCES");
    expect(joined).toContain("LANGUES");
    expect(joined).toContain("CERTIFICATION");
  });

  it("classifies the canonical French PDF as French", async () => {
    await ensurePdfFixture();
    const { pages } = await extractFixture();
    const detector = new DeterministicLanguageDetector();
    const language = await detector.detectLanguage(request(), pages);

    expect(language).toMatchObject({
      ok: true,
      value: { language: "french" },
    });
    if (!language.ok) return;
    expect(["high", "medium"]).toContain(language.value.confidence);
  });

  it("reproduces the pinned semantic-evaluation corpus transcript byte-for-byte", async () => {
    await ensurePdfFixture();
    const corpus = semanticParserFixtureInputs[corpusFixtureId];
    expect(corpus).toBeDefined();
    if (corpus === undefined) return;

    const { lines } = await extractFixture();
    const normalized = lines.map((line) => normalizeFixtureText(line));

    expect(normalized).toEqual(
      corpus.fragments.map((fragment) => fragment.text),
    );
    expect(transcriptSha256(normalized)).toBe(corpus.transcript.sha256);
    expect(corpus.transcript.lineCount).toBe(normalized.length);
    expect(corpus.formatMetadata).toMatchObject({
      sourceFormat: "pdf",
      extractionMode: "selectable_text",
      renderedPageCount: 1,
    });
  });

  it("is deterministic and idempotent offline", async () => {
    await ensurePdfFixture();
    const first = await extractFixture();
    const second = await extractFixture();

    expect(JSON.stringify(first.pages)).toBe(JSON.stringify(second.pages));
    expect(transcriptSha256(first.lines)).toBe(transcriptSha256(second.lines));
    await expect(fixtureSha256()).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when the fixture is missing", async () => {
    const adapter = fileAdapter();
    const result = await adapter.extractSelectableText({
      ...request(),
      sourceStorageKey: "tests/fixtures/resumes/does-not-exist.pdf",
    });
    expect(result.ok).toBe(false);
  });

  it("fails closed on a malformed PDF", async () => {
    const adapter = bytesAdapter(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
    );
    const result = await adapter.extractSelectableText(request());
    expect(result.ok).toBe(false);
  });

  it("fails closed on an empty-text PDF", async () => {
    const empty = await buildPdf({ pages: [[]] });
    const adapter = bytesAdapter(empty);
    const result = await adapter.extractSelectableText(request());
    expect(result).toMatchObject({
      ok: false,
      error: { category: "scanned_or_image_only" },
    });
  });

  it("fails closed on an image-only PDF", async () => {
    const imageOnly = await buildPdf({ pages: [[]], imageOnPages: [0] });
    const adapter = bytesAdapter(imageOnly);
    const result = await adapter.extractSelectableText(request());
    expect(result).toMatchObject({
      ok: false,
      error: { category: "scanned_or_image_only" },
    });
  });

  it("fails closed on an encrypted/password-protected PDF", async () => {
    const protectedPdf = await buildPdf({
      pages: [["Professional experience and education with team skills"]],
      password: "synthetic-password",
    });
    const adapter = bytesAdapter(protectedPdf);
    const result = await adapter.extractSelectableText(request());
    expect(result).toMatchObject({
      ok: false,
      error: { category: "password_protected" },
    });
  });

  it("does not classify non-French content as French", async () => {
    await ensurePdfFixture();
    const english =
      "Professional experience and education with skills developed for the company team. Managed project responsibilities and built systems with colleagues for many years.";
    const detector = new DeterministicLanguageDetector();
    const result = await detector.detectLanguage(
      request(),
      pdfPagesWith([english]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { language: "english" },
    });
  });

  it("detects tampering of the pinned corpus transcript", async () => {
    await ensurePdfFixture();
    const { lines } = await extractFixture();
    const tampered = [...lines];
    tampered[tampered.length - 1] = "ABSENT : valeur modifiée.";

    expect(transcriptMatchesCorpus(tampered)).toBe(false);
    expect(transcriptMatchesCorpus(lines)).toBe(true);
  });
});

async function extractFixture(): Promise<{
  pages: readonly PdfPageText[];
  items: readonly PdfTextItem[];
  lines: readonly string[];
}> {
  const adapter = new PdfJsPdfAdapter(fileReader(), {
    maximumFileSizeBytes: 100_000,
    maximumPageCount: 5,
  });
  const result = await adapter.extractSelectableText(request());
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return { pages: [], items: [], lines: [] };
  }
  const pages = result.value;
  const items = pages.flatMap((page) => page.items);
  const lines = items
    .map((item) => item.text.trim())
    .filter((line) => line.length > 0);
  return { pages, items, lines };
}

function transcriptMatchesCorpus(lines: readonly string[]): boolean {
  const corpus = semanticParserFixtureInputs[corpusFixtureId];
  if (corpus === undefined) return false;
  const normalized = lines.map((line) => normalizeFixtureText(line));
  if (
    JSON.stringify(normalized) !==
    JSON.stringify(corpus.fragments.map((f) => f.text))
  ) {
    return false;
  }
  return transcriptSha256(normalized) === corpus.transcript.sha256;
}

function transcriptSha256(lines: readonly string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function fixtureSha256(): Promise<string> {
  const bytes = await readFile(fixturePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function request() {
  return {
    importId: "00000000-0000-4000-8000-000000000601",
    ownerUserId: "00000000-0000-4000-8000-000000000602",
    sourceStorageKey: fixturePath,
    format: "pdf" as const,
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

function bytesAdapter(bytes: Uint8Array): PdfJsPdfAdapter {
  return new PdfJsPdfAdapter(
    {
      async readSource(input) {
        return bytes.byteLength > input.maximumBytes
          ? bytes.subarray(0, input.maximumBytes + 1)
          : bytes;
      },
    },
    { maximumFileSizeBytes: 100_000, maximumPageCount: 5 },
  );
}

function fileAdapter(): PdfJsPdfAdapter {
  return new PdfJsPdfAdapter(fileReader(), {
    maximumFileSizeBytes: 100_000,
    maximumPageCount: 5,
  });
}

function pdfPagesWith(lines: readonly string[]): readonly PdfPageText[] {
  return [
    {
      pageNumber: 1,
      pageReadingOrder: 0,
      items: lines.map((text, index) => ({
        text,
        provenance: {
          kind: "pdf_text_item",
          pageNumber: 1,
          itemIndex: index,
          readingOrder: index,
          boundingBox: {
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            unit: "pdf_point",
          },
        },
      })),
    },
  ];
}

async function ensurePdfFixture(): Promise<void> {
  try {
    await access(fixturePath);
  } catch {
    await execFileAsync(process.execPath, [generatorPath]);
  }
}
