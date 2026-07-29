import { z } from "zod";

export const importResumeResponseSchemaVersion = "2026-07-28" as const;

const uuidSchema = z.string().uuid();
const plainMessageSchema = z.string().min(1).max(400);
const responseBaseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
  })
  .strict();

const recoveryActionSchema = z.enum([
  "retry",
  "replace_upload",
  "delete_source",
  "discard_import",
  "manual_entry",
  "reupload",
  "wait",
  "confirm_contact_transfer",
  "cancel",
]);

const errorCategorySchema = z.enum([
  "authentication_required",
  "rate_limited",
  "unsupported_format",
  "unsupported_language",
  "oversized_file",
  "over_page_limit",
  "no_selectable_text",
  "password_protected",
  "malformed_or_corrupted",
  "unsafe_content",
  "mixed_content",
  "no_supported_field",
  "processing_timeout",
  "parser_memory_limit",
  "cancelled",
  "expired",
  "terminal_failure",
]);

const publicFailureSchema = z
  .object({
    code: errorCategorySchema,
    userMessage: plainMessageSchema,
    retryable: z.boolean(),
    recoveryActions: z.array(recoveryActionSchema).min(1),
    retryAfterSeconds: z.number().int().positive().optional(),
  })
  .strict();

const progressStepSchema = z.enum([
  "checking_document",
  "reading_content",
  "organizing_resume_sections",
  "preparing_review",
]);

const draftSummarySchema = z
  .object({
    draftId: uuidSchema,
    retentionExpiresAt: z.string().datetime(),
    fieldCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
  })
  .strict();

export const importInitializationResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("import_initialization"),
    importId: uuidSchema,
    uploadStatus: z.literal("uploaded"),
    retentionExpiresAt: z.string().datetime(),
    manualEntryUrl: z.literal("/resumes/new/manual"),
    userMessage: plainMessageSchema,
  })
  .strict();

export const validationResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("validation"),
    importId: uuidSchema,
    accepted: z.boolean(),
    renderedPageCount: z.number().int().positive().optional(),
    detectedLanguage: z
      .enum([
        "english",
        "french",
        "bilingual_french_english",
        "unsupported",
        "unknown",
      ])
      .optional(),
    failure: publicFailureSchema.optional(),
  })
  .strict();

export const queuedProcessingResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("queued_processing"),
    importId: uuidSchema,
    userMessage: plainMessageSchema,
    recoveryActions: z.array(recoveryActionSchema).min(1),
  })
  .strict();

export const processingProgressResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("processing_progress"),
    importId: uuidSchema,
    step: progressStepSchema,
    progressKnown: z.boolean(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    userMessage: plainMessageSchema,
  })
  .strict()
  .refine(
    (value) => value.progressKnown || value.progressPercent === undefined,
    {
      message:
        "progressPercent is omitted when precise progress is unavailable",
      path: ["progressPercent"],
    },
  );

export const publicImportStatusResponseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
    importId: uuidSchema,
    status: z.enum([
      "processing",
      "draft_ready",
      "partial_extraction",
      "recoverable_timeout",
      "validation_failure",
      "terminal_processing_failure",
      "authentication_required",
      "connectivity_lost",
      "not_found",
      "expired",
      "cancelled",
    ]),
    currentStep: progressStepSchema.optional(),
    progressKnown: z.boolean(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    draftSummary: draftSummarySchema.optional(),
    failure: publicFailureSchema.optional(),
    allowedRecoveryActions: z.array(recoveryActionSchema),
    userMessage: plainMessageSchema,
  })
  .strict()
  .refine(
    (value) => value.status !== "processing" || value.currentStep !== undefined,
    {
      message: "currentStep is required while processing",
      path: ["currentStep"],
    },
  )
  .refine(
    (value) => value.progressKnown || value.progressPercent === undefined,
    {
      message:
        "progressPercent is omitted when precise progress is unavailable",
      path: ["progressPercent"],
    },
  )
  .refine(
    (value) =>
      value.progressPercent === undefined || value.progressKnown === true,
    {
      message: "progressKnown must be true when progressPercent is present",
      path: ["progressKnown"],
    },
  );

export const recoverableTimeoutResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("recoverable_timeout"),
    importId: uuidSchema,
    partialDraft: draftSummarySchema.optional(),
    failure: publicFailureSchema,
  })
  .strict();

export const partialExtractionResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("partial_extraction"),
    importId: uuidSchema,
    draft: draftSummarySchema,
    missingOrUnprocessedSections: z.array(z.string().min(1)).min(1),
    recoveryActions: z.array(recoveryActionSchema).min(1),
    userMessage: plainMessageSchema,
  })
  .strict();

export const draftReadyResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("draft_ready"),
    importId: uuidSchema,
    draft: draftSummarySchema,
    userMessage: plainMessageSchema,
  })
  .strict();

export const unsupportedLanguageContactPreviewResponseSchema =
  responseBaseSchema
    .extend({
      status: z.literal("unsupported_language_contact_preview"),
      importId: uuidSchema,
      previewId: uuidSchema,
      contactFieldCount: z.number().int().positive(),
      warning: publicFailureSchema,
    })
    .strict();

export const cancellationResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("cancellation"),
    importId: uuidSchema,
    deletionJobId: uuidSchema,
    userMessage: plainMessageSchema,
    recoveryActions: z.array(recoveryActionSchema).min(1),
  })
  .strict();

export const retryResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("retry"),
    importId: uuidSchema,
    attemptNumber: z.number().int().min(1).max(5),
    userMessage: plainMessageSchema,
  })
  .strict();

export const sourceDeletionResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("source_deletion"),
    importId: uuidSchema,
    deletionState: z.enum(["scheduled", "running", "deleted", "failed"]),
    verificationStatus: z.enum([
      "not_started",
      "verified",
      "partially_failed",
      "failed",
    ]),
    userMessage: plainMessageSchema,
  })
  .strict();

export const importExpiryResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("import_expiry"),
    importId: uuidSchema,
    expiredAt: z.string().datetime(),
    failure: publicFailureSchema,
  })
  .strict();

export const terminalFailureResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("terminal_failure"),
    importId: uuidSchema,
    failure: publicFailureSchema,
  })
  .strict();

export const importResumeResponseSchema = z.discriminatedUnion("status", [
  importInitializationResponseSchema,
  validationResponseSchema,
  queuedProcessingResponseSchema,
  processingProgressResponseSchema,
  recoverableTimeoutResponseSchema,
  partialExtractionResponseSchema,
  draftReadyResponseSchema,
  unsupportedLanguageContactPreviewResponseSchema,
  cancellationResponseSchema,
  retryResponseSchema,
  sourceDeletionResponseSchema,
  importExpiryResponseSchema,
  terminalFailureResponseSchema,
]);

export type ImportInitializationResponse = z.infer<
  typeof importInitializationResponseSchema
>;
export type ValidationResponse = z.infer<typeof validationResponseSchema>;
export type QueuedProcessingResponse = z.infer<
  typeof queuedProcessingResponseSchema
>;
export type ProcessingProgressResponse = z.infer<
  typeof processingProgressResponseSchema
>;
export type PublicImportStatusResponse = z.infer<
  typeof publicImportStatusResponseSchema
>;
export type RecoverableTimeoutResponse = z.infer<
  typeof recoverableTimeoutResponseSchema
>;
export type PartialExtractionResponse = z.infer<
  typeof partialExtractionResponseSchema
>;
export type DraftReadyResponse = z.infer<typeof draftReadyResponseSchema>;
export type UnsupportedLanguageContactPreviewResponse = z.infer<
  typeof unsupportedLanguageContactPreviewResponseSchema
>;
export type CancellationResponse = z.infer<typeof cancellationResponseSchema>;
export type RetryResponse = z.infer<typeof retryResponseSchema>;
export type SourceDeletionResponse = z.infer<
  typeof sourceDeletionResponseSchema
>;
export type ImportExpiryResponse = z.infer<typeof importExpiryResponseSchema>;
export type TerminalFailureResponse = z.infer<
  typeof terminalFailureResponseSchema
>;
export type ImportResumeResponse = z.infer<typeof importResumeResponseSchema>;
