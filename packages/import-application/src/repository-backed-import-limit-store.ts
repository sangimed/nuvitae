import { randomUUID } from "node:crypto";
import {
  decideCapacityLimit,
  decideProcessingStartLimit,
  decideUploadAttemptLimit,
  type AtomicImportLimitStore,
  type ImportLimitReservation,
  type ImportLimitStoreCommand,
  type ImportLimitStoreResult,
} from "./import-limits.js";

export interface ImportLimitAttemptRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly importId: string | null;
  readonly requestId: string | null;
  readonly state: "reserved" | "queued" | "active" | "released";
  readonly attemptedAt: Date;
  readonly queuedAt: Date | null;
  readonly activeAt: Date | null;
  readonly releasedAt: Date | null;
}

export interface ImportLimitAttemptsPort {
  transaction<T>(
    work: (repository: ImportLimitAttemptsPort) => Promise<T>,
  ): Promise<T>;
  acquireLock(ownerUserId: string): Promise<void>;
  findAttemptsInWindow(
    ownerUserId: string,
    windowStart: Date,
  ): Promise<readonly ImportLimitAttemptRecord[]>;
  countByState(ownerUserId: string, state: string): Promise<number>;
  findAttemptById(
    ownerUserId: string,
    attemptId: string,
  ): Promise<ImportLimitAttemptRecord | null>;
  findAttemptByImport(
    ownerUserId: string,
    importId: string,
  ): Promise<ImportLimitAttemptRecord | null>;
  insertAttempt(row: ImportLimitAttemptRecord): Promise<void>;
  updateAttempt(
    attemptId: string,
    ownerUserId: string,
    updates: Partial<
      Pick<
        ImportLimitAttemptRecord,
        "state" | "importId" | "queuedAt" | "activeAt" | "releasedAt"
      >
    >,
  ): Promise<void>;
  releaseByImport(
    ownerUserId: string,
    importId: string,
    state: "queued" | "active",
    releasedAt: Date,
  ): Promise<void>;
  deleteAttempt(ownerUserId: string, attemptId: string): Promise<void>;
}

export class RepositoryBackedImportLimitStore implements AtomicImportLimitStore {
  constructor(
    private readonly repository: ImportLimitAttemptsPort,
    private readonly ids: () => string = randomUUID,
  ) {}

  async executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult> {
    return this.repository.transaction(async (repository) => {
      await repository.acquireLock(command.ownerUserId);

      switch (command.kind) {
        case "reserve":
          return this.reserve(command, repository);
        case "transition":
          return this.transitionToQueued(command, repository);
        case "claim":
          return this.claim(command, repository);
        case "rollback":
          return this.rollback(command, repository);
        case "release":
          return this.release(command, repository);
        case "release_import":
          return this.releaseImport(command, repository);
      }
    });
  }

  private async reserve(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "reserve" }>,
    repository: ImportLimitAttemptsPort,
  ): Promise<ImportLimitStoreResult> {
    const windowStart = new Date(
      command.now.getTime() -
        command.limits.rollingAttemptWindowSeconds * 1_000,
    );
    const attempts = await repository.findAttemptsInWindow(
      command.ownerUserId,
      windowStart,
    );
    const timestamps = attempts.map((a) => a.attemptedAt.getTime());
    const outcome = decideUploadAttemptLimit(
      { attemptTimestamps: timestamps, activeJobCount: 0, queuedJobCount: 0 },
      command.now,
      command.limits,
    );
    if (outcome.kind === "denied") {
      return { kind: "denied", outcome };
    }

    const reservation: ImportLimitReservation = {
      id: this.ids(),
      ownerUserId: command.ownerUserId,
      attemptedAt: command.now,
      importId: null,
      state: "reserved",
    };
    await repository.insertAttempt({
      id: reservation.id,
      ownerUserId: reservation.ownerUserId,
      importId: null,
      requestId: null,
      state: "reserved",
      attemptedAt: reservation.attemptedAt,
      queuedAt: null,
      activeAt: null,
      releasedAt: null,
    });
    return { kind: "reserved", reservation };
  }

  private async transitionToQueued(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "transition" }>,
    repository: ImportLimitAttemptsPort,
  ): Promise<ImportLimitStoreResult> {
    const attempt = await repository.findAttemptById(
      command.ownerUserId,
      command.attemptId,
    );
    if (attempt === null) return { kind: "missing_reservation" };

    if (attempt.state === "queued" && attempt.importId === command.importId) {
      return {
        kind: "reserved",
        reservation: attempt as ImportLimitReservation,
      };
    }
    if (attempt.state !== "reserved") return { kind: "missing_reservation" };

    const queued = await repository.countByState(command.ownerUserId, "queued");
    const outcome = decideCapacityLimit(
      { attemptTimestamps: [], activeJobCount: 0, queuedJobCount: queued },
      "queued",
      command.limits,
    );
    if (outcome.kind !== "allowed") return { kind: "denied", outcome };

    await repository.updateAttempt(command.attemptId, command.ownerUserId, {
      state: "queued",
      importId: command.importId,
      queuedAt: command.now,
    });
    return {
      kind: "reserved",
      reservation: {
        ...attempt,
        state: "queued",
        importId: command.importId,
      },
    };
  }

  private async claim(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "claim" }>,
    repository: ImportLimitAttemptsPort,
  ): Promise<ImportLimitStoreResult> {
    const attempt = await repository.findAttemptByImport(
      command.ownerUserId,
      command.importId,
    );
    if (attempt === null) {
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
      return {
        kind: "reserved",
        reservation: attempt as ImportLimitReservation,
      };
    }
    if (attempt.state !== "queued") return { kind: "missing_reservation" };

    const active = await repository.countByState(command.ownerUserId, "active");
    const outcome = decideProcessingStartLimit(
      { attemptTimestamps: [], activeJobCount: active, queuedJobCount: 0 },
      command.limits,
    );
    if (outcome.kind !== "allowed") return { kind: "denied", outcome };

    await repository.updateAttempt(attempt.id, command.ownerUserId, {
      state: "active",
      activeAt: command.now,
    });
    return {
      kind: "reserved",
      reservation: {
        ...attempt,
        state: "active",
      },
    };
  }

  private async rollback(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "rollback" }>,
    repository: ImportLimitAttemptsPort,
  ): Promise<ImportLimitStoreResult> {
    await repository.deleteAttempt(command.ownerUserId, command.attemptId);
    return { kind: "released" };
  }

  private async release(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "release" }>,
    repository: ImportLimitAttemptsPort,
  ): Promise<ImportLimitStoreResult> {
    const attempt = await repository.findAttemptById(
      command.ownerUserId,
      command.attemptId,
    );
    if (attempt === null) return { kind: "missing_reservation" };
    if (attempt.state === "released") return { kind: "released" };

    await repository.updateAttempt(command.attemptId, command.ownerUserId, {
      state: "released",
      releasedAt: new Date(),
    });
    return { kind: "released" };
  }

  private async releaseImport(
    command: Extract<
      ImportLimitStoreCommand,
      { readonly kind: "release_import" }
    >,
    repository: ImportLimitAttemptsPort,
  ): Promise<ImportLimitStoreResult> {
    const now = new Date();
    await repository.releaseByImport(
      command.ownerUserId,
      command.importId,
      "queued",
      now,
    );
    await repository.releaseByImport(
      command.ownerUserId,
      command.importId,
      "active",
      now,
    );
    return { kind: "released" };
  }
}
