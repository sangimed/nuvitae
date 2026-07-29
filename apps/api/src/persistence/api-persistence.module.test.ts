import { Test } from "@nestjs/testing";
import {
  PersistenceConfigError,
  TypeOrmImportResumeRepository,
} from "@nuvitae/persistence";
import { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import {
  API_IMPORT_RESUME_REPOSITORY,
  API_PERSISTENCE_TRANSACTION_RUNNER,
  apiPersistenceRepositoryProviders,
  createApiTypeOrmModuleOptions,
} from "./api-persistence.module";

const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  POSTGRES_HOST: "database.internal",
  POSTGRES_PORT: "5432",
  POSTGRES_USER: "runtime_user",
  POSTGRES_PASSWORD: "runtime_password",
  POSTGRES_DB: "runtime_database",
  POSTGRES_SSL: "false",
};

describe("ApiPersistenceModule", () => {
  it("uses the shared production-safe TypeORM option factory", () => {
    const options = createApiTypeOrmModuleOptions(validProductionEnv);

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it("fails invalid production configuration without exposing supplied secrets", () => {
    const secret = "must-never-appear";

    expect(() =>
      createApiTypeOrmModuleOptions({
        NODE_ENV: "production",
        POSTGRES_PASSWORD: secret,
      }),
    ).toThrow(PersistenceConfigError);

    try {
      createApiTypeOrmModuleOptions({
        NODE_ENV: "production",
        POSTGRES_PASSWORD: secret,
      });
    } catch (error) {
      const serialized = JSON.stringify(
        error,
        Object.getOwnPropertyNames(error),
      );
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain("postgres://");
    }
  });

  it("aliases repository and transaction tokens to one Nest-managed DataSource", async () => {
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
        ...apiPersistenceRepositoryProviders,
      ],
    }).compile();

    const repository = testingModule.get(API_IMPORT_RESUME_REPOSITORY);
    const transactionRunner = testingModule.get(
      API_PERSISTENCE_TRANSACTION_RUNNER,
    );

    expect(repository).toBeInstanceOf(TypeOrmImportResumeRepository);
    expect(transactionRunner).toBe(repository);
    await transactionRunner.transaction(async (value) => value);
    expect(managedDataSource.transaction).toHaveBeenCalledOnce();
  });
});
