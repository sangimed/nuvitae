import { describe, expect, it } from "vitest";
import {
  parseSemanticProviderRuntimeMode,
  semanticProviderRuntimeModes,
} from "./semantic-provider-mode.js";

describe("semantic provider runtime mode", () => {
  it("defaults to production when the variable is absent", () => {
    expect(parseSemanticProviderRuntimeMode({})).toBe("production");
    expect(
      parseSemanticProviderRuntimeMode({
        NUVITAE_SEMANTIC_PROVIDER_MODE: undefined,
      }),
    ).toBe("production");
  });

  it("accepts only the allowlisted modes", () => {
    expect(semanticProviderRuntimeModes).toEqual([
      "production",
      "deterministic-e2e-test",
    ]);
    expect(
      parseSemanticProviderRuntimeMode({
        NUVITAE_SEMANTIC_PROVIDER_MODE: "production",
      }),
    ).toBe("production");
    expect(
      parseSemanticProviderRuntimeMode({
        NUVITAE_SEMANTIC_PROVIDER_MODE: "deterministic-e2e-test",
      }),
    ).toBe("deterministic-e2e-test");
  });

  it("fails closed for malformed, boolean-like, or unknown modes", () => {
    for (const value of [
      "",
      "true",
      "1",
      "yes",
      "enabled",
      "on",
      "test",
      "deterministic",
      "deterministic-e2e",
    ]) {
      expect(() =>
        parseSemanticProviderRuntimeMode({
          NUVITAE_SEMANTIC_PROVIDER_MODE: value,
        }),
      ).toThrow();
    }
  });
});
