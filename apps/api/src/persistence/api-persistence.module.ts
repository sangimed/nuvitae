import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TypeOrmImportResumeRepository,
  TypeOrmImportWorkflowRepository,
  createTypeOrmModuleOptions,
  readPersistenceConfigFromEnv,
} from "@nuvitae/persistence/typeorm";
import type { ImportResumeRepository } from "@nuvitae/persistence/ports";
import { DataSource } from "typeorm";
import { TypeOrmManualResumeDraftRepository } from "./typeorm-manual-resume-draft.repository.js";
import type { ManualResumeDraftRepository } from "../manual-resume/manual-resume.repository.js";
import { TypeOrmResumeWorkspaceRepository } from "./typeorm-resume-workspace.repository.js";

export const API_IMPORT_RESUME_REPOSITORY = Symbol(
  "API_IMPORT_RESUME_REPOSITORY",
);
export const API_IMPORT_REVIEW_REPOSITORY = Symbol(
  "API_IMPORT_REVIEW_REPOSITORY",
);
export const API_IMPORT_CONFIRMATION_REPOSITORY = Symbol(
  "API_IMPORT_CONFIRMATION_REPOSITORY",
);
export const API_START_IMPORT_REPOSITORY = Symbol(
  "API_START_IMPORT_REPOSITORY",
);
export const API_MANUAL_RESUME_DRAFT_REPOSITORY = Symbol(
  "API_MANUAL_RESUME_DRAFT_REPOSITORY",
);
export const API_RESUME_WORKSPACE_REPOSITORY = Symbol(
  "API_RESUME_WORKSPACE_REPOSITORY",
);

/**
 * The runtime factory is the API's only PostgreSQL environment boundary.
 * Shared persistence owns validation, entities, migrations, and TypeORM flags.
 */
export function createApiTypeOrmModuleOptions(
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    ...createTypeOrmModuleOptions(readPersistenceConfigFromEnv(env)),
    // The Community API owns its normal startup migration pass. Workers never
    // perform migrations, avoiding competing runtime schema changes.
    migrationsRun: env.NUVITAE_RUN_MIGRATIONS === "true",
  };
}

export const apiPersistenceRepositoryProviders: Provider[] = [
  {
    provide: API_START_IMPORT_REPOSITORY,
    useExisting: API_IMPORT_REVIEW_REPOSITORY,
  },
  {
    provide: API_IMPORT_CONFIRMATION_REPOSITORY,
    useExisting: API_IMPORT_REVIEW_REPOSITORY,
  },
  {
    provide: API_IMPORT_REVIEW_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmImportWorkflowRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: API_IMPORT_RESUME_REPOSITORY,
    useFactory: (dataSource: DataSource): ImportResumeRepository =>
      new TypeOrmImportResumeRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: API_MANUAL_RESUME_DRAFT_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmManualResumeDraftRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: API_RESUME_WORKSPACE_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmResumeWorkspaceRepository(dataSource),
    inject: [DataSource],
  },
];

/**
 * API use cases inject capability tokens instead of TypeORM entities. New
 * workflows receive transaction-scoped repositories while TypeORM details
 * remain in this composition boundary and its adapters.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createApiTypeOrmModuleOptions,
    }),
  ],
  providers: apiPersistenceRepositoryProviders,
  exports: [
    API_IMPORT_RESUME_REPOSITORY,
    API_IMPORT_REVIEW_REPOSITORY,
    API_IMPORT_CONFIRMATION_REPOSITORY,
    API_START_IMPORT_REPOSITORY,
    API_MANUAL_RESUME_DRAFT_REPOSITORY,
    API_RESUME_WORKSPACE_REPOSITORY,
  ],
})
export class ApiPersistenceModule {}

export type ApiManualResumeDraftRepository = ManualResumeDraftRepository;
