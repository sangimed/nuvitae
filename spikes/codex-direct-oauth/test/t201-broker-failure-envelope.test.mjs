import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { processT201RunnerEvidence } from "../lib/t201-live-runner-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = "b".repeat(32);
const startedAt = "2026-08-01T12:00:00.000Z";

function runBroker(env) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["t201-semantic-broker.mjs"], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      }),
    );
  });
}

function sanitizedFailure(runIdValue = runId, fixtureIdentifier = "T201-C02") {
  return {
    evidence_classification: "live_t201_semantic_parsing",
    observation_timestamp: "2026-08-01T12:00:01.000Z",
    runner_run_id_hash: runIdValue,
    fixture_identifier: fixtureIdentifier,
    invocation_attempted: false,
    invocation_succeeded: false,
    encrypted_state_recovered: false,
    parsing_pass: false,
    primary_failure_category: "transport_failure",
    primary_failure_phase: "safe_unknown_phase",
    safe_final_state: "transport_failure",
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    encrypted_state_preserved: true,
    callback_port_absent: true,
  };
}

test("broker failure after T201-C02 selection and before credential recovery retains only safe fixture identity", async () => {
  await fs.mkdir("/tmp/t201-result", { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(
    "/tmp/t201-result/nuvitae-t201-broker-failure-",
  );
  await fs.chown(directory, process.geteuid(), process.getegid());
  const resultPath = path.join(directory, "result.json");
  const run = await runBroker({
    NUVITAE_T201_CASE_ID: "T201-C02",
    NUVITAE_T201_RUN_ID_HASH: runId,
    NUVITAE_T201_RESULT_PATH: resultPath,
  });
  const result = JSON.parse(run.stdout);
  assert.equal(run.code, 1);
  assert.equal(result.fixture_identifier, "T201-C02");
  assert.equal(result.encrypted_state_recovered, false);
  assert.equal(result.invocation_attempted, false);
  assert.equal(result.primary_failure_category, "transport_failure");
  assert.equal(result.primary_failure_phase, "safe_unknown_phase");
  assert.equal(JSON.stringify(result).includes("credential.json"), false);
  assert.equal(JSON.stringify(result).includes("/run/t199-key"), false);
  assert.equal(JSON.stringify(result).includes("access_token"), false);
  assert.equal(JSON.stringify(result).includes("refresh_token"), false);
  await fs.rm(directory, { recursive: true, force: true });
});

test("runner accepts matching sanitized failures, preserves their classification, and rejects mismatched fixture identity", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-failure-evidence-"),
  );
  const matchingPath = path.join(directory, "matching.json");
  const matchingLogs = path.join(directory, "matching.log");
  await fs.writeFile(matchingLogs, `${JSON.stringify(sanitizedFailure())}\n`);
  const matching = await processT201RunnerEvidence({
    evidencePath: matchingPath,
    logsPath: matchingLogs,
    runnerRunIdHash: runId,
    runnerStartedAt: startedAt,
    brokerExitCode: 1,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    caseId: "T201-C02",
  });
  assert.equal(matching.evidence_schema_valid, true);
  assert.equal(matching.primary_failure_category, "transport_failure");
  assert.equal(matching.safe_final_state, "transport_failure");

  const mismatchedLogs = path.join(directory, "mismatched.log");
  await fs.writeFile(
    mismatchedLogs,
    `${JSON.stringify(sanitizedFailure(runId, "T201-C03"))}\n`,
  );
  const mismatched = await processT201RunnerEvidence({
    evidencePath: path.join(directory, "mismatched.json"),
    logsPath: mismatchedLogs,
    runnerRunIdHash: runId,
    runnerStartedAt: startedAt,
    brokerExitCode: 1,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    caseId: "T201-C02",
  });
  assert.equal(mismatched.evidence_schema_valid, false);
  assert.deepEqual(mismatched.evidence_rejection_reasons, [
    "fixture_identifier_mismatch",
  ]);
  await fs.rm(directory, { recursive: true, force: true });
});

test("success and failure envelopes derive the same C02 fixture identity from the selected case contract", async () => {
  const source = await fs.readFile(
    path.join(root, "t201-semantic-broker.mjs"),
    "utf8",
  );
  assert.match(
    source,
    /const selectedFixtureIdentifier =\s+process\.env\.NUVITAE_T201_CASE_ID === CASE_ID \? CASE_ID : null/,
  );
  assert.match(source, /fixture_identifier: CASE_ID/);
  assert.match(
    source,
    /fixture_identifier: selectedFixtureIdentifier \?\? "not_evaluated"/,
  );
});
