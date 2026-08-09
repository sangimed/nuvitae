import { z } from "zod";

const enabledSchema = z.enum(["true", "false"]).default("false");
const uuidSchema = z.string().uuid();
const nonProductionNodeEnvSchema = z
  .string()
  .default("development")
  .refine((value) => value !== "production", {
    message: "Local play mode cannot run with NODE_ENV=production.",
  });

export interface LocalPlayConfig {
  readonly enabled: boolean;
  readonly localUserId: string;
  readonly privateStorageRoot: string;
  readonly privateStorageSigningSecret: string;
  readonly maxSignedReferenceTtlSeconds: number;
  readonly providerSessionRoot: string;
  readonly providerSessionEncryptionSecret: string;
  readonly maxProviderSessionBytes: number;
}

export function isLocalPlayModeEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NUVITAE_LOCAL_PLAY_MODE === "true";
}

export function readLocalPlayConfig(
  env: NodeJS.ProcessEnv = process.env,
): LocalPlayConfig {
  const enabled = enabledSchema.parse(env.NUVITAE_LOCAL_PLAY_MODE);
  if (enabled !== "true") {
    throw new Error("Local play mode is disabled.");
  }
  nonProductionNodeEnvSchema.parse(env.NODE_ENV);
  const parsed = z
    .object({
      NUVITAE_LOCAL_PLAY_USER_ID: uuidSchema,
      NUVITAE_PRIVATE_STORAGE_ROOT: z.string().min(1),
      NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET: z.string().min(32),
      NUVITAE_PRIVATE_STORAGE_MAX_SIGNED_REFERENCE_TTL_SECONDS: z
        .preprocess(
          (value) => (value === undefined ? 300 : Number(value)),
          z.number().int().positive().max(3600),
        )
        .default(300),
      NUVITAE_PROVIDER_SESSION_ROOT: z
        .string()
        .min(1)
        .default("/var/lib/nuvitae/provider-sessions"),
      NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET: z.string().min(32),
      NUVITAE_PROVIDER_SESSION_MAX_BYTES: z
        .preprocess(
          (value) => (value === undefined ? 65_536 : Number(value)),
          z
            .number()
            .int()
            .positive()
            .max(16 * 1024 * 1024),
        )
        .default(65_536),
    })
    .parse(env);
  return {
    enabled: true,
    localUserId: parsed.NUVITAE_LOCAL_PLAY_USER_ID,
    privateStorageRoot: parsed.NUVITAE_PRIVATE_STORAGE_ROOT,
    privateStorageSigningSecret: parsed.NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET,
    maxSignedReferenceTtlSeconds:
      parsed.NUVITAE_PRIVATE_STORAGE_MAX_SIGNED_REFERENCE_TTL_SECONDS,
    providerSessionRoot: parsed.NUVITAE_PROVIDER_SESSION_ROOT,
    providerSessionEncryptionSecret:
      parsed.NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET,
    maxProviderSessionBytes: parsed.NUVITAE_PROVIDER_SESSION_MAX_BYTES,
  };
}
