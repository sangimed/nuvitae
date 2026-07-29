import { readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import type { ExtractionSourceReader } from "../adapters.js";
import { IsolatedParserRunner } from "../isolated-parser-runner.js";
import {
  buildDocx,
  documentXml,
  paragraphXml,
} from "../testing/test-document-builders.js";
import { LibreOfficeRenderedPageCounter } from "./libreoffice-rendered-page-count.js";

const parserRoot = process.env.PARSER_TMP_ROOT;
const integration = parserRoot === undefined ? describe.skip : describe;
const request = (signal?: AbortSignal) => ({
  importId: "00000000-0000-4000-8000-000000000021",
  ownerUserId: "00000000-0000-4000-8000-000000000022",
  sourceStorageKey: "synthetic-docx",
  format: "docx" as const,
  ...(signal === undefined ? {} : { abortSignal: signal }),
});

integration("LibreOfficeRenderedPageCounter (parser container)", () => {
  const count = async (
    bytes: Uint8Array,
    maximumRenderedPageCount = 5,
    signal?: AbortSignal,
  ) => {
    const sourceReader: ExtractionSourceReader = {
      readSource: async () => new Uint8Array(bytes),
    };
    const runner = new IsolatedParserRunner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/usr/bin/prlimit",
      },
    });
    return await new LibreOfficeRenderedPageCounter(sourceReader, runner, {
      temporaryRoot: parserRoot!,
      libreOfficeExecutable: "/usr/lib/libreoffice/program/oosplash",
      maximumDocxSizeBytes: 1_000_000,
      maximumConvertedPdfSizeBytes: 5_000_000,
      maximumRenderedPageCount,
      docxValidationLimits: {
        maximumArchiveSizeBytes: 1_000_000,
        maximumEntryCount: 50,
        maximumEntryUncompressedSizeBytes: 500_000,
        maximumTotalUncompressedSizeBytes: 1_000_000,
        maximumCompressionRatio: 200,
        maximumXmlDepth: 50,
      },
    }).countRenderedPages(request(signal));
  };

  it("counts one-page and multi-page synthetic DOCX files", async () => {
    const one = await buildDocx({
      documentXml: documentXml(paragraphXml("<w:t>One synthetic page</w:t>")),
    });
    const multiple = await buildDocx({
      documentXml: documentXml(
        paragraphXml(
          '<w:t>Page one</w:t><w:br w:type="page"/><w:t>Page two</w:t>',
        ),
      ),
    });
    await expect(count(one)).resolves.toEqual({
      ok: true,
      value: { renderedPageCount: 1 },
    });
    await expect(count(multiple)).resolves.toEqual({
      ok: true,
      value: { renderedPageCount: 2 },
    });
  }, 60_000);

  it("accepts exactly five rendered pages and rejects six", async () => {
    const five = await renderedPagesDocx(5);
    const six = await renderedPagesDocx(6);
    await expect(count(five)).resolves.toEqual({
      ok: true,
      value: { renderedPageCount: 5 },
    });
    await expect(count(six)).resolves.toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });
  }, 60_000);

  it("rejects rendered page-limit, malformed input and cancellation", async () => {
    const multiple = await buildDocx({
      documentXml: documentXml(
        paragraphXml('<w:t>One</w:t><w:br w:type="page"/><w:t>Two</w:t>'),
      ),
    });
    await expect(count(multiple, 1)).resolves.toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });
    await expect(count(new Uint8Array([1, 2, 3]))).resolves.toMatchObject({
      ok: false,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(count(multiple, 5, controller.signal)).resolves.toMatchObject({
      ok: false,
      error: { category: "cancelled" },
    });
  }, 60_000);

  it("removes input, PDF, profile and work directories after success and failure", async () => {
    const before = await readdir(parserRoot!);
    const valid = await buildDocx({
      documentXml: documentXml(paragraphXml("<w:t>Cleanup</w:t>")),
    });
    await count(valid);
    await count(new Uint8Array([1, 2, 3]));
    expect(await readdir(parserRoot!)).toEqual(before);
  }, 60_000);
});

async function renderedPagesDocx(pageCount: number): Promise<Uint8Array> {
  return await buildDocx({
    documentXml: documentXml(
      paragraphXml(
        Array.from({ length: pageCount }, (_, index) =>
          index === pageCount - 1
            ? `<w:t>Page ${index + 1}</w:t>`
            : `<w:t>Page ${index + 1}</w:t><w:br w:type="page"/>`,
        ).join(""),
      ),
    ),
  });
}
