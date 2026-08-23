import { z } from "zod";
import { importResumeResponseSchemaVersion } from "./responses.js";
import { resumeDateSchema } from "./resume-date.js";

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime();
const plainMessageSchema = z.string().min(1).max(500);
const fieldPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-zA-Z0-9_-]+)*$/);

export const reviewSectionSchema = z.enum([
  "personal",
  "contact",
  "headline",
  "summary",
  "work_experience",
  "education",
  "skills",
  "languages",
  "projects",
  "certifications",
  "professional_links",
]);

export const reviewActionSchema = z.enum([
  "confirm",
  "edit",
  "remove",
  "add",
  "complete",
  "exclude",
  "intentionally_leave",
]);

export const reviewResumeDateSchema = resumeDateSchema;

export const extractedValueSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("text"), value: z.string().min(1).max(4_000) })
    .strict(),
  z
    .object({
      kind: z.literal("text_list"),
      values: z.array(z.string().min(1).max(400)).max(80),
    })
    .strict(),
  z.object({ kind: z.literal("date"), value: reviewResumeDateSchema }).strict(),
  z
    .object({
      kind: z.literal("date_range"),
      startDate: reviewResumeDateSchema.optional(),
      endDate: reviewResumeDateSchema.optional(),
      isOngoing: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("link"),
      label: z.string().min(1).max(120).optional(),
      url: z.string().url().max(2_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("language"),
      name: z.string().min(1).max(120),
      proficiency: z.string().min(1).max(120).optional(),
    })
    .strict(),
]);

export const safeProvenanceSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("pdf"), pageNumber: z.number().int().positive() })
    .strict(),
  z
    .object({
      kind: z.literal("docx"),
      documentPart: z.enum([
        "body",
        "header",
        "footer",
        "table",
        "footnote",
        "endnote",
        "other",
      ]),
      paragraphNumber: z.number().int().positive().optional(),
      tableNumber: z.number().int().positive().optional(),
      rowNumber: z.number().int().positive().optional(),
      cellNumber: z.number().int().positive().optional(),
    })
    .strict(),
  z.object({ kind: z.literal("user_added") }).strict(),
  z
    .object({
      kind: z.literal("user_edited"),
      original: z.lazy(() => safeOriginalProvenanceSchema).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("inferred"),
      needsConfirmation: z.boolean(),
      original: z.lazy(() => safeOriginalProvenanceSchema).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("minimal"),
      label: z.literal("imported_from_initial_resume"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic"),
      evidence: z
        .array(
          z
            .object({
              fragmentId: z.string().min(1).max(120),
              fragmentHash: z.string().regex(/^[a-f0-9]{64}$/u),
              line: z.number().int().positive(),
              start: z.number().int().nonnegative(),
              end: z.number().int().positive(),
            })
            .strict(),
        )
        .min(1)
        .max(8),
    })
    .strict(),
]);

const safeOriginalProvenanceSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("pdf"), pageNumber: z.number().int().positive() })
    .strict(),
  z
    .object({
      kind: z.literal("docx"),
      documentPart: z.enum([
        "body",
        "header",
        "footer",
        "table",
        "footnote",
        "endnote",
        "other",
      ]),
      paragraphNumber: z.number().int().positive().optional(),
      tableNumber: z.number().int().positive().optional(),
      rowNumber: z.number().int().positive().optional(),
      cellNumber: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("minimal"),
      label: z.literal("imported_from_initial_resume"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic"),
      evidence: z
        .array(
          z
            .object({
              fragmentId: z.string().min(1).max(120),
              fragmentHash: z.string().regex(/^[a-f0-9]{64}$/u),
              line: z.number().int().positive(),
              start: z.number().int().nonnegative(),
              end: z.number().int().positive(),
            })
            .strict(),
        )
        .min(1)
        .max(8),
    })
    .strict(),
]);

const effectiveSourcedTextSchema = z
  .object({
    value: z.string().max(4_000),
    sourceStatus: z.enum([
      "explicit_source",
      "user_added",
      "user_edited",
      "source_deleted_minimal_provenance",
    ]),
    confidenceStatus: z.enum(["high", "medium", "low", "not_applicable"]),
    inferenceStatus: z.enum(["not_inferred", "confirmed_inference"]),
    provenance: safeProvenanceSchema,
  })
  .strict();

const effectiveProfessionalLinkSchema = z
  .object({
    id: uuidSchema,
    label: z.string().max(120).optional(),
    url: effectiveSourcedTextSchema,
  })
  .strict();

/** Canonical, provenance-safe content currently eligible for confirmation. */
export const effectiveResumeContentSchema = z
  .object({
    personal: z.array(effectiveSourcedTextSchema),
    contact: z.array(effectiveSourcedTextSchema),
    headline: effectiveSourcedTextSchema.optional(),
    summary: effectiveSourcedTextSchema.optional(),
    workExperiences: z.array(
      z
        .object({
          id: uuidSchema,
          employerName: z.string().max(300),
          employerLocation: z.string().max(200).optional(),
          roles: z.array(
            z
              .object({
                id: uuidSchema,
                title: z.string().max(200),
                location: z.string().max(200).optional(),
                startDate: resumeDateSchema.optional(),
                endDate: resumeDateSchema.optional(),
                isOngoing: z.boolean(),
                responsibilities: z.array(effectiveSourcedTextSchema),
                achievements: z.array(effectiveSourcedTextSchema),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    education: z.array(
      z
        .object({
          id: uuidSchema,
          institution: effectiveSourcedTextSchema,
          credential: effectiveSourcedTextSchema.optional(),
          fieldOfStudy: effectiveSourcedTextSchema.optional(),
          location: effectiveSourcedTextSchema.optional(),
          startDate: resumeDateSchema.optional(),
          endDate: resumeDateSchema.optional(),
        })
        .strict(),
    ),
    skills: z.array(
      z.object({ id: uuidSchema, name: effectiveSourcedTextSchema }).strict(),
    ),
    languages: z.array(
      z
        .object({
          id: uuidSchema,
          name: effectiveSourcedTextSchema,
          proficiency: effectiveSourcedTextSchema.optional(),
        })
        .strict(),
    ),
    projects: z.array(
      z
        .object({
          id: uuidSchema,
          name: effectiveSourcedTextSchema,
          description: effectiveSourcedTextSchema.optional(),
          links: z.array(effectiveProfessionalLinkSchema),
        })
        .strict(),
    ),
    certifications: z.array(
      z
        .object({
          id: uuidSchema,
          name: effectiveSourcedTextSchema,
          issuer: effectiveSourcedTextSchema.optional(),
          issuedAt: resumeDateSchema.optional(),
          expiresAt: resumeDateSchema.optional(),
        })
        .strict(),
    ),
    professionalLinks: z.array(effectiveProfessionalLinkSchema),
  })
  .strict();

export const reviewFieldSchema = z
  .object({
    fieldId: uuidSchema,
    fieldPath: fieldPathSchema,
    value: extractedValueSchema,
    sourceStatus: z.enum([
      "explicit_source",
      "inferred",
      "user_added",
      "user_edited",
      "source_deleted_minimal_provenance",
    ]),
    confidenceStatus: z.enum(["high", "medium", "low", "not_applicable"]),
    inferenceStatus: z.enum([
      "not_inferred",
      "inferred_needs_review",
      "confirmed_inference",
    ]),
    reviewStatus: z.enum([
      "unreviewed",
      "confirmed",
      "edited",
      "excluded",
      "intentionally_left",
    ]),
    provenance: safeProvenanceSchema,
    warningIds: z.array(uuidSchema),
    allowedActions: z.array(reviewActionSchema),
  })
  .strict();

export const reviewWarningSchema = z
  .object({
    warningId: uuidSchema,
    warningType: z.enum([
      "missing",
      "ambiguous",
      "conflicting",
      "duplicate",
      "low_confidence",
      "unsupported",
      "unsafe",
      "incomplete",
      "inferred",
      "partial",
      "mixed_content",
      "expired_source",
    ]),
    section: reviewSectionSchema,
    fieldPath: fieldPathSchema.optional(),
    message: plainMessageSchema,
    severity: z.enum(["info", "needs_attention", "blocking"]),
    reviewStatus: z.enum([
      "needs_review",
      "confirmed",
      "edited",
      "excluded",
      "intentionally_left",
    ]),
    requiresResolution: z.boolean(),
    allowedActions: z.array(reviewActionSchema),
  })
  .strict();

export const groupedReviewSectionSchema = z
  .object({
    section: reviewSectionSchema,
    label: z.string().min(1).max(80),
    fields: z.array(reviewFieldSchema),
    warnings: z.array(reviewWarningSchema),
    allowedActions: z.array(reviewActionSchema),
  })
  .strict();

const responseBaseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
  })
  .strict();

export const reviewDraftReadResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("review_draft"),
    importId: uuidSchema,
    draftId: uuidSchema,
    draftStatus: z.enum(["review_required", "ready_to_confirm"]),
    reviewRevision: z.number().int().nonnegative(),
    retentionExpiresAt: isoDateSchema,
    lastReviewedAt: isoDateSchema.optional(),
    sections: z.array(groupedReviewSectionSchema),
    effectiveResume: effectiveResumeContentSchema.optional(),
    activeFieldCount: z.number().int().nonnegative(),
    unresolvedWarningCount: z.number().int().nonnegative(),
    readyToConfirm: z.boolean(),
    userMessage: plainMessageSchema,
  })
  .strict();

export const reviewErrorResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("review_error"),
    importId: uuidSchema.optional(),
    code: z.enum([
      "authentication_required",
      "not_found",
      "not_ready",
      "stale_review",
      "lifecycle_not_reviewable",
      "validation_failed",
      "temporarily_unavailable",
      "malformed_response",
    ]),
    userMessage: plainMessageSchema,
  })
  .strict();

export const reviewMutationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("confirm_field"), fieldId: uuidSchema }).strict(),
  z
    .object({
      type: z.literal("edit_field"),
      fieldId: uuidSchema,
      value: extractedValueSchema,
    })
    .strict(),
  z.object({ type: z.literal("remove_field"), fieldId: uuidSchema }).strict(),
  z
    .object({
      type: z.literal("add_field"),
      section: reviewSectionSchema,
      fieldPath: fieldPathSchema,
      value: extractedValueSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("complete_missing_field"),
      warningId: uuidSchema,
      section: reviewSectionSchema,
      fieldPath: fieldPathSchema,
      value: extractedValueSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("resolve_warning"),
      warningId: uuidSchema,
      resolution: z.enum([
        "confirmed",
        "edited",
        "excluded",
        "intentionally_left",
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("exclude_section"),
      section: reviewSectionSchema,
    })
    .strict(),
]);

export const reviewMutationRequestSchema = z
  .object({
    operationId: uuidSchema,
    expectedReviewRevision: z.number().int().nonnegative(),
    action: reviewMutationActionSchema,
  })
  .strict();

export const reviewMutationResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("review_updated"),
    importId: uuidSchema,
    draftId: uuidSchema,
    reviewRevision: z.number().int().nonnegative(),
    draft: reviewDraftReadResponseSchema,
    userMessage: plainMessageSchema,
  })
  .strict();

export type ReviewSection = z.infer<typeof reviewSectionSchema>;
export type ReviewDraftReadResponse = z.infer<
  typeof reviewDraftReadResponseSchema
>;
export type ReviewErrorResponse = z.infer<typeof reviewErrorResponseSchema>;
export type ReviewMutationRequest = z.infer<typeof reviewMutationRequestSchema>;
export type ReviewMutationResponse = z.infer<
  typeof reviewMutationResponseSchema
>;
export type ReviewMutationAction = z.infer<typeof reviewMutationActionSchema>;
export type ReviewField = z.infer<typeof reviewFieldSchema>;
export type ReviewWarning = z.infer<typeof reviewWarningSchema>;
export type GroupedReviewSection = z.infer<typeof groupedReviewSectionSchema>;
