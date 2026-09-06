/** Provider-neutral intent for a Semantic V2 generation request. */
export const semanticGenerationProfiles = [
  "fast",
  "balanced",
  "quality",
] as const;

export type SemanticGenerationProfile =
  (typeof semanticGenerationProfiles)[number];

export type SemanticGenerationReasoning = "minimal" | "standard" | "deep";
export type SemanticGenerationOutputDetail = "compact" | "standard";

export interface SemanticGenerationPolicy {
  readonly profile: SemanticGenerationProfile;
  readonly reasoning: SemanticGenerationReasoning;
  readonly outputDetail: SemanticGenerationOutputDetail;
  readonly requirements: {
    readonly structuredOutput: true;
    readonly streaming: true;
  };
}

export const semanticGenerationPolicies: Readonly<
  Record<SemanticGenerationProfile, SemanticGenerationPolicy>
> = {
  fast: {
    profile: "fast",
    reasoning: "minimal",
    outputDetail: "compact",
    requirements: { structuredOutput: true, streaming: true },
  },
  balanced: {
    profile: "balanced",
    reasoning: "minimal",
    outputDetail: "compact",
    requirements: { structuredOutput: true, streaming: true },
  },
  quality: {
    profile: "quality",
    reasoning: "standard",
    outputDetail: "compact",
    requirements: { structuredOutput: true, streaming: true },
  },
};

export const defaultSemanticGenerationProfile = "balanced" as const;

export function semanticGenerationPolicyFor(
  profile: SemanticGenerationProfile = defaultSemanticGenerationProfile,
): SemanticGenerationPolicy {
  return semanticGenerationPolicies[profile];
}
