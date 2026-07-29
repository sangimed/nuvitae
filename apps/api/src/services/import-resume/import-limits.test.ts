import { describe, expect, it } from "vitest";

import { documentedImportProcessingDefaults } from "../../config/import-processing-limits.js";
import {
  ImportLimitService,
  decideImportLimit,
  type AtomicImportLimitStore,
  type ImportLimitReservation,
  type ImportLimitStoreCommand,
  type ImportLimitStoreResult,
} from "./import-limits.js";

const userA = "1ecf3f80-1038-4fe0-b50a-c47c78494a42";
const userB = "9bdf7af5-f0b4-47fa-aaf2-1b1b42a19c2e";
const baseTime = new Date("2026-07-29T12:00:00.000Z");

describe("deterministic import-limit decisions", () => {
  it("allows attempts one through five and denies the sixth inside the rolling window", () => {
    const attemptTimes: Date[] = [];
    for (let index = 0; index < 5; index += 1) {
      const decision = decideImportLimit(
        {
          attemptTimestamps: attemptTimes,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        { kind: "attempt", now: baseTime },
        documentedImportProcessingDefaults,
      );
      expect(decision).toEqual({ allowed: true });
      attemptTimes.push(new Date(baseTime.getTime() + index * 1_000));
    }

    expect(
      decideImportLimit(
        {
          attemptTimestamps: attemptTimes,
          activeJobCount: 0,
          queuedJobCount: 0,
        },
        { kind: "attempt", now: new Date(baseTime.getTime() + 5_000) },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      allowed: false,
      code: "IMPORT_ATTEMPT_LIMIT_REACHED",
      retryAfterSeconds: 595,
    });
  });

  it("expires attempts at the exact ten-minute boundary", () => {
    const atBoundary = new Date(
      baseTime.getTime() +
        documentedImportProcessingDefaults.rollingAttemptWindowSeconds * 1_000,
    );
    const state = {
      attemptTimestamps: [
        baseTime,
        new Date(baseTime.getTime() + 1_000),
        new Date(baseTime.getTime() + 2_000),
        new Date(baseTime.getTime() + 3_000),
        new Date(baseTime.getTime() + 4_000),
      ],
      activeJobCount: 0,
      queuedJobCount: 0,
    };

    expect(
      decideImportLimit(
        state,
        { kind: "attempt", now: atBoundary },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({ allowed: true });
  });

  it("enforces one active and two queued jobs with typed reasons", () => {
    expect(
      decideImportLimit(
        { attemptTimestamps: [], activeJobCount: 0, queuedJobCount: 0 },
        { kind: "active", now: baseTime },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({ allowed: true });
    expect(
      decideImportLimit(
        { attemptTimestamps: [], activeJobCount: 1, queuedJobCount: 0 },
        { kind: "active", now: baseTime },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      allowed: false,
      code: "ACTIVE_IMPORT_JOB_LIMIT_REACHED",
      retryAfterSeconds:
        documentedImportProcessingDefaults.retryCooldownSeconds,
    });
    for (const queuedJobCount of [0, 1]) {
      expect(
        decideImportLimit(
          { attemptTimestamps: [], activeJobCount: 0, queuedJobCount },
          { kind: "queued", now: baseTime },
          documentedImportProcessingDefaults,
        ),
      ).toEqual({ allowed: true });
    }
    expect(
      decideImportLimit(
        { attemptTimestamps: [], activeJobCount: 0, queuedJobCount: 2 },
        { kind: "queued", now: baseTime },
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      allowed: false,
      code: "QUEUED_IMPORT_JOB_LIMIT_REACHED",
      retryAfterSeconds:
        documentedImportProcessingDefaults.retryCooldownSeconds,
    });
  });
});

describe("ImportLimitService atomic reservation contract", () => {
  it("uses one owner-scoped atomic store command and isolates users", async () => {
    const store = new InMemoryAtomicStore();
    const service = new ImportLimitService(
      store,
      documentedImportProcessingDefaults,
    );

    const first = await service.reserveAttempt(userA, baseTime);
    const otherUser = await service.reserveAttempt(userB, baseTime);

    expect(first).toMatchObject({ allowed: true });
    expect(otherUser).toMatchObject({ allowed: true });
    expect(store.commands).toHaveLength(2);
    expect(store.commands.map((command) => command.ownerUserId)).toEqual([
      userA,
      userB,
    ]);
    expect(store.commands.every((command) => command.kind === "reserve")).toBe(
      true,
    );

    for (let index = 0; index < 4; index += 1) {
      expect(
        await service.reserveAttempt(
          userA,
          new Date(baseTime.getTime() + index + 1),
        ),
      ).toMatchObject({ allowed: true });
    }
    await expect(
      service.reserveAttempt(userA, new Date(baseTime.getTime() + 5)),
    ).resolves.toMatchObject({
      allowed: false,
      code: "IMPORT_ATTEMPT_LIMIT_REACHED",
    });
    await expect(
      service.reserveAttempt(userB, new Date(baseTime.getTime() + 5)),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("rolls back a reservation when enqueueing fails", async () => {
    const store = new InMemoryAtomicStore();
    const service = new ImportLimitService(
      store,
      documentedImportProcessingDefaults,
    );
    const reservation = await service.reserveAttempt(userA, baseTime);
    if (!reservation.allowed) {
      throw new Error("Expected reservation");
    }

    await service.rollbackReservation(
      userA,
      reservation.reservation.id,
      baseTime,
    );
    expect(store.commands.at(-1)).toEqual({
      kind: "rollback",
      ownerUserId: userA,
      reservationId: reservation.reservation.id,
      now: baseTime,
    });

    for (let index = 0; index < 5; index += 1) {
      expect(
        await service.reserveAttempt(
          userA,
          new Date(baseTime.getTime() + index + 1),
        ),
      ).toMatchObject({ allowed: true });
    }
  });

  it("fails closed when limit state is unavailable", async () => {
    const store: AtomicImportLimitStore = {
      executeAtomically: async () => {
        throw new Error("synthetic backing store failure");
      },
    };
    const service = new ImportLimitService(
      store,
      documentedImportProcessingDefaults,
    );

    await expect(service.reserveAttempt(userA, baseTime)).resolves.toEqual({
      allowed: false,
      code: "IMPORT_LIMIT_STATE_UNAVAILABLE",
      retryAfterSeconds:
        documentedImportProcessingDefaults.retryCooldownSeconds,
    });
  });
});

class InMemoryAtomicStore implements AtomicImportLimitStore {
  readonly commands: ImportLimitStoreCommand[] = [];
  readonly states = new Map<
    string,
    {
      attempts: { at: Date; reservationId: string }[];
      reservations: Map<string, ImportLimitReservation>;
    }
  >();
  nextId = 1;

  async executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult> {
    this.commands.push(command);
    const state = this.states.get(command.ownerUserId) ?? {
      attempts: [],
      reservations: new Map<string, ImportLimitReservation>(),
    };
    this.states.set(command.ownerUserId, state);

    if (command.kind === "rollback") {
      state.reservations.delete(command.reservationId);
      state.attempts = state.attempts.filter(
        (attempt) => attempt.reservationId !== command.reservationId,
      );
      return { kind: "released" };
    }
    if (command.kind === "release") {
      state.reservations.delete(command.reservationId);
      return { kind: "released" };
    }
    if (command.kind === "transition") {
      const reservation = state.reservations.get(command.reservationId);
      if (reservation === undefined) {
        return { kind: "missing_reservation" };
      }
      const activeJobCount = [...state.reservations.values()].filter(
        (value) => value.state === "active",
      ).length;
      const queuedJobCount = [...state.reservations.values()].filter(
        (value) => value.state === "queued",
      ).length;
      const decision = decideImportLimit(
        {
          attemptTimestamps: state.attempts.map((attempt) => attempt.at),
          activeJobCount,
          queuedJobCount,
        },
        { kind: command.to, now: command.now },
        command.limits,
      );
      if (!decision.allowed) {
        return { kind: "denied", decision };
      }
      const transitioned = { ...reservation, state: command.to };
      state.reservations.set(command.reservationId, transitioned);
      return { kind: "reserved", reservation: transitioned };
    }

    const activeJobCount = [...state.reservations.values()].filter(
      (value) => value.state === "active",
    ).length;
    const queuedJobCount = [...state.reservations.values()].filter(
      (value) => value.state === "queued",
    ).length;
    const decision = decideImportLimit(
      {
        attemptTimestamps: state.attempts.map((attempt) => attempt.at),
        activeJobCount,
        queuedJobCount,
      },
      { kind: "attempt", now: command.now },
      command.limits,
    );
    if (!decision.allowed) {
      return { kind: "denied", decision };
    }
    const reservation: ImportLimitReservation = {
      id: `reservation-${this.nextId++}`,
      ownerUserId: command.ownerUserId,
      attemptedAt: command.now,
      state: "reserved",
    };
    state.reservations.set(reservation.id, reservation);
    state.attempts.push({ at: command.now, reservationId: reservation.id });
    return { kind: "reserved", reservation };
  }
}
