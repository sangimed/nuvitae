import {
  buildDocx,
  buildPdf,
  buildStructuralPdf,
  documentXml,
  paragraphXml,
} from "../../../packages/extraction/src/testing/test-document-builders.js";
import { describe, expect, it } from "vitest";
import {
  addDocument,
  createValidationHarness,
  importedDocument,
  otherUserId,
  ownerUserId,
  validateOwned,
} from "./validation-test-harness.js";

describe("malformed and protected document validation", () => {
  it("passes passive URI links through page, text, and language validation", async () => {
    const source = buildStructuralPdf({ cases: ["uri", "uri", "uri"] });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000300",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: true,
      renderedPageCount: 1,
    });
    expect(
      harness.logs.find((log) => log.event === "validation.completed"),
    ).toMatchObject({
      event: "validation.completed",
      metadata: {
        errorCategory: "accepted",
        pageCountBucket: "one",
      },
    });
    expect(JSON.stringify(harness.logs)).not.toContain("professional.example");
  });

  it("stops active PDF content before page/language validation and logs only its reason code", async () => {
    const source = buildStructuralPdf({ cases: ["javascript"] });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000309",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "unsafe_content" },
    });
    expect(
      harness.logs.find((log) => log.event === "validation.completed"),
    ).toMatchObject({
      event: "validation.completed",
      metadata: {
        errorCategory: "unsafe_content",
        pageCountBucket: "not_known",
        languageCategory: "not_known",
        pdfSafetyReason: "pdf_javascript_action",
      },
    });
    expect(JSON.stringify(harness.logs)).not.toContain("synthetic");
  });

  it.each([
    ["malformed PDF", new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])],
    ["corrupted PDF", new Uint8Array([1, 2, 3, 4, 5, 6])],
  ])("rejects %s with a stable public category", async (_name, source) => {
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000301",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "malformed_or_corrupted", retryable: false },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("rejected");
  });

  it("rejects a truncated PDF without exposing PDF.js diagnostics", async () => {
    const complete = await buildPdf({
      pages: [["Synthetic private diagnostic sentinel"]],
    });
    const source = complete.subarray(0, Math.floor(complete.byteLength / 2));
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000302",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);
    const serialized = JSON.stringify({ response, logs: harness.logs });

    expect(response.failure?.code).toBe("malformed_or_corrupted");
    expect(serialized).not.toContain("sentinel");
    expect(serialized).not.toContain("xref");
    expect(serialized).not.toContain(document.visibleFilename);
    expect(serialized).not.toContain(document.storageKey);
  });

  it("rejects encrypted/password-protected PDFs", async () => {
    const source = await buildPdf({
      pages: [["Professional experience and education with team skills"]],
      password: "synthetic-password",
    });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000303",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: false,
      failure: { code: "password_protected" },
    });
  });

  it.each([
    ["malformed DOCX ZIP", async () => new Uint8Array([0x50, 0x4b, 1, 2, 3])],
    ["missing DOCX main document", async () => await buildDocx({})],
    [
      "malformed WordprocessingML",
      async () =>
        await buildDocx({
          documentXml:
            '<?xml version="1.0"?><w:document xmlns:w="urn:invalid"><w:body><w:p>',
        }),
    ],
  ])("rejects %s safely", async (_name, buildSource) => {
    const source = await buildSource();
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000304",
      source,
      format: "docx",
    });
    addDocument(harness, document, source);

    const response = await validateOwned(harness, document.id);

    expect(response.failure?.code).toBe("malformed_or_corrupted");
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("rejected");
  });

  it("rejects an encrypted DOCX ZIP entry as password protected", async () => {
    const valid = await buildDocx({
      documentXml: documentXml(
        paragraphXml("<w:t>Professional experience and skills</w:t>"),
      ),
    });
    const source = markZipEntriesEncrypted(valid);
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000305",
      source,
      format: "docx",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: false,
      failure: { code: "password_protected" },
    });
  });

  it("rejects macro-enabled DOCX without executing active content", async () => {
    const source = await buildDocx({
      documentXml: documentXml(
        paragraphXml("<w:t>Professional experience and skills</w:t>"),
      ),
      mainContentType: "application/vnd.ms-word.document.macroEnabled.main+xml",
      additionalEntries: {
        "word/vbaProject.bin": new Uint8Array([1, 2, 3]),
      },
    });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000306",
      source,
      format: "docx",
    });
    addDocument(harness, document, source);

    await expect(validateOwned(harness, document.id)).resolves.toMatchObject({
      accepted: false,
      failure: { code: "unsafe_content" },
    });
  });

  it("keeps infrastructure failures retryable and does not persist rejection", async () => {
    const source = await buildDocx({
      documentXml: documentXml(
        paragraphXml(
          "<w:t>Professional experience and education with skills developed for the company team and managed project responsibilities.</w:t>",
        ),
      ),
    });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000307",
      source,
      format: "docx",
    });
    addDocument(harness, document, source);
    harness.pageCountFailures.set(document.storageKey!, "unexpected");

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "terminal_failure", retryable: true },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("not_started");
    expect(harness.repository.draftSaveCount).toBe(0);
    expect(harness.repository.artifactCreateCount).toBe(0);
  });

  it("restores a retryable state when the private source is missing", async () => {
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000310",
      source: new Uint8Array([1]),
      format: "pdf",
    });
    harness.repository.documents.set(document.id, document);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "terminal_failure", retryable: true },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("not_started");
  });

  it("maps cancellation to a stable retryable outcome without rejecting", async () => {
    const source = await buildPdf({ pages: [["Synthetic selectable text"]] });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000311",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);
    const controller = new AbortController();
    controller.abort();

    const response = await validateOwned(
      harness,
      document.id,
      controller.signal,
    );

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "cancelled", retryable: true },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("not_started");
  });

  it("does not expose a failed final persistence commit as acceptance", async () => {
    const source = await buildPdf({
      pages: [
        [
          "Professional experience and education with skills developed for the company team. Managed project responsibilities and built systems for many years.",
        ],
      ],
    });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000312",
      source,
      format: "pdf",
    });
    addDocument(harness, document, source);
    harness.repository.failLifecycleSaveOnAttempt = 2;

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "terminal_failure", retryable: true },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("not_started");
  });

  it("returns the same public failure for missing and wrong-owner imports", async () => {
    const source = await buildPdf({ pages: [["Synthetic text"]] });
    const harness = createValidationHarness();
    const document = importedDocument({
      id: "00000000-0000-4000-8000-000000000308",
      source,
      format: "pdf",
      ownerId: otherUserId,
    });
    addDocument(harness, document, source);

    const wrongOwner = await harness.service.validate({
      ownerUserId,
      importedDocumentId: document.id,
    });
    const missing = await harness.service.validate({
      ownerUserId,
      importedDocumentId: "00000000-0000-4000-8000-000000000309",
    });

    expect(wrongOwner.failure).toEqual(missing.failure);
    expect(wrongOwner.accepted).toBe(false);
    expect(missing.accepted).toBe(false);
  });
});

function markZipEntriesEncrypted(value: Uint8Array): Uint8Array {
  const result = Buffer.from(value);
  for (let offset = 0; offset <= result.byteLength - 10; offset += 1) {
    const signature = result.readUInt32LE(offset);
    if (signature === 0x04034b50) {
      result.writeUInt16LE(result.readUInt16LE(offset + 6) | 0x1, offset + 6);
    } else if (signature === 0x02014b50) {
      result.writeUInt16LE(result.readUInt16LE(offset + 8) | 0x1, offset + 8);
    }
  }
  return result;
}
