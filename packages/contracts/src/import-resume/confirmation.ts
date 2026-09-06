import { z } from "zod";
import { utcInstantSchema } from "../instant.js";
import { extractedValueSchema, safeProvenanceSchema } from "./review.js";
import { importResumeResponseSchemaVersion } from "./responses.js";
import { resumeDateSchema } from "./resume-date.js";
import {
  resumeEditorSectionOrderSchema,
  structuredResumeContentSchema,
} from "../manual-resume.js";

const uuidSchema = z.string().uuid();
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
    confirmedAt: utcInstantSchema,
    sourceRetentionExpiresAt: utcInstantSchema,
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
    discardedAt: utcInstantSchema,
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

export const deleteResumeSourceErrorResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("source_document_deletion_error"),
    structuredResumeId: uuidSchema.optional(),
    code: z.enum([
      "authentication_required",
      "not_found",
      "deletion_in_progress",
      "temporarily_unavailable",
    ]),
    userMessage: plainMessageSchema,
  })
  .strict();

const confirmedSourcedTextSchema = z
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

const confirmedProfessionalLinkSchema = z
  .object({
    id: uuidSchema,
    label: z.string().max(120).optional(),
    url: confirmedSourcedTextSchema,
  })
  .strict();

export const confirmedResumeContentSchema = z
  .object({
    sectionOrder: resumeEditorSectionOrderSchema.optional(),
    personal: z.array(confirmedSourcedTextSchema),
    contact: z.array(confirmedSourcedTextSchema),
    headline: confirmedSourcedTextSchema.optional(),
    summary: confirmedSourcedTextSchema.optional(),
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
                responsibilities: z.array(confirmedSourcedTextSchema),
                achievements: z.array(confirmedSourcedTextSchema),
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
          institution: confirmedSourcedTextSchema,
          credential: confirmedSourcedTextSchema.optional(),
          fieldOfStudy: confirmedSourcedTextSchema.optional(),
          location: confirmedSourcedTextSchema.optional(),
          startDate: resumeDateSchema.optional(),
          endDate: resumeDateSchema.optional(),
        })
        .strict(),
    ),
    skills: z.array(
      z
        .object({
          id: uuidSchema,
          name: confirmedSourcedTextSchema,
          category: z.string().max(120).optional(),
        })
        .strict(),
    ),
    languages: z.array(
      z
        .object({
          id: uuidSchema,
          name: confirmedSourcedTextSchema,
          proficiency: confirmedSourcedTextSchema.optional(),
        })
        .strict(),
    ),
    projects: z.array(
      z
        .object({
          id: uuidSchema,
          name: confirmedSourcedTextSchema,
          description: confirmedSourcedTextSchema.optional(),
          links: z.array(confirmedProfessionalLinkSchema),
        })
        .strict(),
    ),
    certifications: z.array(
      z
        .object({
          id: uuidSchema,
          name: confirmedSourcedTextSchema,
          issuer: confirmedSourcedTextSchema.optional(),
          issuedAt: resumeDateSchema.optional(),
          expiresAt: resumeDateSchema.optional(),
        })
        .strict(),
    ),
    professionalLinks: z.array(confirmedProfessionalLinkSchema),
  })
  .strict();

export const updateConfirmedStructuredResumeRequestSchema = z
  .object({
    expectedUpdatedAt: utcInstantSchema,
    content: structuredResumeContentSchema,
  })
  .strict();

export const confirmedStructuredResumeReadResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("confirmed_structured_resume"),
    structuredResumeId: uuidSchema,
    confirmationStatus: z.literal("confirmed"),
    provenanceLabel: z.literal("imported_from_initial_resume"),
    content: confirmedResumeContentSchema,
    createdAt: utcInstantSchema,
    updatedAt: utcInstantSchema,
    sourceAvailability: confirmedResumeSourceAvailabilitySchema,
    sourceRetentionExpiresAt: utcInstantSchema.optional(),
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
export type UpdateConfirmedStructuredResumeRequest = z.infer<
  typeof updateConfirmedStructuredResumeRequestSchema
>;

void extractedValueSchema;
