import { randomUUID } from "node:crypto";
import {
  decideImportLimit,
  type AtomicImportLimitStore,
  type ImportLimitReservation,
  type ImportLimitStoreCommand,
  type ImportLimitStoreResult,
} from "../services/import-resume/import-limits.js";

type ReservationIdGenerator = () => string;

interface OwnerState {
  readonly attemptTimestamps: Date[];
  readonly reservations: Map<string, ImportLimitReservation>;
}

/**
 * Local-play-only import limit state. It is atomic in one Node.js process
 * because each command mutates synchronously without an async gap, but it is
 * unsuitable for production or multiple API replicas.
 */
export class LocalAtomicImportLimitStore implements AtomicImportLimitStore {
  private readonly owners = new Map<string, OwnerState>();

  constructor(private readonly ids: ReservationIdGenerator = randomUUID) {}

  async executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult> {
    const state = this.owner(command.ownerUserId);
    if (command.kind === "reserve") {
      pruneAttempts(
        state,
        command.now,
        command.limits.rollingAttemptWindowSeconds,
      );
      const decision = decideImportLimit(
        {
          attemptTimestamps: state.attemptTimestamps,
          activeJobCount: countByState(state, "active"),
          queuedJobCount: countByState(state, "queued"),
        },
        { kind: "attempt", now: command.now },
        command.limits,
      );
      if (!decision.allowed) return { kind: "denied", decision };
      const reservation: ImportLimitReservation = {
        id: this.ids(),
        ownerUserId: command.ownerUserId,
        attemptedAt: command.now,
        state: "reserved",
      };
      state.attemptTimestamps.push(command.now);
      state.reservations.set(reservation.id, reservation);
      return { kind: "reserved", reservation };
    }

    const reservation = state.reservations.get(command.reservationId);
    if (reservation === undefined) return { kind: "missing_reservation" };
    if (command.kind === "release") {
      state.reservations.delete(command.reservationId);
      return { kind: "released" };
    }
    if (command.kind === "rollback") {
      state.reservations.delete(command.reservationId);
      removeAttempt(state, reservation.attemptedAt);
      return { kind: "released" };
    }

    const decision = decideImportLimit(
      {
        attemptTimestamps: state.attemptTimestamps,
        activeJobCount: countByState(state, "active"),
        queuedJobCount: countByState(state, "queued"),
      },
      { kind: command.to, now: command.now },
      command.limits,
    );
    if (!decision.allowed) return { kind: "denied", decision };
    const transitioned = { ...reservation, state: command.to };
    state.reservations.set(command.reservationId, transitioned);
    return { kind: "reserved", reservation: transitioned };
  }

  private owner(ownerUserId: string): OwnerState {
    let state = this.owners.get(ownerUserId);
    if (state === undefined) {
      state = { attemptTimestamps: [], reservations: new Map() };
      this.owners.set(ownerUserId, state);
    }
    return state;
  }
}

function countByState(
  state: OwnerState,
  reservationState: ImportLimitReservation["state"],
): number {
  return [...state.reservations.values()].filter(
    (reservation) => reservation.state === reservationState,
  ).length;
}

function pruneAttempts(
  state: OwnerState,
  now: Date,
  windowSeconds: number,
): void {
  const windowStart = now.getTime() - windowSeconds * 1_000;
  state.attemptTimestamps.splice(
    0,
    state.attemptTimestamps.length,
    ...state.attemptTimestamps.filter(
      (attemptedAt) => attemptedAt.getTime() > windowStart,
    ),
  );
}

function removeAttempt(state: OwnerState, attemptedAt: Date): void {
  const index = state.attemptTimestamps.findIndex(
    (candidate) => candidate.getTime() === attemptedAt.getTime(),
  );
  if (index >= 0) state.attemptTimestamps.splice(index, 1);
}
