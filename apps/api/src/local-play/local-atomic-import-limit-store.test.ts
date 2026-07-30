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
  it("reserves, transitions, releases, and rolls back deterministically", async () => {
    let id = 0;
    const store = new LocalAtomicImportLimitStore(() => `reservation-${++id}`);
    const ownerUserId = "00000000-0000-4000-8000-000000000101";
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
        reservationId: first.reservation.id,
        to: "queued",
        now,
        limits,
      }),
    ).resolves.toMatchObject({
      kind: "reserved",
      reservation: { state: "queued" },
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
        reservationId: second.reservation.id,
        to: "queued",
        now,
        limits,
      }),
    ).resolves.toMatchObject({
      kind: "denied",
      decision: { code: "QUEUED_IMPORT_JOB_LIMIT_REACHED" },
    });

    await expect(
      store.executeAtomically({
        kind: "rollback",
        ownerUserId,
        reservationId: second.reservation.id,
        now,
      }),
    ).resolves.toEqual({ kind: "released" });
    await expect(
      store.executeAtomically({
        kind: "release",
        ownerUserId,
        reservationId: first.reservation.id,
        now,
      }),
    ).resolves.toEqual({ kind: "released" });
  });
});
