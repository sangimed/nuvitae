import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  IMPORT_RESUME_PROCESSING_QUEUE,
  type DeterministicExtractionJobPayload,
  type DocumentValidationJobPayload,
  type ForegroundTimeoutJobPayload,
} from "@nuvitae/contracts";
import { Queue } from "bullmq";
import type { StartImportQueuePublisher } from "../../ports/start-import.js";

@Injectable()
export class StartImportQueue implements StartImportQueuePublisher {
  constructor(
    @InjectQueue(IMPORT_RESUME_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  async addBulk(
    jobs: readonly {
      readonly name: string;
      readonly jobId: string;
      readonly data:
        | DocumentValidationJobPayload
        | DeterministicExtractionJobPayload
        | ForegroundTimeoutJobPayload;
      readonly delay?: number;
    }[],
  ): Promise<void> {
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: job.name,
        data: job.data,
        opts: {
          jobId: job.jobId,
          ...(job.delay === undefined ? {} : { delay: job.delay }),
          attempts: 3,
          backoff: { type: "exponential", delay: 500 },
          removeOnComplete: { age: 300, count: 100 },
          removeOnFail: { age: 900, count: 100 },
        },
      })),
    );
  }
}
