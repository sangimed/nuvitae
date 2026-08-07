import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runRunner(args) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "t246-live-runner.mjs"), ...args],
      {
        stdio: "pipe",
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const baseArgs = [
  "--campaign",
  "T246-C04",
  "--attempt",
  "A01",
  "--semantic-case",
  "T246-C04",
  "--fixture",
  "tests/fixtures/resumes/anonymous-bilingual-resume.pdf",
  "--manifest",
  "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c04.manifest.json",
  "--evidence",
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c04-a01-semantic-parsing.json",
  "--max-broker-runs",
  "1",
  "--max-semantic-backend-requests",
  "1",
  "--automatic-retries",
  "0",
];

test("T246 live mode stops before any live step because the registry is NOT_AUTHORIZED", async () => {
  const result = await runRunner(["--mode", "live", ...baseArgs]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /t246_not_authorized/);
  assert.doesNotMatch(result.stderr, /credential/);
});

test("T246 preflight mode stops before any live step for a NOT_AUTHORIZED case", async () => {
  const result = await runRunner(["--mode", "preflight", ...baseArgs]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /t246_not_authorized/);
  assert.doesNotMatch(result.stderr, /credential/);
});

test("T246 runner rejects an unknown mode", async () => {
  const result = await runRunner(["--mode", "bogus", ...baseArgs]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /t246_mode_required/);
});

test("T246 runner no longer contains the inert live-path terminal branch", async () => {
  const source = await fs.readFile(
    new URL("../t246-live-runner.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("t246_live_path_not_reachable"), false);
  assert.match(source, /runT246LiveBridge/);
});

test("T246 offline mode verifies the prepared case deterministically", async () => {
  const result = await runRunner(["--mode", "offline", ...baseArgs]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /T246 offline case check passed: T246-C04/);
  assert.match(result.stdout, /live_request_required=true/);
  assert.match(result.stdout, /authorized=false/);
});
