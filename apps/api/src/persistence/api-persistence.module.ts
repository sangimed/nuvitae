import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TypeOrmImportResumeRepository,
  createTypeOrmModuleOptions,
  readPersistenceConfigFromEnv,
  type ImportResumeRepository,
  type PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { DataSource, type EntityManager } from "typeorm";

export const API_IMPORT_RESUME_REPOSITORY = Symbol(
  "API_IMPORT_RESUME_REPOSITORY",
);
export const API_PERSISTENCE_TRANSACTION_RUNNER = Symbol(
  "API_PERSISTENCE_TRANSACTION_RUNNER",
);

/**
 * The runtime factory is the API's only PostgreSQL environment boundary.
 * Shared persistence owns validation, entities, migrations, and TypeORM flags.
 */
export function createApiTypeOrmModuleOptions(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createTypeOrmModuleOptions(readPersistenceConfigFromEnv(env));
}

export const apiPersistenceRepositoryProviders: Provider[] = [
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
];

/**
 * Future API use cases inject these tokens instead of TypeORM entities.
 * Both tokens resolve to one repository backed by Nest's managed DataSource.
 * Transactional use cases pass the supplied EntityManager to repository calls.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createApiTypeOrmModuleOptions,
    }),
  ],
  providers: apiPersistenceRepositoryProviders,
  exports: [API_IMPORT_RESUME_REPOSITORY, API_PERSISTENCE_TRANSACTION_RUNNER],
})
export class ApiPersistenceModule {}

// Compile-time documentation of the callback accepted by the transaction token.
export type ApiPersistenceOperation<T> = (manager: EntityManager) => Promise<T>;
export type ApiPersistenceRunner = PersistenceTransactionRunner;
