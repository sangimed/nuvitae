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
  semanticParserFixtureInputs,
  type SemanticParserFixtureId,
} from "@nuvitae/test-fixtures";
import { buildSemanticParseRequest } from "../../../apps/worker/src/import-resume/build-semantic-parse-request.js";
import { expectedSemanticJsonById } from "../../../packages/test-fixtures/src/resume-import/expected-semantic-json.js";

/**
 * T246 offline regression coverage for the sparse (C05) and structurally
 * ambiguous (C06) real-document cases: missing fields must stay null/absent,
 * unsupported facts must be rejected, ambiguous facts must use the
 * repository-defined ambiguity mechanism, grouping must not invent
 * relationships, and expected-fact recall must not reward guessing.
 */

const fixtureDirectory = "tests/fixtures/resumes";

const sparseCase = {
  caseId: "T246-C05",
  corpusFixtureId: "docx-partial-canonical-anonymous" as const,
  fixturePath: `${fixtureDirectory}/anonymous-partial-resume.docx`,
  format: "docx" as const,
  importId: "00000000-0000-4000-8000-000000000715",
};

const ambiguousCase = {
  caseId: "T246-C06",
  corpusFixtureId: "pdf-ambiguous-canonical-anonymous" as const,
  fixturePath: `${fixtureDirectory}/anonymous-ambiguous-resume.pdf`,
  format: "pdf" as const,
  importId: "00000000-0000-4000-8000-000000000716",
};

describe("T246 sparse real-document semantics (C05)", () => {
  it("keeps every omitted CV field null or absent", async () => {
    await buildRequest(sparseCase);
    const response = expectedSemanticJsonById[sparseCase.corpusFixtureId];
    expect(response.sections.contact.location).toBeNull();
    expect(response.sections.contact.website).toBeNull();
    expect(response.sections.summary).toBeNull();
    expect(response.sections.workExperience[0]?.employerLocation).toBeNull();
    expect(response.sections.workExperience[0]?.roles[0]?.location).toBeNull();
    expect(response.sections.workExperience[0]?.roles[0]?.achievements).toEqual(
      [],
    );
    expect(response.sections.education[0]?.fieldOfStudy).toBeNull();
    expect(response.sections.education[0]?.location).toBeNull();
    expect(response.sections.education[0]?.details).toEqual([]);
    expect(response.sections.projects).toEqual([]);
    expect(response.sections.certifications).toEqual([]);
    expect(response.sections.professionalLinks).toEqual([]);
    expect(JSON.stringify(response)).not.toContain('"undefined"');
  });

  it("accepts the sparse expected response through the full validation pipeline", async () => {
    const { request } = await buildRequest(sparseCase);
    const response = expectedSemanticJsonById[sparseCase.corpusFixtureId];
    const validation = validateSemanticResponse({ request, response });
    expect(validation).toMatchObject({
      schemaValid: true,
      evidenceValid: true,
      groundingValid: true,
      absenceValid: true,
      ambiguityValid: true,
      conflictValid: true,
      noInventionValid: true,
      injectionResistant: true,
      accepted: true,
    });
  });

  it("rejects invented summary, certification, and website values", async () => {
    const { request } = await buildRequest(sparseCase);
    const response = structuredClone(
      expectedSemanticJsonById[sparseCase.corpusFixtureId],
    );

    const inventedSummary = validateSemanticResponse({
      request,
      response: {
        ...response,
        sections: {
          ...response.sections,
          summary: {
            value: "Invented product manager summary",
            normalizedValue: null,
            evidence: [],
            classification: "explicit",
            confidence: "high",
          },
        },
      },
    });
    expect(inventedSummary.accepted).toBe(false);

    const inventedCertification = validateSemanticResponse({
      request,
      response: {
        ...response,
        sections: {
          ...response.sections,
          certifications: [
            {
              candidateId: "certification-1",
              name: {
                value: "Invented Certification",
                normalizedValue: null,
                evidence: [],
                classification: "explicit",
                confidence: "high",
              },
              issuer: null,
              date: null,
            },
          ],
        },
      },
    });
    expect(inventedCertification.accepted).toBe(false);

    const inventedWebsite = validateSemanticResponse({
      request,
      response: {
        ...response,
        sections: {
          ...response.sections,
          contact: {
            ...response.sections.contact,
            website: {
              value: "https://invented.example.invalid",
              normalizedValue: null,
              evidence: [],
              classification: "explicit",
              confidence: "high",
            },
          },
        },
      },
    });
    expect(inventedWebsite.accepted).toBe(false);
  });

  it("does not reward guessing: only explicitly present facts count", async () => {
    const { request } = await buildRequest(sparseCase);
    const response = expectedSemanticJsonById[sparseCase.corpusFixtureId];
    const presentPaths = [
      "contact.fullName",
      "contact.email",
      "contact.phone",
      "headline",
      "workExperience[0].employerName",
      "workExperience[0].roles[0].title",
      "workExperience[0].roles[0].startDate",
      "education[0].degree",
      "skills[0].name",
      "languages[0].name",
    ];
    for (const path of presentPaths) {
      expect(
        valueAtPath(response.sections, path),
        `expected fact ${path}`,
      ).not.toBeNull();
    }
    for (const path of ["contact.location", "contact.website", "summary"]) {
      expect(
        valueAtPath(response.sections, path),
        `absent field ${path}`,
      ).toBeNull();
    }
    expect(response.sections.projects).toEqual([]);
    expect(response.sections.certifications).toEqual([]);
    expect(response.sections.professionalLinks).toEqual([]);
    const validation = validateSemanticResponse({ request, response });
    expect(validation.accepted).toBe(true);
  });
});

describe("T246 structurally ambiguous real-document semantics (C06)", () => {
  it("extracts only explicit facts and keeps the ambiguous date null", async () => {
    await buildRequest(ambiguousCase);
    const response = expectedSemanticJsonById[ambiguousCase.corpusFixtureId];
    const role = response.sections.workExperience[0]?.roles[0];

    expect(response.sections.contact.fullName?.value).toBe(
      "Amir Hussain-Example",
    );
    expect(response.sections.workExperience[0]?.employerName?.value).toBe(
      "Northbeam Systems",
    );
    expect(role?.title?.value).toBe("Streaming Infrastructure Engineer");
    expect(role?.startDate).toBeNull();
    expect(role?.endDate).toBeNull();
    expect(role?.isOngoing).toBeNull();
    expect(response.sections.education[0]?.degree?.value).toBe(
      "MSc Computer Science",
    );
    expect(response.sections.education[0]?.startDate?.value).toBe("2015");
    expect(response.sections.education[0]?.endDate?.value).toBe("2019");
    expect(response.sections.skills.map((skill) => skill.name?.value)).toEqual([
      "Kafka",
      "Spark",
      "Python",
      "Kubernetes",
    ]);
  });

  it("represents ambiguity with the repository-defined ambiguity mechanism and no invented relationships", async () => {
    const { request } = await buildRequest(ambiguousCase);
    const response = expectedSemanticJsonById[ambiguousCase.corpusFixtureId];

    expect(response.relationships).toEqual([]);
    expect(response.ambiguityDiagnostics).toHaveLength(2);
    const codes = response.ambiguityDiagnostics.map(
      (diagnostic) => diagnostic.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining(["ambiguous_role_association", "ambiguous_date"]),
    );
    for (const diagnostic of response.ambiguityDiagnostics) {
      expect(diagnostic.severity).toBe("warning");
      expect(diagnostic.evidence.length).toBeGreaterThan(0);
    }

    const validation = validateSemanticResponse({ request, response });
    expect(validation.ambiguityValid).toBe(true);
    expect(validation.noInventionValid).toBe(true);
    expect(validation.accepted).toBe(true);
    expect(validation.requiresReview).toBe(true);
  });

  it("rejects a forced date inference and invented grouping values", async () => {
    const { request } = await buildRequest(ambiguousCase);
    const response = structuredClone(
      expectedSemanticJsonById[ambiguousCase.corpusFixtureId],
    );
    const forcedDate = validateSemanticResponse({
      request,
      response: {
        ...response,
        sections: {
          ...response.sections,
          workExperience: [
            {
              ...response.sections.workExperience[0]!,
              roles: [
                {
                  ...response.sections.workExperience[0]!.roles[0]!,
                  startDate: {
                    value: "2018",
                    normalizedValue: null,
                    evidence: [],
                    classification: "explicit",
                    confidence: "high",
                  },
                },
              ],
            },
          ],
        },
      },
    });
    expect(forcedDate.accepted).toBe(false);

    const inventedEmployer = validateSemanticResponse({
      request,
      response: {
        ...response,
        sections: {
          ...response.sections,
          workExperience: [
            ...response.sections.workExperience,
            {
              candidateId: "work-2",
              employerName: {
                value: "Invented Employer",
                normalizedValue: null,
                evidence: [],
                classification: "explicit",
                confidence: "high",
              },
              employerLocation: null,
              roles: [],
            },
          ],
        },
      },
    });
    expect(inventedEmployer.accepted).toBe(false);
  });

  it("pins the canonical transcript and language for the ambiguous binary", async () => {
    const { request } = await buildRequest(ambiguousCase);
    const corpus = semanticParserFixtureInputs[ambiguousCase.corpusFixtureId];
    expect(request.normalizedTranscript.sha256).toBe(corpus.transcript.sha256);
    expect(request.languageContext.detectedLanguage).toBe("english");
  });
});

async function buildRequest(scenario: {
  readonly corpusFixtureId: SemanticParserFixtureId;
  readonly fixturePath: string;
  readonly format: "pdf" | "docx";
  readonly importId: string;
}) {
  const metadata = await stat(scenario.fixturePath);
  const document = documentFor(scenario, metadata.size);
  const reader: ExtractionSourceReader = {
    async readSource(input) {
      const bytes = await readFile(input.sourceStorageKey);
      return bytes.byteLength > input.maximumBytes
        ? bytes.subarray(0, input.maximumBytes + 1)
        : bytes;
    },
  };
  let fragments;
  if (scenario.format === "pdf") {
    const adapter = new PdfJsPdfAdapter(reader, {
      maximumFileSizeBytes: 100_000,
      maximumPageCount: 5,
    });
    const extracted = await adapter.extractSelectableText({
      importId: scenario.importId,
      ownerUserId: "00000000-0000-4000-8000-000000000702",
      sourceStorageKey: scenario.fixturePath,
      format: "pdf",
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) throw new Error("extraction_failed");
    fragments = fragmentsFromPdf(extracted.value);
  } else {
    const adapter = new OoxmlDocxAdapter(reader, {
      maximumArchiveSizeBytes: 100_000,
      maximumEntryCount: 200,
      maximumEntryUncompressedSizeBytes: 5 * 1024 * 1024,
      maximumTotalUncompressedSizeBytes: 20 * 1024 * 1024,
      maximumCompressionRatio: 200,
      maximumXmlDepth: 80,
    });
    const extracted = await adapter.extractText({
      importId: scenario.importId,
      ownerUserId: "00000000-0000-4000-8000-000000000702",
      sourceStorageKey: scenario.fixturePath,
      format: "docx",
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) throw new Error("extraction_failed");
    fragments = fragmentsFromDocx(extracted.value);
  }
  const request = buildSemanticParseRequest(document, fragments);
  return { request };
}

function documentFor(
  scenario: {
    readonly fixturePath: string;
    readonly format: "pdf" | "docx";
    readonly importId: string;
  },
  sizeBytes: number,
): ImportedDocument {
  return {
    id: scenario.importId,
    ownerUserId: "00000000-0000-4000-8000-000000000702",
    visibleFilename: scenario.fixturePath.split("/").at(-1)!,
    contentType:
      scenario.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileExtension: scenario.format,
    sizeBytes,
    storageKey: scenario.fixturePath,
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

function valueAtPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter((segment) => segment.length > 0)
    .reduce<unknown>((current, segment) => {
      if (current === null || current === undefined) return null;
      if (segment === "sections")
        return (current as Record<string, unknown>)["sections"];
      const indexMatch = /^(.*)\[(\d+)\]$/.exec(segment);
      if (indexMatch !== null) {
        const array = (current as Record<string, unknown>)[indexMatch[1] ?? ""];
        return Array.isArray(array) ? array[Number(indexMatch[2] ?? -1)] : null;
      }
      return (current as Record<string, unknown>)[segment];
    }, value);
}
