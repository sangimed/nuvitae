import { z } from "zod";

export const documentedImportProcessingDefaults = {
  maxUploadSizeBytes: 10 * 1024 * 1024,
  maxRenderedPageCount: 5,
  foregroundTimeoutSeconds: 180,
  parserMemoryLimitMiB: 512,
  maxActiveJobsPerUser: 1,
  maxQueuedJobsPerUser: 2,
  rollingAttemptLimit: 5,
  rollingAttemptWindowSeconds: 10 * 60,
  retryCooldownSeconds: 60,
} as const;

export const documentedImportProcessingHardCeilings = {
  ...documentedImportProcessingDefaults,
} as const;

const positiveIntegerLimit = (defaultValue: number, hardCeiling: number) =>
  z.preprocess((value) => {
    if (value === undefined) {
      return defaultValue;
    }
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return value;
  }, z.number().int().positive().finite().max(hardCeiling));

export const importProcessingLimitsEnvSchema = z
  .object({
    IMPORT_MAX_UPLOAD_SIZE_BYTES: positiveIntegerLimit(
      documentedImportProcessingDefaults.maxUploadSizeBytes,
      documentedImportProcessingHardCeilings.maxUploadSizeBytes,
    ),
    IMPORT_MAX_RENDERED_PAGE_COUNT: positiveIntegerLimit(
      documentedImportProcessingDefaults.maxRenderedPageCount,
      documentedImportProcessingHardCeilings.maxRenderedPageCount,
    ),
    IMPORT_FOREGROUND_TIMEOUT_SECONDS: positiveIntegerLimit(
      documentedImportProcessingDefaults.foregroundTimeoutSeconds,
      documentedImportProcessingHardCeilings.foregroundTimeoutSeconds,
    ),
    IMPORT_PARSER_MEMORY_LIMIT_MIB: positiveIntegerLimit(
      documentedImportProcessingDefaults.parserMemoryLimitMiB,
      documentedImportProcessingHardCeilings.parserMemoryLimitMiB,
    ),
    IMPORT_MAX_ACTIVE_JOBS_PER_USER: positiveIntegerLimit(
      documentedImportProcessingDefaults.maxActiveJobsPerUser,
      documentedImportProcessingHardCeilings.maxActiveJobsPerUser,
    ),
    IMPORT_MAX_QUEUED_JOBS_PER_USER: positiveIntegerLimit(
      documentedImportProcessingDefaults.maxQueuedJobsPerUser,
      documentedImportProcessingHardCeilings.maxQueuedJobsPerUser,
    ),
    IMPORT_ROLLING_ATTEMPT_LIMIT: positiveIntegerLimit(
      documentedImportProcessingDefaults.rollingAttemptLimit,
      documentedImportProcessingHardCeilings.rollingAttemptLimit,
    ),
    IMPORT_ROLLING_ATTEMPT_WINDOW_SECONDS: positiveIntegerLimit(
      documentedImportProcessingDefaults.rollingAttemptWindowSeconds,
      documentedImportProcessingHardCeilings.rollingAttemptWindowSeconds,
    ),
    IMPORT_RETRY_COOLDOWN_SECONDS: positiveIntegerLimit(
      documentedImportProcessingDefaults.retryCooldownSeconds,
      documentedImportProcessingHardCeilings.retryCooldownSeconds,
    ),
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
  }));

export type ImportProcessingLimits = z.infer<
  typeof importProcessingLimitsEnvSchema
>;

export function parseImportProcessingLimitsEnv(
  env: Partial<Record<string, string | undefined>>,
): ImportProcessingLimits {
  return importProcessingLimitsEnvSchema.parse(env);
}

export function redactImportProcessingLimitsForDiagnostics(
  limits: ImportProcessingLimits,
): Record<keyof ImportProcessingLimits, "[configured-limit]"> {
  return {
    maxUploadSizeBytes: redactLimit(limits.maxUploadSizeBytes),
    maxRenderedPageCount: redactLimit(limits.maxRenderedPageCount),
    foregroundTimeoutSeconds: redactLimit(limits.foregroundTimeoutSeconds),
    parserMemoryLimitMiB: redactLimit(limits.parserMemoryLimitMiB),
    maxActiveJobsPerUser: redactLimit(limits.maxActiveJobsPerUser),
    maxQueuedJobsPerUser: redactLimit(limits.maxQueuedJobsPerUser),
    rollingAttemptLimit: redactLimit(limits.rollingAttemptLimit),
    rollingAttemptWindowSeconds: redactLimit(
      limits.rollingAttemptWindowSeconds,
    ),
    retryCooldownSeconds: redactLimit(limits.retryCooldownSeconds),
  };
}

function redactLimit(_value: number): "[configured-limit]" {
  return "[configured-limit]";
}
