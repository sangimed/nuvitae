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
  "T246-C06",
  "--attempt",
  "A01",
  "--semantic-case",
  "T246-C06",
  "--fixture",
  "tests/fixtures/resumes/anonymous-ambiguous-resume.pdf",
  "--manifest",
  "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c06.manifest.json",
  "--evidence",
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c06-a01-semantic-parsing.json",
  "--max-broker-runs",
  "1",
  "--max-semantic-backend-requests",
  "1",
  "--automatic-retries",
  "0",
];

const c07Args = [
  "--campaign",
  "T246-C07",
  "--attempt",
  "A01",
  "--semantic-case",
  "T246-C07",
  "--fixture",
  "tests/fixtures/resumes/anonymous-prompt-instruction-resume.docx",
  "--manifest",
  "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c07.manifest.json",
  "--evidence",
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c07-a01-semantic-parsing.json",
  "--max-broker-runs",
  "1",
  "--max-semantic-backend-requests",
  "1",
  "--automatic-retries",
  "0",
];

const c08Args = [
  "--campaign",
  "T246-C08",
  "--attempt",
  "A01",
  "--semantic-case",
  "T246-C08",
  "--fixture",
  "tests/fixtures/resumes/anonymous-malformed-resume.pdf",
  "--manifest",
  "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c08.recovery-manifest.json",
  "--evidence",
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c08-a01-recovery.json",
  "--max-broker-runs",
  "0",
  "--max-semantic-backend-requests",
  "0",
  "--automatic-retries",
  "0",
];

test("T246 live mode refuses consumed C07 before any operator gate or live step", async () => {
  const result = await runRunner(["--mode", "live", ...c07Args]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /t246_attempt_consumed/);
  assert.doesNotMatch(result.stderr, /credential/);
});

test("T246 live mode refuses the consumed C06-A01 attempt before any live step", async () => {
  const result = await runRunner(["--mode", "live", ...baseArgs]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /t246_attempt_consumed/);
  assert.doesNotMatch(result.stderr, /credential/);
});

test("T246 preflight mode refuses consumed C08 before any live step", async () => {
  const result = await runRunner(["--mode", "preflight", ...c08Args]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /t246_attempt_consumed/);
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
  assert.match(result.stdout, /T246 offline case check passed: T246-C06/);
  assert.match(result.stdout, /live_request_required=true/);
  assert.match(result.stdout, /authorized=false/);
});
