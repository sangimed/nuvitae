import { DataSource, EntityManager } from "typeorm";
import { ImportLimitAttemptEntity } from "../entities/import-limit-attempt.entity.js";
import type {
  ImportLimitAttemptRow,
  ImportLimitAttemptsRepository,
} from "./import-limit-attempts.repository.js";

function entityToRow(entity: ImportLimitAttemptEntity): ImportLimitAttemptRow {
  return {
    id: entity.id,
    ownerUserId: entity.ownerUserId,
    importId: entity.importId,
    requestId: entity.requestId,
    state: entity.state as ImportLimitAttemptRow["state"],
    attemptedAt: entity.attemptedAt,
    queuedAt: entity.queuedAt,
    activeAt: entity.activeAt,
    releasedAt: entity.releasedAt,
  };
}

function uuidToAdvisoryLock(ownerUserId: string): [number, number] {
  const hex = ownerUserId.replace(/-/g, "");
  const key1 = parseInt(hex.substring(0, 8), 16) | 0;
  const key2 = parseInt(hex.substring(8, 16), 16) | 0;
  return [key1, key2];
}

export class TypeOrmImportLimitAttemptsRepository implements ImportLimitAttemptsRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionManager?: EntityManager,
  ) {}

  transaction<T>(
    work: (repository: ImportLimitAttemptsRepository) => Promise<T>,
  ): Promise<T> {
    if (this.transactionManager !== undefined) return work(this);
    return this.dataSource.transaction((manager) =>
      work(new TypeOrmImportLimitAttemptsRepository(this.dataSource, manager)),
    );
  }

  private manager(): EntityManager {
    return this.transactionManager ?? this.dataSource.manager;
  }

  async acquireLock(ownerUserId: string): Promise<void> {
    const [key1, key2] = uuidToAdvisoryLock(ownerUserId);
    await this.manager().query(
      `SELECT pg_advisory_xact_lock(${key1}, ${key2})`,
    );
  }

  async findAttemptsInWindow(
    ownerUserId: string,
    windowStart: Date,
  ): Promise<ImportLimitAttemptRow[]> {
    const entities = await this.manager().find(ImportLimitAttemptEntity, {
      where: { ownerUserId },
      order: { attemptedAt: "ASC" },
    });
    // The rolling interval is (windowStart, now]. An attempt exactly at the
    // lower boundary has expired and no longer consumes capacity.
    return entities
      .filter((e) => e.attemptedAt.getTime() > windowStart.getTime())
      .map(entityToRow);
  }

  async countByState(ownerUserId: string, state: string): Promise<number> {
    return this.manager().count(ImportLimitAttemptEntity, {
      where: { ownerUserId, state },
    });
  }

  async findAttemptById(
    ownerUserId: string,
    attemptId: string,
  ): Promise<ImportLimitAttemptRow | null> {
    const entity = await this.manager().findOne(ImportLimitAttemptEntity, {
      where: { id: attemptId, ownerUserId },
    });
    return entity === null ? null : entityToRow(entity);
  }

  async findAttemptByImport(
    ownerUserId: string,
    importId: string,
  ): Promise<ImportLimitAttemptRow | null> {
    const entity = await this.manager().findOne(ImportLimitAttemptEntity, {
      where: { importId, ownerUserId },
    });
    return entity === null ? null : entityToRow(entity);
  }

  async insertAttempt(row: ImportLimitAttemptRow): Promise<void> {
    const manager = this.manager();
    const entity = manager.create(ImportLimitAttemptEntity, {
      id: row.id,
      ownerUserId: row.ownerUserId,
      importId: row.importId,
      requestId: row.requestId,
      state: row.state,
      attemptedAt: row.attemptedAt,
      queuedAt: row.queuedAt,
      activeAt: row.activeAt,
      releasedAt: row.releasedAt,
    });
    await manager.save(entity);
  }

  async updateAttempt(
    attemptId: string,
    ownerUserId: string,
    updates: Partial<
      Pick<
        ImportLimitAttemptRow,
        "state" | "importId" | "queuedAt" | "activeAt" | "releasedAt"
      >
    >,
  ): Promise<void> {
    await this.manager().update(
      ImportLimitAttemptEntity,
      { id: attemptId, ownerUserId },
      updates,
    );
  }

  async releaseByImport(
    ownerUserId: string,
    importId: string,
    state: "queued" | "active",
    releasedAt: Date,
  ): Promise<void> {
    await this.manager().update(
      ImportLimitAttemptEntity,
      { ownerUserId, importId, state },
      { state: "released", releasedAt },
    );
  }

  async deleteAttempt(ownerUserId: string, attemptId: string): Promise<void> {
    await this.manager().delete(ImportLimitAttemptEntity, {
      id: attemptId,
      ownerUserId,
    });
  }
}
