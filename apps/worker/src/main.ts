import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  WorkerModule,
  removeWorkerReadinessFile,
  writeWorkerReadinessFile,
} from "./worker.module";

async function bootstrap() {
  removeWorkerReadinessFile();

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["log", "error", "warn"],
  });

  app.enableShutdownHooks();
  writeWorkerReadinessFile();

  await new Promise<void>((resolve) => {
    const keepAlive = setInterval(() => {
      // Standalone workers do not expose HTTP; keep the process alive for queues.
    }, 60_000);

    const shutdown = async () => {
      clearInterval(keepAlive);
      removeWorkerReadinessFile();
      await app.close();
      resolve();
    };

    process.once("SIGTERM", () => {
      void shutdown();
    });
    process.once("SIGINT", () => {
      void shutdown();
    });
  });
}

void bootstrap();
