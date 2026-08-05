import { describe, expect, it } from "vitest";
import { LocalAtomicImportLimitStore } from "./local-atomic-import-limit-store.js";

const limits = {
  maxUploadSizeBytes: 10,
  maxRenderedPageCount: 5,
  foregroundTimeoutSeconds: 180,
  parserMemoryLimitMiB: 512,
  maxActiveJobsPerUser: 1,
  maxQueuedJobsPerUser: 1,
  rollingAttemptLimit: 2,
  rollingAttemptWindowSeconds: 60,
  retryCooldownSeconds: 30,
};

describe("LocalAtomicImportLimitStore", () => {
  it("reserves, transitions, claims, releases, and rolls back deterministically", async () => {
    let id = 0;
    const store = new LocalAtomicImportLimitStore(() => `reservation-${++id}`);
    const ownerUserId = "00000000-0000-4000-8000-000000000101";
    const importId = "a0000000-0000-4000-8000-000000000001";
    const now = new Date("2026-07-29T10:00:00.000Z");

    const first = await store.executeAtomically({
      kind: "reserve",
      ownerUserId,
      now,
      limits,
    });
    expect(first).toMatchObject({
      kind: "reserved",
      reservation: { id: "reservation-1", state: "reserved" },
    });
    if (first.kind !== "reserved") throw new Error("expected reservation");

    await expect(
      store.executeAtomically({
        kind: "transition",
        ownerUserId,
        attemptId: first.reservation.id,
        importId,
        now,
        limits,
      }),
    ).resolves.toMatchObject({
      kind: "reserved",
      reservation: { state: "queued", importId },
    });

    const second = await store.executeAtomically({
      kind: "reserve",
      ownerUserId,
      now,
      limits,
    });
    expect(second).toMatchObject({
      kind: "reserved",
      reservation: { id: "reservation-2" },
    });
    if (second.kind !== "reserved") throw new Error("expected reservation");

    await expect(
      store.executeAtomically({
        kind: "transition",
        ownerUserId,
        attemptId: second.reservation.id,
        importId,
        now,
        limits,
      }),
    ).resolves.toMatchObject({
      kind: "denied",
      outcome: { code: "queued_job_limit" },
    });

    await expect(
      store.executeAtomically({
        kind: "claim",
        ownerUserId,
        importId,
        now,
        limits,
      }),
    ).resolves.toMatchObject({
      kind: "reserved",
      reservation: { state: "active" },
    });

    await expect(
      store.executeAtomically({
        kind: "rollback",
        ownerUserId,
        attemptId: second.reservation.id,
        now,
      }),
    ).resolves.toEqual({ kind: "released" });
    await expect(
      store.executeAtomically({
        kind: "release_import",
        ownerUserId,
        importId,
        now,
      }),
    ).resolves.toEqual({ kind: "released" });
    await expect(
      store.executeAtomically({
        kind: "release",
        ownerUserId,
        attemptId: first.reservation.id,
        now,
      }),
    ).resolves.toEqual({ kind: "released" });
  });
});
