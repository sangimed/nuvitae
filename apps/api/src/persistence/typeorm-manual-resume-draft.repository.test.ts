import { describe, expect, it, vi } from "vitest";
import type { DataSource, EntityManager } from "typeorm";
import { TypeOrmManualResumeDraftRepository } from "./typeorm-manual-resume-draft.repository.js";

describe("TypeOrmManualResumeDraftRepository", () => {
  it("binds manual draft reads to the manager supplied by the transaction", async () => {
    const rootFind = vi.fn(() => {
      throw new Error("root_manager_must_not_be_used");
    });
    const transactionalFind = vi.fn(async () => null);
    const manager = {
      findOneBy: transactionalFind,
    } as unknown as EntityManager;
    const dataSource = {
      manager: { findOneBy: rootFind },
      transaction: vi.fn(
        async <T>(work: (value: EntityManager) => Promise<T>) => work(manager),
      ),
    } as unknown as DataSource;
    const repository = new TypeOrmManualResumeDraftRepository(dataSource);

    const draft = await repository.transaction((scoped) =>
      scoped.findManualDraftByOwner("draft-id", "owner-id"),
    );

    expect(draft).toBeNull();
    expect(transactionalFind).toHaveBeenCalledOnce();
    expect(rootFind).not.toHaveBeenCalled();
  });
});
