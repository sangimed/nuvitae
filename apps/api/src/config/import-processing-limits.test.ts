import { describe, expect, it } from "vitest";

import {
  documentedImportProcessingDefaults,
  parseImportProcessingLimitsEnv,
  redactImportProcessingLimitsForDiagnostics,
} from "./import-processing-limits.js";

describe("import processing limit configuration", () => {
  it("uses production-safe documented defaults through explicit parsing", () => {
    expect(parseImportProcessingLimitsEnv({})).toEqual(
      documentedImportProcessingDefaults,
    );
  });

  it("accepts tighter limits", () => {
    expect(
      parseImportProcessingLimitsEnv({
        IMPORT_MAX_UPLOAD_SIZE_BYTES: "1048576",
        IMPORT_MAX_RENDERED_PAGE_COUNT: "3",
        IMPORT_FOREGROUND_TIMEOUT_SECONDS: "120",
        IMPORT_PARSER_MEMORY_LIMIT_MIB: "256",
        IMPORT_MAX_ACTIVE_JOBS_PER_USER: "1",
        IMPORT_MAX_QUEUED_JOBS_PER_USER: "1",
        IMPORT_ROLLING_ATTEMPT_LIMIT: "3",
        IMPORT_ROLLING_ATTEMPT_WINDOW_SECONDS: "300",
        IMPORT_RETRY_COOLDOWN_SECONDS: "30",
      }),
    ).toEqual({
      maxUploadSizeBytes: 1048576,
      maxRenderedPageCount: 3,
      foregroundTimeoutSeconds: 120,
      parserMemoryLimitMiB: 256,
      maxActiveJobsPerUser: 1,
      maxQueuedJobsPerUser: 1,
      rollingAttemptLimit: 3,
      rollingAttemptWindowSeconds: 300,
      retryCooldownSeconds: 30,
    });
  });

  it("rejects zero, negative, malformed, NaN, and infinite values", () => {
    expect(() =>
      parseImportProcessingLimitsEnv({ IMPORT_MAX_UPLOAD_SIZE_BYTES: "0" }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({ IMPORT_MAX_RENDERED_PAGE_COUNT: "-1" }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({
        IMPORT_FOREGROUND_TIMEOUT_SECONDS: "abc",
      }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({ IMPORT_PARSER_MEMORY_LIMIT_MIB: "NaN" }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({
        IMPORT_ROLLING_ATTEMPT_WINDOW_SECONDS: "Infinity",
      }),
    ).toThrow();
  });

  it("rejects attempts to disable safety limits", () => {
    expect(() =>
      parseImportProcessingLimitsEnv({ IMPORT_MAX_ACTIVE_JOBS_PER_USER: "0" }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({ IMPORT_MAX_QUEUED_JOBS_PER_USER: "0" }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({ IMPORT_ROLLING_ATTEMPT_LIMIT: "0" }),
    ).toThrow();
  });

  it("rejects values above hard safety ceilings", () => {
    expect(() =>
      parseImportProcessingLimitsEnv({
        IMPORT_MAX_UPLOAD_SIZE_BYTES: String(
          documentedImportProcessingDefaults.maxUploadSizeBytes + 1,
        ),
      }),
    ).toThrow();
    expect(() =>
      parseImportProcessingLimitsEnv({
        IMPORT_PARSER_MEMORY_LIMIT_MIB: String(
          documentedImportProcessingDefaults.parserMemoryLimitMiB + 1,
        ),
      }),
    ).toThrow();
  });

  it("does not weaken defaults for production", () => {
    expect(
      parseImportProcessingLimitsEnv({ NODE_ENV: "production" } as never),
    ).toEqual(documentedImportProcessingDefaults);
  });

  it("redacts diagnostic representation consistently", () => {
    expect(
      redactImportProcessingLimitsForDiagnostics(
        documentedImportProcessingDefaults,
      ),
    ).toEqual({
      maxUploadSizeBytes: "[configured-limit]",
      maxRenderedPageCount: "[configured-limit]",
      foregroundTimeoutSeconds: "[configured-limit]",
      parserMemoryLimitMiB: "[configured-limit]",
      maxActiveJobsPerUser: "[configured-limit]",
      maxQueuedJobsPerUser: "[configured-limit]",
      rollingAttemptLimit: "[configured-limit]",
      rollingAttemptWindowSeconds: "[configured-limit]",
      retryCooldownSeconds: "[configured-limit]",
    });
  });
});
