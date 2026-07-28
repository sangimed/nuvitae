import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bootstrapHealthSchema } from "@nuvitae/contracts";

export const workerReadinessPath =
  process.env.WORKER_READY_FILE ?? "/tmp/nuvitae-worker-ready";

export function writeWorkerReadinessFile(path = workerReadinessPath): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      bootstrapHealthSchema.parse({
        service: "worker",
        status: "ok",
      }),
    ),
    "utf8",
  );
}

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.QUEUE_HOST ?? "queue",
        port: Number(process.env.QUEUE_PORT ?? "6379"),
        password: process.env.QUEUE_PASSWORD || undefined,
      },
    }),
  ],
})
export class WorkerModule {}
