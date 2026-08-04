import { execFile } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";

const execFileAsync = promisify(execFile);

describe("project-local TypeORM migration workflow", () => {
  let database: IsolatedPersistenceTestDatabase;
  const temporaryMigrations = ".tmp/migrations";
  const committedMigrations = "packages/persistence/src/migrations";
  let committedMigrationSnapshot: ReadonlyMap<string, string>;

  beforeAll(async () => {
    committedMigrationSnapshot = new Map(
      await Promise.all(
        (await readdir(committedMigrations))
          .filter((entry) => entry.endsWith(".ts"))
          .map(
            async (entry) =>
              [
                entry,
                await readFile(resolve(committedMigrations, entry), "utf8"),
              ] as const,
          ),
      ),
    );
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
    expect(before.stdout).toContain("[ ] ImportDraftReviewRevision");

    await command("db:migration:run");
    const after = await command("db:migration:show");
    expect(after.stdout).toMatch(
      /\[X\]\s+1\s+InitialImportResumePersistence1722168000000/,
    );
    expect(after.stdout).toMatch(
      /\[X\]\s+\d+\s+ImportDraftReviewRevision1722340800000/,
    );
    const tables = await database.dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('imported_documents', 'structured_resumes')`,
      [database.schema],
    );
    expect(tables).toHaveLength(2);
    const semanticTables = await database.dataSource.query<
      {
        table_name: string;
      }[]
    >(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('semantic_parse_attempts', 'nuvitae_extraction_responses', 'evidence_records', 'provider_capability_snapshots', 'semantic_parser_validation_statuses')`,
      [database.schema],
    );
    expect(semanticTables).toHaveLength(5);
    const tracking = await database.dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "${database.schema}"."typeorm_migrations"`,
    );
    expect(tracking[0]?.count).toBe("5");

    await command("db:migration:revert");
    const reverted = await command("db:migration:show");
    expect(reverted.stdout).toContain("[X] 1 InitialImportResumePersistence");
    expect(reverted.stdout).toContain(
      "[X] 4 SemanticImportProcessingStates1722427200000",
    );
    expect(reverted.stdout).toContain(
      "[ ] SemanticParserPersistence1722513600000",
    );
    const revertedSemanticTables = await database.dataSource.query<
      {
        table_name: string;
      }[]
    >(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('semantic_parse_attempts', 'nuvitae_extraction_responses', 'evidence_records', 'provider_capability_snapshots', 'semantic_parser_validation_statuses')`,
      [database.schema],
    );
    expect(revertedSemanticTables).toHaveLength(0);

    await command("db:migration:run");
    const restored = await command("db:migration:show");
    expect(restored.stdout).toMatch(
      /\[X\]\s+\d+\s+InitialImportResumePersistence1722168000000/,
    );
    const restoredSemanticTables = await database.dataSource.query<
      {
        table_name: string;
      }[]
    >(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('semantic_parse_attempts', 'nuvitae_extraction_responses', 'evidence_records', 'provider_capability_snapshots', 'semantic_parser_validation_statuses')`,
      [database.schema],
    );
    expect(restoredSemanticTables).toHaveLength(5);
    const rerun = await database.dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "${database.schema}"."typeorm_migrations"`,
    );
    expect(rerun[0]?.count).toBe("5");

    const result = await command("db:migration:create");
    expect(result.stdout).toContain(".tmp/migrations/");
    expect(result.stdout).toContain("-Empty.ts");

    try {
      const generated = await command("db:migration:generate");
      expect(generated.stdout + generated.stderr).toContain(
        "No changes in database schema were found",
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 1
      ) {
        const generationOutput =
          String("stdout" in error ? error.stdout : "") +
          String("stderr" in error ? error.stderr : "");
        expect(generationOutput).toContain(
          "No changes in database schema were found",
        );
      } else {
        throw error;
      }
    }

    const committedAfter = new Map(
      await Promise.all(
        (await readdir(committedMigrations))
          .filter((entry) => entry.endsWith(".ts"))
          .map(
            async (entry) =>
              [
                entry,
                await readFile(resolve(committedMigrations, entry), "utf8"),
              ] as const,
          ),
      ),
    );
    expect(committedAfter).toEqual(committedMigrationSnapshot);
  });
});
