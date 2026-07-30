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
import { buildExtractionDraft } from "@nuvitae/domain";

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
});

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
