import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readCommunityAuthConfig } from "../../apps/api/src/community-auth/community-auth.config.js";
import { readCommunityProductRuntimeConfig } from "../../apps/api/src/runtime/community-product.config.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const bootstrapScript = join(repositoryRoot, "scripts/community-bootstrap.sh");
const ownerSecretScript = join(
  repositoryRoot,
  "scripts/community-owner-secret.sh",
);
const composePath = join(repositoryRoot, "compose.yml");

function parseEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s))
      .map(([key, value]) => [key, value ?? ""]),
  );
}

function serviceBlock(compose: string, name: string): string {
  const start = compose.indexOf(`\n  ${name}:\n`);
  const nextService = name === "postgres" ? "queue" : "test";
  const end = compose.indexOf(`\n  ${nextService}:\n`, start + 1);
  return compose.slice(start, end === -1 ? undefined : end);
}

async function initializedConfig() {
  const directory = await mkdtemp(join(tmpdir(), "nuvitae-community-test-"));
  const configPath = join(directory, ".community.env");
  const result = await execFileAsync("sh", [bootstrapScript], {
    cwd: repositoryRoot,
    env: { ...process.env, NUVITAE_COMMUNITY_CONFIG_PATH: configPath },
  });
  return { configPath, result };
}

describe("Community installation bootstrap", () => {
  it("creates a complete production-safe configuration without revealing secrets", async () => {
    const { configPath, result } = await initializedConfig();
    const configText = await readFile(configPath, "utf8");
    const config = parseEnv(configText);

    expect(config).toMatchObject({
      POSTGRES_USER: "nuvitae",
      POSTGRES_DB: "nuvitae",
      NUVITAE_LOCAL_PLAY_MODE: "false",
      NUVITAE_COMMUNITY_COOKIE_SECURE: "true",
      NUVITAE_COMMUNITY_SESSION_TTL_SECONDS: "86400",
    });
    for (const key of [
      "POSTGRES_PASSWORD",
      "QUEUE_PASSWORD",
      "NUVITAE_COMMUNITY_ACCESS_SECRET",
      "NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET",
      "NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET",
    ]) {
      expect(config[key]).toMatch(/^[a-f0-9]{96}$/);
      expect(result.stdout).not.toContain(config[key]);
      expect(result.stderr).not.toContain(config[key]);
    }
    expect((await stat(configPath)).mode & 0o077).toBe(0);
    expect(
      readCommunityAuthConfig({ ...config, NODE_ENV: "production" }),
    ).toMatchObject({ cookieSecure: true, sessionTtlSeconds: 86400 });
    expect(
      readCommunityProductRuntimeConfig({
        ...config,
        NODE_ENV: "production",
        NUVITAE_PRIVATE_STORAGE_ROOT: "/var/lib/nuvitae/private",
        NUVITAE_PROVIDER_SESSION_ROOT:
          "/var/lib/nuvitae/private/provider-sessions",
      }),
    ).toMatchObject({
      privateStorageRoot: "/var/lib/nuvitae/private",
      providerSessionRoot: "/var/lib/nuvitae/private/provider-sessions",
    });
  });

  it("is idempotent and does not overwrite existing valid configuration", async () => {
    const { configPath } = await initializedConfig();
    const before = await readFile(configPath, "utf8");
    const result = await execFileAsync("sh", [bootstrapScript], {
      cwd: repositoryRoot,
      env: { ...process.env, NUVITAE_COMMUNITY_CONFIG_PATH: configPath },
    });

    expect(await readFile(configPath, "utf8")).toBe(before);
    expect(result.stdout).toContain("already initialized");
  });

  it("reveals only the configured owner access secret through the explicit helper", async () => {
    const { configPath } = await initializedConfig();
    const config = parseEnv(await readFile(configPath, "utf8"));
    const result = await execFileAsync("sh", [ownerSecretScript], {
      cwd: repositoryRoot,
      env: { ...process.env, NUVITAE_COMMUNITY_CONFIG_PATH: configPath },
    });

    expect(result.stdout).toContain(config.NUVITAE_COMMUNITY_ACCESS_SECRET);
    for (const key of [
      "POSTGRES_PASSWORD",
      "QUEUE_PASSWORD",
      "NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET",
      "NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET",
    ]) {
      expect(result.stdout).not.toContain(config[key]);
    }
    await expect(
      execFileAsync("sh", [ownerSecretScript], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          NUVITAE_COMMUNITY_CONFIG_PATH: join(
            tmpdir(),
            "nuvitae-community-uninitialized.env",
          ),
        },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("not initialized"),
    });
  });
});

describe("Community Compose exposure", () => {
  it("keeps Community traffic local without a device-auth callback port", async () => {
    const compose = await readFile(composePath, "utf8");

    expect(compose).toContain('- "127.0.0.1:3000:3000"');
    expect(compose).not.toContain('- "3000:3000"');
    expect(compose).not.toContain('- "3001:3001"');
    expect(compose).not.toContain("1455:3001");
    expect(compose).toContain('NUVITAE_LOCAL_PLAY_MODE: "false"');
    expect(serviceBlock(compose, "postgres")).not.toContain("\n    ports:");
    expect(serviceBlock(compose, "queue")).not.toContain("\n    ports:");
  });
});
