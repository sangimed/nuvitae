import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  T202_LEGACY_C01_EVIDENCE_REL_PATH,
  T202_T199_EVIDENCE_REL_PATH,
  T202_T200_EVIDENCE_REL_PATH,
  evaluateT202,
  writeT202Aggregate,
} from "../lib/t202-evaluator.mjs";

const SPIKE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REPO_ROOT = path.resolve(SPIKE_ROOT, "../..");
const EVIDENCE_DIR = path.join(SPIKE_ROOT, "evidence");

function metricByKey(report, key) {
  const metric = report.metrics.find((item) => item.key === key);
  assert.ok(metric, `missing metric ${key}`);
  return metric;
}

async function copyInto(tempRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    const target = path.join(tempRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(REPO_ROOT, relativePath), target);
  }
}

async function authoritativeEvidenceRelPaths() {
  const registry = JSON.parse(
    await fs.readFile(
      path.join(REPO_ROOT, "spikes/codex-direct-oauth/campaign-b-authorizations.json"),
      "utf8",
    ),
  );
  const selected = new Set([
    T202_LEGACY_C01_EVIDENCE_REL_PATH,
    T202_T199_EVIDENCE_REL_PATH,
    T202_T200_EVIDENCE_REL_PATH,
  ]);
  const caseIds = [
    "T201-C02",
    "T201-C03",
    "T201-C04",
    "T201-C05",
    "T201-C06",
  ];
  for (const caseId of caseIds) {
    const passing = [];
    for (const entry of registry.authorized_attempts.filter(
      (item) => item.semantic_case === caseId,
    )) {
      let evidence;
      try {
        evidence = JSON.parse(
          await fs.readFile(path.join(REPO_ROOT, entry.evidence), "utf8"),
        );
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      if (evidence.case_pass === true) passing.push(entry.evidence);
    }
    assert.equal(
      passing.length,
      1,
      `expected exactly one passing attempt for ${caseId}`,
    );
    selected.add(passing[0]);
  }
  return [...selected];
}

test("T202 evaluator measures the accepted matrix deterministically", async () => {
  const report = await evaluateT202({ repoRoot: REPO_ROOT });

  assert.equal(report.matrix.matrix_pass, true);
  assert.equal(report.matrix.matrix_state, "all_cases_live_passed");
  assert.equal(report.summary.t202_measurement_complete, true);
  assert.equal(report.summary.all_evidence_supported_metrics_pass, true);

  const invocation = metricByKey(report, "invocation_success_rate");
  assert.deepEqual(
    { numerator: invocation.numerator, denominator: invocation.denominator },
    { numerator: 7, denominator: 7 },
  );
  assert.equal(invocation.value, 1);
  assert.equal(invocation.pass, true);

  const protocol = metricByKey(report, "protocol_validity");
  assert.deepEqual(
    { numerator: protocol.numerator, denominator: protocol.denominator },
    { numerator: 7, denominator: 7 },
  );

  for (const key of [
    "schema_valid_rate",
    "structured_output_validity",
    "semantic_parsing_pass_rate",
    "grounding_success",
    "no_invention_success",
    "deterministic_completeness",
  ]) {
    const metric = metricByKey(report, key);
    assert.deepEqual(
      { numerator: metric.numerator, denominator: metric.denominator },
      { numerator: 6, denominator: 6 },
      `${key} should be 6/6`,
    );
    assert.equal(metric.pass, true, `${key} should pass`);
  }

  const exactRecall = metricByKey(report, "exact_fact_recall");
  assert.deepEqual(
    { numerator: exactRecall.numerator, denominator: exactRecall.denominator },
    { numerator: 92, denominator: 92 },
  );
  const highPriority = metricByKey(report, "high_priority_fact_recall");
  assert.deepEqual(
    {
      numerator: highPriority.numerator,
      denominator: highPriority.denominator,
    },
    { numerator: 68, denominator: 68 },
  );

  assert.equal(metricByKey(report, "unsupported_fact_count").numerator, 0);
  assert.equal(metricByKey(report, "forbidden_inference_count").numerator, 0);
  assert.equal(metricByKey(report, "unsupported_evidence_count").numerator, 0);
  assert.equal(metricByKey(report, "valid_evidence_rate").numerator, 6);
  assert.equal(metricByKey(report, "authentication_success").pass, true);
  assert.equal(metricByKey(report, "restart_recovery").pass, true);
  assert.equal(metricByKey(report, "refresh_rotation").pass, true);

  const unmeasured = report.unmeasured_metrics.map((item) => item.key);
  assert.ok(unmeasured.includes("turn_latency"));
  assert.ok(unmeasured.includes("cancellation_latency"));
  assert.ok(unmeasured.includes("quota_behavior"));
  assert.ok(unmeasured.includes("non_technical_onboarding_feasibility"));

  assert.ok(report.historical_failed_attempts.attempts.length > 0);
  const c04b01 = report.historical_failed_attempts.attempts.find((item) =>
    item.evidence_file.includes("c04-b01"),
  );
  assert.ok(c04b01);
  assert.ok(c04b01.safe_error_categories.includes("evidence_coordinate_mismatch"));
});

test("T202 evaluator is idempotent", async () => {
  const first = await evaluateT202({ repoRoot: REPO_ROOT });
  const second = await evaluateT202({ repoRoot: REPO_ROOT });
  assert.deepEqual(first, second);
});

test("T202 aggregate writer produces the checked-in aggregate deterministically", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t202-aggregate-"),
  );
  try {
    const aggregatePath = path.join(tempRoot, "t202-metrics.json");
    const report = await writeT202Aggregate({
      repoRoot: REPO_ROOT,
      aggregatePath,
    });
    const persisted = JSON.parse(await fs.readFile(aggregatePath, "utf8"));
    assert.equal(persisted.evidence_classification, "sanitized_t202_offline_remeasurement");
    assert.equal(persisted.evidence_atomic_replace_succeeded, true);
    assert.equal(persisted.summary.t202_measurement_complete, true);
    assert.deepEqual(persisted, report);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("T202 evaluator fails closed on missing registry", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t202-missing-registry-"),
  );
  try {
    await assert.rejects(
      evaluateT202({
        repoRoot: REPO_ROOT,
        registryPath: path.join(tempRoot, "missing-registry.json"),
      }),
      /t202_evaluator_fail_closed:missing_registry/,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("T202 evaluator fails closed on malformed matrix", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t202-malformed-matrix-"),
  );
  try {
    const matrixPath = path.join(tempRoot, "matrix.json");
    await fs.writeFile(matrixPath, "{not json", "utf8");
    await assert.rejects(
      evaluateT202({
        repoRoot: REPO_ROOT,
        matrixPath,
      }),
      /t202_evaluator_fail_closed:malformed_matrix/,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("T202 evaluator fails closed on matrix not accepted", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t202-matrix-not-accepted-"),
  );
  try {
    const matrixPath = path.join(tempRoot, "matrix.json");
    const matrix = JSON.parse(
      await fs.readFile(
        path.join(REPO_ROOT, "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json"),
        "utf8",
      ),
    );
    matrix.matrix_pass = false;
    await fs.writeFile(matrixPath, JSON.stringify(matrix), "utf8");
    await assert.rejects(
      evaluateT202({
        repoRoot: REPO_ROOT,
        matrixPath,
      }),
      /t202_evaluator_fail_closed:matrix_not_accepted/,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("T202 evaluator fails closed on conflicting per-case evidence", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t202-conflict-"),
  );
  try {
    const relativePaths = await authoritativeEvidenceRelPaths();
    await copyInto(tempRoot, [
      "spikes/codex-direct-oauth/campaign-b-authorizations.json",
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json",
      ...relativePaths,
    ]);
    const c04Path = path.join(
      tempRoot,
      "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-c04-b03-semantic-parsing.json",
    );
    const c04 = JSON.parse(await fs.readFile(c04Path, "utf8"));
    c04.evaluation_metrics.exact_fact_recall = 0.5;
    await fs.writeFile(c04Path, JSON.stringify(c04), "utf8");
    await assert.rejects(
      evaluateT202({ repoRoot: tempRoot }),
      /t202_evaluator_fail_closed:conflicting_metric:T201-C04:exact_fact_recall/,
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
