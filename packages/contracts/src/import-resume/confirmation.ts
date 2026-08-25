import { z } from "zod";
import {
  effectiveResumeContentSchema,
  extractedValueSchema,
} from "./review.js";
import { importResumeResponseSchemaVersion } from "./responses.js";

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime();
const plainMessageSchema = z.string().min(1).max(500);

const responseBaseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
  })
  .strict();

export const confirmStructuredResumeRequestSchema = z
  .object({
    operationId: uuidSchema,
    expectedReviewRevision: z.number().int().nonnegative(),
    explicitConfirmation: z.literal(true),
  })
  .strict();

export const confirmStructuredResumeResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("structured_resume_confirmed"),
    importId: uuidSchema,
    draftId: uuidSchema,
    structuredResumeId: uuidSchema,
    confirmationStatus: z.literal("confirmed"),
    provenanceLabel: z.literal("imported_from_initial_resume"),
    confirmedAt: isoDateSchema,
    sourceRetentionExpiresAt: isoDateSchema,
    resumeUrl: z.string().regex(/^\/resumes\/[0-9a-f-]+$/i),
    userMessage: plainMessageSchema,
  })
  .strict();

export const confirmStructuredResumeErrorResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("structured_resume_confirmation_error"),
    importId: uuidSchema.optional(),
    draftId: uuidSchema.optional(),
    code: z.enum([
      "authentication_required",
      "not_found",
      "draft_not_ready",
      "unresolved_warnings",
      "no_user_confirmed_field",
      "reviewed_content_not_mappable",
      "stale_review",
      "expired",
      "lifecycle_not_confirmable",
      "concurrent_confirmation",
      "temporarily_unavailable",
      "validation_failed",
    ]),
    userMessage: plainMessageSchema,
    blockerCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export const discardImportRequestSchema = z
  .object({
    operationId: uuidSchema,
    expectedReviewRevision: z.number().int().nonnegative(),
    explicitDiscard: z.literal(true),
  })
  .strict();

export const discardImportResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("import_discarded"),
    importId: uuidSchema,
    draftId: uuidSchema,
    discardedAt: isoDateSchema,
    deletionJobId: uuidSchema,
    deletionState: z.literal("scheduled"),
    userMessage: plainMessageSchema,
    recoveryActions: z.array(z.enum(["new_import", "manual_entry"])).min(1),
  })
  .strict();

export const discardImportErrorResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("import_discard_error"),
    importId: uuidSchema.optional(),
    draftId: uuidSchema.optional(),
    code: z.enum([
      "authentication_required",
      "not_found",
      "stale_review",
      "expired",
      "lifecycle_not_discardable",
      "temporarily_unavailable",
      "validation_failed",
    ]),
    userMessage: plainMessageSchema,
  })
  .strict();

export const confirmedResumeSourceAvailabilitySchema = z.enum([
  "source_available_until_retention_deadline",
  "source_no_longer_available",
  "source_availability_unknown",
]);

export const confirmedResumeContentSchema = effectiveResumeContentSchema;

export const confirmedStructuredResumeReadResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("confirmed_structured_resume"),
    structuredResumeId: uuidSchema,
    confirmationStatus: z.literal("confirmed"),
    provenanceLabel: z.literal("imported_from_initial_resume"),
    content: confirmedResumeContentSchema,
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    sourceAvailability: confirmedResumeSourceAvailabilitySchema,
    sourceRetentionExpiresAt: isoDateSchema.optional(),
    userMessage: plainMessageSchema,
  })
  .strict();

export type ConfirmStructuredResumeRequest = z.infer<
  typeof confirmStructuredResumeRequestSchema
>;
export type ConfirmStructuredResumeResponse = z.infer<
  typeof confirmStructuredResumeResponseSchema
>;
export type ConfirmStructuredResumeErrorResponse = z.infer<
  typeof confirmStructuredResumeErrorResponseSchema
>;
export type DiscardImportRequest = z.infer<typeof discardImportRequestSchema>;
export type DiscardImportResponse = z.infer<typeof discardImportResponseSchema>;
export type ConfirmedStructuredResumeReadResponse = z.infer<
  typeof confirmedStructuredResumeReadResponseSchema
>;

void extractedValueSchema;
