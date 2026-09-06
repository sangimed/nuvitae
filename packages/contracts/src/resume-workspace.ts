import { z } from "zod";
import { importResumeResponseSchemaVersion } from "./import-resume/responses.js";
import { utcInstantSchema } from "./instant.js";

const uuidSchema = z.string().uuid();

export const resumeWorkspaceItemSchema = z
  .object({
    id: uuidSchema,
    kind: z.enum(["manual_draft", "confirmed_resume"]),
    title: z.string().min(1).max(300),
    updatedAt: utcInstantSchema,
    editUrl: z.string().regex(/^\/resumes\/(drafts\/)?[0-9a-f-]+$/i),
    provenanceLabel: z.enum(["manual_entry", "imported_from_initial_resume"]),
  })
  .strict();

export const resumeWorkspaceListResponseSchema = z
  .object({
    version: z.literal(importResumeResponseSchemaVersion),
    requestId: uuidSchema,
    status: z.literal("resume_workspace"),
    resumes: z.array(resumeWorkspaceItemSchema),
  })
  .strict();

export type ResumeWorkspaceItem = z.infer<typeof resumeWorkspaceItemSchema>;
export type ResumeWorkspaceListResponse = z.infer<
  typeof resumeWorkspaceListResponseSchema
>;
