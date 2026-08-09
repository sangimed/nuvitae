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

const providerConnectionStatusSchema = z.enum([
  "not_configured",
  "login_pending",
  "connected",
  "login_cancelled",
  "disconnected",
  "authentication_expired",
  "authentication_revoked",
]);

const providerAuthenticationStatusSchema = z.enum([
  "unauthenticated",
  "pending",
  "authenticated",
  "expired",
  "revoked",
  "unknown",
]);

const providerAvailabilityStatusSchema = z.enum([
  "available",
  "unavailable",
  "rate_limited",
  "quota_exceeded",
  "unsupported_capability",
  "unknown",
]);

/**
 * Provider-neutral read-only connection projection. It deliberately omits
 * connection identifiers, session references, URLs, account data, and
 * capability internals because the normal UI does not need them.
 */
export const providerConnectionStatusResponseSchema = z
  .object({
    version: z.literal(providerConnectionResponseSchemaVersion),
    providerKind: z.string().min(1).max(64),
    connectionStatus: providerConnectionStatusSchema,
    authenticationStatus: providerAuthenticationStatusSchema,
    availabilityStatus: providerAvailabilityStatusSchema,
    ready: z.boolean(),
    safeMessage: z.string().max(240).nullable(),
  })
  .strict();

export type ProviderConnectionStatusResponse = z.infer<
  typeof providerConnectionStatusResponseSchema
>;
