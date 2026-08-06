import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  consolidateT201MatrixEvidence,
  selectT201AuthoritativeEvidenceFiles,
  updateMatrixEvidenceForCase,
} from "../lib/t201-live-runner-evidence.mjs";

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
    safe_final_state: "complete",
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    encrypted_state_preserved: true,
    broker_removed: true,
  };
}

async function withMatrixFixture(run, { forcePartialCase } = {}) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-runner-contract-"),
  );
  const evidencePath = path.join(root, "evidence.json");
  const matrixPath = path.join(root, "matrix.json");
  await fs.copyFile(
    path.join(spikeRoot, "evidence/codex-direct-oauth-t201-matrix.json"),
    matrixPath,
  );
  if (forcePartialCase) {
    const matrix = JSON.parse(await fs.readFile(matrixPath, "utf8"));
    const target = matrix.cases.find(
      (item) => item.case_id === forcePartialCase,
    );
    assert.ok(target);
    target.pass = false;
    target.safe_metrics = null;
    await fs.writeFile(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
  }
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

async function withTempRepo(run) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-consolidation-"),
  );
  const spikeDir = path.join(root, "spikes", "codex-direct-oauth");
  const evidenceDir = path.join(spikeDir, "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });
  const matrixPath = path.join(evidenceDir, "codex-direct-oauth-t201-matrix.json");
  const registryPath = path.join(spikeDir, "campaign-b-authorizations.json");
  await fs.copyFile(
    path.join(spikeRoot, "evidence/codex-direct-oauth-t201-matrix.json"),
    matrixPath,
  );
  await fs.copyFile(
    path.join(spikeRoot, "campaign-b-authorizations.json"),
    registryPath,
  );
  try {
    await run({ root, spikeDir, evidenceDir, matrixPath, registryPath });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const AUTHORITATIVE_EVIDENCE_FILES = Object.freeze([
  "codex-direct-oauth-t201-c02-b13-semantic-parsing.json",
  "codex-direct-oauth-t201-c03-b03-semantic-parsing.json",
  "codex-direct-oauth-t201-c04-b03-semantic-parsing.json",
  "codex-direct-oauth-t201-c05-b01-semantic-parsing.json",
  "codex-direct-oauth-t201-c06-b01-semantic-parsing.json",
]);

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

test("matrix dispatch updates any T201 case entry and keeps the aggregate incomplete until every case passes", async () => {
  await withMatrixFixture(
    async ({ evidencePath, matrixPath }) => {
      await writeEvidence(evidencePath, successfulCaseEvidence("T201-C04"));
      const updated = await updateMatrixEvidenceForCase({
        evidencePath,
        matrixPath,
        caseId: "T201-C04",
      });
      assert.notEqual(updated, null);
      const target = updated.cases.find((item) => item.case_id === "T201-C04");
      assert.equal(target.pass, true);
      assert.equal(target.safe_metrics.schema_valid, true);
      assert.equal(target.safe_metrics.parsing_pass, true);
      assert.equal(target.privacy_safe, true);
      assert.equal(target.credential_isolation, true);
      assert.equal(JSON.stringify(target).includes("raw_model_output"), false);
      assert.equal(updated.matrix_pass, false);
      assert.equal(updated.matrix_state, "partially_live_evaluated");
    },
    { forcePartialCase: "T201-C06" },
  );
});

test("matrix dispatch never mutates the aggregate for unknown case identifiers", async () => {
  await withMatrixFixture(async ({ evidencePath, matrixPath }) => {
    await writeEvidence(evidencePath, successfulCaseEvidence("T201-C04"));
    const matrixBefore = await fs.readFile(matrixPath, "utf8");
    const dispatched = await updateMatrixEvidenceForCase({
      evidencePath,
      matrixPath,
      caseId: "T201-C99",
    });
    assert.equal(dispatched, null);
    assert.equal(await fs.readFile(matrixPath, "utf8"), matrixBefore);
  });
});

test("C02 still invokes its matrix updater and writes approved safe metrics", async () => {
  await withMatrixFixture(
    async ({ evidencePath, matrixPath }) => {
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
    },
    { forcePartialCase: "T201-C06" },
  );
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

test("matrix dispatch flips the aggregate to complete when the last mandatory case passes", async () => {
  await withMatrixFixture(
    async ({ evidencePath, matrixPath }) => {
      await writeEvidence(evidencePath, successfulCaseEvidence("T201-C06"));
      const updated = await updateMatrixEvidenceForCase({
        evidencePath,
        matrixPath,
        caseId: "T201-C06",
      });
      assert.equal(updated.matrix_pass, true);
      assert.equal(updated.matrix_state, "all_cases_live_passed");
      for (const item of updated.cases) assert.equal(item.pass, true);
    },
    { forcePartialCase: "T201-C06" },
  );
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

test("authoritative attempt selection keeps exactly one passing authorized attempt per case", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-selection-"),
  );
  try {
    await fs.mkdir(path.join(root, "evidence"), { recursive: true });
    const passingPath = path.join(root, "evidence", "b01.json");
    const failedPath = path.join(root, "evidence", "b02.json");
    await writeEvidence(passingPath, successfulCaseEvidence("T201-C05"));
    await writeEvidence(failedPath, {
      ...successfulCaseEvidence("T201-C05"),
      case_pass: false,
      safe_final_state: "transport_failure",
      t201_complete: false,
      evaluation_metrics: { ...successfulMetrics, parsing_pass: false },
    });
    const registry = {
      schema_version: 1,
      authorized_attempts: [
        {
          campaign: "T201-C05-B",
          attempt: "B01",
          semantic_case: "T201-C05",
          evidence: "evidence/b01.json",
        },
        {
          campaign: "T201-C05-B",
          attempt: "B02",
          semantic_case: "T201-C05",
          evidence: "evidence/b02.json",
        },
      ],
    };
    const selected = await selectT201AuthoritativeEvidenceFiles({
      registry,
      repoRoot: root,
    });
    assert.equal(selected.size, 1);
    assert.equal(selected.get("T201-C05").attempt, "B01");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("authoritative attempt selection fails closed on multiple passing attempts for one case", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-ambiguous-"),
  );
  try {
    await fs.mkdir(path.join(root, "evidence"), { recursive: true });
    await writeEvidence(
      path.join(root, "evidence", "b01.json"),
      successfulCaseEvidence("T201-C05"),
    );
    await writeEvidence(
      path.join(root, "evidence", "b02.json"),
      successfulCaseEvidence("T201-C05"),
    );
    const registry = {
      schema_version: 1,
      authorized_attempts: [
        {
          campaign: "T201-C05-B",
          attempt: "B01",
          semantic_case: "T201-C05",
          evidence: "evidence/b01.json",
        },
        {
          campaign: "T201-C05-B",
          attempt: "B02",
          semantic_case: "T201-C05",
          evidence: "evidence/b02.json",
        },
      ],
    };
    await assert.rejects(
      () =>
        selectT201AuthoritativeEvidenceFiles({ registry, repoRoot: root }),
      /t201_matrix_authoritative_attempt_ambiguous/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("offline consolidation selects the single passing authorized attempt for every case and completes the matrix", async () => {
  await withTempRepo(async ({ root, evidenceDir, matrixPath, registryPath }) => {
    for (const file of AUTHORITATIVE_EVIDENCE_FILES) {
      await fs.copyFile(
        path.join(spikeRoot, "evidence", file),
        path.join(evidenceDir, file),
      );
    }
    const c04Path = path.join(evidenceDir, AUTHORITATIVE_EVIDENCE_FILES[2]);
    const c04Before = await fs.readFile(c04Path);
    const matrix = await consolidateT201MatrixEvidence({
      matrixPath,
      registryPath,
      repoRoot: root,
    });
    assert.equal(matrix.matrix_pass, true);
    assert.equal(matrix.matrix_state, "all_cases_live_passed");
    for (const item of matrix.cases) assert.equal(item.pass, true);
    const c01 = matrix.cases.find((item) => item.case_id === "T201-C01");
    assert.equal(c01.pass, true);
    assert.equal(c01.safe_metrics.parsing_pass, true);
    const c04 = matrix.cases.find((item) => item.case_id === "T201-C04");
    assert.equal(c04.safe_metrics.exact_fact_recall, 1);
    assert.equal(c04.safe_metrics.high_priority_fact_recall, 1);
    assert.equal(c04.safe_metrics.parsing_pass, true);
    const c05 = matrix.cases.find((item) => item.case_id === "T201-C05");
    assert.equal(c05.pass, true);
    const c06 = matrix.cases.find((item) => item.case_id === "T201-C06");
    assert.equal(c06.pass, true);
    assert.deepEqual(await fs.readFile(c04Path), c04Before);
  });
});

test("offline consolidation keeps the matrix incomplete when a mandatory case has no passing attempt", async () => {
  await withTempRepo(async ({ root, evidenceDir, matrixPath, registryPath }) => {
    for (const file of AUTHORITATIVE_EVIDENCE_FILES.filter(
      (candidate) => !candidate.includes("c05-"),
    )) {
      await fs.copyFile(
        path.join(spikeRoot, "evidence", file),
        path.join(evidenceDir, file),
      );
    }
    const matrix = await consolidateT201MatrixEvidence({
      matrixPath,
      registryPath,
      repoRoot: root,
    });
    assert.equal(matrix.matrix_pass, false);
    assert.equal(matrix.matrix_state, "partially_live_evaluated");
    const c05 = matrix.cases.find((item) => item.case_id === "T201-C05");
    assert.equal(c05.pass, false);
    assert.equal(c05.safe_metrics, null);
  });
});
