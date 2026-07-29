import type { ImportProcessingLimits } from "../../config/import-processing-limits.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ImportLimitRequestKind = "attempt" | "queued" | "active";
export type ImportReservationState = "reserved" | "queued" | "active";

export interface ImportLimitState {
  readonly attemptTimestamps: readonly Date[];
  readonly activeJobCount: number;
  readonly queuedJobCount: number;
}

export interface ImportLimitDecisionRequest {
  readonly kind: ImportLimitRequestKind;
  readonly now: Date;
}

export type ImportLimitDenialCode =
  | "IMPORT_ATTEMPT_LIMIT_REACHED"
  | "ACTIVE_IMPORT_JOB_LIMIT_REACHED"
  | "QUEUED_IMPORT_JOB_LIMIT_REACHED"
  | "IMPORT_LIMIT_STATE_UNAVAILABLE";

export type ImportLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: Exclude<
        ImportLimitDenialCode,
        "IMPORT_LIMIT_STATE_UNAVAILABLE"
      >;
      readonly retryAfterSeconds: number;
    };

export interface ImportLimitReservation {
  readonly id: string;
  readonly ownerUserId: string;
  readonly attemptedAt: Date;
  readonly state: ImportReservationState;
}

export type ImportLimitStoreCommand =
  | {
      readonly kind: "reserve";
      readonly ownerUserId: string;
      readonly now: Date;
      readonly limits: ImportProcessingLimits;
    }
  | {
      readonly kind: "transition";
      readonly ownerUserId: string;
      readonly reservationId: string;
      readonly to: "queued" | "active";
      readonly now: Date;
      readonly limits: ImportProcessingLimits;
    }
  | {
      readonly kind: "rollback";
      readonly ownerUserId: string;
      readonly reservationId: string;
      readonly now: Date;
    }
  | {
      readonly kind: "release";
      readonly ownerUserId: string;
      readonly reservationId: string;
      readonly now: Date;
    };

export type ImportLimitStoreResult =
  | {
      readonly kind: "reserved";
      readonly reservation: ImportLimitReservation;
    }
  | { readonly kind: "denied"; readonly decision: ImportLimitDecision }
  | { readonly kind: "released" }
  | { readonly kind: "missing_reservation" };

/**
 * Implementations MUST perform each command as one atomic backing-store
 * operation. A reserve command prunes expired attempts, evaluates the rolling
 * attempt limit, records the new attempt, and creates its reservation without a
 * check/write race. A transition evaluates and consumes queued/active capacity
 * atomically. Rollback removes an uncommitted attempt and its capacity;
 * release removes capacity while retaining the attempt history.
 */
export interface AtomicImportLimitStore {
  executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult>;
}

export type ImportReservationResult =
  | {
      readonly allowed: true;
      readonly reservation: ImportLimitReservation;
    }
  | {
      readonly allowed: false;
      readonly code: ImportLimitDenialCode;
      readonly retryAfterSeconds: number;
    };

export function decideImportLimit(
  state: ImportLimitState,
  request: ImportLimitDecisionRequest,
  limits: ImportProcessingLimits,
): ImportLimitDecision {
  assertDecisionInput(state, request.now, limits);

  if (request.kind === "active") {
    return state.activeJobCount < limits.maxActiveJobsPerUser
      ? { allowed: true }
      : {
          allowed: false,
          code: "ACTIVE_IMPORT_JOB_LIMIT_REACHED",
          retryAfterSeconds: limits.retryCooldownSeconds,
        };
  }
  if (request.kind === "queued") {
    return state.queuedJobCount < limits.maxQueuedJobsPerUser
      ? { allowed: true }
      : {
          allowed: false,
          code: "QUEUED_IMPORT_JOB_LIMIT_REACHED",
          retryAfterSeconds: limits.retryCooldownSeconds,
        };
  }

  const windowMilliseconds = limits.rollingAttemptWindowSeconds * 1_000;
  const windowStart = request.now.getTime() - windowMilliseconds;
  const attemptsInWindow = state.attemptTimestamps
    .map((attempt) => attempt.getTime())
    // The rolling interval is (now - window, now]. An attempt exactly ten
    // minutes old has expired and no longer consumes capacity.
    .filter((attempt) => attempt > windowStart);

  if (attemptsInWindow.length < limits.rollingAttemptLimit) {
    return { allowed: true };
  }

  const oldestAttempt = Math.min(...attemptsInWindow);
  return {
    allowed: false,
    code: "IMPORT_ATTEMPT_LIMIT_REACHED",
    retryAfterSeconds: Math.max(
      1,
      Math.ceil(
        (oldestAttempt + windowMilliseconds - request.now.getTime()) / 1_000,
      ),
    ),
  };
}

export class ImportLimitService {
  constructor(
    private readonly store: AtomicImportLimitStore,
    private readonly limits: ImportProcessingLimits,
  ) {}

  reserveAttempt(
    ownerUserId: string,
    now: Date,
  ): Promise<ImportReservationResult> {
    return this.executeReservation({
      kind: "reserve",
      ownerUserId,
      now,
      limits: this.limits,
    });
  }

  transitionToQueued(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<ImportReservationResult> {
    return this.executeReservation({
      kind: "transition",
      ownerUserId,
      reservationId,
      to: "queued",
      now,
      limits: this.limits,
    });
  }

  transitionToActive(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<ImportReservationResult> {
    return this.executeReservation({
      kind: "transition",
      ownerUserId,
      reservationId,
      to: "active",
      now,
      limits: this.limits,
    });
  }

  async rollbackReservation(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<void> {
    await this.executeRelease({
      kind: "rollback",
      ownerUserId,
      reservationId,
      now,
    });
  }

  async releaseReservation(
    ownerUserId: string,
    reservationId: string,
    now: Date,
  ): Promise<void> {
    await this.executeRelease({
      kind: "release",
      ownerUserId,
      reservationId,
      now,
    });
  }

  private async executeReservation(
    command: Extract<
      ImportLimitStoreCommand,
      { readonly kind: "reserve" | "transition" }
    >,
  ): Promise<ImportReservationResult> {
    if (!uuidPattern.test(command.ownerUserId)) {
      return this.unavailable();
    }
    try {
      const result = await this.store.executeAtomically(command);
      if (result.kind === "reserved") {
        return { allowed: true, reservation: result.reservation };
      }
      if (result.kind === "denied" && !result.decision.allowed) {
        return result.decision;
      }
      return this.unavailable();
    } catch {
      return this.unavailable();
    }
  }

  private async executeRelease(
    command: Extract<
      ImportLimitStoreCommand,
      { readonly kind: "rollback" | "release" }
    >,
  ): Promise<void> {
    if (!uuidPattern.test(command.ownerUserId)) {
      throw new ImportLimitStateUnavailableError();
    }
    try {
      const result = await this.store.executeAtomically(command);
      if (result.kind !== "released") {
        throw new ImportLimitStateUnavailableError();
      }
    } catch (error) {
      if (error instanceof ImportLimitStateUnavailableError) {
        throw error;
      }
      throw new ImportLimitStateUnavailableError();
    }
  }

  private unavailable(): ImportReservationResult {
    return {
      allowed: false,
      code: "IMPORT_LIMIT_STATE_UNAVAILABLE",
      retryAfterSeconds: this.limits.retryCooldownSeconds,
    };
  }
}

export class ImportLimitStateUnavailableError extends Error {
  readonly code = "IMPORT_LIMIT_STATE_UNAVAILABLE" as const;

  constructor() {
    super("Import capacity cannot be checked right now.");
    this.name = "ImportLimitStateUnavailableError";
  }
}

function assertDecisionInput(
  state: ImportLimitState,
  now: Date,
  limits: ImportProcessingLimits,
): void {
  if (
    !Number.isFinite(now.getTime()) ||
    state.activeJobCount < 0 ||
    !Number.isInteger(state.activeJobCount) ||
    state.queuedJobCount < 0 ||
    !Number.isInteger(state.queuedJobCount) ||
    state.attemptTimestamps.some(
      (attempt) => !Number.isFinite(attempt.getTime()),
    ) ||
    [
      limits.maxActiveJobsPerUser,
      limits.maxQueuedJobsPerUser,
      limits.rollingAttemptLimit,
      limits.rollingAttemptWindowSeconds,
      limits.retryCooldownSeconds,
    ].some((limit) => !Number.isInteger(limit) || limit <= 0)
  ) {
    throw new ImportLimitStateUnavailableError();
  }
}
