import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { processT201RunnerEvidence } from "../lib/t201-live-runner-evidence.mjs";
import {
  brokerStateEvidence,
  createT201BrokerExecutionState,
  recordCredentialRecovery,
  recordRefreshAttempt,
  recordRefreshRequired,
  recordTransportResult,
} from "../lib/t201-broker-execution-state.mjs";

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

function sanitizedFailure(
  runIdValue = runId,
  fixtureIdentifier = "T201-C02",
  primaryFailurePhase = "credential_recovery",
) {
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
    primary_failure_phase: primaryFailurePhase,
    safe_final_state: "transport_failure",
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    encrypted_state_preserved: true,
    callback_port_absent: true,
  };
}

test("broker failure at credential recovery retains only safe fixture identity", async () => {
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
  assert.equal(result.primary_failure_phase, "credential_recovery");
  assert.equal(JSON.stringify(result).includes("credential.json"), false);
  assert.equal(JSON.stringify(result).includes("/run/t199-key"), false);
  assert.equal(JSON.stringify(result).includes("access_token"), false);
  assert.equal(JSON.stringify(result).includes("refresh_token"), false);
  await fs.rm(directory, { recursive: true, force: true });
});

test("broker selects C03 through the matrix contract before credential recovery", async () => {
  await fs.mkdir("/tmp/t201-result", { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(
    "/tmp/t201-result/nuvitae-t201-broker-c03-",
  );
  await fs.chown(directory, process.geteuid(), process.getegid());
  const resultPath = path.join(directory, "result.json");
  const run = await runBroker({
    NUVITAE_T201_CASE_ID: "T201-C03",
    NUVITAE_T201_RUN_ID_HASH: runId,
    NUVITAE_T201_RESULT_PATH: resultPath,
  });
  const result = JSON.parse(run.stdout);
  assert.equal(run.code, 1);
  assert.equal(result.fixture_identifier, "T201-C03");
  assert.equal(result.primary_failure_phase, "credential_recovery");
  assert.equal(result.invocation_attempted, false);
  assert.equal(JSON.stringify(result).includes("credential.json"), false);
  await fs.rm(directory, { recursive: true, force: true });
});

test("broker phase attribution uses only fixed pre-operation phase names", async () => {
  const source = await fs.readFile(
    path.join(root, "t201-semantic-broker.mjs"),
    "utf8",
  );
  const expected = {
    matrixArtifactLoading: "loadSelectedArtifacts",
    promptConstruction: "buildT201Prompt",
    requestConstruction: "buildSemanticCodexRequest",
    localInputDiagnostics: "buildLocalInputDiagnostics",
    credentialRecovery: "recoverCredential",
    credentialRefresh: "maybeRefresh",
    accountIdentifierResolution: "accountIdentifierFromCredential",
    transportInvocation: "invokeCodexTransport",
    responseEvaluation: "evaluation =",
    credentialPostVerification: "const after = await recoverCredential",
    resultEmission: "await emit",
  };
  const phaseNames = [
    "result_channel_preparation",
    "matrix_artifact_loading",
    "prompt_construction",
    "request_construction",
    "golden_result_audit",
    "local_input_diagnostics",
    "credential_recovery",
    "credential_refresh",
    "account_identifier_resolution",
    "transport_invocation",
    "response_evaluation",
    "credential_post_verification",
    "result_emission",
    "complete",
  ];
  for (const phase of phaseNames)
    assert.match(source, new RegExp(`"${phase}"`));
  for (const [phase, operation] of Object.entries(expected)) {
    const assignment = source.indexOf(`currentPhase = BROKER_PHASES.${phase};`);
    assert.ok(assignment >= 0, phase);
    assert.ok(source.indexOf(operation, assignment) > assignment, phase);
  }
  const resultEmission = source.indexOf(
    "currentPhase = BROKER_PHASES.resultEmission;",
  );
  const complete = source.indexOf("currentPhase = BROKER_PHASES.complete;");
  assert.ok(resultEmission >= 0);
  assert.ok(complete > source.indexOf("await emit({", resultEmission));
  assert.deepEqual(
    [...source.matchAll(/currentPhase = ([^;]+);/g)].map((match) => match[1]),
    [
      "BROKER_PHASES.resultChannelPreparation",
      "BROKER_PHASES.resultChannelPreparation",
      "BROKER_PHASES.matrixArtifactLoading",
      "BROKER_PHASES.promptConstruction",
      "BROKER_PHASES.requestConstruction",
      "BROKER_PHASES.goldenResultAudit",
      "BROKER_PHASES.localInputDiagnostics",
      "BROKER_PHASES.credentialRecovery",
      "BROKER_PHASES.credentialRefresh",
      "BROKER_PHASES.accountIdentifierResolution",
      "BROKER_PHASES.transportInvocation",
      "BROKER_PHASES.responseEvaluation",
      "BROKER_PHASES.credentialPostVerification",
      "BROKER_PHASES.resultEmission",
      "BROKER_PHASES.complete",
    ],
  );
  assert.match(
    source,
    /primaryFailurePhase: error\.primary_failure_phase \?\? currentPhase/,
  );
  assert.match(
    source,
    /if \(typeof invocation\.raw_model_text === "string"\) \{\s+currentPhase = BROKER_PHASES\.responseEvaluation;/,
  );
});

test("execution state preserves only known partial state across every failure boundary", () => {
  const state = createT201BrokerExecutionState();
  assert.equal(brokerStateEvidence(state).encrypted_state_recovered, false);
  recordCredentialRecovery(state, 7);
  recordRefreshRequired(state, true);
  recordRefreshAttempt(state);
  recordTransportResult(state, {
    invocation_attempted: true,
    invocation_succeeded: false,
    safe_exact_http_status: null,
    response_protocol_valid: false,
  });
  assert.deepEqual(brokerStateEvidence(state), {
    encrypted_state_recovered: true,
    credential_generation_before: 7,
    refresh_required: true,
    refresh_attempted: true,
    refresh_succeeded: false,
    credential_generation_after: null,
    invocation_attempted: true,
    invocation_succeeded: false,
    exact_http_status: null,
    response_protocol_valid: false,
  });
});

test("runner preserves corrected transport phase and known partial state without secrets", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-partial-state-"),
  );
  const logsPath = path.join(directory, "partial.log");
  const state = createT201BrokerExecutionState();
  recordCredentialRecovery(state, 3);
  recordRefreshAttempt(state);
  recordTransportResult(state, {
    invocation_attempted: true,
    invocation_succeeded: false,
    response_protocol_valid: false,
  });
  await fs.writeFile(
    logsPath,
    `${JSON.stringify({ ...sanitizedFailure(runId, "T201-C02", "transport_invocation"), ...brokerStateEvidence(state) })}\n`,
  );
  const evidence = await processT201RunnerEvidence({
    evidencePath: path.join(directory, "evidence.json"),
    logsPath,
    runnerRunIdHash: runId,
    runnerStartedAt: startedAt,
    brokerExitCode: 1,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    caseId: "T201-C02",
  });
  assert.equal(evidence.primary_failure_phase, "transport_invocation");
  assert.equal(evidence.encrypted_state_recovered, true);
  assert.equal(evidence.credential_generation_before, 3);
  assert.equal(evidence.credential_generation_after, null);
  assert.equal(evidence.refresh_attempted, true);
  assert.equal(evidence.invocation_attempted, true);
  assert.equal(evidence.invocation_succeeded, false);
  assert.equal(evidence.exact_http_status, null);
  assert.equal(JSON.stringify(evidence).includes("access_token"), false);
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
  assert.equal(matching.primary_failure_phase, "credential_recovery");
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

test("success and failure envelopes derive fixture identity from the selected matrix case contract", async () => {
  const source = await fs.readFile(
    path.join(root, "t201-semantic-broker.mjs"),
    "utf8",
  );
  assert.match(
    source,
    /const selectedFixtureIdentifier = T201_MATRIX_CASE_IDS\.includes\(\s+process\.env\.NUVITAE_T201_CASE_ID,\s+\)/,
  );
  assert.match(source, /fixture_identifier: selectedFixtureIdentifier/);
  assert.match(
    source,
    /fixture_identifier: selectedFixtureIdentifier \?\? "not_evaluated"/,
  );
});
