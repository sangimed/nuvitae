import { describe, expect, it, vi } from "vitest";
import {
  SourceDeletionService,
  sourceReconstructingStorageKeys,
  type SourceDeletionClaim,
} from "./source-deletion.js";
import type { ImportEventEmitter } from "./observability/import-events.js";

const importId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const now = new Date("2026-08-01T09:00:00.000Z");

describe("SourceDeletionService", () => {
  it("deletes every distinct source-reconstructing key before completing", async () => {
    const harness = setup({
      kind: "claimed",
      storageKeys: ["source-key", "artifact-key", "source-key"],
    });

    await expect(
      harness.service.delete({ importId, ownerUserId, now }),
    ).resolves.toEqual({ kind: "deleted", deletedAt: now });
    expect(harness.storage.deleteObject.mock.calls).toEqual([
      ["source-key"],
      ["artifact-key"],
    ]);
    expect(harness.repository.completeSourceDeletion).toHaveBeenCalledWith(
      importId,
      ownerUserId,
      now,
    );
  });

  it("is idempotent after completed deletion", async () => {
    const deletedAt = new Date("2026-07-31T09:00:00.000Z");
    const harness = setup({ kind: "already_deleted", deletedAt });

    await expect(
      harness.service.delete({ importId, ownerUserId, now }),
    ).resolves.toEqual({ kind: "deleted", deletedAt });
    expect(harness.storage.deleteObject).not.toHaveBeenCalled();
    expect(harness.repository.completeSourceDeletion).not.toHaveBeenCalled();
  });

  it("fails closed and leaves the lifecycle retryable when storage fails", async () => {
    const events: ImportEventEmitter = { emit: vi.fn() };
    const harness = setup(
      { kind: "claimed", storageKeys: ["source-key"] },
      events,
    );
    harness.storage.deleteObject.mockRejectedValueOnce(
      new Error("private path"),
    );

    await expect(
      harness.service.delete({
        importId,
        ownerUserId,
        now,
        queueJobId: "delete-source-job",
        deliveryId: "delivery-id",
        retryOrdinal: 1,
      }),
    ).resolves.toEqual({ kind: "failed" });
    expect(harness.repository.completeSourceDeletion).not.toHaveBeenCalled();
    expect(harness.repository.failSourceDeletion).toHaveBeenCalledWith(
      importId,
      ownerUserId,
    );
    expect(events.emit).toHaveBeenCalledWith("import.storage_delete_failed", {
      importId,
      retryable: true,
      queueJobId: "delete-source-job",
      deliveryId: "delivery-id",
      retryOrdinal: 1,
    });
  });
});

describe("sourceReconstructingStorageKeys", () => {
  it("excludes non-reconstructing and already deleted artifacts", () => {
    expect(
      sourceReconstructingStorageKeys("source", [
        artifact("keep", false, "not_scheduled"),
        artifact("delete", true, "not_scheduled"),
        artifact("gone", true, "deleted"),
      ]),
    ).toEqual(["source", "delete"]);
  });
});

function setup(claim: SourceDeletionClaim, events?: ImportEventEmitter) {
  const repository = {
    transaction: vi.fn(
      async (work: (repository: typeof repository) => Promise<unknown>) =>
        work(repository),
    ),
    claimSourceDeletion: vi.fn(async () => claim),
    completeSourceDeletion: vi.fn(async () => undefined),
    failSourceDeletion: vi.fn(async () => undefined),
    findImportIdByStructuredResumeAndOwner: vi.fn(async () => importId),
  };
  const storage = {
    deleteObject: vi.fn(async () => ({ deleted: true })),
  };
  return {
    repository,
    storage,
    service: new SourceDeletionService(repository, storage, events),
  };
}

function artifact(
  storageKey: string,
  containsSourceReconstructingData: boolean,
  deletionStatus: "not_scheduled" | "deleted",
) {
  return {
    id: crypto.randomUUID(),
    importedDocumentId: importId,
    ownerUserId,
    artifactType: "extracted_raw_text" as const,
    storageKey,
    containsSourceReconstructingData,
    deletionStatus,
    createdAt: now,
    retentionExpiresAt: new Date("2026-08-08T09:00:00.000Z"),
  };
}
