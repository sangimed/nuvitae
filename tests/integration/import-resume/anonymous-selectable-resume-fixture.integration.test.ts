import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  DeterministicLanguageDetector,
  DeterministicResumeFieldExtractor,
  PdfJsPdfAdapter,
  fragmentsFromPdf,
  type ExtractionSourceReader,
} from "@nuvitae/extraction";
import { buildExtractionDraft, type ImportedDocument } from "@nuvitae/domain";
import {
  generateSemanticWarnings,
  mapSemanticCandidates,
  validateSemanticResponse,
} from "@nuvitae/import-application";
import {
  nuvitaeSemanticExtractionResponseVersion,
  type NuvitaeSemanticExtractionResponse,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import { buildSemanticParseRequest } from "../../../apps/worker/src/import-resume/build-semantic-parse-request.js";

const execFileAsync = promisify(execFile);
const fixturePath = "tests/fixtures/resumes/anonymous-selectable-resume.pdf";
const generatorPath =
  "tests/fixtures/resumes/generate-anonymous-selectable-resume.mjs";

describe("anonymous selectable resume fixture", () => {
  it("is one selectable PDF page and produces deterministic supported fields", async () => {
    await ensurePdfFixture();
    const metadata = await stat(fixturePath);
    expect(metadata.size).toBeGreaterThan(0);
    expect(metadata.size).toBeLessThan(100_000);

    const adapter = new PdfJsPdfAdapter(fileReader(), {
      maximumFileSizeBytes: 100_000,
      maximumPageCount: 5,
    });
    const request = {
      importId: "00000000-0000-4000-8000-000000000201",
      ownerUserId: "00000000-0000-4000-8000-000000000202",
      sourceStorageKey: fixturePath,
      format: "pdf" as const,
    };
    const pageCount = await adapter.countPages(request);
    expect(pageCount).toMatchObject({
      ok: true,
      value: { renderedPageCount: 1 },
    });

    const text = await adapter.extractSelectableText(request);
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    const extractedText = text.value
      .flatMap((page) => page.items.map((item) => item.text))
      .join("\n");
    expect(extractedText).toContain("Name: Alex Martin");
    expect(extractedText).toContain("Email: alex.martin@example.test");
    expect(extractedText).toContain("Education:");
    expect(extractedText).toContain("Skills:");

    const language = await new DeterministicLanguageDetector().detectLanguage(
      request,
      text.value,
    );
    expect(language).toMatchObject({
      ok: true,
      value: { language: "english" },
    });
    if (!language.ok) return;

    const extracted = new DeterministicResumeFieldExtractor().extract(
      fragmentsFromPdf(text.value),
      language.value.language,
      "pdf",
    );
    expect(extracted.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "personal",
          fieldPath: "personal.name",
        }),
        expect.objectContaining({
          section: "contact",
          fieldPath: "contact.email",
        }),
        expect.objectContaining({ section: "education" }),
        expect.objectContaining({
          section: "skills",
          fieldPath: "skills.name",
        }),
      ]),
    );
    expect(
      extracted.fields.some(
        (field) => field.fieldPath === "work_experience.entry",
      ),
    ).toBe(false);
    expect(extracted.warnings).toEqual([]);
    expect(extracted.missingOrUnprocessedSections).toEqual([]);

    const draft = buildExtractionDraft({
      importedDocument: {
        id: request.importId,
        ownerUserId: request.ownerUserId,
        visibleFilename: "anonymous-selectable-resume.pdf",
        contentType: "application/pdf",
        fileExtension: "pdf",
        sizeBytes: metadata.size,
        storageKey: fixturePath,
        uploadStatus: "uploaded",
        validationStatus: "accepted",
        processingStatus: "processing",
        deletionStatus: "not_scheduled",
        detectedLanguage: language.value.language,
        createdAt: new Date("2026-07-30T00:00:00.000Z"),
        retentionExpiresAt: new Date("2026-08-06T00:00:00.000Z"),
      },
      fields: extracted.fields,
      warnings: extracted.warnings,
      missingOrUnprocessedSections: extracted.missingOrUnprocessedSections,
      ids: sequenceIds(),
      now: new Date("2026-07-30T00:00:00.000Z"),
    });
    expect(draft.category).toBe("complete");
    expect(draft.draft?.warnings).toEqual([]);
    expect(
      draft.draft?.fields.some(
        (field) => field.fieldPath === "work_experience.entry",
      ),
    ).toBe(false);
  });

  it("preserves explicit semantic resume facts through request, validation, mapping, and review projection", async () => {
    await ensurePdfFixture();
    const metadata = await stat(fixturePath);
    const adapter = new PdfJsPdfAdapter(fileReader(), {
      maximumFileSizeBytes: 100_000,
      maximumPageCount: 5,
    });
    const extractionInput = {
      importId: "00000000-0000-4000-8000-000000000211",
      ownerUserId: "00000000-0000-4000-8000-000000000212",
      sourceStorageKey: fixturePath,
      format: "pdf" as const,
    };
    const text = await adapter.extractSelectableText(extractionInput);
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    const pages = fragmentsFromPdf(text.value);
    const language = await new DeterministicLanguageDetector().detectLanguage(
      extractionInput,
      text.value,
    );
    expect(language.ok).toBe(true);
    if (!language.ok) return;

    const document = importedDocument(
      extractionInput,
      metadata.size,
      language.value.language,
    );
    const request = buildSemanticParseRequest(document, pages, "recall-test");
    const response = explicitResponseFor(request);
    const validation = validateSemanticResponse({ request, response });

    expect(validation.accepted).toBe(true);
    expect(validation.diagnostics).toEqual([]);
    expect(validation.noInventionValid).toBe(true);
    expect(validation.groundingValid).toBe(true);

    const mapping = mapSemanticCandidates({
      response,
      document,
      diagnostics: validation.diagnostics,
    });
    const warnings = generateSemanticWarnings({
      response,
      diagnostics: validation.diagnostics,
      mapping,
    });
    const draft = buildExtractionDraft({
      importedDocument: document,
      fields: mapping.fields,
      warnings: warnings.draftWarnings,
      missingOrUnprocessedSections: [],
      ids: sequenceIds(),
      now: new Date("2026-08-09T00:00:00.000Z"),
    });

    expect(mapping.rejected).toEqual([]);
    expect(warnings.draftWarnings).toEqual([]);
    expect(mapping.reviewRequired).toEqual([]);
    expect(draft.category).toBe("complete");
    expect(draft.draft?.fields.map((field) => field.fieldPath)).toEqual([
      "contact.full_name",
      "contact.email",
      "contact.phone",
      "contact.location",
      "headline",
      "education.0.institution",
      "education.0.credential",
      "education.0.end_date",
      "skills.0.name",
      "skills.1.name",
      "skills.2.name",
      "skills.3.name",
      "languages.0.name",
      "languages.1.name",
      "professional_links.url",
    ]);
    expect(
      draft.draft?.fields.find(
        (field) => field.fieldPath === "education.0.end_date",
      )?.value,
    ).toEqual({
      kind: "date",
      value: { year: 2022, precision: "year" },
    });
    expect(
      draft.draft?.fields
        .filter((field) => field.section === "languages")
        .map((field) => field.value),
    ).toEqual([
      { kind: "language", name: "French" },
      { kind: "language", name: "English" },
    ]);
    expect(
      mapping.evidence.every((item) =>
        request.sourceFragments.some(
          (fragment) =>
            fragment.hash === item.fragmentHash && fragment.line === item.line,
        ),
      ),
    ).toBe(true);
  });
});

function importedDocument(
  input: {
    readonly importId: string;
    readonly ownerUserId: string;
    readonly sourceStorageKey: string;
  },
  sizeBytes: number,
  detectedLanguage: NonNullable<ImportedDocument["detectedLanguage"]>,
): ImportedDocument {
  return {
    id: input.importId,
    ownerUserId: input.ownerUserId,
    visibleFilename: "anonymous-selectable-resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes,
    renderedPageCount: 1,
    detectedLanguage,
    storageKey: input.sourceStorageKey,
    uploadStatus: "uploaded",
    validationStatus: "accepted",
    processingStatus: "semantic_parsing_running",
    deletionStatus: "not_scheduled",
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
    retentionExpiresAt: new Date("2026-08-16T00:00:00.000Z"),
  };
}

function explicitResponseFor(
  request: ResumeSemanticParseRequest,
): NuvitaeSemanticExtractionResponse {
  const fragment = (line: number) => {
    const item = request.sourceFragments[line - 1];
    if (item === undefined) throw new Error(`missing fragment ${line}`);
    return item;
  };
  const evidence = (line: number, value: string) => {
    const item = fragment(line);
    const start = item.text.indexOf(value);
    if (start < 0) throw new Error(`missing source value ${value}`);
    return {
      line: item.line,
      start,
      end: start + value.length,
      fragmentHash: item.hash,
      fragmentId: `fragment-${item.order + 1}`,
    };
  };
  const value = (line: number, text: string) => ({
    value: text,
    normalizedValue: null,
    evidence: [evidence(line, text)],
    classification: "explicit" as const,
    confidence: "high" as const,
  });
  const educationLine = 9;
  const skillsLine = 11;
  const languagesLine = 13;

  return {
    schemaVersion: nuvitaeSemanticExtractionResponseVersion,
    documentLanguage: {
      value: "english",
      confidence: "high",
      evidence: [evidence(languagesLine, "English")],
    },
    sections: {
      contact: {
        fullName: value(3, "Alex Martin"),
        email: value(4, "alex.martin@example.test"),
        phone: value(5, "+33 6 12 34 56 78"),
        location: value(6, "Lyon, France"),
        website: null,
      },
      headline: value(7, "Backend Engineer"),
      summary: null,
      workExperience: [],
      education: [
        {
          candidateId: "education-1",
          institution: value(educationLine, "Example University"),
          degree: value(educationLine, "Master of Software Engineering"),
          fieldOfStudy: null,
          startDate: null,
          endDate: value(educationLine, "2022"),
          location: null,
          details: [],
        },
      ],
      skills: ["TypeScript", "NestJS", "PostgreSQL", "Docker"].map(
        (name, index) => ({
          candidateId: `skill-${index + 1}`,
          name: value(skillsLine, name),
          category: null,
        }),
      ),
      languages: ["French", "English"].map((name, index) => ({
        candidateId: `language-${index + 1}`,
        name: value(languagesLine, name),
        proficiency: null,
      })),
      projects: [],
      certifications: [],
      professionalLinks: [value(15, "https://example.test/alex-martin")],
    },
    relationships: [],
    ambiguityDiagnostics: [],
    conflictDiagnostics: [],
    privacyWarnings: [],
  };
}

async function ensurePdfFixture(): Promise<void> {
  try {
    await access(fixturePath);
  } catch {
    await execFileAsync(process.execPath, [generatorPath]);
  }
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

function sequenceIds() {
  let index = 0;
  return {
    draftId: () => "00000000-0000-4000-8000-000000000301",
    fieldId: () =>
      `00000000-0000-4000-8000-${String(index++).padStart(12, "0")}`,
    warningId: () => "00000000-0000-4000-8000-000000000399",
  };
}
