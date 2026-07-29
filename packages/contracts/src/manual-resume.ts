import { z } from "zod";
import { importResumeResponseSchemaVersion } from "./import-resume/responses.js";

const uuidSchema = z.string().uuid();
const plainMessageSchema = z.string().min(1).max(400);
const manualSourceStatusSchema = z.literal("user_added");
const manualConfidenceStatusSchema = z.literal("not_applicable");
const manualInferenceStatusSchema = z.literal("not_inferred");
const manualReviewStatusSchema = z.literal("edited");

export const manualDraftCreationKeySchema = z
  .string()
  .min(16)
  .max(96)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const resumeDateSchema = z
  .object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12).optional(),
    precision: z.enum(["year", "month", "day"]),
    originalText: z.string().min(1).max(80).optional(),
  })
  .strict();

export const manualSourcedTextSchema = z
  .object({
    value: z.string().max(4_000),
    sourceStatus: manualSourceStatusSchema,
    confidenceStatus: manualConfidenceStatusSchema,
    inferenceStatus: manualInferenceStatusSchema,
  })
  .strict();

const professionalLinkSchema = z
  .object({
    id: uuidSchema,
    label: z.string().max(120).optional(),
    url: manualSourcedTextSchema,
    reviewStatus: manualReviewStatusSchema,
  })
  .strict();

const workExperienceRoleSchema = z
  .object({
    id: uuidSchema,
    title: z.string().max(200),
    location: z.string().max(200).optional(),
    startDate: resumeDateSchema.optional(),
    endDate: resumeDateSchema.optional(),
    isOngoing: z.boolean(),
    responsibilities: z.array(manualSourcedTextSchema).max(24),
    achievements: z.array(manualSourcedTextSchema).max(24),
    sourceStatus: manualSourceStatusSchema,
    reviewStatus: manualReviewStatusSchema,
    inferenceStatus: manualInferenceStatusSchema,
  })
  .strict()
  .refine((role) => !role.isOngoing || role.endDate === undefined, {
    path: ["endDate"],
    message: "Ongoing roles cannot have an end date.",
  });

const workExperienceSchema = z
  .object({
    id: uuidSchema,
    employerName: z.string().max(300),
    employerLocation: z.string().max(200).optional(),
    roles: z.array(workExperienceRoleSchema).max(8),
    reviewStatus: manualReviewStatusSchema,
    inferenceStatus: manualInferenceStatusSchema,
  })
  .strict();

const educationSchema = z
  .object({
    id: uuidSchema,
    institution: manualSourcedTextSchema,
    credential: manualSourcedTextSchema.optional(),
    fieldOfStudy: manualSourcedTextSchema.optional(),
    location: manualSourcedTextSchema.optional(),
    startDate: resumeDateSchema.optional(),
    endDate: resumeDateSchema.optional(),
    reviewStatus: manualReviewStatusSchema,
  })
  .strict();

const skillSchema = z
  .object({
    id: uuidSchema,
    name: manualSourcedTextSchema,
    category: z.string().max(120).optional(),
    reviewStatus: manualReviewStatusSchema,
  })
  .strict();

const languageSchema = z
  .object({
    id: uuidSchema,
    name: manualSourcedTextSchema,
    proficiency: manualSourcedTextSchema.optional(),
    reviewStatus: manualReviewStatusSchema,
  })
  .strict();

const projectSchema = z
  .object({
    id: uuidSchema,
    name: manualSourcedTextSchema,
    description: manualSourcedTextSchema.optional(),
    links: z.array(professionalLinkSchema).max(8),
    reviewStatus: manualReviewStatusSchema,
  })
  .strict();

const certificationSchema = z
  .object({
    id: uuidSchema,
    name: manualSourcedTextSchema,
    issuer: manualSourcedTextSchema.optional(),
    issuedAt: resumeDateSchema.optional(),
    expiresAt: resumeDateSchema.optional(),
    reviewStatus: manualReviewStatusSchema,
  })
  .strict();

export const structuredResumeContentSchema = z
  .object({
    personal: z.array(manualSourcedTextSchema).max(12),
    contact: z.array(manualSourcedTextSchema).max(12),
    headline: manualSourcedTextSchema.optional(),
    summary: manualSourcedTextSchema.optional(),
    workExperiences: z.array(workExperienceSchema).max(25),
    education: z.array(educationSchema).max(20),
    skills: z.array(skillSchema).max(80),
    languages: z.array(languageSchema).max(20),
    projects: z.array(projectSchema).max(30),
    certifications: z.array(certificationSchema).max(40),
    professionalLinks: z.array(professionalLinkSchema).max(20),
  })
  .strict();

export const createManualDraftRequestSchema = z
  .object({
    creationKey: manualDraftCreationKeySchema,
  })
  .strict();

export const updateManualDraftRequestSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    content: structuredResumeContentSchema,
  })
  .strict();

const manualDraftEnvelopeSchema = z
  .object({
    draftId: uuidSchema,
    source: z.literal("manual_entry"),
    status: z.literal("editing"),
    content: structuredResumeContentSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const responseBaseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
  })
  .strict();

export const manualDraftResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("manual_draft"),
    draft: manualDraftEnvelopeSchema,
    userMessage: plainMessageSchema,
  })
  .strict();

export const manualDraftErrorResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("manual_draft_error"),
    code: z.enum([
      "authentication_required",
      "not_found",
      "validation_failed",
      "stale_update",
      "temporarily_unavailable",
    ]),
    userMessage: plainMessageSchema,
    issues: z
      .array(
        z
          .object({
            path: z.string().min(1).max(200),
            message: z.string().min(1).max(200),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type StructuredResumeContentContract = z.infer<
  typeof structuredResumeContentSchema
>;
export type CreateManualDraftRequest = z.infer<
  typeof createManualDraftRequestSchema
>;
export type UpdateManualDraftRequest = z.infer<
  typeof updateManualDraftRequestSchema
>;
export type ManualDraftResponse = z.infer<typeof manualDraftResponseSchema>;
export type ManualDraftErrorResponse = z.infer<
  typeof manualDraftErrorResponseSchema
>;
