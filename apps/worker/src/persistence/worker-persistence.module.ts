import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TypeOrmImportWorkflowRepository,
  createTypeOrmModuleOptions,
  readPersistenceConfigFromEnv,
} from "@nuvitae/persistence";
import { DataSource } from "typeorm";
export const WORKER_IMPORT_WORKFLOW_REPOSITORY = Symbol(
  "WORKER_IMPORT_WORKFLOW_REPOSITORY",
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
    provide: WORKER_IMPORT_WORKFLOW_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmImportWorkflowRepository(dataSource),
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
  exports: [WORKER_IMPORT_WORKFLOW_REPOSITORY],
})
export class WorkerPersistenceModule {}
