import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { WorkerPersistenceModule } from "./persistence/worker-persistence.module";
import { ImportProcessingProcessor } from "./import-resume/import-processing.processor";

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
  providers: [ImportProcessingProcessor],
})
export class WorkerModule {}
