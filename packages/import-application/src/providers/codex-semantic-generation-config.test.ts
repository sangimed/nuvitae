import { describe, expect, it } from "vitest";
import { semanticGenerationPolicyFor } from "../semantic-parser/semantic-generation-policy.js";
import {
  codexSemanticGenerationCapabilities,
  resolveCodexSemanticGenerationConfig,
} from "./codex-semantic-generation-config.js";

describe("Codex semantic generation configuration", () => {
  it.each([
    ["fast", "gpt-5.6-luna", "low", "low"],
    ["balanced", "gpt-5.6-terra", "low", "low"],
    ["quality", "gpt-5.6-sol", "medium", "low"],
  ] as const)(
    "maps the %s logical profile only at the Codex boundary",
    (profile, model, reasoningEffort, textVerbosity) => {
      expect(
        resolveCodexSemanticGenerationConfig(
          semanticGenerationPolicyFor(profile),
        ),
      ).toEqual({ model, reasoningEffort, textVerbosity });
    },
  );

  it("declares the capabilities required by Semantic V2", () => {
    expect(codexSemanticGenerationCapabilities).toMatchObject({
      structuredOutput: true,
      streaming: true,
      reasoningControl: "qualitative",
      outputDetailControl: "qualitative",
    });
  });
});
