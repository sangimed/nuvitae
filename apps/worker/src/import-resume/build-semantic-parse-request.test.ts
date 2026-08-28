import { describe, expect, it } from "vitest";
import type { ImportedDocument } from "@nuvitae/domain";
import type { ResumeSourceFragment } from "@nuvitae/extraction";
import { buildSemanticParseRequest } from "./build-semantic-parse-request.js";

const educationCompletenessFixtureV1 = [
  ...Array.from({ length: 120 }, (_, index) => `Earlier fragment ${index + 1}`),
  "EDUCATION",
  ...Array.from(
    { length: 37 },
    (_, index) => `Example University education fact ${index + 1}`,
  ),
  "SKILLS",
  "TypeScript",
] as const;

const document = {
  id: "synthetic-education-completeness-v1",
  ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  visibleFilename: "synthetic-education-completeness-v1.pdf",
  contentType: "application/pdf",
  fileExtension: "pdf",
  sizeBytes: 1,
  storageKey: "synthetic/source",
  uploadStatus: "uploaded",
  validationStatus: "accepted",
  processingStatus: "queued",
  deletionStatus: "not_scheduled",
  createdAt: new Date("2026-08-14T00:00:00.000Z"),
  retentionExpiresAt: new Date("2026-08-21T00:00:00.000Z"),
  detectedLanguage: "english",
} satisfies ImportedDocument;

function fragments(): readonly ResumeSourceFragment[] {
  return educationCompletenessFixtureV1.map((text, order) => ({
    text,
    order,
    format: "pdf",
    location: {
      kind: "pdf_text_item",
      pageNumber: 1,
      itemIndex: order,
      readingOrder: order,
      boundingBox: {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        unit: "pdf_point",
      },
    },
  }));
}

describe("buildSemanticParseRequest", () => {
  it("retains the complete normalized Education fragment set", () => {
    const request = buildSemanticParseRequest(document, fragments());
    const headingIndex = request.sourceFragments.findIndex(
      (fragment) => fragment.text === "EDUCATION",
    );
    const expectedEducation = educationCompletenessFixtureV1.slice(
      headingIndex + 1,
      headingIndex + 1 + 37,
    );

    expect(expectedEducation).toHaveLength(37);
    expect(
      request.sourceFragments
        .slice(headingIndex + 1, headingIndex + 1 + 37)
        .map((fragment) => fragment.text),
    ).toEqual(expectedEducation);
    expect(request.normalizedTranscript.text.split("\n")).toEqual(
      educationCompletenessFixtureV1,
    );
    expect(request.fragmentHashes).toHaveLength(
      educationCompletenessFixtureV1.length,
    );
  });

  it("records only source-proven DOCX run continuations", () => {
    const request = buildSemanticParseRequest(document, [
      {
        text: "Senior Backend ",
        order: 0,
        format: "docx",
        context: "paragraph",
        location: {
          kind: "docx_run",
          packagePart: "word/document.xml",
          paragraphIndex: 4,
          runIndex: 0,
          characterOffsetStart: 0,
          characterOffsetEnd: 15,
          readingOrder: 0,
        },
      },
      {
        text: "Engineer",
        order: 1,
        format: "docx",
        context: "paragraph",
        location: {
          kind: "docx_run",
          packagePart: "word/document.xml",
          paragraphIndex: 4,
          runIndex: 1,
          characterOffsetStart: 15,
          characterOffsetEnd: 23,
          readingOrder: 1,
        },
      },
      {
        text: "Different paragraph",
        order: 2,
        format: "docx",
        context: "paragraph",
        location: {
          kind: "docx_run",
          packagePart: "word/document.xml",
          paragraphIndex: 5,
          runIndex: 0,
          characterOffsetStart: 0,
          characterOffsetEnd: 19,
          readingOrder: 2,
        },
      },
    ]);

    expect(
      request.sourceFragments.map((fragment) => fragment.continuationToNext),
    ).toEqual(["space", undefined, undefined]);
  });

  it("records source-proven same-line and wrapped PDF continuations but rejects columns", () => {
    const pdf = (
      text: string,
      order: number,
      x: number,
      y: number,
      width: number,
      hasEol = false,
    ): ResumeSourceFragment => ({
      text,
      order,
      format: "pdf",
      location: {
        kind: "pdf_text_item",
        pageNumber: 1,
        itemIndex: order,
        readingOrder: order,
        boundingBox: { x, y, width, height: 10, unit: "pdf_point" },
        hasEol,
      },
    });
    const request = buildSemanticParseRequest(document, [
      pdf("Senior Backend", 0, 10, 700, 70, false),
      pdf("Engineer", 1, 82, 700, 40),
      pdf("Wrapped first line", 2, 10, 686, 90, true),
      pdf("wrapped continuation", 3, 10, 674, 85),
      pdf("Other column", 4, 300, 674, 60),
    ]);

    expect(
      request.sourceFragments.map((fragment) => fragment.continuationToNext),
    ).toEqual(["space", undefined, "space", undefined, undefined]);
  });

  it("records a bounded vertical continuation between adjacent PDF list bullets", () => {
    const pdf = (
      text: string,
      order: number,
      x: number,
      y: number,
      width: number,
      height: number,
      hasEol: boolean,
    ): ResumeSourceFragment => ({
      text,
      order,
      format: "pdf",
      location: {
        kind: "pdf_text_item",
        pageNumber: 1,
        itemIndex: order,
        readingOrder: order,
        boundingBox: { x, y, width, height, unit: "pdf_point" },
        hasEol,
      },
    });
    const request = buildSemanticParseRequest(document, [
      pdf("First project detail", 0, 39, 650, 120, 11, false),
      pdf("•", 1, 39, 636, 0, 1, false),
      pdf("Second project detail", 2, 39, 636, 130, 11, false),
    ]);

    expect(
      request.sourceFragments.map((fragment) => fragment.continuationToNext),
    ).toEqual(["space", "none", undefined]);
  });

  it("keeps a same-line PDF continuation across only ignorable empty PDF.js items", () => {
    const pdf = (
      text: string,
      order: number,
      x: number,
      width: number,
      height = 10,
      hasEol = false,
    ): ResumeSourceFragment => ({
      text,
      order,
      format: "pdf",
      location: {
        kind: "pdf_text_item",
        pageNumber: 1,
        itemIndex: order,
        readingOrder: order,
        boundingBox: {
          x,
          y: 700,
          width,
          height,
          unit: "pdf_point",
        },
        hasEol,
      },
    });
    const request = buildSemanticParseRequest(document, [
      pdf("Senior Platform", 0, 10, 70),
      pdf(" ", 1, 80, 3, 0),
      pdf("Engineer", 2, 82, 40),
    ]);

    expect(request.sourceFragments.map((fragment) => fragment.text)).toEqual([
      "Senior Platform",
      "Engineer",
    ]);
    expect(
      request.sourceFragments.map((fragment) => fragment.continuationToNext),
    ).toEqual(["space", undefined]);
  });

  it.each([
    ["an empty item carrying EOL", true, 82],
    ["column-scale geometry", false, 300],
  ])("rejects PDF continuation across %s", (_name, skippedHasEol, rightX) => {
    const pdf = (
      text: string,
      order: number,
      x: number,
      width: number,
      height = 10,
      hasEol = false,
    ): ResumeSourceFragment => ({
      text,
      order,
      format: "pdf",
      location: {
        kind: "pdf_text_item",
        pageNumber: 1,
        itemIndex: order,
        readingOrder: order,
        boundingBox: {
          x,
          y: 700,
          width,
          height,
          unit: "pdf_point",
        },
        hasEol,
      },
    });
    const request = buildSemanticParseRequest(document, [
      pdf("Senior Platform", 0, 10, 70),
      pdf(" ", 1, 80, 3, 0, skippedHasEol),
      pdf("Engineer", 2, rightX, 40),
    ]);

    expect(request.sourceFragments[0]?.continuationToNext).toBeUndefined();
  });

  it("keeps a DOCX continuation across only contiguous whitespace-only runs", () => {
    const run = (
      text: string,
      runIndex: number,
      start: number,
      end: number,
    ): ResumeSourceFragment => ({
      text,
      order: runIndex,
      format: "docx",
      context: "paragraph",
      location: {
        kind: "docx_run",
        packagePart: "word/document.xml",
        paragraphIndex: 4,
        runIndex,
        characterOffsetStart: start,
        characterOffsetEnd: end,
        readingOrder: runIndex,
      },
    });
    const request = buildSemanticParseRequest(document, [
      run("Master of", 0, 0, 9),
      run(" ", 1, 9, 10),
      run("Engineering", 2, 10, 21),
    ]);

    expect(request.sourceFragments.map((fragment) => fragment.text)).toEqual([
      "Master of",
      "Engineering",
    ]);
    expect(request.sourceFragments[0]?.continuationToNext).toBe("space");
  });
});
