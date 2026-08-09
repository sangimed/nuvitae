import type { EntityManager } from "typeorm";

export interface ImportLimitAttemptRow {
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

export interface ImportLimitAttemptsRepository {
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;

  findAttemptsInWindow(
    ownerUserId: string,
    windowStart: Date,
    manager: EntityManager,
  ): Promise<ImportLimitAttemptRow[]>;

  countByState(
    ownerUserId: string,
    state: string,
    manager: EntityManager,
  ): Promise<number>;

  findAttemptById(
    ownerUserId: string,
    attemptId: string,
    manager: EntityManager,
  ): Promise<ImportLimitAttemptRow | null>;

  findAttemptByImport(
    ownerUserId: string,
    importId: string,
    manager: EntityManager,
  ): Promise<ImportLimitAttemptRow | null>;

  insertAttempt(
    row: ImportLimitAttemptRow,
    manager: EntityManager,
  ): Promise<void>;

  updateAttempt(
    attemptId: string,
    ownerUserId: string,
    updates: Partial<
      Pick<
        ImportLimitAttemptRow,
        "state" | "importId" | "queuedAt" | "activeAt" | "releasedAt"
      >
    >,
    manager: EntityManager,
  ): Promise<void>;

  releaseByImport(
    ownerUserId: string,
    importId: string,
    state: "queued" | "active",
    releasedAt: Date,
    manager: EntityManager,
  ): Promise<void>;

  deleteAttempt(
    ownerUserId: string,
    attemptId: string,
    manager: EntityManager,
  ): Promise<void>;

  acquireLock(ownerUserId: string, manager: EntityManager): Promise<void>;
}
