export interface ImportProcessingLimits {
  readonly maxUploadSizeBytes: number;
  readonly maxRenderedPageCount: number;
  readonly foregroundTimeoutSeconds: number;
  readonly parserMemoryLimitMiB: number;
  readonly maxActiveJobsPerUser: number;
  readonly maxQueuedJobsPerUser: number;
  readonly rollingAttemptLimit: number;
  readonly rollingAttemptWindowSeconds: number;
  readonly retryCooldownSeconds: number;
}
