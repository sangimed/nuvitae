import type {
  SemanticGenerationPolicy,
  SemanticGenerationProfile,
} from "../semantic-parser/semantic-generation-policy.js";
import type { CodexModelIdentifier } from "./codex-model-selection.js";

export type CodexReasoningEffort = "low" | "medium";
export type CodexTextVerbosity = "low" | "medium";

/** Provider-owned native request controls. Never export this from the root API. */
export interface CodexGenerationConfig {
  readonly model: CodexSemanticModelIdentifier;
  readonly reasoningEffort: CodexReasoningEffort;
  readonly textVerbosity: CodexTextVerbosity;
}

export const codexSemanticModels = [
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
] as const;

export type CodexSemanticModelIdentifier = (typeof codexSemanticModels)[number];

export const codexSemanticGenerationCapabilities = {
  structuredOutput: true,
  streaming: true,
  reasoningControl: "qualitative",
  outputDetailControl: "qualitative",
} as const;

const profileMappings: Readonly<
  Record<SemanticGenerationProfile, CodexGenerationConfig>
> = {
  fast: {
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    textVerbosity: "low",
  },
  balanced: {
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
    textVerbosity: "low",
  },
  quality: {
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
    textVerbosity: "low",
  },
};

/** Resolves Nuvitae intent only after it reaches the Codex adapter boundary. */
export function resolveCodexSemanticGenerationConfig(
  policy: SemanticGenerationPolicy,
): CodexGenerationConfig {
  if (
    (policy.requirements.structuredOutput &&
      !codexSemanticGenerationCapabilities.structuredOutput) ||
    (policy.requirements.streaming &&
      !codexSemanticGenerationCapabilities.streaming)
  )
    throw new Error("unsupported_semantic_generation_capability");
  return profileMappings[policy.profile];
}

/** Native default for non-semantic Codex adapter calls. */
export function codexDefaultGenerationConfig(
  model: CodexModelIdentifier,
): CodexGenerationConfig {
  return { model, reasoningEffort: "low", textVerbosity: "low" };
}
