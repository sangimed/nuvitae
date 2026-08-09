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
import type { ImportLimitAttemptsRepository } from "@nuvitae/persistence";

export class TypeOrmImportLimitStore implements AtomicImportLimitStore {
  constructor(
    private readonly repository: ImportLimitAttemptsRepository,
    private readonly ids: () => string = randomUUID,
  ) {}

  async executeAtomically(
    command: ImportLimitStoreCommand,
  ): Promise<ImportLimitStoreResult> {
    return this.repository.transaction(async (manager) => {
      await this.repository.acquireLock(command.ownerUserId, manager);

      switch (command.kind) {
        case "reserve":
          return this.reserve(command, manager);
        case "transition":
          return this.transitionToQueued(command, manager);
        case "claim":
          return this.claim(command, manager);
        case "rollback":
          return this.rollback(command, manager);
        case "release":
          return this.release(command, manager);
        case "release_import":
          return this.releaseImport(command, manager);
      }
    });
  }

  private async reserve(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "reserve" }>,
    manager: Parameters<
      ImportLimitAttemptsRepository["findAttemptsInWindow"]
    >[2],
  ): Promise<ImportLimitStoreResult> {
    const windowStart = new Date(
      command.now.getTime() -
        command.limits.rollingAttemptWindowSeconds * 1_000,
    );
    const attempts = await this.repository.findAttemptsInWindow(
      command.ownerUserId,
      windowStart,
      manager,
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
    await this.repository.insertAttempt(
      {
        id: reservation.id,
        ownerUserId: reservation.ownerUserId,
        importId: null,
        requestId: null,
        state: "reserved",
        attemptedAt: reservation.attemptedAt,
        queuedAt: null,
        activeAt: null,
        releasedAt: null,
      },
      manager,
    );
    return { kind: "reserved", reservation };
  }

  private async transitionToQueued(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "transition" }>,
    manager: Parameters<ImportLimitAttemptsRepository["findAttemptById"]>[2],
  ): Promise<ImportLimitStoreResult> {
    const attempt = await this.repository.findAttemptById(
      command.ownerUserId,
      command.attemptId,
      manager,
    );
    if (attempt === null) return { kind: "missing_reservation" };

    if (attempt.state === "queued" && attempt.importId === command.importId) {
      return {
        kind: "reserved",
        reservation: attempt as ImportLimitReservation,
      };
    }
    if (attempt.state !== "reserved") return { kind: "missing_reservation" };

    const queued = await this.repository.countByState(
      command.ownerUserId,
      "queued",
      manager,
    );
    const outcome = decideCapacityLimit(
      { attemptTimestamps: [], activeJobCount: 0, queuedJobCount: queued },
      "queued",
      command.limits,
    );
    if (outcome.kind !== "allowed") return { kind: "denied", outcome };

    await this.repository.updateAttempt(
      command.attemptId,
      command.ownerUserId,
      {
        state: "queued",
        importId: command.importId,
        queuedAt: command.now,
      },
      manager,
    );
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
    manager: Parameters<
      ImportLimitAttemptsRepository["findAttemptByImport"]
    >[2],
  ): Promise<ImportLimitStoreResult> {
    const attempt = await this.repository.findAttemptByImport(
      command.ownerUserId,
      command.importId,
      manager,
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

    const active = await this.repository.countByState(
      command.ownerUserId,
      "active",
      manager,
    );
    const outcome = decideProcessingStartLimit(
      { attemptTimestamps: [], activeJobCount: active, queuedJobCount: 0 },
      command.limits,
    );
    if (outcome.kind !== "allowed") return { kind: "denied", outcome };

    await this.repository.updateAttempt(
      attempt.id,
      command.ownerUserId,
      {
        state: "active",
        activeAt: command.now,
      },
      manager,
    );
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
    manager: Parameters<ImportLimitAttemptsRepository["deleteAttempt"]>[2],
  ): Promise<ImportLimitStoreResult> {
    await this.repository.deleteAttempt(
      command.ownerUserId,
      command.attemptId,
      manager,
    );
    return { kind: "released" };
  }

  private async release(
    command: Extract<ImportLimitStoreCommand, { readonly kind: "release" }>,
    manager: Parameters<ImportLimitAttemptsRepository["updateAttempt"]>[3],
  ): Promise<ImportLimitStoreResult> {
    const attempt = await this.repository.findAttemptById(
      command.ownerUserId,
      command.attemptId,
      manager,
    );
    if (attempt === null) return { kind: "missing_reservation" };
    if (attempt.state === "released") return { kind: "released" };

    await this.repository.updateAttempt(
      command.attemptId,
      command.ownerUserId,
      { state: "released", releasedAt: new Date() },
      manager,
    );
    return { kind: "released" };
  }

  private async releaseImport(
    command: Extract<
      ImportLimitStoreCommand,
      { readonly kind: "release_import" }
    >,
    manager: Parameters<ImportLimitAttemptsRepository["releaseByImport"]>[4],
  ): Promise<ImportLimitStoreResult> {
    const now = new Date();
    await this.repository.releaseByImport(
      command.ownerUserId,
      command.importId,
      "queued",
      now,
      manager,
    );
    await this.repository.releaseByImport(
      command.ownerUserId,
      command.importId,
      "active",
      now,
      manager,
    );
    return { kind: "released" };
  }
}
