import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIsolatedPersistenceTestDatabase,
  type IsolatedPersistenceTestDatabase,
} from "./test-database.js";

const databases: IsolatedPersistenceTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.cleanup()));
  vi.unstubAllEnvs();
});

describe("isolated test database bootstrap", () => {
  it("initializes a new database concurrently and keeps suite schemas isolated", async () => {
    // Fresh for every run; retain the empty test database in the disposable
    // Compose project rather than deleting databases during the regression.
    const name = `bootstrap_${randomUUID().replaceAll("-", "")}_test`;
    vi.stubEnv("POSTGRES_TEST_DB", name);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        createIsolatedPersistenceTestDatabase("concurrent_creator", {
          migrate: false,
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") databases.push(result.value);
    }
    expect(results.filter((result) => result.status === "rejected")).toEqual(
      [],
    );
    expect(databases).toHaveLength(8);
    expect(new Set(databases.map((database) => database.schema)).size).toBe(8);
    for (const [index, database] of databases.entries()) {
      expect(database.database).toBe(name);
      await database.dataSource.query("CREATE TABLE marker (value integer)");
      await database.dataSource.query("INSERT INTO marker VALUES ($1)", [
        index,
      ]);
    }
    for (const [index, database] of databases.entries()) {
      expect(
        await database.dataSource.query("SELECT value FROM marker"),
      ).toEqual([{ value: index }]);
    }
    const repeated = await createIsolatedPersistenceTestDatabase("repeat", {
      migrate: false,
    });
    databases.push(repeated);
    expect(repeated.database).toBe(name);
    expect(
      await repeated.dataSource.query(
        "SELECT count(*)::integer AS count FROM pg_database WHERE datname = $1",
        [name],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it.each(["", "nuvitae", "nuvitae_test;SELECT 1", 'unsafe"_test'])(
    "rejects unsafe or non-test database name %j before connecting",
    async (name) => {
      vi.stubEnv("POSTGRES_TEST_DB", name);
      vi.stubEnv("POSTGRES_HOST", "invalid.invalid");
      await expect(
        createIsolatedPersistenceTestDatabase("unsafe"),
      ).rejects.toThrow(
        "Persistence integration tests require POSTGRES_TEST_DB ending in _test.",
      );
    },
  );
});
