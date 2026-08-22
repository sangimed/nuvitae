import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DeterministicLanguageDetector,
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  scanTextForHostileContent,
  type ExtractionSourceReader,
} from "@nuvitae/extraction";
import { resumeImportFixtureSpecs } from "@nuvitae/test-fixtures";

const reader: ExtractionSourceReader = {
  async readSource({ sourceStorageKey, maximumBytes }) {
    const bytes = await readFile(sourceStorageKey);
    return bytes.byteLength > maximumBytes
      ? bytes.subarray(0, maximumBytes + 1)
      : bytes;
  },
};

const pdf = new PdfJsPdfAdapter(reader, {
  maximumFileSizeBytes: 10 * 1024 * 1024,
  maximumPageCount: 5,
});
const docx = new OoxmlDocxAdapter(reader, {
  maximumArchiveSizeBytes: 10 * 1024 * 1024,
  maximumEntryCount: 200,
  maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
  maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
  maximumCompressionRatio: 200,
  maximumXmlDepth: 80,
});

describe("deterministic binary resume-import core corpus", () => {
  it.each([
    ["pdf-english-complete", "english"],
    ["docx-french-complete", "french"],
    ["pdf-bilingual-partial", "bilingual_french_english"],
    ["docx-unsupported-language-contact", "unsupported"],
  ] as const)(
    "extracts %s with source provenance, semantic invariants, and language eligibility",
    async (fixtureId, expectedLanguage) => {
      const spec = fixture(fixtureId);
      const request = {
        importId: "00000000-0000-4000-8000-000000000037",
        ownerUserId: "00000000-0000-4000-8000-000000000038",
        sourceStorageKey: spec.outputPath,
        format: spec.format,
      };
      const result =
        spec.format === "pdf"
          ? await pdf.extractSelectableText(request)
          : await docx.extractText(request);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const items: {
        readonly text: string;
        readonly provenance: { readonly kind: string };
      }[] = [];
      for (const container of result.value) {
        if ("items" in container) items.push(...container.items);
        else items.push(...container.runs);
      }
      const transcript = items.map((item) => item.text).join(" ");
      const truth = spec.oracle.semantic!;
      expect(transcript).toContain(truth.contact.name);
      expect(transcript).toContain(truth.employers[0]);
      expect(transcript).toContain(truth.skills[0]);
      expect(
        items.every((item) =>
          spec.format === "pdf"
            ? item.provenance.kind === "pdf_text_item"
            : item.provenance.kind === "docx_run",
        ),
      ).toBe(true);

      const detector = new DeterministicLanguageDetector();
      const language = await detector.detectLanguage(request, result.value);
      expect(language.ok).toBe(true);
      if (language.ok) expect(language.value.language).toBe(expectedLanguage);
    },
  );

  it.each([
    ["pdf-oversized", "resource_limit"],
    ["pdf-malformed", "malformed"],
    ["pdf-password-protected", "password_protected"],
    ["pdf-image-only-scanned", "scanned_or_image_only"],
  ] as const)(
    "classifies destructive PDF %s as %s",
    async (fixtureId, category) => {
      const spec = fixture(fixtureId);
      const result = await pdf.extractSelectableText({
        importId: "00000000-0000-4000-8000-000000000037",
        ownerUserId: "00000000-0000-4000-8000-000000000038",
        sourceStorageKey: spec.outputPath,
        format: "pdf",
      });
      expect(result).toMatchObject({ ok: false, error: { category } });
    },
  );

  it("classifies the deterministically corrupted DOCX package", async () => {
    const spec = fixture("docx-corrupted");
    const result = await docx.extractText({
      importId: "00000000-0000-4000-8000-000000000037",
      ownerUserId: "00000000-0000-4000-8000-000000000038",
      sourceStorageKey: spec.outputPath,
      format: "docx",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { category: "corrupted" },
    });
  });

  it("keeps instruction-like resume text untrusted and detectable", async () => {
    const spec = fixture("docx-hostile");
    const result = await docx.extractText({
      importId: "00000000-0000-4000-8000-000000000037",
      ownerUserId: "00000000-0000-4000-8000-000000000038",
      sourceStorageKey: spec.outputPath,
      format: "docx",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const transcript = result.value
      .flatMap((paragraph) => paragraph.runs)
      .map((run) => run.text)
      .join(" ");
    expect(scanTextForHostileContent(transcript)).toContain("prompt_injection");
    expect(transcript).toContain("Ignore previous instructions");
  });
});

function fixture(fixtureId: string) {
  const spec = resumeImportFixtureSpecs.find(
    (candidate) => candidate.fixtureId === fixtureId,
  );
  if (spec === undefined) throw new Error(`Missing fixture spec: ${fixtureId}`);
  return spec;
}
