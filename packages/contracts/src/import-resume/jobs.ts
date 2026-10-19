import { z } from "zod";
import { utcInstantSchema } from "../instant.js";

export const importResumeJobSchemaVersion = "2026-07-28" as const;

export const IMPORT_RESUME_PROCESSING_QUEUE =
  "resume-import-processing" as const;
export const IMPORT_RESUME_JOB_NAMES = Object.freeze({
  validation: "document_validation",
  extraction: "deterministic_extraction",
  foregroundTimeout: "foreground_timeout",
  sourceDeletion: "source_artifact_deletion",
});

export function importResumeJobId(
  importId: string,
  stage: "validation" | "extraction" | "timeout" | "retention",
): string {
  return `import-${importId}-${stage}-v1`;
}

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/);
const storageKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9/._=-]+$/);
const correlationIdSchema = uuidSchema;
const traceparentSchema = z
  .string()
  .regex(
    /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u,
  )
  .refine(
    (value) =>
      !value.startsWith("00-00000000000000000000000000000000-") &&
      !value.includes("-0000000000000000-"),
    "traceparent trace and span identifiers must not be all zeroes",
  );

/**
 * The queue is allowed to carry only this W3C trace carrier. Baggage and
 * arbitrary vendor state are excluded because job payloads are durable and
 * must not become a route for identities, credentials, or resume content.
 */
export const importTraceContextSchema = z
  .object({ traceparent: traceparentSchema })
  .strict();
export type ImportTraceContext = z.infer<typeof importTraceContextSchema>;

const ownerContextSchema = z
  .object({
    ownerUserId: uuidSchema,
    tenantId: uuidSchema.optional(),
  })
  .strict();

const jobBaseSchema = z
  .object({
    schemaVersion: z.literal(importResumeJobSchemaVersion),
    importId: uuidSchema,
    owner: ownerContextSchema,
    correlationId: correlationIdSchema,
    idempotencyKey: idempotencyKeySchema,
    requestedAt: utcInstantSchema,
  })
  .strict();

const retryAttemptSchema = z
  .object({
    attemptNumber: z.number().int().min(1).max(5),
    maxAttempts: z.number().int().min(1).max(5),
    previousAttemptStartedAt: utcInstantSchema.optional(),
    previousFailureCategory: z
      .enum([
        "malformed_document",
        "corrupted_document",
        "password_protected",
        "image_only_or_scanned",
        "unsupported_language",
        "processing_timeout",
        "parser_memory_limit",
        "resource_limit",
        "unexpected_failure",
      ])
      .optional(),
  })
  .strict()
  .refine((value) => value.attemptNumber <= value.maxAttempts, {
    message: "attemptNumber cannot exceed maxAttempts",
    path: ["attemptNumber"],
  });

export const documentValidationJobPayloadSchema = jobBaseSchema
  .extend({
    jobType: z.literal("document_validation"),
    traceContext: importTraceContextSchema.optional(),
    documentFormat: z.enum(["pdf", "docx"]),
    sourceStorageKey: storageKeySchema,
    uploadedAt: utcInstantSchema,
    foregroundDeadline: utcInstantSchema,
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();

export const deterministicExtractionJobPayloadSchema = jobBaseSchema
  .extend({
    jobType: z.literal("deterministic_extraction"),
    traceContext: importTraceContextSchema.optional(),
    documentFormat: z.enum(["pdf", "docx"]),
    sourceStorageKey: storageKeySchema,
    validationCompletedAt: utcInstantSchema,
    foregroundDeadline: utcInstantSchema,
    abortTokenId: uuidSchema.optional(),
  })
  .strict();

export const foregroundTimeoutJobPayloadSchema = jobBaseSchema
  .extend({
    jobType: z.literal("foreground_timeout"),
    foregroundDeadline: utcInstantSchema,
  })
  .strict();

export const cancellationJobPayloadSchema = jobBaseSchema
  .extend({
    jobType: z.literal("cancellation"),
    target: z
      .object({
        kind: z.enum(["import", "draft", "validation_job", "extraction_job"]),
        id: uuidSchema,
      })
      .strict(),
    reason: z.enum([
      "user_cancelled",
      "replacement_upload",
      "discarded_import",
      "expired",
    ]),
  })
  .strict();

export const retryJobPayloadSchema = jobBaseSchema
  .extend({
    jobType: z.literal("retry"),
    target: z
      .object({
        kind: z.enum(["document_validation", "deterministic_extraction"]),
        id: uuidSchema,
      })
      .strict(),
    retry: retryAttemptSchema,
    cooldownUntil: utcInstantSchema.optional(),
  })
  .strict();

export const sourceArtifactDeletionJobPayloadSchema = jobBaseSchema
  .extend({
    jobType: z.literal("source_artifact_deletion"),
    target: z
      .object({
        kind: z.enum([
          "source_document",
          "derived_artifacts",
          "source_and_derived_artifacts",
        ]),
        id: uuidSchema,
      })
      .strict(),
    reason: z.enum([
      "user_deleted_source",
      "user_cancelled_import",
      "user_discarded_import",
      "draft_expired",
      "retention_deadline",
      "resource_limit_cleanup",
    ]),
    deleteNoLaterThan: utcInstantSchema,
  })
  .strict();

export const importResumeJobPayloadSchema = z.discriminatedUnion("jobType", [
  documentValidationJobPayloadSchema,
  deterministicExtractionJobPayloadSchema,
  foregroundTimeoutJobPayloadSchema,
  cancellationJobPayloadSchema,
  retryJobPayloadSchema,
  sourceArtifactDeletionJobPayloadSchema,
]);

export type DocumentValidationJobPayload = z.infer<
  typeof documentValidationJobPayloadSchema
>;
export type DeterministicExtractionJobPayload = z.infer<
  typeof deterministicExtractionJobPayloadSchema
>;
export type ForegroundTimeoutJobPayload = z.infer<
  typeof foregroundTimeoutJobPayloadSchema
>;
export type CancellationJobPayload = z.infer<
  typeof cancellationJobPayloadSchema
>;
export type RetryJobPayload = z.infer<typeof retryJobPayloadSchema>;
export type SourceArtifactDeletionJobPayload = z.infer<
  typeof sourceArtifactDeletionJobPayloadSchema
>;
export type ImportResumeJobPayload = z.infer<
  typeof importResumeJobPayloadSchema
>;
