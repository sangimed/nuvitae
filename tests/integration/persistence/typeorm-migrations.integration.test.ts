import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";

const execFileAsync = promisify(execFile);

describe("project-local TypeORM migration workflow", () => {
  let database: IsolatedPersistenceTestDatabase;
  const temporaryMigrations = ".tmp/migrations";

  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("migrations", {
      migrate: false,
    });
  });
  afterAll(async () => {
    await rm(temporaryMigrations, { recursive: true, force: true });
    await database.cleanup();
  });

  async function command(script: string) {
    return execFileAsync("pnpm", [script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        POSTGRES_DB: database.database,
        POSTGRES_SCHEMA: database.schema,
      },
    });
  }

  it("shows, runs, reverts, and reruns the tracked migration", async () => {
    const before = await command("db:migration:show");
    expect(before.stdout).toContain("[ ] InitialImportResumePersistence");

    await command("db:migration:run");
    const after = await command("db:migration:show");
    expect(after.stdout).toMatch(
      /\[X\]\s+1\s+InitialImportResumePersistence1722168000000/,
    );
    const tables = await database.dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('imported_documents', 'structured_resumes')`,
      [database.schema],
    );
    expect(tables).toHaveLength(2);
    const tracking = await database.dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "${database.schema}"."typeorm_migrations"`,
    );
    expect(tracking[0]?.count).toBe("1");

    await command("db:migration:revert");
    const removed = await database.dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'imported_documents'`,
      [database.schema],
    );
    expect(removed).toHaveLength(0);

    await command("db:migration:run");
    const rerun = await database.dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "${database.schema}"."typeorm_migrations"`,
    );
    expect(rerun[0]?.count).toBe("1");

    const result = await command("db:migration:create");
    expect(result.stdout).toContain(".tmp/migrations/");
    expect(result.stdout).toContain("-Empty.ts");

    try {
      const generation = await command("db:migration:generate");
      expect(generation.stdout + generation.stderr).toContain(
        ".tmp/migrations/Generated",
      );
      throw new Error("Entity metadata differs from the committed migration.");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 1
      ) {
        const output =
          String("stdout" in error ? error.stdout : "") +
          String("stderr" in error ? error.stderr : "");
        expect(output).toContain("No changes in database schema were found");
        return;
      }
      throw error;
    }
  });
});
