import { z } from "zod";

export interface WorkerPrivateRuntimeConfig {
  readonly privateStorageRoot: string;
  readonly privateStorageSigningSecret: string;
  readonly maxSignedReferenceTtlSeconds: number;
  readonly providerSessionRoot: string;
  readonly providerSessionEncryptionSecret: string;
  readonly maxProviderSessionBytes: number;
}

export function readWorkerPrivateRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): WorkerPrivateRuntimeConfig {
  const parsed = z
    .object({
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
    throw new Error(`Invalid worker private runtime configuration: ${fields}.`);
  }
  return {
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
