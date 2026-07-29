import { describe, expect, it } from "vitest";

import type { ExtractionSourceReader } from "../adapters.js";
import { PdfJsPdfAdapter } from "./pdfjs-pdf-adapter.js";
import { buildPdf } from "../testing/test-document-builders.js";

const request = (key: string, signal?: AbortSignal) => ({
  importId: "00000000-0000-4000-8000-000000000001",
  ownerUserId: "00000000-0000-4000-8000-000000000002",
  sourceStorageKey: key,
  format: "pdf" as const,
  ...(signal === undefined ? {} : { abortSignal: signal }),
});

function readerFor(
  values: Readonly<Record<string, Uint8Array>>,
): ExtractionSourceReader {
  return {
    readSource: async ({ sourceStorageKey, maximumBytes, abortSignal }) => {
      if (abortSignal?.aborted === true) {
        throw new DOMException("aborted", "AbortError");
      }
      const value = values[sourceStorageKey] ?? new Uint8Array();
      return value.byteLength > maximumBytes ? value : new Uint8Array(value);
    },
  };
}

describe("PdfJsPdfAdapter", () => {
  it("counts pages and preserves PDF.js item order and coordinates deterministically", async () => {
    const bytes = await buildPdf({
      pages: [["Synthetic Person", "First role"], ["Deuxième page"]],
    });
    const adapter = new PdfJsPdfAdapter(readerFor({ source: bytes }), {
      maximumFileSizeBytes: 1_000_000,
      maximumPageCount: 5,
    });

    await expect(adapter.countPages(request("source"))).resolves.toEqual({
      ok: true,
      value: { renderedPageCount: 2 },
    });
    const first = await adapter.extractSelectableText(request("source"));
    const second = await adapter.extractSelectableText(request("source"));
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.map((page) => page.pageNumber)).toEqual([1, 2]);
      const items = first.value.flatMap((page) => page.items);
      expect(items.map((item) => item.provenance.readingOrder)).toEqual(
        items.map((_, index) => index),
      );
      expect(items[0]?.provenance).toMatchObject({
        pageNumber: 1,
        itemIndex: 0,
        boundingBox: { unit: "pdf_point" },
      });
      expect(items[0]?.provenance.boundingBox.width).toBeGreaterThan(0);
    }
  });

  it("keeps blank pages but rejects a wholly image-only document", async () => {
    const mixed = await buildPdf({ pages: [["Selectable"], []] });
    const imageOnly = await buildPdf({ pages: [[]] });
    const adapter = new PdfJsPdfAdapter(readerFor({ mixed, imageOnly }), {
      maximumFileSizeBytes: 1_000_000,
      maximumPageCount: 5,
    });
    const result = await adapter.extractSelectableText(request("mixed"));
    expect(result.ok && result.value[1]?.items).toEqual([]);
    await expect(
      adapter.extractSelectableText(request("imageOnly")),
    ).resolves.toMatchObject({
      ok: false,
      error: { category: "scanned_or_image_only" },
    });
  });

  it("returns privacy-safe failures for malformed and truncated input", async () => {
    const valid = await buildPdf({ pages: [["Safe text"]] });
    for (const bytes of [new Uint8Array([1, 2, 3]), valid.subarray(0, 80)]) {
      const adapter = new PdfJsPdfAdapter(readerFor({ source: bytes }), {
        maximumFileSizeBytes: 1_000_000,
        maximumPageCount: 5,
      });
      const result = await adapter.extractSelectableText(request("source"));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(["malformed", "corrupted", "unexpected"]).toContain(
          result.error.category,
        );
        expect(result.error.message).not.toContain("Safe text");
        expect(result.error.message).not.toContain("PDF");
      }
    }
  });

  it("rejects password-protected PDFs deterministically", async () => {
    const bytes = await buildPdf({
      pages: [["Private synthetic text"]],
      password: "test-only",
    });
    const adapter = new PdfJsPdfAdapter(readerFor({ source: bytes }), {
      maximumFileSizeBytes: 1_000_000,
      maximumPageCount: 5,
    });
    await expect(adapter.countPages(request("source"))).resolves.toMatchObject({
      ok: false,
      error: { category: "password_protected" },
    });
  });

  it("enforces file and page limits before returning output", async () => {
    const bytes = await buildPdf({ pages: [["one"], ["two"]] });
    const fileLimited = new PdfJsPdfAdapter(readerFor({ source: bytes }), {
      maximumFileSizeBytes: bytes.byteLength - 1,
      maximumPageCount: 5,
    });
    const pageLimited = new PdfJsPdfAdapter(readerFor({ source: bytes }), {
      maximumFileSizeBytes: bytes.byteLength,
      maximumPageCount: 1,
    });
    await expect(
      fileLimited.countPages(request("source")),
    ).resolves.toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });
    await expect(
      pageLimited.extractSelectableText(request("source")),
    ).resolves.toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });
  });

  it("honours cancellation and remains reusable after PDF.js cleanup", async () => {
    const bytes = await buildPdf({ pages: [["Synthetic"]] });
    const controller = new AbortController();
    controller.abort();
    const adapter = new PdfJsPdfAdapter(readerFor({ source: bytes }), {
      maximumFileSizeBytes: bytes.byteLength,
      maximumPageCount: 5,
    });
    await expect(
      adapter.extractSelectableText(request("source", controller.signal)),
    ).resolves.toMatchObject({ ok: false, error: { category: "cancelled" } });
    await expect(adapter.countPages(request("source"))).resolves.toMatchObject({
      ok: true,
      value: { renderedPageCount: 1 },
    });
  });
});
