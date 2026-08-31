import { describe, expect, it } from "vitest";
import { readCommunityProductRuntimeConfig } from "./community-product.config.js";

const valid = {
  NODE_ENV: "production",
  NUVITAE_PRIVATE_STORAGE_ROOT: "/var/lib/nuvitae/private",
  NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:
    "unique-private-storage-signing-secret-for-community-tests",
  NUVITAE_PROVIDER_SESSION_ROOT: "/var/lib/nuvitae/private/provider-sessions",
  NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:
    "unique-provider-session-encryption-secret-for-community-tests",
};

describe("Community product runtime configuration", () => {
  it("keeps optional Community funnel telemetry disabled unless explicitly enabled", () => {
    expect(readCommunityProductRuntimeConfig(valid)).toMatchObject({
      communityFunnelTelemetryEnabled: false,
    });
    expect(
      readCommunityProductRuntimeConfig({
        ...valid,
        NUVITAE_COMMUNITY_FUNNEL_TELEMETRY_ENABLED: "true",
      }),
    ).toMatchObject({ communityFunnelTelemetryEnabled: true });
  });

  it("requires both private-storage and provider-session secrets", () => {
    expect(() => readCommunityProductRuntimeConfig({})).toThrow(
      /NUVITAE_PRIVATE_STORAGE_ROOT/,
    );
  });

  it("rejects placeholder secrets in production and keeps secrets out of diagnostics", () => {
    const secret = "replace-me-with-a-real-secret-value-not-a-default";
    expect(() =>
      readCommunityProductRuntimeConfig({
        ...valid,
        NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET: secret,
      }),
    ).toThrow(/Invalid Community product configuration: secret/);
    try {
      readCommunityProductRuntimeConfig({
        ...valid,
        NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
