import { z } from "zod";

export const bootstrapHealthSchema = z.object({
  service: z.enum(["web", "api", "worker"]),
  status: z.literal("ok"),
});

export type BootstrapHealth = z.infer<typeof bootstrapHealthSchema>;
