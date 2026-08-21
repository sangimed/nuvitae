import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { CodexDirectProviderAdapter } from "@nuvitae/import-application/codex";
import { TypeOrmImportWorkflowRepository } from "@nuvitae/persistence";
import { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import {
  WORKER_IMPORT_WORKFLOW_REPOSITORY,
  createWorkerTypeOrmModuleOptions,
  workerPersistenceRepositoryProviders,
} from "./persistence/worker-persistence.module";
import {
  WORKER_SEMANTIC_PARSER_PROVIDER,
  createProductionSemanticParserProvider,
  workerImportRuntimeProviders,
} from "./import-resume/worker-import-runtime.providers";
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

  it("composes the transaction-scoped workflow repository from Nest's DataSource", async () => {
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

    const repository = testingModule.get(WORKER_IMPORT_WORKFLOW_REPOSITORY);

    expect(repository).toBeInstanceOf(TypeOrmImportWorkflowRepository);
    await repository.transaction(async (value: unknown) => value);
    expect(managedDataSource.transaction).toHaveBeenCalledOnce();
  });
});

describe("production semantic provider isolation", () => {
  it("activates the production Codex adapter through injected dependencies", () => {
    const provider = createProductionSemanticParserProvider(
      { findConnectionByProviderAndOwner: async () => null } as never,
      { readSession: async () => new Uint8Array() } as never,
    );
    expect(provider).toBeInstanceOf(CodexDirectProviderAdapter);
    const registration = workerImportRuntimeProviders.find((entry) => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("provide" in entry)
      ) {
        return false;
      }
      return (
        (entry as { provide?: unknown }).provide ===
        WORKER_SEMANTIC_PARSER_PROVIDER
      );
    });
    expect(registration).toBeDefined();
    const factory = (registration as { useFactory?: () => unknown }).useFactory;
    expect(typeof factory).toBe("function");
    expect(factory).toBe(createProductionSemanticParserProvider);
  });
});
