import { buildPdf } from "../../../packages/extraction/src/testing/test-document-builders.js";
import { describe, expect, it } from "vitest";
import { assessPdfSelectableText } from "../../../apps/api/src/services/import-resume/validate-document.js";
import {
  addDocument,
  createValidationHarness,
  importedDocument,
  validateOwned,
} from "./validation-test-harness.js";

const english =
  "Professional experience and education with skills developed for the company team. Managed project responsibilities and built systems for many years.";

describe("PDF selectable-text validation", () => {
  it("accepts a selectable-text PDF deterministically", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({ pages: [[english]] });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000401",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const first = await validateOwned(harness, document.id);

    expect(first).toMatchObject({
      accepted: true,
      renderedPageCount: 1,
      detectedLanguage: "english",
    });
  });

  it("rejects a fully image-only PDF and never invents OCR text", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({
      pages: [[]],
      imageOnPages: [0],
    });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000402",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "no_selectable_text" },
    });
    expect(JSON.stringify(response).toLowerCase()).not.toContain("ocr text");
  });

  it("permits a blank page within an otherwise usable PDF", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({ pages: [[english], []] });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000403",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: true,
      renderedPageCount: 2,
    });
  });

  it("accepts text beside an embedded image without claiming image evidence", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({
      pages: [[english]],
      imageOnPages: [0],
    });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000404",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: true,
    });

    const assessment = assessPdfSelectableText([
      {
        pageNumber: 1,
        pageReadingOrder: 0,
        items: [
          {
            text: english,
            provenance: {
              kind: "pdf_text_item",
              pageNumber: 1,
              itemIndex: 0,
              readingOrder: 0,
              boundingBox: {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
                unit: "pdf_point",
              },
            },
          },
        ],
      },
    ]);
    expect(assessment).toEqual({
      hasSelectableText: true,
      textItemCount: 1,
      selectablePageCount: 1,
      imageOnlyPageCount: 0,
      mixedTextAndImage: false,
    });
  });

  it("enforces page limits before selectable-text acceptance", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({
      pages: [[english], [], [], [], [], []],
    });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000405",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: false,
      renderedPageCount: 6,
      failure: { code: "over_page_limit" },
    });
  });

  it("reports text-empty pages honestly and repeats assessments stably", () => {
    const pages = [
      {
        pageNumber: 1,
        pageReadingOrder: 0,
        items: [],
      },
      {
        pageNumber: 2,
        pageReadingOrder: 1,
        items: [
          {
            text: "Selectable",
            provenance: {
              kind: "pdf_text_item" as const,
              pageNumber: 2,
              itemIndex: 0,
              readingOrder: 0,
              boundingBox: {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
                unit: "pdf_point" as const,
              },
            },
          },
        ],
      },
    ];
    const first = assessPdfSelectableText(pages);
    expect(first).toEqual(assessPdfSelectableText(pages));
    expect(first.imageOnlyPageCount).toBe(1);
    expect(first.mixedTextAndImage).toBe(false);
  });
});
