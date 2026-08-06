import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { updateMatrixEvidenceForCase } from "../lib/t201-live-runner-evidence.mjs";

const execFileAsync = promisify(execFile);
const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMMUTABLE_IMAGE = `sha256:${"0".repeat(64)}`;

async function renderedService(serviceName) {
  const { stdout } = await execFileAsync(
    "docker",
    ["compose", "config", "--format", "json"],
    {
      cwd: spikeRoot,
      env: { ...process.env, NUVITAE_T201_IMMUTABLE_IMAGE: IMMUTABLE_IMAGE },
      maxBuffer: 1024 * 1024,
    },
  );
  return JSON.parse(stdout).services[serviceName];
}

const successfulMetrics = Object.freeze({
  schema_valid: true,
  expected_section_recall: 1,
  expected_item_recall: 1,
  exact_fact_recall: 1,
  high_priority_fact_recall: 1,
  unsupported_fact_count: 0,
  forbidden_inference_count: 0,
  missing_evidence_count: 0,
  invalid_evidence_count: 0,
  grounding_pass: true,
  no_invention_pass: true,
  parsing_pass: true,
});

function successfulCaseEvidence(caseId) {
  return {
    evidence_classification: "live_t201_semantic_parsing",
    fixture_identifier: caseId,
    fixture_classified_as_synthetic: true,
    evaluation_metrics: successfulMetrics,
    ambiguity_handling_pass: true,
    case_pass: true,
    t201_complete: caseId !== "T201-C02",
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    encrypted_state_preserved: true,
    broker_removed: true,
  };
}

async function withMatrixFixture(run) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-runner-contract-"),
  );
  const evidencePath = path.join(root, "evidence.json");
  const matrixPath = path.join(root, "matrix.json");
  await fs.copyFile(
    path.join(spikeRoot, "evidence/codex-direct-oauth-t201-matrix.json"),
    matrixPath,
  );
  try {
    await run({ root, evidencePath, matrixPath });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeEvidence(evidencePath, evidence) {
  await fs.writeFile(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    { mode: 0o600 },
  );
}

test("rendered t201-semantic Compose service runs as UID/GID 1000:1000 with the bounded security posture intact", async () => {
  const service = await renderedService("t201-semantic");
  assert.equal(service.user, "1000:1000");
  assert.equal(service.pull_policy, "never");
  assert.equal(service.read_only, true);
  assert.deepEqual(service.cap_drop ?? [], ["ALL"]);
  assert.deepEqual(service.security_opt ?? [], ["no-new-privileges:true"]);
  assert.deepEqual(service.cap_add ?? [], []);
  assert.notEqual(service.privileged, true);
  assert.equal(Number(service.pids_limit), 128);
  assert.equal(Number(service.mem_limit), 192 * 1024 * 1024);
  assert.equal(Number(service.cpus), 0.5);
});

test("rendered Compose keeps the credential diagnostic isolated and the result reader credential-free and user-unmodified", async () => {
  const diagnostic = await renderedService("t201-credential-recovery-diagnostic");
  assert.equal(diagnostic.user, "100:101");
  assert.equal(diagnostic.network_mode, "none");
  const reader = await renderedService("t201-result-reader");
  assert.equal(reader.user == null, true);
  assert.equal(reader.network_mode, "none");
  const readerTargets = (reader.volumes ?? []).map((mount) => mount.target);
  assert.equal(readerTargets.includes("/run/t199-key"), false);
  assert.equal(readerTargets.includes("/spike/credentials"), false);
});

test("non-C02 matrix dispatch never invokes the C02 updater and preserves a C04-style successful semantic result", async () => {
  await withMatrixFixture(async ({ evidencePath, matrixPath }) => {
    await writeEvidence(evidencePath, successfulCaseEvidence("T201-C04"));
    const matrixBefore = await fs.readFile(matrixPath, "utf8");
    const dispatched = await updateMatrixEvidenceForCase({
      evidencePath,
      matrixPath,
      caseId: "T201-C04",
    });
    assert.equal(dispatched, null);
    assert.equal(await fs.readFile(matrixPath, "utf8"), matrixBefore);
  });
});

test("C02 still invokes its matrix updater and writes approved safe metrics", async () => {
  await withMatrixFixture(async ({ evidencePath, matrixPath }) => {
    await writeEvidence(evidencePath, successfulCaseEvidence("T201-C02"));
    const updated = await updateMatrixEvidenceForCase({
      evidencePath,
      matrixPath,
      caseId: "T201-C02",
    });
    assert.equal(updated.matrix_state, "partially_live_evaluated");
    assert.equal(updated.matrix_pass, false);
    const target = updated.cases.find((item) => item.case_id === "T201-C02");
    assert.equal(target.pass, true);
    assert.equal(target.safe_metrics.schema_valid, true);
    assert.equal(target.safe_metrics.parsing_pass, true);
    assert.equal(target.privacy_safe, true);
    assert.equal(target.credential_isolation, true);
    assert.equal(JSON.stringify(target).includes("raw_model_output"), false);
  });
});

test("C02 matrix update failure still propagates and fails the runner", async () => {
  await withMatrixFixture(async ({ evidencePath, matrixPath }) => {
    const completed = successfulCaseEvidence("T201-C02");
    completed.t201_complete = true;
    await writeEvidence(evidencePath, completed);
    await assert.rejects(
      () =>
        updateMatrixEvidenceForCase({
          evidencePath,
          matrixPath,
          caseId: "T201-C02",
        }),
      /invalid_c02_evidence_for_matrix_update/,
    );

    await writeEvidence(evidencePath, successfulCaseEvidence("T201-C04"));
    await assert.rejects(
      () =>
        updateMatrixEvidenceForCase({
          evidencePath,
          matrixPath,
          caseId: "T201-C02",
        }),
      /invalid_c02_evidence_for_matrix_update/,
    );
  });
});

test("live runner dispatches matrix updates through the case-gated wrapper and keeps the C02 fail-closed tail", async () => {
  const runner = await fs.readFile(
    path.join(spikeRoot, "run-t201-live-execute.sh"),
    "utf8",
  );
  assert.equal(runner.includes("updateC02MatrixEvidence"), false);
  assert.equal(runner.includes("updateMatrixEvidenceForCase"), true);
  assert.equal(
    runner.includes(
      'node --input-type=module - "$evidence" "evidence/codex-direct-oauth-t201-matrix.json" "$case_id"',
    ),
    true,
  );
  assert.equal(runner.includes("matrix_status=$?"), true);
  assert.equal(
    runner.includes('if [ "$matrix_status" -ne 0 ]; then runner_status=1; fi'),
    true,
  );
});
