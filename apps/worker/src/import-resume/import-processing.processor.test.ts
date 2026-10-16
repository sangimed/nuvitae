import { describe, expect, it, vi } from "vitest";
import { UnrecoverableError } from "bullmq";
import type { ImportedDocument } from "@nuvitae/domain";
import { IMPORT_RESUME_JOB_NAMES } from "@nuvitae/contracts";
import { ProcessingStartDeniedError } from "@nuvitae/import-application";
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
    retentionExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function payload(
  jobType:
    | "document_validation"
    | "deterministic_extraction"
    | "foreground_timeout"
    | "source_artifact_deletion",
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
  if (jobType === "source_artifact_deletion") {
    return {
      ...base,
      jobType,
      target: { kind: "source_and_derived_artifacts" as const, id: importId },
      reason: "retention_deadline" as const,
      deleteNoLaterThan: document().retentionExpiresAt.toISOString(),
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

function setup(
  overrides: {
    doc?: ImportedDocument | null;
    accepted?: boolean;
    existingDraft?: boolean;
  } = {},
) {
  const repository = {
    transaction: vi.fn(
      async (work: (repository: unknown) => Promise<unknown>) =>
        work(repository),
    ),
    findImportByOwner: vi.fn(async () =>
      overrides.doc === null
        ? null
        : { document: overrides.doc ?? document(), artifacts: [] },
    ),
    findDraftByImportAndOwner: vi.fn(async () =>
      overrides.existingDraft === true ? { id: "existing-draft" } : null,
    ),
    saveImportLifecycle: vi.fn(async (value: ImportedDocument) => value),
  };
  const validation = {
    validate: vi.fn(async () => ({ accepted: overrides.accepted ?? true })),
  };
  const extraction = { process: vi.fn(async () => undefined) };
  const queue = { add: vi.fn(async () => undefined) };
  const sourceDeletion = {
    delete: vi.fn(async () => ({ kind: "deleted" as const, deletedAt: now })),
  };
  const processor = new ImportProcessingProcessor(
    repository as never,
    validation,
    extraction,
    queue as never,
    undefined,
    undefined,
    { now: () => now },
    sourceDeletion as never,
  );
  return {
    processor,
    repository,
    validation,
    extraction,
    queue,
    sourceDeletion,
  };
}

describe("ImportProcessingProcessor", () => {
  it("fails closed for invalid payloads", async () => {
    const { processor } = setup();
    await expect(
      processor.process(job(IMPORT_RESUME_JOB_NAMES.validation, {})),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it("executes the automatic retention source-deletion job with owner scope", async () => {
    const { processor, sourceDeletion } = setup();
    await processor.process(
      job(
        IMPORT_RESUME_JOB_NAMES.sourceDeletion,
        payload("source_artifact_deletion"),
      ),
    );
    expect(sourceDeletion.delete).toHaveBeenCalledWith({
      importId,
      ownerUserId,
      now,
    });
  });

  it("treats a missing owner-scoped import as a no-op", async () => {
    const { processor, validation } = setup({ doc: null });
    await processor.process(
      job(IMPORT_RESUME_JOB_NAMES.validation, payload("document_validation")),
    );
    expect(validation.validate).not.toHaveBeenCalled();
  });

  it("uses the same deduplicating extraction job id on validation redelivery", async () => {
    const { processor, queue } = setup();
    const value = job(
      IMPORT_RESUME_JOB_NAMES.validation,
      payload("document_validation"),
    );
    await processor.process(value);
    await processor.process(value);
    expect(queue.add).toHaveBeenCalledTimes(2);
    for (const call of queue.add.mock.calls) {
      expect(call[2]).toMatchObject({
        jobId: `import-${importId}-extraction-v1`,
        attempts: 1,
      });
    }
  });

  it("does not publish extraction for a rejected document", async () => {
    const { processor, queue } = setup({ accepted: false });
    await processor.process(
      job(IMPORT_RESUME_JOB_NAMES.validation, payload("document_validation")),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("rethrows queue publication failures so BullMQ can retry validation", async () => {
    const { processor, queue } = setup();
    queue.add.mockRejectedValueOnce(new Error("queue_unavailable"));

    await expect(
      processor.process(
        job(IMPORT_RESUME_JOB_NAMES.validation, payload("document_validation")),
      ),
    ).rejects.toThrow("queue_unavailable");
  });

  it("does not repeat validation after its durable state is terminal", async () => {
    const { processor, validation, queue } = setup({
      doc: document({
        validationStatus: "rejected",
        processingStatus: "failed",
      }),
    });

    await processor.process(
      job(IMPORT_RESUME_JOB_NAMES.validation, payload("document_validation")),
    );

    expect(validation.validate).not.toHaveBeenCalled();
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

  it("forwards the extraction job correlation id to semantic processing", async () => {
    const { processor, extraction } = setup({
      doc: document({ validationStatus: "accepted" }),
    });
    const correlationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await processor.process(
      job(IMPORT_RESUME_JOB_NAMES.extraction, {
        ...payload("deterministic_extraction"),
        correlationId,
      }),
    );

    expect(extraction.process).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId,
        importedDocumentId: importId,
        correlationId,
      }),
    );
  });

  it("does not repeat extraction after a review draft is durable", async () => {
    const { processor, extraction } = setup({
      doc: document({
        validationStatus: "accepted",
        processingStatus: "ready_for_review",
      }),
      existingDraft: true,
    });

    await processor.process(
      job(
        IMPORT_RESUME_JOB_NAMES.extraction,
        payload("deterministic_extraction"),
      ),
    );

    expect(extraction.process).not.toHaveBeenCalled();
  });

  it("emits closed limit events and retries when processing start is denied", async () => {
    const events = { emit: vi.fn() };
    const capacity = {
      admitToProcessing: vi.fn(async () => ({ kind: "denied" as const })),
      releaseCapacity: vi.fn(async () => undefined),
    };
    const repository = {
      transaction: vi.fn(
        async (work: (repository: unknown) => Promise<unknown>) =>
          work(repository),
      ),
      findImportByOwner: vi.fn(async () => ({
        document: document({ validationStatus: "accepted" }),
        artifacts: [],
      })),
      findDraftByImportAndOwner: vi.fn(async () => null),
      saveImportLifecycle: vi.fn(async (value: ImportedDocument) => value),
    };
    const extraction = {
      process: vi.fn(async () => {
        throw new ProcessingStartDeniedError();
      }),
    };
    const processor = new ImportProcessingProcessor(
      repository as never,
      { validate: vi.fn() } as never,
      extraction as never,
      { add: vi.fn() } as never,
      events as never,
      capacity as never,
    );
    await expect(
      processor.process(
        job(
          IMPORT_RESUME_JOB_NAMES.extraction,
          payload("deterministic_extraction"),
        ),
      ),
    ).rejects.toBeInstanceOf(ProcessingStartDeniedError);
    expect(events.emit).toHaveBeenCalledWith("import.active_limit_reached", {});
    expect(events.emit).toHaveBeenCalledWith(
      "import.processing_start_denied",
      {},
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
    );
  });

  it("leaves a durable draft unchanged when the timeout job loses the race", async () => {
    const { processor, repository } = setup({
      doc: document({ processingStatus: "processing" }),
      existingDraft: true,
    });

    await processor.process(
      job(
        IMPORT_RESUME_JOB_NAMES.foregroundTimeout,
        payload("foreground_timeout"),
      ),
    );

    expect(repository.saveImportLifecycle).not.toHaveBeenCalled();
  });
});
