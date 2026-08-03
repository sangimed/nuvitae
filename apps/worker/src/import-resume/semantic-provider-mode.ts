import { z } from "zod";

/**
 * Strict allowlisted runtime modes for semantic-provider registration.
 *
 * This is a closed schema with a production-safe default. The deterministic
 * test provider is instantiated only when the mode is exactly
 * `deterministic-e2e-test`; every other value (including a missing value,
 * an empty string, or any boolean-like value such as "true"/"1") resolves to
 * production or fails closed. No loose boolean or truthy environment-variable
 * check is used anywhere in the worker.
 */
export const semanticProviderRuntimeModes = [
  "production",
  "deterministic-e2e-test",
] as const;

export type SemanticProviderRuntimeMode =
  (typeof semanticProviderRuntimeModes)[number];

const semanticProviderRuntimeModeSchema = z
  .enum(semanticProviderRuntimeModes)
  .default("production");

export function parseSemanticProviderRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): SemanticProviderRuntimeMode {
  return semanticProviderRuntimeModeSchema.parse(
    env.NUVITAE_SEMANTIC_PROVIDER_MODE,
  );
}
