import { z } from "zod";
import type { ProductRuntimeConfig } from "./product-runtime.config.js";

export function readCommunityProductRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductRuntimeConfig {
  const parsed = z
    .object({
      NUVITAE_COMMUNITY_FUNNEL_TELEMETRY_ENABLED: z
        .enum(["true", "false"])
        .default("false"),
      NUVITAE_PRIVATE_STORAGE_ROOT: z.string().trim().min(1),
      NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET: z.string().min(32),
      NUVITAE_PRIVATE_STORAGE_MAX_SIGNED_REFERENCE_TTL_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .max(3600)
        .default(300),
      NUVITAE_PROVIDER_SESSION_ROOT: z.string().trim().min(1),
      NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET: z.string().min(32),
      NUVITAE_PROVIDER_SESSION_MAX_BYTES: z.coerce
        .number()
        .int()
        .positive()
        .max(16 * 1024 * 1024)
        .default(65_536),
    })
    .safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid Community product configuration: ${fields}.`);
  }
  const secrets = [
    parsed.data.NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET,
    parsed.data.NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET,
  ];
  if (
    env.NODE_ENV === "production" &&
    secrets.some((secret) =>
      ["change-me", "replace-me", "example", "<generate-", "<replace-"].some(
        (known) => secret.toLowerCase().includes(known),
      ),
    )
  ) {
    throw new Error("Invalid Community product configuration: secret.");
  }
  return {
    communityFunnelTelemetryEnabled:
      parsed.data.NUVITAE_COMMUNITY_FUNNEL_TELEMETRY_ENABLED === "true",
    privateStorageRoot: parsed.data.NUVITAE_PRIVATE_STORAGE_ROOT,
    privateStorageSigningSecret:
      parsed.data.NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET,
    maxSignedReferenceTtlSeconds:
      parsed.data.NUVITAE_PRIVATE_STORAGE_MAX_SIGNED_REFERENCE_TTL_SECONDS,
    providerSessionRoot: parsed.data.NUVITAE_PROVIDER_SESSION_ROOT,
    providerSessionEncryptionSecret:
      parsed.data.NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET,
    maxProviderSessionBytes: parsed.data.NUVITAE_PROVIDER_SESSION_MAX_BYTES,
  };
}
