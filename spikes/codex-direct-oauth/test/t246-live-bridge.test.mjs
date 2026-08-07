import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseT246AttemptArguments } from "../lib/t246-authorization.mjs";
import { runT246LiveBridge } from "../lib/t246-live-bridge.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const IMAGE = `sha256:${"d".repeat(64)}`;

const c01Args = [
  "--campaign",
  "T246-C01",
  "--attempt",
  "A01",
  "--semantic-case",
  "T246-C01",
  "--fixture",
  "tests/fixtures/resumes/anonymous-french-resume.pdf",
  "--manifest",
  "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c01.manifest.json",
  "--evidence",
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json",
  "--max-broker-runs",
  "1",
  "--max-semantic-backend-requests",
  "1",
  "--automatic-retries",
  "0",
];

function fakes() {
  const calls = {
    prepareImage: 0,
    preflight: 0,
    verifyImage: 0,
    execute: 0,
  };
  let executeEnv = null;
  let transcriptSeen = null;
  const deps = {
    prepareImage: async () => {
      calls.prepareImage += 1;
      return {
        reference: IMAGE,
        identity_hash: "i".repeat(64),
        declared_runtime_user_hash: "u".repeat(64),
        build_tag_hash: "b".repeat(64),
      };
    },
    runPreflight: async () => {
      calls.preflight += 1;
      return {
        success: true,
        diagnostic: "credential_free_exact_live_service_preflight",
        semantic_invocation_attempted: false,
        preserved_credentials_mounted: false,
      };
    },
    verifyImage: async () => {
      calls.verifyImage += 1;
      return {
        reference: IMAGE,
        identity_hash: "i".repeat(64),
        declared_runtime_user_hash: "u".repeat(64),
      };
    },
    executeDocker: async () => ({
      process_started: true,
      timed_out: false,
      exit_code: 0,
      stdout: "",
      stderr: "",
    }),
    spawnExecute: async ({ env }) => {
      calls.execute += 1;
      executeEnv = env;
      transcriptSeen = await fs.readFile(
        env.NUVITAE_T246_TRANSCRIPT_PATH,
        "utf8",
      );
      return 0;
    },
    writeTranscript: async ({ lines }) => {
      const directory = await fs.mkdtemp(
        path.join("/tmp", "nuvitae-t246-bridge-transcript-"),
      );
      const transcriptPath = path.join(directory, "transcript.txt");
      await fs.writeFile(transcriptPath, `${lines.join("\n")}\n`, {
        mode: 0o600,
      });
      return {
        transcriptPath,
        cleanup: () => fs.rm(directory, { recursive: true, force: true }),
      };
    },
    entrypointExists: async () => undefined,
    environment: {},
  };
  return {
    calls,
    deps,
    env: () => executeEnv,
    transcriptSeen: () => transcriptSeen,
  };
}

test("T246 live bridge reaches the execute entrypoint exactly once for C01 with the pinned contract", async () => {
  const invocation = parseT246AttemptArguments(c01Args);
  const { calls, deps, env, transcriptSeen } = fakes();
  const outcome = await runT246LiveBridge({
    root,
    invocation,
    mode: "live",
    ...deps,
  });
  assert.equal(outcome.success, true);
  assert.equal(outcome.phase, "live_execution");
  assert.equal(outcome.exitCode, 0);
  assert.equal(calls.prepareImage, 1);
  assert.equal(calls.preflight, 1);
  assert.equal(calls.verifyImage, 1);
  assert.equal(calls.execute, 1);
  const e = env();
  assert.equal(e.NUVITAE_T246_CAMPAIGN_ID, "T246-C01");
  assert.equal(e.NUVITAE_T246_ATTEMPT_ID, "A01");
  assert.equal(e.NUVITAE_T246_CASE_ID, "T246-C01");
  assert.equal(
    e.NUVITAE_T246_FIXTURE_PATH,
    path.join(repo, "tests/fixtures/resumes/anonymous-french-resume.pdf"),
  );
  assert.equal(
    e.NUVITAE_T246_MANIFEST_PATH,
    "fixtures/t246-matrix/t246-c01.manifest.json",
  );
  assert.equal(
    e.NUVITAE_T246_EVIDENCE_PATH,
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json",
  );
  assert.equal(e.NUVITAE_T246_FIXTURE_SHA256.length, 64);
  assert.equal(e.NUVITAE_T246_TRANSCRIPT_SHA256.length, 64);
  assert.equal(e.NUVITAE_T246_MANIFEST_SHA256.length, 64);
  assert.equal(e.NUVITAE_T246_MAX_BROKER_RUNS, "1");
  assert.equal(e.NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS, "1");
  assert.equal(e.NUVITAE_T246_AUTOMATIC_RETRIES, "0");
  assert.equal(e.NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL, undefined);
  assert.equal(e.NUVITAE_T246_IMMUTABLE_IMAGE, IMAGE);
  assert.match(transcriptSeen(), /Léa Dupont-Exemple/);
});

test("T246 preflight bridge runs the credential-free rehearsal and stops before credentials", async () => {
  const invocation = parseT246AttemptArguments(c01Args);
  const { calls, deps, env } = fakes();
  const outcome = await runT246LiveBridge({
    root,
    invocation,
    mode: "preflight",
    ...deps,
  });
  assert.equal(outcome.success, true);
  assert.equal(outcome.phase, "credential_free_rehearsal");
  assert.equal(calls.execute, 1);
  assert.equal(env().NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL, "1");
});

test("T246 bridge fails closed when the credential-free preflight fails", async () => {
  const invocation = parseT246AttemptArguments(c01Args);
  const { deps, calls } = fakes();
  const outcome = await runT246LiveBridge({
    root,
    invocation,
    mode: "live",
    ...deps,
    runPreflight: async () => ({
      success: false,
      first_failure_operation: "x",
    }),
  });
  assert.equal(outcome.success, false);
  assert.equal(outcome.phase, "credential_free_preflight");
  assert.equal(calls.execute, 0);
});

test("T246 bridge rejects a NOT_AUTHORIZED case before any image or execute step", async () => {
  const c04Args = [
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
  const invocation = parseT246AttemptArguments(c04Args);
  const { deps, calls } = fakes();
  await assert.rejects(
    runT246LiveBridge({ root, invocation, mode: "live", ...deps }),
    (error) => error.code === "t246_not_authorized",
  );
  assert.equal(calls.prepareImage, 0);
  assert.equal(calls.execute, 0);
});
