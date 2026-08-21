import { describe, expect, it, vi } from "vitest";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmImportLimitAttemptsRepository } from "./typeorm-import-limit-attempts.repository.js";

describe("TypeOrmImportLimitAttemptsRepository", () => {
  it("binds operations and nested scopes to the transactional manager", async () => {
    const rootQuery = vi.fn(() => {
      throw new Error("root_manager_must_not_be_used");
    });
    const query = vi.fn(async () => []);
    const manager = { query } as unknown as EntityManager;
    const transaction = vi.fn(
      async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
        work(manager),
    );
    const dataSource = {
      manager: { query: rootQuery },
      transaction,
    } as unknown as DataSource;
    const repository = new TypeOrmImportLimitAttemptsRepository(dataSource);

    await repository.transaction(async (scoped) => {
      await scoped.acquireLock("10000000-0000-4000-8000-000000000001");
      await scoped.transaction(async (nested) => {
        expect(nested).toBe(scoped);
      });
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(rootQuery).not.toHaveBeenCalled();
  });
});
