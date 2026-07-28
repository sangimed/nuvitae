import { randomUUID } from "node:crypto";
import {
  createPersistenceDataSource,
  readPersistenceConfigFromEnv,
  type DataSource,
} from "@nuvitae/persistence";

function validatedTestDatabaseName(): string {
  const database = process.env.POSTGRES_TEST_DB ?? "";
  if (!/^[a-z_][a-z0-9_]*_test$/.test(database)) {
    throw new Error(
      "Persistence integration tests require POSTGRES_TEST_DB ending in _test.",
    );
  }
  return database;
}

function dataSourceFor(database: string): DataSource {
  return createPersistenceDataSource(
    readPersistenceConfigFromEnv({
      ...process.env,
      POSTGRES_DB: database,
      POSTGRES_SCHEMA: undefined,
    }),
  );
}

async function ensureTestDatabase(database: string): Promise<void> {
  const developmentDatabase = process.env.POSTGRES_DB ?? "nuvitae";
  const admin = dataSourceFor(developmentDatabase);
  await admin.initialize();
  try {
    const exists = await admin.query<{ exists: boolean }[]>(
      "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [database],
    );
    if (!exists[0]?.exists) {
      // The identifier is constrained above; PostgreSQL cannot parameterize it.
      await admin.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await admin.destroy();
  }
}

export interface IsolatedPersistenceTestDatabase {
  readonly dataSource: DataSource;
  readonly database: string;
  readonly schema: string;
  cleanup(): Promise<void>;
}

export async function createIsolatedPersistenceTestDatabase(
  suite: string,
  options: { readonly migrate?: boolean } = {},
): Promise<IsolatedPersistenceTestDatabase> {
  const database = validatedTestDatabaseName();
  await ensureTestDatabase(database);
  const suffix = randomUUID().replaceAll("-", "");
  const schema = `test_${suite.replaceAll(/[^a-z0-9]/g, "_")}_${suffix}`;
  const config = readPersistenceConfigFromEnv({
    ...process.env,
    POSTGRES_DB: database,
    POSTGRES_SCHEMA: schema,
  });
  const dataSource = createPersistenceDataSource(config);
  try {
    await dataSource.initialize();
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    if (options.migrate !== false) await dataSource.runMigrations();
  } catch (error) {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
      await dataSource.destroy();
    }
    throw error;
  }

  return {
    dataSource,
    database,
    schema,
    async cleanup() {
      if (dataSource.isInitialized) {
        await dataSource.query(`DROP SCHEMA "${schema}" CASCADE`);
        await dataSource.destroy();
      }
    },
  };
}

export function postgresErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "driverError" in error &&
    typeof error.driverError === "object" &&
    error.driverError !== null &&
    "code" in error.driverError
  ) {
    return String(error.driverError.code);
  }
  return undefined;
}
