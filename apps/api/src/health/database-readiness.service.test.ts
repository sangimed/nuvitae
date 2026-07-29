import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { DatabaseReadinessService } from "./database-readiness.service";

describe("DatabaseReadinessService", () => {
  it("runs the minimal parameter-free PostgreSQL probe", async () => {
    const dataSource = {
      isInitialized: true,
      query: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as DataSource;

    await expect(
      new DatabaseReadinessService(dataSource).probe(),
    ).resolves.toBeUndefined();
    expect(dataSource.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("rejects without querying when TypeORM is not initialized", async () => {
    const dataSource = {
      isInitialized: false,
      query: vi.fn(),
    } as unknown as DataSource;

    await expect(
      new DatabaseReadinessService(dataSource).probe(),
    ).rejects.toThrow("not_initialized");
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
