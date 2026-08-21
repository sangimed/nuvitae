import { Test } from "@nestjs/testing";
import {
  PersistenceConfigError,
  TypeOrmImportResumeRepository,
  TypeOrmImportWorkflowRepository,
} from "@nuvitae/persistence";
import { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import {
  API_IMPORT_RESUME_REPOSITORY,
  API_IMPORT_CONFIRMATION_REPOSITORY,
  API_IMPORT_REVIEW_REPOSITORY,
  API_MANUAL_RESUME_DRAFT_REPOSITORY,
  API_START_IMPORT_REPOSITORY,
  apiPersistenceRepositoryProviders,
  createApiTypeOrmModuleOptions,
} from "./api-persistence.module";
import { TypeOrmManualResumeDraftRepository } from "./typeorm-manual-resume-draft.repository.js";

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

  it("composes legacy and workflow repositories from one Nest-managed DataSource", async () => {
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
    const reviewRepository = testingModule.get(API_IMPORT_REVIEW_REPOSITORY);
    const confirmationRepository = testingModule.get(
      API_IMPORT_CONFIRMATION_REPOSITORY,
    );
    const startRepository = testingModule.get(API_START_IMPORT_REPOSITORY);
    const manualRepository = testingModule.get(
      API_MANUAL_RESUME_DRAFT_REPOSITORY,
    );

    expect(repository).toBeInstanceOf(TypeOrmImportResumeRepository);
    expect(reviewRepository).toBeInstanceOf(TypeOrmImportWorkflowRepository);
    expect(confirmationRepository).toBe(reviewRepository);
    expect(startRepository).toBe(reviewRepository);
    expect(manualRepository).toBeInstanceOf(TypeOrmManualResumeDraftRepository);
  });
});
