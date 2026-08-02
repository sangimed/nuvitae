import { z } from "zod";

export const bootstrapHealthSchema = z.object({
  service: z.enum(["web", "api", "worker"]),
  status: z.literal("ok"),
});

export type BootstrapHealth = z.infer<typeof bootstrapHealthSchema>;

export * from "./import-resume/jobs.js";
export * from "./import-resume/responses.js";
export * from "./import-resume/review.js";
export * from "./import-resume/confirmation.js";
export * from "./import-resume/semantic-extraction.js";
export * from "./manual-resume.js";
