import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  IMPORT_RESUME_JOB_NAMES,
  IMPORT_RESUME_PROCESSING_QUEUE,
  importResumeJobId,
} from "@nuvitae/contracts";
import { Queue } from "bullmq";
import { z } from "zod";
import type { ImportStatusQueueReader } from "../../ports/import-status.js";

const progressSchema = z
  .object({
    step: z.enum([
      "checking_document",
      "reading_content",
      "organizing_resume_sections",
      "preparing_review",
    ]),
    progressKnown: z.boolean(),
    progressPercent: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();

@Injectable()
export class ImportStatusQueue implements ImportStatusQueueReader {
  constructor(
    @InjectQueue(IMPORT_RESUME_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  async readProgress(importId: string) {
    const jobs = await Promise.all([
      this.queue.getJob(importResumeJobId(importId, "extraction")),
      this.queue.getJob(importResumeJobId(importId, "validation")),
    ]);
    for (const job of jobs) {
      if (job === undefined || job === null) continue;
      if (
        job.name !== IMPORT_RESUME_JOB_NAMES.extraction &&
        job.name !== IMPORT_RESUME_JOB_NAMES.validation
      ) {
        continue;
      }
      const parsed = progressSchema.safeParse(job.progress);
      if (!parsed.success) continue;
      return {
        step: parsed.data.step,
        progressKnown: parsed.data.progressKnown,
        ...(parsed.data.progressPercent === undefined
          ? {}
          : { progressPercent: parsed.data.progressPercent }),
        updatedAt: new Date(job.processedOn ?? job.timestamp),
      };
    }
    return null;
  }
}
