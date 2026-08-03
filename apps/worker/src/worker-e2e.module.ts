import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ImportProcessingProcessor } from "./import-resume/import-processing.processor";
import { workerE2EImportRuntimeProviders } from "./import-resume/worker-e2e-import-runtime.providers";
import { WorkerPersistenceModule } from "./persistence/worker-persistence.module";

/**
 * Explicit local/E2E worker module used only for automated/local integration
 * testing. It registers the deterministic semantic-provider test adapter
 * through dependency injection and must never be selected in production.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.QUEUE_HOST ?? "queue",
          port: Number(process.env.QUEUE_PORT ?? "6379"),
          password: process.env.QUEUE_PASSWORD || undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: "resume-import-processing" }),
    WorkerPersistenceModule,
  ],
  providers: [ImportProcessingProcessor, ...workerE2EImportRuntimeProviders],
})
export class WorkerE2EModule {}
