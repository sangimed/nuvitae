import { describe, expect, it } from "vitest";
import { readCommunityAuthConfig } from "./community-auth.config.js";

describe("Community auth configuration", () => {
  it("fails closed without a non-default high-entropy access secret", () => {
    expect(() => readCommunityAuthConfig({ NODE_ENV: "production" })).toThrow(
      /NUVITAE_COMMUNITY_ACCESS_SECRET/,
    );
    expect(() =>
      readCommunityAuthConfig({
        NODE_ENV: "production",
        NUVITAE_COMMUNITY_ACCESS_SECRET:
          "change-me-change-me-change-me-change-me",
        NUVITAE_COMMUNITY_COOKIE_SECURE: "true",
      }),
    ).toThrow(/NUVITAE_COMMUNITY_ACCESS_SECRET/);
  });

  it("requires explicit secure-cookie deployment behavior and bounds session expiry", () => {
    expect(() =>
      readCommunityAuthConfig({
        NODE_ENV: "production",
        NUVITAE_COMMUNITY_ACCESS_SECRET:
          "high-entropy-community-access-secret-for-production-tests",
      }),
    ).toThrow(/NUVITAE_COMMUNITY_COOKIE_SECURE/);
    expect(() =>
      readCommunityAuthConfig({
        NODE_ENV: "production",
        NUVITAE_COMMUNITY_ACCESS_SECRET:
          "high-entropy-community-access-secret-for-production-tests",
        NUVITAE_COMMUNITY_COOKIE_SECURE: "false",
      }),
    ).toThrow(/NUVITAE_COMMUNITY_COOKIE_SECURE/);

    expect(
      readCommunityAuthConfig({
        NODE_ENV: "production",
        NUVITAE_COMMUNITY_ACCESS_SECRET:
          "high-entropy-community-access-secret-for-production-tests",
        NUVITAE_COMMUNITY_COOKIE_SECURE: "true",
        NUVITAE_COMMUNITY_SESSION_TTL_SECONDS: "3600",
      }),
    ).toMatchObject({ cookieSecure: true, sessionTtlSeconds: 3600 });
  });
});
