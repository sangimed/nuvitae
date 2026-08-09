import type { ImportProcessingLimits } from "./import-processing-limits.js";

export type ImportLimitReservationState =
  "reserved" | "queued" | "active" | "released";

export type ImportLimitState = "available" | "unavailable";

export type ImportLimitRequestKind =
  "upload" | "queued" | "active" | "processing_start";

export type ImportLimitOutcomeCode =
  | "upload_attempt_limit"
  | "active_job_limit"
  | "queued_job_limit"
  | "processing_start_limit"
  | "limit_service_unavailable";

export type ImportLimitMessageCategory =
  | "upload_attempts"
  | "active_processing"
  | "queued_processing"
  | "processing_start"
  | "service_unavailable";

export interface ImportLimitDecisionRequest {
  readonly attemptTimestamps: readonly (number | Date)[];
  readonly activeJobCount: number;
  readonly queuedJobCount: number;
}

export interface DeniedImportLimitOutcome {
  readonly kind: "denied";
  readonly code: ImportLimitOutcomeCode;
  readonly messageCategory: ImportLimitMessageCategory;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

export type ImportLimitOutcome =
  { readonly kind: "allowed" } | DeniedImportLimitOutcome;

export interface ImportLimitReservation {
  readonly id: string;
  readonly ownerUserId: string;
  readonly attemptedAt: Date;
  readonly importId: string | null;
  readonly state: ImportLimitReservationState;
}

export type ImportReservationResult =
  | {
      readonly allowed: true;
      readonly reservation: ImportLimitReservation;
    }
  | {
      readonly allowed: false;
      readonly outcome: DeniedImportLimitOutcome;
    };

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
      readonly attemptId: string;
      readonly importId: string;
      readonly now: Date;
      readonly limits: ImportProcessingLimits;
    }
  | {
      readonly kind: "claim";
      readonly ownerUserId: string;
      readonly importId: string;
      readonly now: Date;
      readonly limits: ImportProcessingLimits;
    }
  | {
      readonly kind: "rollback";
      readonly ownerUserId: string;
      readonly attemptId: string;
    }
  | {
      readonly kind: "release";
      readonly ownerUserId: string;
      readonly attemptId: string;
    }
  | {
      readonly kind: "release_import";
      readonly ownerUserId: string;
      readonly importId: string;
    };

export type ImportLimitStoreResult =
  | { readonly kind: "reserved"; readonly reservation: ImportLimitReservation }
  | { readonly kind: "denied"; readonly outcome: DeniedImportLimitOutcome }
  | { readonly kind: "released" }
  | { readonly kind: "missing_reservation" };

export interface AtomicImportLimitStore {
  executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult>;
}

export const unavailableLimitOutcome: DeniedImportLimitOutcome = {
  kind: "denied",
  code: "limit_service_unavailable",
  messageCategory: "service_unavailable",
  retryable: true,
};

export class ImportLimitStateUnavailableError extends Error {
  readonly code = "IMPORT_LIMIT_STATE_UNAVAILABLE" as const;

  constructor() {
    super("Import limit state is unavailable.");
    this.name = "ImportLimitStateUnavailableError";
  }
}

export function nextRetryAfterSeconds(
  oldestCountedAttempt: Date | number,
  now: Date,
  windowSeconds: number,
): number {
  const attemptMs =
    oldestCountedAttempt instanceof Date
      ? oldestCountedAttempt.getTime()
      : oldestCountedAttempt;
  const windowMs = windowSeconds * 1_000;
  const remaining = attemptMs + windowMs - now.getTime();
  return Math.max(1, Math.ceil(Math.max(0, remaining) / 1_000));
}

export function decideUploadAttemptLimit(
  request: ImportLimitDecisionRequest,
  now: Date,
  limits: ImportProcessingLimits,
): ImportLimitOutcome {
  const windowMs = limits.rollingAttemptWindowSeconds * 1_000;
  const windowStart = now.getTime() - windowMs;
  const inWindow = request.attemptTimestamps
    .map((t) => (t instanceof Date ? t.getTime() : t))
    // The rolling interval is (now - window, now]. An attempt exactly at the
    // lower boundary has expired and no longer consumes capacity.
    .filter((ts) => ts > windowStart);
  if (inWindow.length < limits.rollingAttemptLimit) {
    return { kind: "allowed" };
  }
  if (inWindow.length === 0) return { kind: "allowed" };
  return {
    kind: "denied",
    code: "upload_attempt_limit",
    messageCategory: "upload_attempts",
    retryable: true,
    retryAfterSeconds: nextRetryAfterSeconds(
      Math.min(...inWindow),
      now,
      limits.rollingAttemptWindowSeconds,
    ),
  };
}

export function decideCapacityLimit(
  request: ImportLimitDecisionRequest,
  kind: "queued" | "active",
  limits: ImportProcessingLimits,
): ImportLimitOutcome {
  const count =
    kind === "queued" ? request.queuedJobCount : request.activeJobCount;
  const max =
    kind === "queued"
      ? limits.maxQueuedJobsPerUser
      : limits.maxActiveJobsPerUser;
  if (count >= max) {
    return {
      kind: "denied",
      code: kind === "queued" ? "queued_job_limit" : "active_job_limit",
      messageCategory:
        kind === "queued" ? "queued_processing" : "active_processing",
      retryable: true,
    };
  }
  return { kind: "allowed" };
}

export function decideProcessingStartLimit(
  request: ImportLimitDecisionRequest,
  limits: ImportProcessingLimits,
): ImportLimitOutcome {
  if (request.activeJobCount >= limits.maxActiveJobsPerUser) {
    return {
      kind: "denied",
      code: "processing_start_limit",
      messageCategory: "processing_start",
      retryable: true,
    };
  }
  return { kind: "allowed" };
}

export class ImportLimitService {
  constructor(
    private readonly store: AtomicImportLimitStore,
    private readonly limits: ImportProcessingLimits,
  ) {}

  async reserveAttempt(
    ownerUserId: string,
    now: Date,
  ): Promise<ImportReservationResult> {
    try {
      const result = await this.store.executeAtomically({
        kind: "reserve",
        ownerUserId,
        now,
        limits: this.limits,
      });
      if (result.kind === "reserved") {
        return { allowed: true, reservation: result.reservation };
      }
      if (result.kind === "denied") {
        return { allowed: false, outcome: result.outcome };
      }
      return { allowed: false, outcome: unavailableLimitOutcome };
    } catch {
      return { allowed: false, outcome: unavailableLimitOutcome };
    }
  }

  async admitToQueue(
    ownerUserId: string,
    attemptId: string,
    importId: string,
    now: Date,
  ): Promise<ImportLimitOutcome> {
    try {
      const result = await this.store.executeAtomically({
        kind: "transition",
        ownerUserId,
        attemptId,
        importId,
        now,
        limits: this.limits,
      });
      if (result.kind === "reserved") return { kind: "allowed" };
      if (result.kind === "denied") return result.outcome;
      return unavailableLimitOutcome;
    } catch {
      return unavailableLimitOutcome;
    }
  }

  async admitToProcessing(
    ownerUserId: string,
    importId: string,
    now: Date,
  ): Promise<{ kind: "allowed" } | { kind: "denied"; code: string }> {
    try {
      const result = await this.store.executeAtomically({
        kind: "claim",
        ownerUserId,
        importId,
        now,
        limits: this.limits,
      });
      if (result.kind === "reserved") return { kind: "allowed" };
      if (result.kind === "denied")
        return { kind: "denied", code: result.outcome.code };
      return { kind: "denied", code: "limit_service_unavailable" };
    } catch {
      return { kind: "denied", code: "limit_service_unavailable" };
    }
  }

  async rollbackReservation(
    ownerUserId: string,
    reservationId: string,
    _now: Date,
  ): Promise<void> {
    const result = await this.store.executeAtomically({
      kind: "rollback",
      ownerUserId,
      attemptId: reservationId,
    });
    if (result.kind === "missing_reservation") {
      throw new ImportLimitStateUnavailableError();
    }
  }

  async releaseReservation(
    ownerUserId: string,
    reservationId: string,
    _now: Date,
  ): Promise<void> {
    const result = await this.store.executeAtomically({
      kind: "release",
      ownerUserId,
      attemptId: reservationId,
    });
    if (result.kind === "missing_reservation") {
      throw new ImportLimitStateUnavailableError();
    }
  }

  async releaseCapacityForImport(
    ownerUserId: string,
    importId: string,
    _now: Date,
  ): Promise<void> {
    try {
      await this.store.executeAtomically({
        kind: "release_import",
        ownerUserId,
        importId,
      });
    } catch {
      // Release is best-effort; silently ignore failures.
    }
  }
}
