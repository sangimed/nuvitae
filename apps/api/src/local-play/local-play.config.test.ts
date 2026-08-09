import { describe, expect, it } from "vitest";
import { extractUserContext } from "../auth/user-context.js";
import { readLocalPlayConfig } from "./local-play.config.js";
import { LocalPlayPrincipalMiddleware } from "./local-play-principal.middleware.js";

describe("local play configuration", () => {
  it("refuses production mode and malformed identity", () => {
    expect(() =>
      readLocalPlayConfig({
        NUVITAE_LOCAL_PLAY_MODE: "true",
        NODE_ENV: "production",
        NUVITAE_LOCAL_PLAY_USER_ID: "00000000-0000-4000-8000-000000000101",
        NUVITAE_PRIVATE_STORAGE_ROOT: "/tmp/nuvitae-private",
        NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:
          "local-play-storage-signing-secret-not-for-production",
        NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:
          "local-play-provider-session-encryption-secret-not-for-production",
      } as NodeJS.ProcessEnv),
    ).toThrow();
    expect(() =>
      readLocalPlayConfig({
        NUVITAE_LOCAL_PLAY_MODE: "true",
        NODE_ENV: "development",
        NUVITAE_LOCAL_PLAY_USER_ID: "not-a-uuid",
        NUVITAE_PRIVATE_STORAGE_ROOT: "/tmp/nuvitae-private",
        NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:
          "local-play-storage-signing-secret-not-for-production",
        NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:
          "local-play-provider-session-encryption-secret-not-for-production",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("attaches only the configured development principal", () => {
    const original = process.env;
    process.env = {
      ...original,
      NUVITAE_LOCAL_PLAY_MODE: "true",
      NODE_ENV: "development",
      NUVITAE_LOCAL_PLAY_USER_ID: "00000000-0000-4000-8000-000000000101",
      NUVITAE_PRIVATE_STORAGE_ROOT: "/tmp/nuvitae-private",
      NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:
        "local-play-storage-signing-secret-not-for-production",
      NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:
        "local-play-provider-session-encryption-secret-not-for-production",
    };
    try {
      const request = {
        headers: {
          "x-user-id": "00000000-0000-4000-8000-000000000999",
        },
        body: { ownerUserId: "00000000-0000-4000-8000-000000000999" },
      };
      new LocalPlayPrincipalMiddleware().use(request, {}, () => undefined);
      expect(extractUserContext(request)).toMatchObject({
        state: "authenticated",
        userId: "00000000-0000-4000-8000-000000000101",
      });
    } finally {
      process.env = original;
    }
  });
});
