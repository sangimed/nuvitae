import { z } from "zod";

export const providerConnectionResponseSchemaVersion = "2026-08-08" as const;

const opaqueLoginReferenceSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const browserAuthorizationUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.hostname === "auth.openai.com" &&
        url.pathname === "/oauth/authorize"
      );
    } catch {
      return false;
    }
  }, "The browser handoff URL is not an approved authorization URL.");

/**
 * T213 public handoff contract. The URL is used only for immediate top-level
 * browser navigation. It must not be persisted, logged, or copied into a
 * domain entity. The broker remains the only owner of OAuth state and PKCE
 * material; this response contains no credentials or provider account data.
 */
export const codexConnectionInitiationResponseSchema = z
  .object({
    version: z.literal(providerConnectionResponseSchemaVersion),
    status: z.literal("login_pending"),
    loginReference: opaqueLoginReferenceSchema,
    authorizationUrl: browserAuthorizationUrlSchema,
  })
  .strict();

export type CodexConnectionInitiationResponse = z.infer<
  typeof codexConnectionInitiationResponseSchema
>;
