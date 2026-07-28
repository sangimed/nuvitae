import { describe, expect, it } from "vitest";

import {
  importResumeJobPayloadSchema,
  importResumeJobSchemaVersion,
} from "./jobs.js";

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";
const uuidC = "33333333-3333-4333-8333-333333333333";

const base = {
  schemaVersion: importResumeJobSchemaVersion,
  importId: uuidA,
  owner: { ownerUserId: uuidB },
  correlationId: uuidC,
  idempotencyKey: "import:11111111",
  requestedAt: "2026-07-28T10:00:00.000Z",
};

describe("import resume job contracts", () => {
  it.each([
    {
      jobType: "document_validation",
      documentFormat: "pdf",
      sourceStorageKey: "users/u/imports/i/source.pdf",
      uploadedAt: "2026-07-28T10:00:00.000Z",
      sizeBytes: 1024,
    },
    {
      jobType: "deterministic_extraction",
      documentFormat: "docx",
      sourceStorageKey: "users/u/imports/i/source.docx",
      validationCompletedAt: "2026-07-28T10:01:00.000Z",
    },
    {
      jobType: "cancellation",
      target: { kind: "import", id: uuidA },
      reason: "user_cancelled",
    },
    {
      jobType: "retry",
      target: { kind: "deterministic_extraction", id: uuidA },
      retry: {
        attemptNumber: 2,
        maxAttempts: 5,
        previousFailureCategory: "processing_timeout",
      },
    },
    {
      jobType: "source_artifact_deletion",
      target: { kind: "source_and_derived_artifacts", id: uuidA },
      reason: "retention_deadline",
      deleteNoLaterThan: "2026-08-04T10:00:00.000Z",
    },
  ])("accepts valid $jobType payloads", (payload) => {
    expect(
      importResumeJobPayloadSchema.safeParse({ ...base, ...payload }).success,
    ).toBe(true);
  });

  it("rejects unknown schema versions and malformed identifiers", () => {
    expect(
      importResumeJobPayloadSchema.safeParse({
        ...base,
        schemaVersion: "2026-01-01",
        jobType: "document_validation",
        documentFormat: "pdf",
        sourceStorageKey: "source.pdf",
        uploadedAt: "2026-07-28T10:00:00.000Z",
        sizeBytes: 1024,
      }).success,
    ).toBe(false);

    expect(
      importResumeJobPayloadSchema.safeParse({
        ...base,
        importId: "not-a-uuid",
        jobType: "cancellation",
        target: { kind: "import", id: uuidA },
        reason: "user_cancelled",
      }).success,
    ).toBe(false);
  });

  it("requires ownership context", () => {
    expect(
      importResumeJobPayloadSchema.safeParse({
        schemaVersion: base.schemaVersion,
        importId: base.importId,
        correlationId: base.correlationId,
        idempotencyKey: base.idempotencyKey,
        requestedAt: base.requestedAt,
        jobType: "cancellation",
        target: { kind: "import", id: uuidA },
        reason: "user_cancelled",
      }).success,
    ).toBe(false);
  });

  it("validates retry attempt metadata", () => {
    expect(
      importResumeJobPayloadSchema.safeParse({
        ...base,
        jobType: "retry",
        target: { kind: "document_validation", id: uuidA },
        retry: { attemptNumber: 6, maxAttempts: 5 },
      }).success,
    ).toBe(false);
  });

  it("rejects raw content fields and oversized upload metadata", () => {
    expect(
      importResumeJobPayloadSchema.safeParse({
        ...base,
        jobType: "document_validation",
        documentFormat: "pdf",
        sourceStorageKey: "source.pdf",
        uploadedAt: "2026-07-28T10:00:00.000Z",
        sizeBytes: 10 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);

    expect(
      importResumeJobPayloadSchema.safeParse({
        ...base,
        jobType: "deterministic_extraction",
        documentFormat: "pdf",
        sourceStorageKey: "source.pdf",
        validationCompletedAt: "2026-07-28T10:01:00.000Z",
        rawText: "full resume content must not be accepted",
      }).success,
    ).toBe(false);
  });
});
