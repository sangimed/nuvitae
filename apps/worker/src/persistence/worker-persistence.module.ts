import { Module, type Provider } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  TypeOrmImportResumeRepository,
  TypeOrmImportWorkflowRepository,
  createTypeOrmModuleOptions,
  readPersistenceConfigFromEnv,
  type ImportResumeRepository,
  type PersistenceTransactionRunner,
} from "@nuvitae/persistence";
import { DataSource, type EntityManager } from "typeorm";

export const WORKER_IMPORT_RESUME_REPOSITORY = Symbol(
  "WORKER_IMPORT_RESUME_REPOSITORY",
);
export const WORKER_PERSISTENCE_TRANSACTION_RUNNER = Symbol(
  "WORKER_PERSISTENCE_TRANSACTION_RUNNER",
);
export const WORKER_IMPORT_WORKFLOW_REPOSITORY = Symbol(
  "WORKER_IMPORT_WORKFLOW_REPOSITORY",
);
export const WORKER_PERSISTENCE_EXECUTION = Symbol(
  "WORKER_PERSISTENCE_EXECUTION",
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

/**
 * Future BullMQ processors call execute and return its promise. TypeORM resolves
 * that promise only after commit; a thrown persistence error triggers rollback
 * and remains rejected so BullMQ cannot acknowledge the job as successful.
 */
export class WorkerPersistenceExecution {
  constructor(
    private readonly transactionRunner: PersistenceTransactionRunner,
  ) {}

  execute<T>(operation: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.transactionRunner.transaction(operation);
  }
}

export const workerPersistenceRepositoryProviders: Provider[] = [
  {
    provide: WORKER_IMPORT_WORKFLOW_REPOSITORY,
    useFactory: (dataSource: DataSource) =>
      new TypeOrmImportWorkflowRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: WORKER_IMPORT_RESUME_REPOSITORY,
    useFactory: (dataSource: DataSource): ImportResumeRepository =>
      new TypeOrmImportResumeRepository(dataSource),
    inject: [DataSource],
  },
  {
    provide: WORKER_PERSISTENCE_TRANSACTION_RUNNER,
    useExisting: WORKER_IMPORT_RESUME_REPOSITORY,
  },
  {
    provide: WORKER_PERSISTENCE_EXECUTION,
    useFactory: (
      transactionRunner: PersistenceTransactionRunner,
    ): WorkerPersistenceExecution =>
      new WorkerPersistenceExecution(transactionRunner),
    inject: [WORKER_PERSISTENCE_TRANSACTION_RUNNER],
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
    WORKER_IMPORT_RESUME_REPOSITORY,
    WORKER_PERSISTENCE_TRANSACTION_RUNNER,
    WORKER_PERSISTENCE_EXECUTION,
  ],
})
export class WorkerPersistenceModule {}
