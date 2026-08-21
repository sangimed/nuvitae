import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TypeOrmImportResumeRepository,
  TypeOrmImportWorkflowRepository,
  createTypeOrmModuleOptions,
  readPersistenceConfigFromEnv,
  type ImportResumeRepository,
  type ManualResumeDraftRepository,
  type PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { DataSource, type EntityManager } from "typeorm";

export const API_IMPORT_RESUME_REPOSITORY = Symbol(
  "API_IMPORT_RESUME_REPOSITORY",
);
export const API_PERSISTENCE_TRANSACTION_RUNNER = Symbol(
  "API_PERSISTENCE_TRANSACTION_RUNNER",
);
export const API_IMPORT_REVIEW_REPOSITORY = Symbol(
  "API_IMPORT_REVIEW_REPOSITORY",
);
export const API_MANUAL_RESUME_DRAFT_REPOSITORY = Symbol(
  "API_MANUAL_RESUME_DRAFT_REPOSITORY",
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
    provide: API_PERSISTENCE_TRANSACTION_RUNNER,
    useExisting: API_IMPORT_RESUME_REPOSITORY,
  },
  {
    provide: API_MANUAL_RESUME_DRAFT_REPOSITORY,
    useExisting: API_IMPORT_RESUME_REPOSITORY,
  },
];

/**
 * API use cases inject capability tokens instead of TypeORM entities. New
 * import workflows receive transaction-scoped repositories; legacy manual
 * resume use cases still use the transaction runner during their migration.
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
    API_PERSISTENCE_TRANSACTION_RUNNER,
    API_MANUAL_RESUME_DRAFT_REPOSITORY,
  ],
})
export class ApiPersistenceModule {}

// Compile-time documentation of the callback accepted by the transaction token.
export type ApiPersistenceOperation<T> = (manager: EntityManager) => Promise<T>;
export type ApiPersistenceRunner = PersistenceTransactionRunner;
export type ApiManualResumeDraftRepository = ManualResumeDraftRepository;
