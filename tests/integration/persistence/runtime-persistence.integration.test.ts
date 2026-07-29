import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import {
  PersistenceConfigError,
  TypeOrmImportResumeRepository,
} from "@nuvitae/persistence";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../apps/api/src/app.module.js";
import { createApiTypeOrmModuleOptions } from "../../../apps/api/src/persistence/api-persistence.module.js";
import {
  WORKER_IMPORT_RESUME_REPOSITORY,
  WORKER_PERSISTENCE_EXECUTION,
  WORKER_PERSISTENCE_TRANSACTION_RUNNER,
  WorkerPersistenceExecution,
  createWorkerTypeOrmModuleOptions,
} from "../../../apps/worker/src/persistence/worker-persistence.module.js";
import { startWorkerRuntime } from "../../../apps/worker/src/runtime/worker-runtime.js";
import { WorkerModule } from "../../../apps/worker/src/worker.module.js";
import type { IsolatedPersistenceTestDatabase } from "./test-database.js";
import { createIsolatedPersistenceTestDatabase } from "./test-database.js";

const persistenceEnvironmentKeys = [
  "NODE_ENV",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "POSTGRES_SCHEMA",
  "POSTGRES_SSL",
  "POSTGRES_CONNECTION_TIMEOUT_MS",
  "POSTGRES_STATEMENT_TIMEOUT_MS",
] as const;

describe("final API and worker persistence runtime integration", () => {
  let database: IsolatedPersistenceTestDatabase;
  const previousEnvironment = new Map<string, string | undefined>();

  beforeAll(async () => {
    for (const key of persistenceEnvironmentKeys) {
      previousEnvironment.set(key, process.env[key]);
    }
    database = await createIsolatedPersistenceTestDatabase("runtime");
    process.env.NODE_ENV = "test";
    process.env.POSTGRES_DB = database.database;
    process.env.POSTGRES_SCHEMA = database.schema;
    process.env.POSTGRES_CONNECTION_TIMEOUT_MS = "3000";
    process.env.POSTGRES_STATEMENT_TIMEOUT_MS = "2000";
  });

  afterAll(async () => {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await database.cleanup();
  });

  it("uses the shared option factory in both apps without automatic schema mutation", async () => {
    const apiOptions = createApiTypeOrmModuleOptions(process.env);
    const workerOptions = createWorkerTypeOrmModuleOptions(process.env);

    expect(apiOptions.synchronize).toBe(false);
    expect(apiOptions.migrationsRun).toBe(false);
    expect(workerOptions.synchronize).toBe(false);
    expect(workerOptions.migrationsRun).toBe(false);
    expect(apiOptions.entities).toEqual(workerOptions.entities);
    expect(apiOptions.migrations).toEqual(workerOptions.migrations);

    for (const path of [
      "apps/api/src/persistence/api-persistence.module.ts",
      "apps/worker/src/persistence/worker-persistence.module.ts",
    ]) {
      const source = await readFile(resolve(path), "utf8");
      expect(source).toContain("createTypeOrmModuleOptions");
      expect(source).toContain("readPersistenceConfigFromEnv");
      expect(source).not.toMatch(/\bentities\s*:/);
      expect(source).not.toMatch(/\bmigrations\s*:/);
      expect(source).not.toContain("forFeature(");
    }
  });

  it("starts AppModule and keeps liveness independent from database readiness", async () => {
    const app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    const baseUrl = await app.getUrl();

    try {
      const ready = await fetch(`${baseUrl}/health`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ service: "api", status: "ok" });

      const live = await fetch(`${baseUrl}/health/live`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ service: "api", status: "ok" });

      const managedDataSource = app.get(DataSource);
      await managedDataSource.destroy();

      const unavailable = await fetch(`${baseUrl}/health`);
      expect(unavailable.status).toBe(503);
      const failureBody = await unavailable.text();
      expect(JSON.parse(failureBody)).toEqual({
        statusCode: 503,
        code: "database_unavailable",
        message: "Service is not ready.",
      });
      expect(failureBody).not.toContain(process.env.POSTGRES_PASSWORD);
      expect(failureBody).not.toContain(process.env.POSTGRES_HOST);
      expect(failureBody).not.toContain(process.env.POSTGRES_DB);
      expect(failureBody).not.toContain("SELECT 1");
      expect(failureBody).not.toContain("driver");

      const stillLive = await fetch(`${baseUrl}/health/live`);
      expect(stillLive.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("fails invalid API runtime configuration without exposing credential values", () => {
    const secret = "integration-secret-must-not-appear";

    try {
      createApiTypeOrmModuleOptions({
        NODE_ENV: "production",
        POSTGRES_PASSWORD: secret,
      });
      throw new Error("expected_configuration_failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceConfigError);
      const serialized = JSON.stringify(
        error,
        Object.getOwnPropertyNames(error),
      );
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain("postgres://");
    }
  });

  it("starts the standalone worker, commits and rolls back through its managed DataSource, then removes readiness", async () => {
    const readinessPath = join(
      mkdtempSync(join(tmpdir(), "nuvitae-worker-runtime-")),
      "ready",
    );
    let application:
      | Awaited<ReturnType<typeof NestFactory.createApplicationContext>>
      | undefined;
    const runtime = await startWorkerRuntime({
      readinessPath,
      createApplication: async () => {
        application = await NestFactory.createApplicationContext(WorkerModule, {
          logger: false,
        });
        return application;
      },
    });

    try {
      expect(existsSync(readinessPath)).toBe(true);
      expect(JSON.parse(readFileSync(readinessPath, "utf8"))).toEqual({
        service: "worker",
        status: "ok",
      });

      const repository = application!.get(WORKER_IMPORT_RESUME_REPOSITORY);
      const transactionRunner = application!.get(
        WORKER_PERSISTENCE_TRANSACTION_RUNNER,
      );
      const execution = application!.get<WorkerPersistenceExecution>(
        WORKER_PERSISTENCE_EXECUTION,
      );
      const managedDataSource = application!.get(DataSource);

      expect(repository).toBeInstanceOf(TypeOrmImportResumeRepository);
      expect(transactionRunner).toBe(repository);

      await execution.execute(async (manager) => {
        await manager.query(
          "CREATE TABLE worker_transaction_probe (id integer PRIMARY KEY)",
        );
        await manager.query(
          "INSERT INTO worker_transaction_probe (id) VALUES (1)",
        );
      });
      expect(
        await managedDataSource.query<{ id: number }[]>(
          "SELECT id FROM worker_transaction_probe ORDER BY id",
        ),
      ).toEqual([{ id: 1 }]);

      await expect(
        execution.execute(async (manager) => {
          await manager.query(
            "INSERT INTO worker_transaction_probe (id) VALUES (2)",
          );
          throw new Error("persistence_failed");
        }),
      ).rejects.toThrow("persistence_failed");
      expect(
        await managedDataSource.query<{ id: number }[]>(
          "SELECT id FROM worker_transaction_probe ORDER BY id",
        ),
      ).toEqual([{ id: 1 }]);
    } finally {
      await runtime.shutdown();
    }

    expect(existsSync(readinessPath)).toBe(false);
  });

  it("keeps worker implementation independent from API implementation modules", async () => {
    const workerSources = [
      "apps/worker/src/main.ts",
      "apps/worker/src/worker.module.ts",
      "apps/worker/src/persistence/worker-persistence.module.ts",
      "apps/worker/src/runtime/worker-runtime.ts",
    ];
    for (const path of workerSources) {
      const source = await readFile(resolve(path), "utf8");
      expect(source).not.toMatch(/apps\/api|@nuvitae\/api|\.\.\/.*api/);
    }
  });

  it("packages persistence runtime artifacts in both production Dockerfiles", async () => {
    for (const path of ["docker/api/Dockerfile", "docker/worker/Dockerfile"]) {
      const source = await readFile(resolve(path), "utf8");
      expect(source).toContain("packages/persistence/dist");
      expect(source).toContain("packages/persistence/node_modules");
      expect(source).toContain("packages/domain/dist");
      expect(source).not.toContain("tests/integration");
      expect(source).not.toMatch(/npm install -g|pnpm add -g/);
    }
  });
});
