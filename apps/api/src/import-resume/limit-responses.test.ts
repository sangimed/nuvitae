import { describe, expect, it } from "vitest";
import {
  mapLimitOutcomeToHttpResponse,
  LimitHttpError,
} from "./limit-responses.js";
import type {
  DeniedImportLimitOutcome,
  ImportLimitOutcome,
} from "../services/import-resume/import-limits.js";

describe("mapLimitOutcomeToHttpResponse", () => {
  it("maps upload_attempt_limit to 429 with Retry-After", () => {
    const outcome: ImportLimitOutcome = {
      kind: "denied",
      code: "upload_attempt_limit",
      messageCategory: "upload_attempts",
      retryable: true,
      retryAfterSeconds: 120,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.statusCode).toBe(429);
    expect(result.code).toBe("rate_limited");
    expect(result.retryAfterSeconds).toBe(120);
    expect(typeof result.message).toBe("string");
  });

  it("maps active_job_limit to 429 without Retry-After", () => {
    const outcome: ImportLimitOutcome = {
      kind: "denied",
      code: "active_job_limit",
      messageCategory: "active_jobs",
      retryable: true,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.statusCode).toBe(429);
    expect(result.code).toBe("active_job_limit_reached");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(typeof result.message).toBe("string");
  });

  it("maps queued_job_limit to 429 without Retry-After", () => {
    const outcome: ImportLimitOutcome = {
      kind: "denied",
      code: "queued_job_limit",
      messageCategory: "queued_jobs",
      retryable: true,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.statusCode).toBe(429);
    expect(result.code).toBe("queued_job_limit_reached");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(typeof result.message).toBe("string");
  });

  it("maps processing_start_limit to 429 without Retry-After", () => {
    const outcome: ImportLimitOutcome = {
      kind: "denied",
      code: "processing_start_limit",
      messageCategory: "processing_start",
      retryable: true,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.statusCode).toBe(429);
    expect(result.code).toBe("processing_start_denied");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(typeof result.message).toBe("string");
  });

  it("maps limit_service_unavailable to 503 without Retry-After", () => {
    const outcome: ImportLimitOutcome = {
      kind: "denied",
      code: "limit_service_unavailable",
      messageCategory: "limit_service",
      retryable: true,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.statusCode).toBe(503);
    expect(result.code).toBe("import_limit_unavailable");
    expect(result.retryAfterSeconds).toBeUndefined();
    expect(typeof result.message).toBe("string");
  });

  it("maps allowed outcome to 200 accepted", () => {
    const outcome: ImportLimitOutcome = { kind: "allowed" };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.statusCode).toBe(200);
    expect(result.code).toBe("accepted");
    expect(result.retryAfterSeconds).toBeUndefined();
  });

  it("does not expose internal state, IDs, or counts in messages", () => {
    const outcome: DeniedImportLimitOutcome = {
      kind: "denied",
      code: "upload_attempt_limit",
      messageCategory: "upload_attempts",
      retryable: true,
      retryAfterSeconds: 60,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.message).not.toContain("5");
    expect(result.message).not.toContain("count");
    expect(result.message).not.toContain("reserved");
    expect(result.message).not.toContain("queued");
    expect(result.message).not.toContain("active");
    expect(result.message).not.toContain("advisory");
    expect(result.message).not.toContain("lock");
    expect(result.message).not.toContain("SQL");
    expect(result.message).not.toContain("worker");
    expect(result.message).not.toContain("queue");
  });

  it("does not expose timestamps or durations in messages", () => {
    const outcome: DeniedImportLimitOutcome = {
      kind: "denied",
      code: "active_job_limit",
      messageCategory: "active_jobs",
      retryable: true,
    };
    const result = mapLimitOutcomeToHttpResponse(outcome);
    expect(result.message).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(result.message).not.toMatch(/T\d{2}:\d{2}/);
    expect(result.message).not.toMatch(/\d+\s*(seconds?|minutes?|hours?)/i);
  });
});

describe("LimitHttpError", () => {
  it("creates an error with the response details", () => {
    const error = new LimitHttpError({
      statusCode: 429,
      code: "rate_limited",
      message: "Too many uploads.",
      retryAfterSeconds: 60,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.response.statusCode).toBe(429);
    expect(error.response.code).toBe("rate_limited");
    expect(error.response.message).toBe("Too many uploads.");
    expect(error.response.retryAfterSeconds).toBe(60);
  });
});
