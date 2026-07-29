import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { TypeOrmImportResumeRepository } from "@nuvitae/persistence";
import { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import {
  WORKER_IMPORT_RESUME_REPOSITORY,
  WORKER_PERSISTENCE_EXECUTION,
  WORKER_PERSISTENCE_TRANSACTION_RUNNER,
  WorkerPersistenceExecution,
  createWorkerTypeOrmModuleOptions,
  workerPersistenceRepositoryProviders,
} from "./persistence/worker-persistence.module";
import {
  removeWorkerReadinessFile,
  writeWorkerReadinessFile,
} from "./readiness/worker-readiness";

describe("worker readiness", () => {
  it("writes a database-aware readiness payload for Docker health checks", () => {
    const path = join(mkdtempSync(join(tmpdir(), "nuvitae-worker-")), "ready");

    writeWorkerReadinessFile(path);

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      service: "worker",
      status: "ok",
    });
  });

  it("removes stale readiness state for shutdown and restart", () => {
    const path = join(mkdtempSync(join(tmpdir(), "nuvitae-worker-")), "ready");

    writeWorkerReadinessFile(path);
    removeWorkerReadinessFile(path);

    expect(existsSync(path)).toBe(false);
  });
});

describe("worker persistence providers", () => {
  it("uses shared options with schema mutation disabled", () => {
    const options = createWorkerTypeOrmModuleOptions({
      NODE_ENV: "production",
      POSTGRES_HOST: "database.internal",
      POSTGRES_PORT: "5432",
      POSTGRES_USER: "runtime_user",
      POSTGRES_PASSWORD: "runtime_password",
      POSTGRES_DB: "runtime_database",
      POSTGRES_SSL: "false",
    });

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it("uses one Nest-managed DataSource for repositories and transactions", async () => {
    const manager = {};
    const managedDataSource = {
      manager,
      transaction: vi.fn(async (work: (value: object) => Promise<unknown>) =>
        work(manager),
      ),
    };
    const testingModule = await Test.createTestingModule({
      providers: [
        { provide: DataSource, useValue: managedDataSource },
        ...workerPersistenceRepositoryProviders,
      ],
    }).compile();

    const repository = testingModule.get(WORKER_IMPORT_RESUME_REPOSITORY);
    const transactionRunner = testingModule.get(
      WORKER_PERSISTENCE_TRANSACTION_RUNNER,
    );
    const execution = testingModule.get<WorkerPersistenceExecution>(
      WORKER_PERSISTENCE_EXECUTION,
    );

    expect(repository).toBeInstanceOf(TypeOrmImportResumeRepository);
    expect(transactionRunner).toBe(repository);
    await execution.execute(async (value) => value);
    expect(managedDataSource.transaction).toHaveBeenCalledOnce();
  });
});
