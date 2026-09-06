import { describe, expect, it } from "vitest";
import { readWorkerPrivateRuntimeConfig } from "./private-runtime.config.js";

describe("worker private runtime configuration", () => {
  it("fails closed without the shared private storage and session secrets", () => {
    expect(() => readWorkerPrivateRuntimeConfig({})).toThrow(
      /NUVITAE_PRIVATE_STORAGE_ROOT/,
    );
  });

  it("reads the same canonical paths supplied to the Community API", () => {
    expect(
      readWorkerPrivateRuntimeConfig({
        NUVITAE_PRIVATE_STORAGE_ROOT: "/var/lib/nuvitae/private",
        NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:
          "private-storage-signing-secret-for-worker-runtime-tests",
        NUVITAE_PROVIDER_SESSION_ROOT:
          "/var/lib/nuvitae/private/provider-sessions",
        NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:
          "provider-session-encryption-secret-for-worker-runtime-tests",
      }),
    ).toMatchObject({
      privateStorageRoot: "/var/lib/nuvitae/private",
      providerSessionRoot: "/var/lib/nuvitae/private/provider-sessions",
      semanticGenerationProfile: "balanced",
    });
  });

  it("allows only logical semantic generation profiles", () => {
    const env = {
      NUVITAE_PRIVATE_STORAGE_ROOT: "/var/lib/nuvitae/private",
      NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:
        "private-storage-signing-secret-for-worker-runtime-tests",
      NUVITAE_PROVIDER_SESSION_ROOT:
        "/var/lib/nuvitae/private/provider-sessions",
      NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:
        "provider-session-encryption-secret-for-worker-runtime-tests",
      NUVITAE_SEMANTIC_PROFILE: "fast",
    };
    expect(readWorkerPrivateRuntimeConfig(env).semanticGenerationProfile).toBe(
      "fast",
    );
    expect(() =>
      readWorkerPrivateRuntimeConfig({
        ...env,
        NUVITAE_SEMANTIC_PROFILE: "gpt-5.6-terra",
      }),
    ).toThrow(/NUVITAE_SEMANTIC_PROFILE/);
  });
});
