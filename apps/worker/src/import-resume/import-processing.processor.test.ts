import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import type { ImportedDocument } from "@nuvitae/domain";
import { IMPORT_RESUME_JOB_NAMES } from "@nuvitae/contracts";
import { ImportProcessingProcessor } from "./import-processing.processor.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-07-29T09:30:00.000Z");

function document(overrides: Partial<ImportedDocument> = {}): ImportedDocument {
  return {
    id: importId,
    ownerUserId,
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    fileExtension: "pdf",
    sizeBytes: 42,
    storageKey:
      "users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/imports/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    uploadStatus: "uploaded",
    validationStatus: "not_started",
    processingStatus: "queued",
    deletionStatus: "not_scheduled",
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-05T09:30:00.000Z"),
    ...overrides,
  };
}

function payload(
  jobType:
    "document_validation" | "deterministic_extraction" | "foreground_timeout",
) {
  const base = {
    schemaVersion: "2026-07-28" as const,
    importId,
    owner: { ownerUserId },
    correlationId: importId,
    idempotencyKey: `import-${importId}-validation-v1`,
    requestedAt: now.toISOString(),
  };
  if (jobType === "document_validation") {
    return {
      ...base,
      jobType,
      documentFormat: "pdf" as const,
      sourceStorageKey: document().storageKey!,
      uploadedAt: now.toISOString(),
      foregroundDeadline: new Date(now.getTime() + 180_000).toISOString(),
      sizeBytes: 42,
    };
  }
  if (jobType === "deterministic_extraction") {
    return {
      ...base,
      jobType,
      documentFormat: "pdf" as const,
      sourceStorageKey: document().storageKey!,
      validationCompletedAt: now.toISOString(),
      foregroundDeadline: new Date(now.getTime() + 180_000).toISOString(),
    };
  }
  return {
    ...base,
    jobType,
    foregroundDeadline: new Date(now.getTime() - 1).toISOString(),
  };
}

function job(name: string, data: unknown) {
  return {
    name,
    data,
    updateProgress: vi.fn(async () => undefined),
  } as never;
}

function setup(overrides: { doc?: ImportedDocument; accepted?: boolean } = {}) {
  const repository = {
    findImportByOwner: vi.fn(async () =>
      overrides.doc === null
        ? null
        : { document: overrides.doc ?? document(), artifacts: [] },
    ),
    findDraftByImportAndOwner: vi.fn(async () => null),
    saveImportLifecycle: vi.fn(async (value: ImportedDocument) => value),
  };
  const transactionRunner = {
    transaction: vi.fn(async (work: (manager: object) => Promise<unknown>) =>
      work({}),
    ),
  };
  const validation = {
    validate: vi.fn(async () => ({ accepted: overrides.accepted ?? true })),
  };
  const extraction = { process: vi.fn(async () => undefined) };
  const queue = { add: vi.fn(async () => undefined) };
  const processor = new ImportProcessingProcessor(
    repository as never,
    transactionRunner as never,
    validation,
    extraction,
    queue as never,
  );
  return {
    processor,
    repository,
    transactionRunner,
    validation,
    extraction,
    queue,
  };
}

describe("ImportProcessingProcessor", () => {
  it("fails closed for invalid payloads", async () => {
    const { processor } = setup();
    await expect(
      processor.process(job(IMPORT_RESUME_JOB_NAMES.validation, {})),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("treats a missing owner-scoped import as a no-op", async () => {
    const { processor, validation } = setup({ doc: null });
    await processor.process(
      job(IMPORT_RESUME_JOB_NAMES.validation, payload("document_validation")),
    );
    expect(validation.validate).not.toHaveBeenCalled();
  });

  it("publishes extraction once after accepted validation", async () => {
    const { processor, queue } = setup();
    const value = job(
      IMPORT_RESUME_JOB_NAMES.validation,
      payload("document_validation"),
    );
    await processor.process(value);
    await processor.process(value);
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0]?.[2]).toMatchObject({
      jobId: `import-${importId}-extraction-v1`,
    });
  });

  it("does not publish extraction for a rejected document", async () => {
    const { processor, queue } = setup({ accepted: false });
    await processor.process(
      job(IMPORT_RESUME_JOB_NAMES.validation, payload("document_validation")),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("reports ordered, private-safe extraction progress", async () => {
    const { processor } = setup({
      doc: document({ validationStatus: "accepted" }),
    });
    const value = job(
      IMPORT_RESUME_JOB_NAMES.extraction,
      payload("deterministic_extraction"),
    );
    await processor.process(value);
    expect(
      value.updateProgress.mock.calls.map(
        (call: [{ step: string }]) => call[0].step,
      ),
    ).toEqual([
      "reading_content",
      "organizing_resume_sections",
      "preparing_review",
    ]);
    expect(JSON.stringify(value.updateProgress.mock.calls)).not.toContain(
      "resume.pdf",
    );
  });

  it("wins the timeout race without overwriting a ready draft", async () => {
    const { processor, repository } = setup({
      doc: document({ processingStatus: "processing" }),
    });
    await processor.process(
      job(
        IMPORT_RESUME_JOB_NAMES.foregroundTimeout,
        payload("foreground_timeout"),
      ),
    );
    expect(repository.saveImportLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ processingStatus: "timeout_partial" }),
      expect.anything(),
    );
  });
});
