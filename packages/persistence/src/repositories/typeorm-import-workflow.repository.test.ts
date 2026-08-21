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

  it("requires review locks to run through a transaction-scoped repository", async () => {
    const repository = new TypeOrmImportWorkflowRepository({
      manager: {},
    } as DataSource);

    expect(() =>
      repository.findReviewDraftByImportAndOwnerForUpdate(
        "import-id",
        "owner-id",
      ),
    ).toThrow("import_review_operation_requires_transaction");
  });

  it("binds review locking to the manager supplied by the transaction", async () => {
    const getOne = vi.fn(async () => null);
    const andWhere = vi.fn(() => ({ getOne }));
    const where = vi.fn(() => ({ andWhere }));
    const setLock = vi.fn(() => ({ where }));
    const createQueryBuilder = vi.fn(() => ({ setLock }));
    const manager = { createQueryBuilder } as unknown as EntityManager;
    const dataSource = {
      manager: {},
      transaction: vi.fn(
        async <T>(work: (value: EntityManager) => Promise<T>) => work(manager),
      ),
    } as unknown as DataSource;
    const repository = new TypeOrmImportWorkflowRepository(dataSource);

    const draft = await repository.transaction((scoped) =>
      scoped.findReviewDraftByImportAndOwnerForUpdate("import-id", "owner-id"),
    );

    expect(draft).toBeNull();
    expect(createQueryBuilder).toHaveBeenCalledOnce();
    expect(setLock).toHaveBeenCalledWith("pessimistic_write");
  });
});
