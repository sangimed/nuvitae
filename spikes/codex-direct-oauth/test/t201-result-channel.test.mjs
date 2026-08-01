import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inspectBrokerResultChannel, verifyPreparedResultDirectory, writeAtomicBrokerResult } from "../lib/t201-broker-result-channel.mjs";
import { processT201RunnerEvidence } from "../lib/t201-live-runner-evidence.mjs";

const runId = "a".repeat(32);
const startedAt = "2026-08-01T12:00:00.000Z";
function result(overrides = {}) {
  return {
    evidence_classification: "live_t201_semantic_parsing", observation_timestamp: "2026-08-01T12:00:01.000Z", runner_run_id_hash: runId,
    fixture_identifier: "T201-C02", invocation_attempted: false, invocation_succeeded: false, parsing_pass: false,
    raw_credentials_exposed_to_parent: false, account_identifier_exposed_to_parent: false, raw_model_response_persisted: false,
    encrypted_state_preserved: true, callback_port_absent: true, ...overrides,
  };
}
async function channel({ resultText = "", stdout = "", stderr = "", exitCode = 1 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nuvitae-t201-channel-"));
  const resultPath = path.join(dir, "result.json"); const stdoutPath = path.join(dir, "stdout"); const stderrPath = path.join(dir, "stderr");
  await Promise.all([fs.writeFile(resultPath, resultText), fs.writeFile(stdoutPath, stdout), fs.writeFile(stderrPath, stderr)]);
  return { dir, resultPath, stdoutPath, stderrPath, exitCode, inspected: await inspectBrokerResultChannel({ resultPath, stdoutPath, stderrPath, brokerExitCode: exitCode }) };
}

test("result channel accepts one JSON object with or without a final newline", async () => {
  for (const suffix of ["", "\n"]) {
    const value = await channel({ resultText: `${JSON.stringify(result())}${suffix}`, stdout: `${JSON.stringify(result())}\n` });
    assert.equal(value.inspected.result_state, "valid_broker_result"); assert.equal(value.inspected.stdout_state, "single_json_stdout");
    await fs.rm(value.dir, { recursive: true, force: true });
  }
});

test("result channel distinguishes empty, crash, module-load, malformed, and mixed stdout failures", async () => {
  const cases = [
    [{}, "broker_crash"],
    [{ stderr: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module", exitCode: 1 }, "module_load_failure"],
    [{ resultText: "{not-json}", exitCode: 1 }, "malformed_json_result"],
    [{ stdout: "diagnostic before\n{}\ndiagnostic after\n", exitCode: 0 }, "mixed_stdout_result"],
  ];
  for (const [input, expected] of cases) {
    const value = await channel(input); assert.equal(value.inspected.infrastructure_category, expected); await fs.rm(value.dir, { recursive: true, force: true });
  }
});

test("valid sanitized failure result survives non-zero exit without semantic metrics", async () => {
  const value = await channel({ resultText: `${JSON.stringify(result())}\n`, stdout: `${JSON.stringify(result())}\n`, exitCode: 1 });
  const evidencePath = path.join(value.dir, "evidence.json");
  const evidence = await processT201RunnerEvidence({
    evidencePath, logsPath: "/dev/null", resultPath: value.resultPath, stdoutPath: value.stdoutPath, stderrPath: value.stderrPath,
    runnerRunIdHash: runId, runnerStartedAt: startedAt, brokerExitCode: 1, brokerRemoved: true, callbackPortAbsent: true,
    secretScanResult: "passed", logSecretScanResult: "passed", caseId: "T201-C02",
  });
  assert.equal(evidence.evidence_schema_valid, true); assert.equal(evidence.invocation_attempted, false); assert.equal(evidence.semantic_quality_evaluated, false);
  assert.equal(evidence.t201_complete, false); await fs.rm(value.dir, { recursive: true, force: true });
});

test("result artifact writer rejects paths outside the disposable broker result mount", async () => {
  await assert.rejects(() => writeAtomicBrokerResult(result(), "/var/tmp/not-a-broker-result.json"), /invalid_broker_result_path/);
});

test("prepared private result directory supports 0600 temporary write, fsync, atomic rename, parent read, and cleanup", async () => {
  await fs.mkdir("/tmp/t201-result", { recursive: true, mode: 0o700 });
  const dir = await fs.mkdtemp("/tmp/t201-result/private-");
  const resultPath = path.join(dir, "result.json");
  await fs.chmod(dir, 0o700);
  const topology = await verifyPreparedResultDirectory(resultPath);
  assert.equal(topology.mode, 0o700);
  await writeAtomicBrokerResult(result(), resultPath);
  assert.equal((await fs.stat(resultPath)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await fs.readFile(resultPath, "utf8")), result());
  await fs.rm(resultPath);
  await assert.rejects(() => fs.stat(resultPath));
  await fs.rm(dir, { recursive: true, force: true });
});

test("prepared result directory rejects read-open ownership modes before the broker fabricates metrics", async () => {
  await fs.mkdir("/tmp/t201-result", { recursive: true, mode: 0o700 });
  const dir = await fs.mkdtemp("/tmp/t201-result/reject-");
  const resultPath = path.join(dir, "result.json");
  await fs.chmod(dir, 0o733);
  await assert.rejects(() => verifyPreparedResultDirectory(resultPath), /result_artifact_verify_directory_mode_EPERM/);
  await fs.rm(dir, { recursive: true, force: true });
});
