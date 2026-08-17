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
});
