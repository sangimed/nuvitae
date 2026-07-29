import type { EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { PersistenceTransactionRunner } from "@nuvitae/persistence";
import { WorkerPersistenceExecution } from "./worker-persistence.module";

describe("WorkerPersistenceExecution", () => {
  it("resolves only after the transaction commits", async () => {
    const events: string[] = [];
    const manager = {} as EntityManager;
    const runner: PersistenceTransactionRunner = {
      async transaction(work) {
        events.push("transaction-started");
        const value = await work(manager);
        events.push("committed");
        return value;
      },
    };
    const execution = new WorkerPersistenceExecution(runner);

    const result = await execution.execute(async (receivedManager) => {
      expect(receivedManager).toBe(manager);
      events.push("persistence-finished");
      return "queue-result";
    });
    events.push("execution-resolved");

    expect(result).toBe("queue-result");
    expect(events).toEqual([
      "transaction-started",
      "persistence-finished",
      "committed",
      "execution-resolved",
    ]);
  });

  it("rejects and preserves transaction rollback semantics on failure", async () => {
    const failure = new Error("persistence_failed");
    const rollback = vi.fn();
    const runner: PersistenceTransactionRunner = {
      async transaction(work) {
        try {
          return await work({} as EntityManager);
        } catch (error) {
          rollback();
          throw error;
        }
      },
    };
    const execution = new WorkerPersistenceExecution(runner);

    await expect(
      execution.execute(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(rollback).toHaveBeenCalledOnce();
  });
});
