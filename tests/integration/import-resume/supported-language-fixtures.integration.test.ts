import {
  DeterministicLanguageDetector,
  type DocxParagraph,
  type PdfPageText,
} from "@nuvitae/extraction";
import { describe, expect, it } from "vitest";
import {
  buildDocx,
  buildPdf,
  documentXml,
  paragraphXml,
} from "../../../packages/extraction/src/testing/test-document-builders.js";
import {
  addDocument,
  createValidationHarness,
  importedDocument,
  validateOwned,
} from "./validation-test-harness.js";

const english =
  "Professional experience and education with skills developed for the company team. Managed project responsibilities and built systems with colleagues for many years.";
const french =
  "Expérience professionnelle et éducation avec des compétences pour une équipe. Gestion de projet et responsabilités dans une entreprise avec plusieurs ans de travail.";
const bilingual = `${english} ${french}`;
const unsupported =
  "Experiencia profesional y educación con habilidades para el trabajo. Proyecto desarrollado con equipo y responsabilidades durante muchos años.";

describe("supported language fixtures", () => {
  it.each([
    ["French PDF", "pdf" as const, french, "french"],
    ["English PDF", "pdf" as const, english, "english"],
    ["bilingual PDF", "pdf" as const, bilingual, "bilingual_french_english"],
    ["French DOCX", "docx" as const, french, "french"],
    ["English DOCX", "docx" as const, english, "english"],
    ["bilingual DOCX", "docx" as const, bilingual, "bilingual_french_english"],
  ])("accepts %s", async (_name, format, text, detectedLanguage) => {
    const harness = createValidationHarness();
    const source =
      format === "pdf"
        ? await buildPdf({ pages: [[text]] })
        : await buildDocx({
            documentXml: documentXml(paragraphXml(`<w:t>${text}</w:t>`)),
          });
    const document = importedDocument({
      id:
        format === "pdf"
          ? "00000000-0000-4000-8000-000000000501"
          : "00000000-0000-4000-8000-000000000502",
      source,
      format,
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: true,
      detectedLanguage,
    });
  });

  it("returns unknown for insufficient text and rejects it conservatively", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({ pages: [["Short profile"]] });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000503",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: false,
      detectedLanguage: "unknown",
      failure: { code: "unsupported_language" },
    });
  });

  it("returns unsupported for strong unsupported-language evidence", async () => {
    const detector = new DeterministicLanguageDetector();
    const result = await detector.detectLanguage(
      request(),
      pdfText(unsupported),
    );
    expect(result).toEqual({
      ok: true,
      value: { language: "unsupported", confidence: "high" },
    });
  });

  it("ignores obvious URLs, email addresses, phone numbers, and punctuation", async () => {
    const noisy =
      `${english} https://example.test/experience ` +
      "synthetic.person@example.test +33 (0) 1 23 45 67 89 !!!";
    const detector = new DeterministicLanguageDetector();

    await expect(
      detector.detectLanguage(request(), docxText(noisy)),
    ).resolves.toMatchObject({
      ok: true,
      value: { language: "english" },
    });
  });

  it("returns deterministic repeated results for PDF pages and DOCX paragraphs", async () => {
    const detector = new DeterministicLanguageDetector();
    const firstPdf = await detector.detectLanguage(request(), pdfText(french));
    const secondPdf = await detector.detectLanguage(request(), pdfText(french));
    const firstDocx = await detector.detectLanguage(
      { ...request(), format: "docx" },
      docxText(french),
    );
    const secondDocx = await detector.detectLanguage(
      { ...request(), format: "docx" },
      docxText(french),
    );

    expect(firstPdf).toEqual(secondPdf);
    expect(firstDocx).toEqual(secondDocx);
  });

  it("requires meaningful evidence of both languages for bilingual", async () => {
    const detector = new DeterministicLanguageDetector();
    const borrowedWord = await detector.detectLanguage(
      request(),
      pdfText(`${english} français`),
    );
    const meaningful = await detector.detectLanguage(
      request(),
      pdfText(bilingual),
    );

    expect(borrowedWord).toMatchObject({
      ok: true,
      value: { language: "english" },
    });
    expect(meaningful).toMatchObject({
      ok: true,
      value: { language: "bilingual_french_english" },
    });
  });
});

const request = () => ({
  importId: "00000000-0000-4000-8000-000000000510",
  ownerUserId: "00000000-0000-4000-8000-000000000511",
  sourceStorageKey: "opaque-language-source",
  format: "pdf" as const,
});

function pdfText(text: string): readonly PdfPageText[] {
  return [
    {
      pageNumber: 1,
      pageReadingOrder: 0,
      items: [
        {
          text,
          provenance: {
            kind: "pdf_text_item",
            pageNumber: 1,
            itemIndex: 0,
            readingOrder: 0,
            boundingBox: {
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              unit: "pdf_point",
            },
          },
        },
      ],
    },
  ];
}

function docxText(text: string): readonly DocxParagraph[] {
  return [
    {
      packagePart: "word/document.xml",
      paragraphIndex: 0,
      readingOrder: 0,
      runs: [
        {
          text,
          provenance: {
            kind: "docx_run",
            packagePart: "word/document.xml",
            paragraphIndex: 0,
            runIndex: 0,
            characterOffsetStart: 0,
            characterOffsetEnd: text.length,
            readingOrder: 0,
          },
        },
      ],
    },
  ];
}
