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
    })
    .parse(env);
  return {
    enabled: true,
    localUserId: parsed.NUVITAE_LOCAL_PLAY_USER_ID,
    privateStorageRoot: parsed.NUVITAE_PRIVATE_STORAGE_ROOT,
    privateStorageSigningSecret: parsed.NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET,
    maxSignedReferenceTtlSeconds:
      parsed.NUVITAE_PRIVATE_STORAGE_MAX_SIGNED_REFERENCE_TTL_SECONDS,
  };
}
