import { z } from "zod";
import type { ImportProcessingLimits } from "@nuvitae/import-application";

const positiveInteger = (defaultValue: number) =>
  z.preprocess(
    (value) => (value === undefined ? defaultValue : Number(value)),
    z.number().int().positive().finite(),
  );

export function parseWorkerImportProcessingLimits(
  env: NodeJS.ProcessEnv = process.env,
): ImportProcessingLimits {
  return z
    .object({
      IMPORT_MAX_UPLOAD_SIZE_BYTES: positiveInteger(10 * 1024 * 1024),
      IMPORT_MAX_RENDERED_PAGE_COUNT: positiveInteger(5),
      IMPORT_FOREGROUND_TIMEOUT_SECONDS: positiveInteger(180),
      IMPORT_PARSER_MEMORY_LIMIT_MIB: positiveInteger(512),
      IMPORT_MAX_ACTIVE_JOBS_PER_USER: positiveInteger(1),
      IMPORT_MAX_QUEUED_JOBS_PER_USER: positiveInteger(2),
      IMPORT_ROLLING_ATTEMPT_LIMIT: positiveInteger(5),
      IMPORT_ROLLING_ATTEMPT_WINDOW_SECONDS: positiveInteger(10 * 60),
      IMPORT_RETRY_COOLDOWN_SECONDS: positiveInteger(60),
    })
    .transform((value) => ({
      maxUploadSizeBytes: value.IMPORT_MAX_UPLOAD_SIZE_BYTES,
      maxRenderedPageCount: value.IMPORT_MAX_RENDERED_PAGE_COUNT,
      foregroundTimeoutSeconds: value.IMPORT_FOREGROUND_TIMEOUT_SECONDS,
      parserMemoryLimitMiB: value.IMPORT_PARSER_MEMORY_LIMIT_MIB,
      maxActiveJobsPerUser: value.IMPORT_MAX_ACTIVE_JOBS_PER_USER,
      maxQueuedJobsPerUser: value.IMPORT_MAX_QUEUED_JOBS_PER_USER,
      rollingAttemptLimit: value.IMPORT_ROLLING_ATTEMPT_LIMIT,
      rollingAttemptWindowSeconds: value.IMPORT_ROLLING_ATTEMPT_WINDOW_SECONDS,
      retryCooldownSeconds: value.IMPORT_RETRY_COOLDOWN_SECONDS,
    }))
    .parse(env);
}
