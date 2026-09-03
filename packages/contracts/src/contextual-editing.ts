import { z } from "zod";
import { importResumeResponseSchemaVersion } from "./import-resume/responses.js";

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime();
const plainMessageSchema = z.string().min(1).max(500);

export const contextualResumeEditActions = [
  "improve_writing",
  "make_concise",
  "strengthen_impact",
  "fix_grammar",
] as const;

export const contextualResumeEditActionSchema = z.enum(
  contextualResumeEditActions,
);

export const contextualResumeEditTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("summary") }).strict(),
  z
    .object({
      kind: z.enum(["work_responsibility", "work_achievement"]),
      experienceId: uuidSchema,
      roleId: uuidSchema,
      itemIndex: z.number().int().nonnegative().max(23),
    })
    .strict(),
  z
    .object({
      kind: z.literal("project_description"),
      projectId: uuidSchema,
    })
    .strict(),
]);

export const createContextualResumeEditProposalRequestSchema = z
  .object({
    expectedUpdatedAt: isoDateSchema,
    action: contextualResumeEditActionSchema,
    target: contextualResumeEditTargetSchema,
  })
  .strict();

const responseBaseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
  })
  .strict();

export const contextualResumeEditProposalResponseSchema = responseBaseSchema
  .extend({
    status: z.literal("contextual_resume_edit_proposal"),
    proposalId: uuidSchema,
    action: contextualResumeEditActionSchema,
    target: contextualResumeEditTargetSchema,
    before: z.string().min(1).max(4_000),
    after: z.string().min(1).max(4_000),
    generatedAt: isoDateSchema,
    userMessage: plainMessageSchema,
  })
  .strict();

export const contextualResumeEditProposalErrorResponseSchema =
  responseBaseSchema
    .extend({
      status: z.literal("contextual_resume_edit_proposal_error"),
      code: z.enum([
        "not_found",
        "stale_update",
        "target_unavailable",
        "provider_not_configured",
        "provider_unavailable",
        "unsafe_proposal",
        "validation_failed",
      ]),
      userMessage: plainMessageSchema,
    })
    .strict();

export type ContextualResumeEditAction = z.infer<
  typeof contextualResumeEditActionSchema
>;
export type ContextualResumeEditTarget = z.infer<
  typeof contextualResumeEditTargetSchema
>;
export type CreateContextualResumeEditProposalRequest = z.infer<
  typeof createContextualResumeEditProposalRequestSchema
>;
export type ContextualResumeEditProposalResponse = z.infer<
  typeof contextualResumeEditProposalResponseSchema
>;
export type ContextualResumeEditProposalErrorResponse = z.infer<
  typeof contextualResumeEditProposalErrorResponseSchema
>;
