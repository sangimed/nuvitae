import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ImportedDocument } from "@nuvitae/domain";
import {
  OoxmlDocxAdapter,
  PdfJsPdfAdapter,
  fragmentsFromDocx,
  fragmentsFromPdf,
  type ExtractionSourceReader,
} from "@nuvitae/extraction";
import { validateSemanticResponse } from "@nuvitae/import-application";
import {
  createDeterministicSemanticParserProvider,
  deterministicFixtureProfiles,
} from "@nuvitae/import-application/testing";
import { buildSemanticParseRequest } from "../../../apps/worker/src/import-resume/build-semantic-parse-request.js";

const fixtureDirectory = "tests/fixtures/resumes";
const pdfFixturePath = `${fixtureDirectory}/semantic-vertical-slice-jordan-avery.pdf`;
const docxFixturePath = `${fixtureDirectory}/semantic-vertical-slice-maya-chen.docx`;

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

function documentFor(
  fileExtension: "pdf" | "docx",
  sizeBytes: number,
): ImportedDocument {
  return {
    id: "00000000-0000-4000-8000-000000000111",
    ownerUserId: "00000000-0000-4000-8000-000000000112",
    visibleFilename:
      fileExtension === "pdf"
        ? "semantic-vertical-slice-jordan-avery.pdf"
        : "semantic-vertical-slice-maya-chen.docx",
    contentType:
      fileExtension === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileExtension,
    sizeBytes,
    storageKey: fileExtension === "pdf" ? pdfFixturePath : docxFixturePath,
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    detectedLanguage: "english",
    renderedPageCount: 1,
    createdAt: new Date("2026-08-01T09:30:00.000Z"),
    retentionExpiresAt: new Date("2026-08-08T09:30:00.000Z"),
  };
}

describe("semantic vertical-slice physical fixtures", () => {
  it("normalizes the real PDF fixture to the exact T210 PDF profile and parses through the real provider", async () => {
    const profile = deterministicFixtureProfiles.find(
      (candidate) => candidate.profileId === "pdf-english-anonymous",
    );
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const metadata = await stat(pdfFixturePath);
    expect(metadata.size).toBeGreaterThan(0);
    expect(metadata.size).toBeLessThan(100_000);

    const adapter = new PdfJsPdfAdapter(fileReader(), {
      maximumFileSizeBytes: 100_000,
      maximumPageCount: 5,
    });
    const extracted = await adapter.extractSelectableText({
      importId: "00000000-0000-4000-8000-000000000111",
      ownerUserId: "00000000-0000-4000-8000-000000000112",
      sourceStorageKey: pdfFixturePath,
      format: "pdf",
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const fragments = fragmentsFromPdf(extracted.value);
    const request = buildSemanticParseRequest(
      documentFor("pdf", metadata.size),
      fragments,
    );
    expect(request.normalizedTranscript).toEqual(profile.transcript);
    expect(request.sourceFragments).toEqual(profile.fragments);
    expect(request.fragmentHashes).toEqual(profile.fragmentHashes);
    expect(request.formatMetadata).toEqual(profile.formatMetadata);

    const result =
      await createDeterministicSemanticParserProvider().parse(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response).toEqual(profile.response);
    const validation = validateSemanticResponse({
      request,
      response: result.response,
    });
    expect(validation).toMatchObject({
      schemaValid: true,
      evidenceValid: true,
      groundingValid: true,
      absenceValid: true,
      ambiguityValid: true,
      conflictValid: true,
      noInventionValid: true,
      accepted: true,
    });
  });

  it("normalizes the real DOCX fixture to the exact T210 DOCX profile and parses through the real provider", async () => {
    const profile = deterministicFixtureProfiles.find(
      (candidate) => candidate.profileId === "docx-english-anonymous",
    );
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    const metadata = await stat(docxFixturePath);
    expect(metadata.size).toBeGreaterThan(0);
    expect(metadata.size).toBeLessThan(100_000);

    const adapter = new OoxmlDocxAdapter(fileReader(), {
      maximumArchiveSizeBytes: 100_000,
      maximumEntryCount: 200,
      maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
      maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
      maximumCompressionRatio: 200,
      maximumXmlDepth: 80,
    });
    const extracted = await adapter.extractText({
      importId: "00000000-0000-4000-8000-000000000111",
      ownerUserId: "00000000-0000-4000-8000-000000000112",
      sourceStorageKey: docxFixturePath,
      format: "docx",
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const fragments = fragmentsFromDocx(extracted.value);
    const request = buildSemanticParseRequest(
      documentFor("docx", metadata.size),
      fragments,
    );
    expect(request.normalizedTranscript).toEqual(profile.transcript);
    expect(request.sourceFragments).toEqual(profile.fragments);
    expect(request.fragmentHashes).toEqual(profile.fragmentHashes);
    expect(request.formatMetadata).toEqual(profile.formatMetadata);

    const result =
      await createDeterministicSemanticParserProvider().parse(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response).toEqual(profile.response);
    const validation = validateSemanticResponse({
      request,
      response: result.response,
    });
    expect(validation).toMatchObject({
      schemaValid: true,
      evidenceValid: true,
      groundingValid: true,
      absenceValid: true,
      ambiguityValid: true,
      conflictValid: true,
      noInventionValid: true,
      accepted: true,
    });
  });
});
