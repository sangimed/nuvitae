import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import {
  removeWorkerReadinessFile,
  workerReadinessPath,
  writeWorkerReadinessFile,
} from "../readiness/worker-readiness";
import { WorkerModule } from "../worker.module";

export interface WorkerRuntime {
  shutdown(): Promise<void>;
}

interface WorkerRuntimeDependencies {
  readonly readinessPath?: string;
  readonly createApplication?: () => Promise<INestApplicationContext>;
}

async function createWorkerApplication(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(WorkerModule, {
    // Bootstrap failures are reported once by main without raw driver details.
    logger: false,
  });
}

export async function startWorkerRuntime(
  dependencies: WorkerRuntimeDependencies = {},
): Promise<WorkerRuntime> {
  const readinessPath = dependencies.readinessPath ?? workerReadinessPath();
  const createApplication =
    dependencies.createApplication ?? createWorkerApplication;
  let application: INestApplicationContext | undefined;

  removeWorkerReadinessFile(readinessPath);

  try {
    application = await createApplication();
    const dataSource = application.get(DataSource);
    if (!dataSource.isInitialized) throw new Error("not_initialized");
    await dataSource.query("SELECT 1");
    writeWorkerReadinessFile(readinessPath);

    let shutdownPromise: Promise<void> | undefined;
    return {
      shutdown(): Promise<void> {
        shutdownPromise ??= (async () => {
          removeWorkerReadinessFile(readinessPath);
          await application?.close();
        })();
        return shutdownPromise;
      },
    };
  } catch {
    removeWorkerReadinessFile(readinessPath);
    if (application !== undefined) {
      try {
        await application.close();
      } catch {
        // The generic bootstrap failure remains the only surfaced diagnostic.
      }
    }
    throw new Error("worker_bootstrap_failed");
  }
}
