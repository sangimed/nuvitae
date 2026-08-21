import { randomUUID } from "node:crypto";
import {
  decideCapacityLimit,
  nextRetryAfterSeconds,
  type AtomicImportLimitStore,
  type ImportLimitReservation,
  type ImportLimitStoreCommand,
  type ImportLimitStoreResult,
} from "@nuvitae/import-application";

type ReservationIdGenerator = () => string;

interface OwnerState {
  readonly attempts: ImportLimitReservation[];
}

/**
 * Local-play-only import limit state. Commands are atomic within one Node.js
 * process because each mutates synchronously without an async gap, but it is
 * unsuitable for production or multiple API replicas; production uses the
 * PostgreSQL-backed store.
 */
export class LocalAtomicImportLimitStore implements AtomicImportLimitStore {
  private readonly owners = new Map<string, OwnerState>();

  constructor(private readonly ids: ReservationIdGenerator = randomUUID) {}

  async executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult> {
    const state = this.owner(command.ownerUserId);

    if (command.kind === "reserve") {
      return this.reserve(state, command);
    }
    if (command.kind === "rollback") {
      state.attempts.splice(
        0,
        state.attempts.length,
        ...state.attempts.filter((attempt) => attempt.id !== command.attemptId),
      );
      return { kind: "released" };
    }
    if (command.kind === "release") {
      const attempt = findAttempt(state, command.attemptId);
      if (attempt === undefined) return { kind: "missing_reservation" };
      replaceAttempt(state, { ...attempt, state: "released" });
      return { kind: "released" };
    }
    if (command.kind === "release_import") {
      replaceAttempts(
        state,
        state.attempts.map((attempt) =>
          attempt.importId === command.importId &&
          (attempt.state === "queued" || attempt.state === "active")
            ? { ...attempt, state: "released" }
            : attempt,
        ),
      );
      return { kind: "released" };
    }
    if (command.kind === "claim") {
      return this.claim(state, command);
    }
    return this.transitionToQueued(state, command);
  }

  private reserve(
    state: OwnerState,
    command: Extract<ImportLimitStoreCommand, { readonly kind: "reserve" }>,
  ): ImportLimitStoreResult {
    const windowStart =
      command.now.getTime() -
      command.limits.rollingAttemptWindowSeconds * 1_000;
    const inWindow = state.attempts
      .map((attempt) => attempt.attemptedAt.getTime())
      .filter((attemptedAt) => attemptedAt > windowStart);
    if (inWindow.length >= command.limits.rollingAttemptLimit) {
      return {
        kind: "denied",
        outcome: {
          kind: "denied",
          code: "upload_attempt_limit",
          messageCategory: "upload_attempts",
          retryable: true,
          retryAfterSeconds: nextRetryAfterSeconds(
            new Date(Math.min(...inWindow)),
            command.now,
            command.limits.rollingAttemptWindowSeconds,
          ),
        },
      };
    }
    const reservation: ImportLimitReservation = {
      id: this.ids(),
      ownerUserId: command.ownerUserId,
      attemptedAt: command.now,
      importId: null,
      state: "reserved",
    };
    state.attempts.push(reservation);
    return { kind: "reserved", reservation };
  }

  private transitionToQueued(
    state: OwnerState,
    command: Extract<ImportLimitStoreCommand, { readonly kind: "transition" }>,
  ): ImportLimitStoreResult {
    const attempt = findAttempt(state, command.attemptId);
    if (attempt === undefined) return { kind: "missing_reservation" };
    if (attempt.state === "queued" && attempt.importId === command.importId) {
      return { kind: "reserved", reservation: attempt };
    }
    if (attempt.state !== "reserved") return { kind: "missing_reservation" };
    const queued = countByState(state, "queued");
    const outcome = decideCapacityLimit(
      { attemptTimestamps: [], activeJobCount: 0, queuedJobCount: queued },
      "queued",
      command.limits,
    );
    if (outcome.kind !== "allowed") return { kind: "denied", outcome };
    const transitioned = {
      ...attempt,
      state: "queued" as const,
      importId: command.importId,
    };
    replaceAttempt(state, transitioned);
    return { kind: "reserved", reservation: transitioned };
  }

  private claim(
    state: OwnerState,
    command: Extract<ImportLimitStoreCommand, { readonly kind: "claim" }>,
  ): ImportLimitStoreResult {
    const attempt = state.attempts.find(
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
    if (countByState(state, "active") >= command.limits.maxActiveJobsPerUser) {
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
    replaceAttempt(state, transitioned);
    return { kind: "reserved", reservation: transitioned };
  }

  private owner(ownerUserId: string): OwnerState {
    let state = this.owners.get(ownerUserId);
    if (state === undefined) {
      state = { attempts: [] };
      this.owners.set(ownerUserId, state);
    }
    return state;
  }
}

function findAttempt(
  state: OwnerState,
  attemptId: string,
): ImportLimitReservation | undefined {
  return state.attempts.find((attempt) => attempt.id === attemptId);
}

function countByState(
  state: OwnerState,
  reservationState: "queued" | "active",
): number {
  return state.attempts.filter((attempt) => attempt.state === reservationState)
    .length;
}

function replaceAttempt(
  state: OwnerState,
  attempt: ImportLimitReservation,
): void {
  replaceAttempts(
    state,
    state.attempts.map((candidate) =>
      candidate.id === attempt.id ? attempt : candidate,
    ),
  );
}

function replaceAttempts(
  state: OwnerState,
  attempts: readonly ImportLimitReservation[],
): void {
  state.attempts.splice(0, state.attempts.length, ...attempts);
}
