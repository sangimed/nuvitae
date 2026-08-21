import { describe, expect, it } from "vitest";
import { documentedImportProcessingDefaults } from "../../config/import-processing-limits.js";
import {
  ImportLimitService,
  decideCapacityLimit,
  decideProcessingStartLimit,
  decideUploadAttemptLimit,
  nextRetryAfterSeconds,
  type AtomicImportLimitStore,
  type ImportLimitReservation,
  type ImportLimitStoreCommand,
  type ImportLimitStoreResult,
} from "@nuvitae/import-application";

const userA = "1ecf3f80-1038-4fe0-b50a-c47c78494a42";
const userB = "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e";
const importA = "a0000000-0000-4000-8000-000000000001";
const importB = "a0000000-0000-4000-8000-000000000002";
const baseTime = new Date("2026-07-29T12:00:00.000Z");

describe("deterministic rolling upload-attempt decisions", () => {
  it("allows attempts one through five and denies the sixth with a rounded retry-after", () => {
    const attemptTimes: Date[] = [];
    for (let index = 0; index < 5; index += 1) {
      expect(
        decideUploadAttemptLimit(
          {
            attemptTimestamps: attemptTimes,
            activeJobCount: 0,
            queuedJobCount: 0,
          },
          baseTime,
          documentedImportProcessingDefaults,
        ),
      ).toEqual({ kind: "allowed" });
      attemptTimes.push(new Date(baseTime.getTime() + index * 1_000));
    }

    expect(
      decideUploadAttemptLimit(
        {
          attemptTimestamps: attemptTimes,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        new Date(baseTime.getTime() + 5_000),
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      kind: "denied",
      code: "upload_attempt_limit",
      messageCategory: "upload_attempts",
      retryable: true,
      retryAfterSeconds: 595,
    });
  });

  it("counts an attempt one millisecond inside the rolling window", () => {
    const windowMs =
      documentedImportProcessingDefaults.rollingAttemptWindowSeconds * 1_000;
    const windowStart = baseTime.getTime() - windowMs;
    const inWindow = [
      new Date(windowStart + 1),
      new Date(windowStart + 1_000),
      new Date(windowStart + 2_000),
      new Date(windowStart + 3_000),
      new Date(windowStart + 4_000),
    ];
    expect(
      decideUploadAttemptLimit(
        {
          attemptTimestamps: inWindow,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        baseTime,
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      kind: "denied",
      code: "upload_attempt_limit",
      messageCategory: "upload_attempts",
      retryable: true,
      retryAfterSeconds: 1,
    });
  });

  it("does not count an attempt exactly at the lower boundary", () => {
    const windowMs =
      documentedImportProcessingDefaults.rollingAttemptWindowSeconds * 1_000;
    const windowStart = baseTime.getTime() - windowMs;
    const attempts = [
      new Date(windowStart),
      new Date(windowStart + 1_000),
      new Date(windowStart + 2_000),
      new Date(windowStart + 3_000),
      new Date(windowStart + 4_000),
    ];
    expect(
      decideUploadAttemptLimit(
        {
          attemptTimestamps: attempts,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        baseTime,
        documentedImportProcessingDefaults,
      ),
    ).toEqual({ kind: "allowed" });
  });

  it("does not count an attempt one millisecond before the lower boundary", () => {
    const windowMs =
      documentedImportProcessingDefaults.rollingAttemptWindowSeconds * 1_000;
    const windowStart = baseTime.getTime() - windowMs;
    const attempts = [
      new Date(windowStart - 1),
      new Date(windowStart + 1_000),
      new Date(windowStart + 2_000),
      new Date(windowStart + 3_000),
      new Date(windowStart + 4_000),
    ];
    expect(
      decideUploadAttemptLimit(
        {
          attemptTimestamps: attempts,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        baseTime,
        documentedImportProcessingDefaults,
      ),
    ).toEqual({ kind: "allowed" });
  });

  it("makes admission possible exactly when the oldest counted attempt leaves the open lower boundary", () => {
    const windowMs =
      documentedImportProcessingDefaults.rollingAttemptWindowSeconds * 1_000;
    const oldest = new Date(baseTime.getTime() - 5_000);
    const attempts = [
      oldest,
      new Date(baseTime.getTime() - 4_000),
      new Date(baseTime.getTime() - 3_000),
      new Date(baseTime.getTime() - 2_000),
      new Date(baseTime.getTime() - 1_000),
    ];

    // One millisecond before the oldest attempt leaves the window, the
    // request is still blocked with a positive, exact Retry-After.
    const justBefore = new Date(oldest.getTime() + windowMs - 1);
    expect(
      decideUploadAttemptLimit(
        {
          attemptTimestamps: attempts,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        justBefore,
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      kind: "denied",
      code: "upload_attempt_limit",
      messageCategory: "upload_attempts",
      retryable: true,
      retryAfterSeconds: 1,
    });

    // Exactly when the oldest counted attempt leaves the open lower
    // boundary, admission becomes possible.
    const atBoundary = new Date(oldest.getTime() + windowMs);
    expect(
      decideUploadAttemptLimit(
        {
          attemptTimestamps: attempts,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        atBoundary,
        documentedImportProcessingDefaults,
      ),
    ).toEqual({ kind: "allowed" });
  });

  it("computes retry-after deterministically and never returns zero or negative", () => {
    const windowSeconds =
      documentedImportProcessingDefaults.rollingAttemptWindowSeconds;
    const oldest = new Date(baseTime.getTime() + 5_000);
    expect(
      nextRetryAfterSeconds(
        oldest,
        new Date(baseTime.getTime() + 9_000),
        windowSeconds,
      ),
    ).toBe(596);
    expect(
      nextRetryAfterSeconds(
        oldest,
        new Date(baseTime.getTime() + 604_000),
        windowSeconds,
      ),
    ).toBe(1);
    // A synthetic negative remainder (already-expired oldest) still yields 1
    // for a request that is nevertheless reported as blocked.
    expect(
      nextRetryAfterSeconds(
        oldest,
        new Date(baseTime.getTime() + 700_000),
        windowSeconds,
      ),
    ).toBe(1);
  });
});

describe("deterministic capacity decisions", () => {
  it("enforces one active job and two queued jobs with typed reasons", () => {
    const empty = {
      attemptTimestamps: [],
      activeJobCount: 0,
      queuedJobCount: 0,
    };
    expect(
      decideCapacityLimit(empty, "active", documentedImportProcessingDefaults),
    ).toEqual({
      kind: "allowed",
    });
    expect(
      decideCapacityLimit(
        { ...empty, activeJobCount: 1 },
        "active",
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      kind: "denied",
      code: "active_job_limit",
      messageCategory: "active_processing",
      retryable: true,
    });
    for (const queuedJobCount of [0, 1]) {
      expect(
        decideCapacityLimit(
          { ...empty, queuedJobCount },
          "queued",
          documentedImportProcessingDefaults,
        ),
      ).toEqual({ kind: "allowed" });
    }
    expect(
      decideCapacityLimit(
        { ...empty, queuedJobCount: 2 },
        "queued",
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      kind: "denied",
      code: "queued_job_limit",
      messageCategory: "queued_processing",
      retryable: true,
    });
  });

  it("re-checks active capacity at processing start without inventing a retry time", () => {
    expect(
      decideProcessingStartLimit(
        { attemptTimestamps: [], activeJobCount: 0, queuedJobCount: 0 },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({ kind: "allowed" });
    expect(
      decideProcessingStartLimit(
        { attemptTimestamps: [], activeJobCount: 1, queuedJobCount: 0 },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      kind: "denied",
      code: "processing_start_limit",
      messageCategory: "processing_start",
      retryable: true,
    });
    expect(
      decideCapacityLimit(
        { attemptTimestamps: [], activeJobCount: 1, queuedJobCount: 0 },
        "active",
        documentedImportProcessingDefaults,
      ),
    ).not.toHaveProperty("retryAfterSeconds");
  });
});

describe("ImportLimitService atomic contract", () => {
  it("reserves up to five attempts per rolling window and isolates users", async () => {
    const store = new InMemoryAtomicStore();
    const service = new ImportLimitService(
      store,
      documentedImportProcessingDefaults,
    );

    const first = await service.reserveAttempt(userA, baseTime);
    const otherUser = await service.reserveAttempt(userB, baseTime);
    expect(first).toMatchObject({ allowed: true });
    expect(otherUser).toMatchObject({ allowed: true });
    expect(store.commands.map((command) => command.ownerUserId)).toEqual([
      userA,
      userB,
    ]);

    for (let index = 0; index < 4; index += 1) {
      expect(
        await service.reserveAttempt(
          userA,
          new Date(baseTime.getTime() + index + 1),
        ),
      ).toMatchObject({ allowed: true });
    }
    const denied = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 5),
    );
    expect(denied).toMatchObject({
      allowed: false,
      outcome: { code: "upload_attempt_limit" },
    });
    expect(denied.allowed ? null : denied.outcome.retryAfterSeconds).toBeTypeOf(
      "number",
    );
    await expect(
      service.reserveAttempt(userB, new Date(baseTime.getTime() + 5)),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("admitToQueue consumes at most two queued slots and is idempotent per import", async () => {
    const service = new ImportLimitService(
      new InMemoryAtomicStore(),
      documentedImportProcessingDefaults,
    );
    const first = await service.reserveAttempt(userA, baseTime);
    const second = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 1_000),
    );
    const third = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 2_000),
    );
    if (!first.allowed || !second.allowed || !third.allowed) {
      throw new Error("Expected reservations");
    }

    await expect(
      service.admitToQueue(userA, first.reservation.id, importA, baseTime),
    ).resolves.toEqual({ kind: "allowed" });
    await expect(
      service.admitToQueue(userA, second.reservation.id, importB, baseTime),
    ).resolves.toEqual({ kind: "allowed" });
    await expect(
      service.admitToQueue(userA, third.reservation.id, importA, baseTime),
    ).resolves.toMatchObject({
      kind: "denied",
      code: "queued_job_limit",
    });
    // Idempotent retry of the same admission does not double-count.
    await expect(
      service.admitToQueue(userA, first.reservation.id, importA, baseTime),
    ).resolves.toEqual({ kind: "allowed" });
  });

  it("admitToProcessing claims the single active slot and re-checks on each start", async () => {
    const service = new ImportLimitService(
      new InMemoryAtomicStore(),
      documentedImportProcessingDefaults,
    );
    const first = await service.reserveAttempt(userA, baseTime);
    const second = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 1_000),
    );
    if (!first.allowed || !second.allowed) throw new Error("Expected");
    await service.admitToQueue(userA, first.reservation.id, importA, baseTime);
    await service.admitToQueue(userA, second.reservation.id, importB, baseTime);

    await expect(
      service.admitToProcessing(userA, importA, baseTime),
    ).resolves.toEqual({ kind: "allowed" });
    // The same worker claim retry is idempotent.
    await expect(
      service.admitToProcessing(userA, importA, baseTime),
    ).resolves.toEqual({ kind: "allowed" });
    await expect(
      service.admitToProcessing(userA, importB, baseTime),
    ).resolves.toMatchObject({
      kind: "denied",
      code: "processing_start_limit",
    });
  });

  it("releases and rolls back capacity without double-counting or phantom slots", async () => {
    const store = new InMemoryAtomicStore();
    const service = new ImportLimitService(
      store,
      documentedImportProcessingDefaults,
    );
    const first = await service.reserveAttempt(userA, baseTime);
    const second = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 1_000),
    );
    if (!first.allowed || !second.allowed) throw new Error("Expected");
    await service.admitToQueue(userA, first.reservation.id, importA, baseTime);
    await service.admitToQueue(userA, second.reservation.id, importB, baseTime);
    await service.admitToProcessing(userA, importA, baseTime);

    // Terminal completion frees the active slot; queued slot remains held.
    await service.releaseCapacityForImport(userA, importA, baseTime);
    const third = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 2_000),
    );
    if (!third.allowed) throw new Error("Expected reservation");
    await expect(
      service.admitToQueue(userA, third.reservation.id, importA, baseTime),
    ).resolves.toEqual({ kind: "allowed" });

    // Rollback removes the attempt entirely: capacity and history free up.
    await service.rollbackReservation(userA, third.reservation.id, baseTime);
    const fourth = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 3_000),
    );
    expect(fourth).toMatchObject({ allowed: true });
  });

  it("wrong-owner identifiers cannot release or consume another user's capacity", async () => {
    const service = new ImportLimitService(
      new InMemoryAtomicStore(),
      documentedImportProcessingDefaults,
    );
    const a = await service.reserveAttempt(userA, baseTime);
    const b = await service.reserveAttempt(userB, baseTime);
    if (!a.allowed || !b.allowed) throw new Error("Expected");
    await service.admitToQueue(userA, a.reservation.id, importA, baseTime);

    // User B cannot transition or release user A's reservation.
    await expect(
      service.admitToQueue(userB, a.reservation.id, importB, baseTime),
    ).resolves.toMatchObject({
      kind: "denied",
      code: "limit_service_unavailable",
    });
    await expect(
      service.releaseReservation(userB, a.reservation.id, baseTime),
    ).rejects.toMatchObject({ code: "IMPORT_LIMIT_STATE_UNAVAILABLE" });
    await expect(
      service.releaseCapacityForImport(userB, importA, baseTime),
    ).resolves.toBeUndefined();
    // User A's queued slot is still held.
    const c = await service.reserveAttempt(
      userA,
      new Date(baseTime.getTime() + 1_000),
    );
    if (!c.allowed) throw new Error("Expected");
    await expect(
      service.admitToQueue(userA, c.reservation.id, importB, baseTime),
    ).resolves.toEqual({ kind: "allowed" });
  });

  it("fails closed when the backing store is unavailable or the owner is invalid", async () => {
    const failing: AtomicImportLimitStore = {
      executeAtomically: async () => {
        throw new Error("synthetic backing store failure");
      },
    };
    const service = new ImportLimitService(
      failing,
      documentedImportProcessingDefaults,
    );
    await expect(service.reserveAttempt(userA, baseTime)).resolves.toEqual({
      allowed: false,
      outcome: {
        kind: "denied",
        code: "limit_service_unavailable",
        messageCategory: "service_unavailable",
        retryable: true,
      },
    });
    await expect(
      service.admitToProcessing(userA, importA, baseTime),
    ).resolves.toMatchObject({
      kind: "denied",
      code: "limit_service_unavailable",
    });
    await expect(
      service.reserveAttempt("not-a-uuid", baseTime),
    ).resolves.toMatchObject({
      allowed: false,
      outcome: { code: "limit_service_unavailable" },
    });
  });
});

class InMemoryAtomicStore implements AtomicImportLimitStore {
  readonly commands: ImportLimitStoreCommand[] = [];
  readonly attemptsByOwner = new Map<string, ImportLimitReservation[]>();
  nextId = 1;

  async executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult> {
    this.commands.push(command);
    const attempts = this.attempts(command.ownerUserId);

    if (command.kind === "reserve") {
      const windowStart =
        command.now.getTime() -
        command.limits.rollingAttemptWindowSeconds * 1_000;
      const inWindow = attempts.filter(
        (attempt) => attempt.attemptedAt.getTime() > windowStart,
      );
      if (inWindow.length >= command.limits.rollingAttemptLimit) {
        return {
          kind: "denied",
          outcome: decideUploadAttemptLimit(
            {
              attemptTimestamps: inWindow.map((attempt) => attempt.attemptedAt),
              activeJobCount: 0,
              queuedJobCount: 0,
            },
            command.now,
            command.limits,
          ) as Exclude<
            ReturnType<typeof decideUploadAttemptLimit>,
            { kind: "allowed" }
          >,
        };
      }
      const reservation: ImportLimitReservation = {
        id: `c0000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        ownerUserId: command.ownerUserId,
        attemptedAt: command.now,
        importId: null,
        state: "reserved",
      };
      attempts.push(reservation);
      return { kind: "reserved", reservation };
    }
    if (command.kind === "rollback") {
      this.replace(
        attempts,
        attempts.filter((a) => a.id !== command.attemptId),
      );
      return { kind: "released" };
    }
    if (command.kind === "release") {
      const attempt = attempts.find((a) => a.id === command.attemptId);
      if (attempt === undefined) return { kind: "missing_reservation" };
      this.replace(attempts, [
        ...attempts.filter((a) => a.id !== attempt.id),
        { ...attempt, state: "released" },
      ]);
      return { kind: "released" };
    }
    if (command.kind === "release_import") {
      this.replace(
        attempts,
        attempts.map((attempt) =>
          attempt.importId === command.importId &&
          (attempt.state === "queued" || attempt.state === "active")
            ? { ...attempt, state: "released" }
            : attempt,
        ),
      );
      return { kind: "released" };
    }
    if (command.kind === "claim") {
      const attempt = attempts.find(
        (candidate) =>
          candidate.importId === command.importId &&
          candidate.ownerUserId === command.ownerUserId,
      );
      if (attempt === undefined) {
        return {
          kind: "denied",
          outcome: {
            kind: "denied",
            code: "processing_start_limit",
            messageCategory: "processing_start",
            retryable: true,
          },
        };
      }
      if (attempt.state === "active") {
        return { kind: "reserved", reservation: attempt };
      }
      if (attempt.state !== "queued") return { kind: "missing_reservation" };
      const active = attempts.filter((a) => a.state === "active").length;
      if (active >= command.limits.maxActiveJobsPerUser) {
        return {
          kind: "denied",
          outcome: {
            kind: "denied",
            code: "processing_start_limit",
            messageCategory: "processing_start",
            retryable: true,
          },
        };
      }
      const transitioned = { ...attempt, state: "active" as const };
      this.replace(attempts, [
        ...attempts.filter((a) => a.id !== attempt.id),
        transitioned,
      ]);
      return { kind: "reserved", reservation: transitioned };
    }

    const attempt = attempts.find((a) => a.id === command.attemptId);
    if (attempt === undefined) return { kind: "missing_reservation" };
    if (attempt.state === "queued" && attempt.importId === command.importId) {
      return { kind: "reserved", reservation: attempt };
    }
    if (attempt.state !== "reserved") return { kind: "missing_reservation" };
    const queued = attempts.filter((a) => a.state === "queued").length;
    if (queued >= command.limits.maxQueuedJobsPerUser) {
      return {
        kind: "denied",
        outcome: decideCapacityLimit(
          {
            attemptTimestamps: [],
            activeJobCount: 0,
            queuedJobCount: queued,
          },
          "queued",
          command.limits,
        ) as Exclude<
          ReturnType<typeof decideCapacityLimit>,
          { kind: "allowed" }
        >,
      };
    }
    const transitioned = {
      ...attempt,
      state: "queued" as const,
      importId: command.importId,
    };
    this.replace(attempts, [
      ...attempts.filter((a) => a.id !== attempt.id),
      transitioned,
    ]);
    return { kind: "reserved", reservation: transitioned };
  }

  private attempts(ownerUserId: string): ImportLimitReservation[] {
    let attempts = this.attemptsByOwner.get(ownerUserId);
    if (attempts === undefined) {
      attempts = [];
      this.attemptsByOwner.set(ownerUserId, attempts);
    }
    return attempts;
  }

  private replace(
    attempts: ImportLimitReservation[],
    next: readonly ImportLimitReservation[],
  ): void {
    attempts.splice(0, attempts.length, ...next);
  }
}
