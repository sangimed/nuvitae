import { describe, expect, it } from "vitest";
import type { ImportProcessingLimits } from "./import-processing-limits.js";
import {
  type ImportLimitAttemptRecord,
  type ImportLimitAttemptsPort,
  RepositoryBackedImportLimitStore,
} from "./repository-backed-import-limit-store.js";

const limits: ImportProcessingLimits = {
  maxUploadSizeBytes: 10 * 1024 * 1024,
  maxRenderedPageCount: 5,
  rollingAttemptLimit: 5,
  rollingAttemptWindowSeconds: 60,
  maxQueuedJobsPerUser: 2,
  maxActiveJobsPerUser: 1,
  foregroundTimeoutSeconds: 30,
  parserMemoryLimitMiB: 256,
  retryCooldownSeconds: 5,
};

class InMemoryAttemptsPort implements ImportLimitAttemptsPort {
  readonly attempts = new Map<string, ImportLimitAttemptRecord>();
  readonly operations: string[] = [];

  async transaction<T>(
    work: (repository: ImportLimitAttemptsPort) => Promise<T>,
  ): Promise<T> {
    this.operations.push("transaction");
    return work(this);
  }

  async acquireLock(): Promise<void> {
    this.operations.push("lock");
  }

  async findAttemptsInWindow(
    ownerUserId: string,
    windowStart: Date,
  ): Promise<readonly ImportLimitAttemptRecord[]> {
    return [...this.attempts.values()].filter(
      (attempt) =>
        attempt.ownerUserId === ownerUserId &&
        attempt.attemptedAt.getTime() > windowStart.getTime(),
    );
  }

  async countByState(ownerUserId: string, state: string): Promise<number> {
    return [...this.attempts.values()].filter(
      (attempt) =>
        attempt.ownerUserId === ownerUserId && attempt.state === state,
    ).length;
  }

  async findAttemptById(ownerUserId: string, attemptId: string) {
    const attempt = this.attempts.get(attemptId);
    return attempt?.ownerUserId === ownerUserId ? attempt : null;
  }

  async findAttemptByImport(ownerUserId: string, importId: string) {
    return (
      [...this.attempts.values()].find(
        (attempt) =>
          attempt.ownerUserId === ownerUserId && attempt.importId === importId,
      ) ?? null
    );
  }

  async insertAttempt(row: ImportLimitAttemptRecord): Promise<void> {
    this.attempts.set(row.id, row);
  }

  async updateAttempt(
    attemptId: string,
    ownerUserId: string,
    updates: Partial<ImportLimitAttemptRecord>,
  ): Promise<void> {
    const attempt = await this.findAttemptById(ownerUserId, attemptId);
    if (attempt !== null)
      this.attempts.set(attemptId, { ...attempt, ...updates });
  }

  async releaseByImport(
    ownerUserId: string,
    importId: string,
    state: "queued" | "active",
    releasedAt: Date,
  ): Promise<void> {
    const attempt = await this.findAttemptByImport(ownerUserId, importId);
    if (attempt?.state === state) {
      this.attempts.set(attempt.id, {
        ...attempt,
        state: "released",
        releasedAt,
      });
    }
  }

  async deleteAttempt(ownerUserId: string, attemptId: string): Promise<void> {
    const attempt = await this.findAttemptById(ownerUserId, attemptId);
    if (attempt !== null) this.attempts.delete(attemptId);
  }
}

describe("RepositoryBackedImportLimitStore", () => {
  it("runs reserve and queue transitions under the owner lock", async () => {
    const repository = new InMemoryAttemptsPort();
    const store = new RepositoryBackedImportLimitStore(
      repository,
      () => "attempt-id",
    );
    const now = new Date("2026-08-21T10:00:00.000Z");

    const reserved = await store.executeAtomically({
      kind: "reserve",
      ownerUserId: "owner-id",
      now,
      limits,
    });
    const queued = await store.executeAtomically({
      kind: "transition",
      ownerUserId: "owner-id",
      attemptId: "attempt-id",
      importId: "import-id",
      now,
      limits,
    });

    expect(reserved).toMatchObject({ kind: "reserved" });
    expect(queued).toMatchObject({
      kind: "reserved",
      reservation: { state: "queued", importId: "import-id" },
    });
    expect(repository.operations).toEqual([
      "transaction",
      "lock",
      "transaction",
      "lock",
    ]);
  });
});
