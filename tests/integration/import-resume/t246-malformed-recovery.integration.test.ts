import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PdfJsPdfAdapter } from "@nuvitae/extraction";
import {
  addDocument,
  createValidationHarness,
  importedDocument,
  ownerUserId,
  validateOwned,
} from "./validation-test-harness.js";

/**
 * T246-C08 offline malformed/unsupported recovery proof for the checked-in
 * binary fixture `tests/fixtures/resumes/anonymous-malformed-resume.pdf`.
 *
 * The fixture is deliberately not a valid PDF. The expected behavior is
 * deterministic recovery/failure: extraction and validation fail closed with
 * the malformed-document category, no semantic model invocation is attempted
 * (the fixture has no semantic corpus entry), no credential recovery is
 * required, the user-facing recovery category is stable, the sanitized
 * evidence shape carries only safe metadata, and no raw parser exception or
 * document content is persisted.
 */

const fixturePath = "tests/fixtures/resumes/anonymous-malformed-resume.pdf";
const importId = "00000000-0000-4000-8000-000000000718";

// Pinned SHA-256 of the deterministic malformed binary.
const EXPECTED_FIXTURE_SHA256 =
  "14bcd090baf31edba64e9cbd8cdfc15f943344aa72cb3675ad8e91bfcbce03ad";

describe("T246-C08 malformed/unsupported recovery", () => {
  it("is a checked-in deterministic binary with the pinned fixture hash", async () => {
    const metadata = await stat(fixturePath);
    expect(metadata.size).toBeGreaterThan(0);
    const bytes = await readFile(fixturePath);
    expect(fixtureSha256(bytes)).toBe(EXPECTED_FIXTURE_SHA256);
    const again = await readFile(fixturePath);
    expect(Buffer.compare(bytes, again)).toBe(0);
  });

  it("fails closed at the production PDF adapter with the malformed category", async () => {
    const bytes = await readFile(fixturePath);
    const adapter = new PdfJsPdfAdapter(
      {
        async readSource(input) {
          return bytes.byteLength > input.maximumBytes
            ? bytes.subarray(0, input.maximumBytes + 1)
            : bytes;
        },
      },
      { maximumFileSizeBytes: 100_000, maximumPageCount: 5 },
    );
    const request = {
      importId,
      ownerUserId,
      sourceStorageKey: fixturePath,
      format: "pdf" as const,
    };

    const pageCount = await adapter.countPages(request);
    const extraction = await adapter.extractSelectableText(request);
    expect(pageCount).toMatchObject({
      ok: false,
      error: { category: "malformed", retryable: false },
    });
    expect(extraction).toMatchObject({
      ok: false,
      error: { category: "malformed", retryable: false },
    });
  });

  it("maps to the stable user-facing recovery category without a draft or artifact", async () => {
    const bytes = await readFile(fixturePath);
    const harness = createValidationHarness();
    const document = importedDocument({
      id: importId,
      source: bytes,
      format: "pdf",
    });
    addDocument(harness, document, bytes);

    const response = await validateOwned(harness, document.id);

    expect(response).toMatchObject({
      accepted: false,
      failure: { code: "malformed_or_corrupted", retryable: false },
    });
    expect(
      harness.repository.documents.get(document.id)?.validationStatus,
    ).toBe("rejected");
    expect(harness.repository.draftSaveCount).toBe(0);
    expect(harness.repository.artifactCreateCount).toBe(0);
    expect(harness.repository.lifecycleSaveCount).toBeGreaterThan(0);
  });

  it("persists only sanitized evidence with no parser exception or document content", async () => {
    const bytes = await readFile(fixturePath);
    const harness = createValidationHarness();
    const document = importedDocument({
      id: importId,
      source: bytes,
      format: "pdf",
    });
    addDocument(harness, document, bytes);

    const response = await validateOwned(harness, document.id);
    const serialized = JSON.stringify({ response, logs: harness.logs });

    expect(serialized).not.toContain("anonymous-malformed-resume");
    expect(serialized).not.toContain(document.storageKey!);
    expect(serialized).not.toContain("xref");
    expect(serialized).not.toContain("PDF.js");
    expect(serialized).not.toContain("PDFDocument");
    expect(serialized).not.toContain("%PDF-1.4");
    for (const entry of harness.logs) {
      expect(entry.metadata).not.toHaveProperty("stack");
      expect(entry.metadata).not.toHaveProperty("message");
    }
  });
});

function fixtureSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
