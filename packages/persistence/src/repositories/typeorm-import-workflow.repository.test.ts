import { describe, expect, it, vi } from "vitest";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmImportWorkflowRepository } from "./typeorm-import-workflow.repository.js";

describe("TypeOrmImportWorkflowRepository", () => {
  it("binds every callback operation to the transactional entity manager", async () => {
    const rootFind = vi.fn(() => {
      throw new Error("root_manager_must_not_be_used");
    });
    const transactionalFind = vi.fn(async () => null);
    const manager = {
      findOneBy: transactionalFind,
    } as unknown as EntityManager;
    const transaction = vi.fn(
      async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
        work(manager),
    );
    const dataSource = {
      manager: { findOneBy: rootFind },
      transaction,
    } as unknown as DataSource;
    const repository = new TypeOrmImportWorkflowRepository(dataSource);

    const result = await repository.transaction(async (scoped) => {
      const found = await scoped.findImportByOwner("import-id", "owner-id");
      return await scoped.transaction(async (nested) => {
        expect(nested).toBe(scoped);
        return found;
      });
    });

    expect(result).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionalFind).toHaveBeenCalledTimes(1);
    expect(rootFind).not.toHaveBeenCalled();
  });
});
