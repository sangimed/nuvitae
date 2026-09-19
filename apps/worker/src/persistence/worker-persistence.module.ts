import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TypeOrmImportWorkflowRepository,
  TypeOrmSourceDeletionRepository,
  createTypeOrmModuleOptions,
  readPersistenceConfigFromEnv,
} from "@nuvitae/persistence/typeorm";
import { DataSource } from "typeorm";
export const WORKER_IMPORT_WORKFLOW_REPOSITORY = Symbol(
  "WORKER_IMPORT_WORKFLOW_REPOSITORY",
);
export const WORKER_SOURCE_DELETION_REPOSITORY = Symbol(
  "WORKER_SOURCE_DELETION_REPOSITORY",
);
export const WORKER_PERSISTENCE_DATA_SOURCE = Symbol(
  "WORKER_PERSISTENCE_DATA_SOURCE",
);

/**
 * The runtime factory is the worker's only PostgreSQL environment boundary.
 * It delegates validation and the complete option shape to shared persistence.
 */
export function createWorkerTypeOrmModuleOptions(
  env: NodeJS.ProcessEnv = process.env,
) {
  return createTypeOrmModuleOptions(readPersistenceConfigFromEnv(env));
}

export const workerPersistenceRepositoryProviders: Provider[] = [
  {
    provide: WORKER_PERSISTENCE_DATA_SOURCE,
    useExisting: DataSource,
  },
  {
    provide: WORKER_IMPORT_WORKFLOW_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmImportWorkflowRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: WORKER_SOURCE_DELETION_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmSourceDeletionRepository(dataSource),
    inject: [DataSource],
  },
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createWorkerTypeOrmModuleOptions,
    }),
  ],
  providers: workerPersistenceRepositoryProviders,
  exports: [
    WORKER_IMPORT_WORKFLOW_REPOSITORY,
    WORKER_SOURCE_DELETION_REPOSITORY,
    WORKER_PERSISTENCE_DATA_SOURCE,
  ],
})
export class WorkerPersistenceModule {}
