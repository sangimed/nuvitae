import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { extractUserContext } from "../../apps/api/src/auth/user-context.js";
import { documentedImportProcessingDefaults } from "../../apps/api/src/config/import-processing-limits.js";
import { mapLimitOutcomeToHttpResponse } from "../../apps/api/src/import-resume/transport/http/limit-responses.js";
import { LocalAtomicImportLimitStore } from "../../apps/api/src/local-play/local-atomic-import-limit-store.js";
import { LocalPlayPrincipalMiddleware } from "../../apps/api/src/local-play/local-play-principal.middleware.js";

const execFileAsync = promisify(execFile);
const defaultOwner = "00000000-0000-4000-8000-000000000101";

interface DockerCall {
  args: string[];
  owner: string;
}

async function recordedRunner(): Promise<DockerCall[]> {
  // The recording executable never runs Docker, deletes resources or calls a
  // provider. Keep its tiny temporary evidence directory for inspection.
  const directory = await mkdtemp(join(tmpdir(), "nuvitae-batch-test-"));
  const calls = join(directory, "calls.jsonl");
  await writeFile(
    join(directory, "docker"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.BATCH_CALLS, JSON.stringify({args, owner: process.env.NUVITAE_LOCAL_PLAY_USER_ID || '${defaultOwner}'}) + '\\n');
if (args.includes('up') && args.includes('worker')) fs.writeFileSync(process.env.BATCH_MODE, process.env.NUVITAE_SEMANTIC_PROVIDER_MODE || 'production');
if (args.includes('printenv')) process.stdout.write(fs.readFileSync(process.env.BATCH_MODE, 'utf8') + '\\n');
`,
    { mode: 0o700 },
  );
  await execFileAsync("bash", ["scripts/local-play-e2e.sh"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      BATCH_CALLS: calls,
      BATCH_MODE: join(directory, "mode"),
    },
  });
  return (await readFile(calls, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as DockerCall);
}

describe("Local Play serial acceptance isolation", () => {
  it("admits the six-upload sequence while retaining each owner's rolling limit", async () => {
    const calls = await recordedRunner();
    const store = new LocalAtomicImportLimitStore();
    const now = new Date("2026-10-29T10:00:00Z");
    const owners: string[] = [];
    let serverOwner = defaultOwner;
    for (const call of calls) {
      if (
        call.args.includes("up") &&
        call.args.includes("api") &&
        !call.args.includes("--no-recreate")
      ) {
        serverOwner = call.owner;
      }
      if (
        !call.args.includes("playwright-test") ||
        !call.args.includes("run")
      ) {
        continue;
      }
      // The runner's persistence assertions must target the actual API owner.
      expect(call.owner).toBe(serverOwner);
      const pattern = call.args[call.args.indexOf("-g") + 1];
      const count = call.args.includes(
        "tests/browser/resume-export/import-to-pdf-fidelity.spec.ts",
      )
        ? 2
        : pattern === "real"
          ? 3
          : pattern === "no production semantic provider"
            ? 1
            : 0;
      for (let upload = 0; upload < count; upload += 1) {
        const result = await store.executeAtomically({
          kind: "reserve",
          ownerUserId: serverOwner,
          now,
          limits: documentedImportProcessingDefaults,
        });
        expect(result.kind).toBe("reserved");
        owners.push(serverOwner);
      }
    }
    expect(owners).toHaveLength(6);
    expect(owners.slice(0, 4)).toEqual(Array(4).fill(owners[0]));
    expect(owners.slice(4)).toEqual(Array(2).fill(owners[4]));
    expect(owners[4]).not.toBe(owners[0]);

    // Use the same store and time: selecting another server owner never clears
    // the first owner's history. Its fifth attempt succeeds; its sixth fails.
    const reserve = (ownerUserId: string) =>
      store.executeAtomically({
        kind: "reserve",
        ownerUserId,
        now,
        limits: documentedImportProcessingDefaults,
      });
    expect((await reserve(owners[0]!)).kind).toBe("reserved");
    const denied = await reserve(owners[0]!);
    expect(denied).toMatchObject({
      kind: "denied",
      outcome: { code: "upload_attempt_limit", retryAfterSeconds: 600 },
    });
    if (denied.kind !== "denied") throw new Error("expected rate limiting");
    expect(mapLimitOutcomeToHttpResponse(denied.outcome)).toMatchObject({
      statusCode: 429,
      code: "rate_limited",
      retryAfterSeconds: 600,
    });
    for (let attempt = 2; attempt < 5; attempt += 1) {
      expect((await reserve(owners[4]!)).kind).toBe("reserved");
    }
    expect(await reserve(owners[4]!)).toMatchObject({
      kind: "denied",
      outcome: { code: "upload_attempt_limit", retryAfterSeconds: 600 },
    });
  });

  it("uses the same server-configured owner for API and browser persistence checks", async () => {
    const compose = await readFile("compose.local.yml", "utf8");
    const binding =
      "${NUVITAE_LOCAL_PLAY_USER_ID:-00000000-0000-4000-8000-000000000101}";
    expect(compose.includes(`NUVITAE_LOCAL_PLAY_USER_ID: "${binding}"`)).toBe(
      true,
    );
    expect(compose.includes(`      LOCAL_PLAY_USER_ID: "${binding}"`)).toBe(
      true,
    );
  });

  it("cannot select the configured batch owner through browser input", () => {
    vi.stubEnv("NUVITAE_LOCAL_PLAY_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "NUVITAE_LOCAL_PLAY_USER_ID",
      "00000000-0000-4000-8000-000000000102",
    );
    vi.stubEnv("NUVITAE_PRIVATE_STORAGE_ROOT", "/tmp/nuvitae-batch-private");
    vi.stubEnv(
      "NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET",
      "test-only-local-play-signing-secret",
    );
    vi.stubEnv(
      "NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET",
      "test-only-local-play-session-secret",
    );
    try {
      const request = {
        headers: { "x-user-id": defaultOwner },
        query: { ownerUserId: defaultOwner },
        body: { ownerUserId: defaultOwner },
      };
      new LocalPlayPrincipalMiddleware().use(request, {}, () => undefined);
      expect(extractUserContext(request)).toMatchObject({
        state: "authenticated",
        userId: "00000000-0000-4000-8000-000000000102",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
