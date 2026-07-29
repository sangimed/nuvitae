import { validationResponseSchema } from "@nuvitae/contracts";
import type { ImportedDocument } from "@nuvitae/domain";
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
  ownerUserId,
  retentionExpiresAt,
  validateOwned,
} from "./validation-test-harness.js";

const english =
  "Professional experience and education with skills developed for the company team. Managed project responsibilities and built systems for many years.";
const french =
  "Expérience professionnelle et éducation avec des compétences développées pour une équipe. Gestion de projet et responsabilités réalisées dans une entreprise.";
const bilingual = `${english} ${french}`;
const spanish =
  "Experiencia profesional y educación con habilidades para el trabajo. Proyecto desarrollado con equipo y responsabilidades durante muchos años.";

const docxWith = async (text: string) =>
  await buildDocx({
    documentXml: documentXml(paragraphXml(`<w:t>${text}</w:t>`)),
  });

describe("document upload validation integration", () => {
  it.each([
    ["PDF", "pdf" as const],
    ["DOCX", "docx" as const],
  ])("accepts a valid %s source at or below 10 MB", async (_name, format) => {
    const harness = createValidationHarness();
    const source =
      format === "pdf"
        ? await buildPdf({ pages: [[english]] })
        : await docxWith(english);
    const document = importedDocument({
      id:
        format === "pdf"
          ? "00000000-0000-4000-8000-000000000201"
          : "00000000-0000-4000-8000-000000000202",
      source,
      format,
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(validationResponseSchema.parse(response).accepted).toBe(true);
    expect(harness.repository.documents.get(document.id)).toMatchObject({
      validationStatus: "accepted",
      processingStatus: "not_started",
    });
  });

  it.each([
    ["empty input", new Uint8Array(), "malformed_or_corrupted"],
    ["over 10 MB", new Uint8Array(10 * 1024 * 1024 + 1), "oversized_file"],
  ])("rejects %s", async (_name, source, expectedCode) => {
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000203",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: expectedCode },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("rejected");
  });

  it("rejects unsupported stored types and extension/content-type mismatches", async () => {
    const source = await buildPdf({ pages: [[english]] });
    for (const document of [
      {
        ...importedDocument({
          id: "00000000-0000-4000-8000-000000000204",
          source,
          format: "pdf",
        }),
        fileExtension: "unsupported" as const,
      },
      importedDocument({
        id: "00000000-0000-4000-8000-000000000205",
        source,
        format: "pdf",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ]) {
      const harness = createValidationHarness();
      addDocument(harness, document as ImportedDocument, source);
      await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
        accepted: false,
        failure: { code: "unsupported_format" },
      });
    }
  });

  it.each([
    [1, true, undefined],
    [5, true, undefined],
    [6, false, "over_page_limit"],
  ])("enforces PDF rendered page count %i", async (pages, accepted, code) => {
    const harness = createValidationHarness();
    const source = await buildPdf({
      pages: Array.from({ length: pages }, (_, index) =>
        index === 0 ? [english] : [],
      ),
    });
    const document = importedDocument({
      id: `00000000-0000-4000-8000-${String(210 + pages).padStart(12, "0")}`,
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response.accepted).toBe(accepted);
    expect(response.renderedPageCount).toBe(pages);
    expect(response.failure?.code).toBe(code);
  });

  it.each([
    [1, true, undefined],
    [5, true, undefined],
    [6, false, "over_page_limit"],
  ])("enforces DOCX rendered page count %i", async (pages, accepted, code) => {
    const harness = createValidationHarness();
    const source = await docxWith(english);
    const document = importedDocument({
      id: `00000000-0000-4000-8000-${String(220 + pages).padStart(12, "0")}`,
      source,
      format: "docx",
    });
    addDocument(harness, document, source, pages);

    const response = await validateOwned(harness, document.id);

    expect(response.accepted).toBe(accepted);
    expect(response.renderedPageCount).toBe(pages);
    expect(response.failure?.code).toBe(code);
  });

  it("accepts selectable PDF and usable DOCX text, and rejects text-empty documents", async () => {
    const cases = [
      {
        format: "pdf" as const,
        source: await buildPdf({ pages: [[english]] }),
        accepted: true,
      },
      {
        format: "pdf" as const,
        source: await buildPdf({ pages: [[]] }),
        accepted: false,
      },
      {
        format: "docx" as const,
        source: await docxWith(english),
        accepted: true,
      },
      {
        format: "docx" as const,
        source: await docxWith("   "),
        accepted: false,
      },
    ];
    for (const [index, item] of cases.entries()) {
      const harness = createValidationHarness();
      const document = importedDocument({
        id: `00000000-0000-4000-8000-${String(230 + index).padStart(12, "0")}`,
        source: item.source,
        format: item.format,
      });
      addDocument(harness, document, item.source);
      const response = await validateOwned(harness, document.id);
      expect(response.accepted).toBe(item.accepted);
      if (!item.accepted) {
        expect(response.failure?.code).toBe("no_selectable_text");
      }
    }
  });

  it.each([
    ["english", english, "english", true],
    ["french", french, "french", true],
    ["bilingual", bilingual, "bilingual_french_english", true],
    ["unsupported", spanish, "unsupported", false],
  ])(
    "detects %s fixture language",
    async (_name, text, detectedLanguage, accepted) => {
      const harness = createValidationHarness();
      const source = await buildPdf({ pages: [[text]] });
      const document = importedDocument({
        id: `00000000-0000-4000-8000-${String(240 + harness.sources.size).padStart(12, "0")}`,
        source,
        format: "pdf",
      });
      addDocument(harness, document, source);

      const response = await validateOwned(harness, document.id);

      expect(response).toMatchObject({ accepted, detectedLanguage });
      if (!accepted) {
        expect(response.failure).toMatchObject({
          code: "unsupported_language",
          recoveryActions: ["replace_upload", "manual_entry"],
        });
      }
    },
  );

  it("preserves retention and source lifecycle while creating no draft, job, or artifact", async () => {
    const harness = createValidationHarness();
    const source = await buildPdf({ pages: [[english]] });
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000250",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    await validateOwned(harness, document.id);

    const persisted = harness.repository.documents.get(document.id);
    expect(persisted?.retentionExpiresAt).toEqual(retentionExpiresAt);
    expect(persisted?.storageKey).toBe(document.storageKey);
    expect(persisted?.processingStatus).toBe("not_started");
    expect(harness.repository.draftSaveCount).toBe(0);
    expect(harness.repository.artifactCreateCount).toBe(0);
    expect(ownerUserId).toBe(document.ownerUserId);
  });
});
