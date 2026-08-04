import type { ImportedDocument } from "@nuvitae/domain";
import type {
  ImportAggregate,
  ImportResumeRepository,
  PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { describe, expect, it, vi } from "vitest";
import { documentedImportProcessingDefaults } from "../config/import-processing-limits.js";
import type { ImportReservationResult } from "../services/import-resume/import-limits.js";
import { StartImportResponseContractError } from "./start-import.errors.js";
import type {
  StartImportClock,
  StartImportIdGenerator,
  StartImportLimitPort,
  StartImportPrivacyLogger,
  StartImportPrivateStorage,
  StartImportRequestIdGenerator,
} from "./start-import.ports.js";
import { StartImportService } from "./start-import.service.js";

const ownerUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const reservation = {
  id: "reservation-1",
  ownerUserId,
  attemptedAt: new Date("2026-07-29T09:30:00.000Z"),
  state: "reserved" as const,
};
const docxContentType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("StartImportService", () => {
  it.each([
    ["resume.pdf", "application/pdf", "pdf"],
    ["resume.DOCX", docxContentType, "docx"],
  ] as const)(
    "durably creates one uploaded %s document with seven-day retention",
    async (filename, contentType, expectedFormat) => {
      const harness = createHarness();
      const response = await harness.service.start({
        ownerUserId,
        visibleFilename: filename,
        contentType,
        content: Buffer.from("synthetic resume bytes"),
      });

      expect(response).toMatchObject({
        importId,
        requestId,
        uploadStatus: "uploaded",
        status: "import_initialization",
      });
      expect(response.retentionExpiresAt).toBe("2026-08-05T09:30:00.000Z");
      expect(harness.storage.writeObject).toHaveBeenCalledOnce();
      expect(harness.transactionRunner.transaction).toHaveBeenCalledOnce();
      expect(harness.repository.createImportAggregate).toHaveBeenCalledOnce();
      const aggregate = harness.repository.createImportAggregate.mock
        .calls[0]?.[0] as ImportAggregate;
      expect(aggregate.artifacts).toEqual([]);
      expect(aggregate.document).toMatchObject({
        id: importId,
        ownerUserId,
        visibleFilename: filename,
        contentType,
        fileExtension: expectedFormat,
        sizeBytes: Buffer.byteLength("synthetic resume bytes"),
        uploadStatus: "uploaded",
        validationStatus: "not_started",
        processingStatus: "not_started",
        deletionStatus: "not_scheduled",
        createdAt: new Date("2026-07-29T09:30:00.000Z"),
        retentionExpiresAt: new Date("2026-08-05T09:30:00.000Z"),
      });
      expect(aggregate.document.storageKey).toMatch(
        new RegExp(
          `^users/${ownerUserId}/imports/${importId}/source/[a-f0-9]{32}$`,
        ),
      );
      expect(aggregate.document.storageKey).not.toContain(filename);
      expect(harness.limits.releaseReservation).toHaveBeenCalledWith(
        ownerUserId,
        reservation.id,
        reservation.attemptedAt,
      );
      expect(harness.limits.rollbackReservation).not.toHaveBeenCalled();
    },
  );

  it("normalizes path components and caps only the visible filename", async () => {
    const harness = createHarness();
    const longStem = "r".repeat(300);
    await harness.service.start({
      ownerUserId,
      visibleFilename: `C:\\client\\folder\\${longStem}.pdf`,
      contentType: "application/pdf",
      content: Buffer.from("pdf"),
    });

    const document = createdDocument(harness);
    expect(document.visibleFilename).toHaveLength(255);
    expect(document.visibleFilename.endsWith(".pdf")).toBe(true);
    expect(document.visibleFilename).not.toContain("\\");
    expect(document.storageKey).not.toContain("client");
  });

  it.each([
    ["resume.txt", "text/plain"],
    ["resume.pdf", docxContentType],
    ["resume.docx", "application/pdf"],
    ["resume", "application/pdf"],
  ])("rejects unsupported or mismatched %s metadata", async (name, type) => {
    const harness = createHarness();
    await expect(
      harness.service.start({
        ownerUserId,
        visibleFilename: name,
        contentType: type,
        content: Buffer.from("bytes"),
      }),
    ).rejects.toMatchObject({
      status: 415,
      code: "unsupported_format",
    });
    expect(harness.storage.writeObject).not.toHaveBeenCalled();
    expect(harness.repository.createImportAggregate).not.toHaveBeenCalled();
    expect(harness.limits.releaseReservation).toHaveBeenCalledOnce();
    expect(harness.limits.rollbackReservation).not.toHaveBeenCalled();
  });

  it("rejects empty, over-limit, and unsafe upload values after reserving the attempt", async () => {
    for (const input of [
      {
        visibleFilename: "resume.pdf",
        contentType: "application/pdf",
        content: Buffer.alloc(0),
        code: "empty_file",
      },
      {
        visibleFilename: "resume.pdf",
        contentType: "application/pdf",
        content: Buffer.alloc(
          documentedImportProcessingDefaults.maxUploadSizeBytes + 1,
        ),
        code: "oversized_file",
      },
      {
        visibleFilename: "unsafe\u0000resume.pdf",
        contentType: "application/pdf",
        content: Buffer.from("bytes"),
        code: "unsafe_upload_metadata",
      },
    ]) {
      const harness = createHarness();
      await expect(
        harness.service.start({ ownerUserId, ...input }),
      ).rejects.toMatchObject({ code: input.code });
      expect(harness.limits.reserveAttempt).toHaveBeenCalledOnce();
      expect(harness.limits.releaseReservation).toHaveBeenCalledOnce();
      expect(harness.storage.writeObject).not.toHaveBeenCalled();
    }
  });

  it("returns rate limiting with retry timing and fails closed on unavailable state", async () => {
    const denied: ImportReservationResult = {
      allowed: false,
      code: "IMPORT_ATTEMPT_LIMIT_REACHED",
      retryAfterSeconds: 47,
    };
    const rateLimited = createHarness({ reservationResult: denied });
    await expect(startPdf(rateLimited.service)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 47,
    });

    const unavailable = createHarness({
      reservationResult: {
        allowed: false,
        code: "IMPORT_LIMIT_STATE_UNAVAILABLE",
        retryAfterSeconds: 60,
      },
    });
    await expect(startPdf(unavailable.service)).rejects.toMatchObject({
      status: 503,
      code: "import_limit_unavailable",
    });
    expect(unavailable.storage.writeObject).not.toHaveBeenCalled();
  });

  it("rolls back without persistence when private storage fails", async () => {
    const harness = createHarness({ storageFailure: "private/root secret" });
    await expect(startPdf(harness.service)).rejects.toMatchObject({
      status: 503,
      code: "storage_unavailable",
    });
    expect(harness.repository.createImportAggregate).not.toHaveBeenCalled();
    expect(harness.limits.rollbackReservation).toHaveBeenCalledOnce();
  });

  it("deletes private storage and rolls back when persistence fails", async () => {
    const harness = createHarness({
      persistenceFailure: "postgres password SELECT * FROM private",
    });
    await expect(startPdf(harness.service)).rejects.toMatchObject({
      status: 503,
      code: "persistence_unavailable",
    });
    expect(harness.storage.deleteObject).toHaveBeenCalledOnce();
    expect(harness.limits.rollbackReservation).toHaveBeenCalledOnce();
    expect(harness.limits.releaseReservation).not.toHaveBeenCalled();
  });

  it("reports a generic internal failure when compensation deletion fails", async () => {
    const harness = createHarness({
      persistenceFailure: "raw database error",
      deletionFailure: "private filesystem path",
    });
    let error: unknown;
    try {
      await startPdf(harness.service);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ status: 500, code: "internal_failure" });
    expect(JSON.stringify(error)).not.toContain("database");
    expect(JSON.stringify(error)).not.toContain("filesystem");
    expect(harness.logger.emit).toHaveBeenCalledWith(
      "import.storage_delete_failed",
      expect.objectContaining({ importId, retryable: true }),
    );
    expect(harness.limits.rollbackReservation).toHaveBeenCalledOnce();
  });

  it("makes a post-durability response contract failure visible to developers", async () => {
    const harness = createHarness({ requestId: "not-a-uuid" });
    await expect(startPdf(harness.service)).rejects.toBeInstanceOf(
      StartImportResponseContractError,
    );
    expect(harness.repository.createImportAggregate).toHaveBeenCalledOnce();
    expect(harness.storage.deleteObject).not.toHaveBeenCalled();
    expect(harness.limits.releaseReservation).toHaveBeenCalledOnce();
  });

  it("creates independent imports and deadlines for repeated same-file uploads", async () => {
    const firstTime = new Date("2026-07-29T09:30:00.000Z");
    const secondTime = new Date("2026-07-29T10:00:00.000Z");
    const harness = createHarness({
      times: [firstTime, secondTime],
      importIds: [importId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"],
      requestIds: [requestId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"],
    });

    const first = await startPdf(harness.service);
    const second = await startPdf(harness.service);
    const documents = harness.repository.createImportAggregate.mock.calls.map(
      (call) => (call[0] as ImportAggregate).document,
    );

    expect(first.importId).not.toBe(second.importId);
    expect(documents[0]?.storageKey).not.toBe(documents[1]?.storageKey);
    expect(first.retentionExpiresAt).toBe("2026-08-05T09:30:00.000Z");
    expect(second.retentionExpiresAt).toBe("2026-08-05T10:00:00.000Z");
  });

  it("keeps sensitive inputs and infrastructure diagnostics out of public errors and logs", async () => {
    const harness = createHarness({
      persistenceFailure:
        "password=secret /var/lib/nuvitae/private Candidate Resume.pdf",
    });
    let error: unknown;
    try {
      await harness.service.start({
        ownerUserId,
        visibleFilename: "Candidate Resume.pdf",
        contentType: "application/pdf",
        content: Buffer.from("top secret resume content"),
      });
    } catch (caught) {
      error = caught;
    }
    const publicAndLogs = JSON.stringify({
      error,
      logs: harness.logRecords,
    });
    expect(publicAndLogs).not.toContain("Candidate Resume.pdf");
    expect(publicAndLogs).not.toContain("top secret resume content");
    expect(publicAndLogs).not.toContain("password=secret");
    expect(publicAndLogs).not.toContain("/var/lib");
  });
});

function createHarness(
  options: {
    readonly reservationResult?: ImportReservationResult;
    readonly storageFailure?: string;
    readonly persistenceFailure?: string;
    readonly deletionFailure?: string;
    readonly requestId?: string;
    readonly times?: readonly Date[];
    readonly importIds?: readonly string[];
    readonly requestIds?: readonly string[];
  } = {},
) {
  const times = [...(options.times ?? [new Date("2026-07-29T09:30:00.000Z")])];
  const importIds = [...(options.importIds ?? [importId])];
  const requestIds = [
    ...(options.requestIds ?? [options.requestId ?? requestId]),
  ];
  const clock: StartImportClock = {
    now: vi.fn(() => times.shift() ?? reservation.attemptedAt),
  };
  const idGenerator: StartImportIdGenerator = {
    nextId: vi.fn(() => importIds.shift() ?? importId),
  };
  const requestIdGenerator: StartImportRequestIdGenerator = {
    nextRequestId: vi.fn(() => requestIds.shift() ?? requestId),
  };
  const storage: StartImportPrivateStorage & {
    writeObject: ReturnType<typeof vi.fn>;
    deleteObject: ReturnType<typeof vi.fn>;
  } = {
    writeObject: vi.fn(async () => {
      if (options.storageFailure !== undefined) {
        throw new Error(options.storageFailure);
      }
    }),
    deleteObject: vi.fn(async () => {
      if (options.deletionFailure !== undefined) {
        throw new Error(options.deletionFailure);
      }
      return { deleted: true };
    }),
  };
  const limits: StartImportLimitPort & {
    reserveAttempt: ReturnType<typeof vi.fn>;
    releaseReservation: ReturnType<typeof vi.fn>;
    rollbackReservation: ReturnType<typeof vi.fn>;
  } = {
    reserveAttempt: vi.fn(
      async () =>
        options.reservationResult ?? {
          allowed: true as const,
          reservation,
        },
    ),
    releaseReservation: vi.fn(async () => undefined),
    rollbackReservation: vi.fn(async () => undefined),
  };
  const repository = {
    createImportAggregate: vi.fn(
      async (aggregate: ImportAggregate): Promise<ImportAggregate> => {
        if (options.persistenceFailure !== undefined) {
          throw new Error(options.persistenceFailure);
        }
        return aggregate;
      },
    ),
  } as unknown as ImportResumeRepository & {
    createImportAggregate: ReturnType<typeof vi.fn>;
  };
  const transactionRunner: PersistenceTransactionRunner & {
    transaction: ReturnType<typeof vi.fn>;
  } = {
    transaction: vi.fn(async (work) => {
      return work({} as never);
    }),
  };
  const logRecords: unknown[] = [];
  const logger: StartImportPrivacyLogger & {
    emit: ReturnType<typeof vi.fn>;
  } = {
    emit: vi.fn((event, metadata) => logRecords.push({ event, metadata })),
  };
  const service = new StartImportService(
    repository,
    transactionRunner,
    storage,
    limits,
    documentedImportProcessingDefaults,
    clock,
    idGenerator,
    requestIdGenerator,
    logger,
  );
  return {
    service,
    repository,
    transactionRunner,
    storage,
    limits,
    logger,
    logRecords,
  };
}

function startPdf(service: StartImportService) {
  return service.start({
    ownerUserId,
    visibleFilename: "resume.pdf",
    contentType: "application/pdf",
    content: Buffer.from("same synthetic file"),
  });
}

function createdDocument(
  harness: ReturnType<typeof createHarness>,
): ImportedDocument {
  return (
    harness.repository.createImportAggregate.mock
      .calls[0]?.[0] as ImportAggregate
  ).document;
}
