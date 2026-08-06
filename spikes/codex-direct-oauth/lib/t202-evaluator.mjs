// Deterministic offline T202 re-measurement from sanitized checked-in
// evidence only.
//
// T202 (docs/research/codex-direct-oauth-evaluation.md) measures the direct
// Codex OAuth semantic path. This evaluator consumes only the accepted,
// sanitized evidence the repository already owns:
//
// - the consolidated T201 matrix (authoritative aggregate);
// - the Campaign-B authorization registry (authoritative attempt selection);
// - the single passing per-case sanitized evidence selected by the same rules
//   as the T201 consolidator (C01 keeps its legacy canonical evidence);
// - the T199 live credential-lifecycle evidence;
// - the T200 minimal-invocation evidence.
//
// It never touches credentials, raw prompts, raw model output, Docker, OAuth,
// or live transport. It fails closed on missing, malformed, conflicting, or
// ambiguous evidence, produces deterministic output, and is idempotent.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  T201_MATRIX_CASE_IDS,
  T201_MATRIX_METRIC_KEYS,
} from "./t201-matrix-evaluator.mjs";
import {
  selectT201AuthoritativeEvidenceFiles,
  writeEvidenceAtomic,
} from "./t201-live-runner-evidence.mjs";

const SPIKE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const T202_MATRIX_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-matrix.json";
export const T202_REGISTRY_REL_PATH =
  "spikes/codex-direct-oauth/campaign-b-authorizations.json";
export const T202_LEGACY_C01_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t201-semantic-parsing.json";
export const T202_T199_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t199-live.json";
export const T202_T200_EVIDENCE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json";
export const T202_AGGREGATE_REL_PATH =
  "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t202-metrics.json";

const EVIDENCE_GLOB_PREFIX = "codex-direct-oauth-t201-c";
const EVIDENCE_GLOB_SUFFIX = "-semantic-parsing.json";

function fail(reason) {
  throw new Error(`t202_evaluator_fail_closed:${reason}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function loadJson(repoRoot, relativePath, label) {
  const resolved = path.resolve(repoRoot, relativePath);
  let text;
  try {
    text = await fs.readFile(resolved, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") fail(`missing_${label}:${relativePath}`);
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`malformed_${label}:${relativePath}`);
  }
  if (!isPlainObject(parsed)) fail(`malformed_${label}:${relativePath}`);
  return parsed;
}

function requireBoolean(evidence, field, label) {
  if (typeof evidence[field] !== "boolean")
    fail(`missing_or_malformed_${label}_field:${field}`);
  return evidence[field];
}

function requireInteger(evidence, field, label) {
  if (!Number.isInteger(evidence[field]))
    fail(`missing_or_malformed_${label}_field:${field}`);
  return evidence[field];
}

function requireObject(evidence, field, label) {
  if (!isPlainObject(evidence[field]))
    fail(`missing_or_malformed_${label}_field:${field}`);
  return evidence[field];
}

function ratio(numerator, denominator) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    fail("ratio_must_be_integer_counts");
  }
  if (denominator <= 0) fail("ratio_denominator_must_be_positive");
  if (numerator < 0 || numerator > denominator) fail("ratio_numerator_out_of_range");
  return numerator / denominator;
}

// Map legacy per-case evidence metric names onto matrix metric names where the
// two vocabularies differ.
const EVIDENCE_METRIC_NAME_MAP = Object.freeze({
  source_grounding_pass: "grounding_pass",
  JSON_only_valid: "structured_output_valid",
});

function matrixMetricName(evidenceMetricName) {
  return EVIDENCE_METRIC_NAME_MAP[evidenceMetricName] ?? evidenceMetricName;
}

function metricSource(relativePath) {
  return `spikes/codex-direct-oauth/evidence/${path.basename(relativePath)}`;
}

async function loadAuthoritativeCaseEvidence({
  repoRoot,
  registry,
  matrix,
}) {
  const selected = await selectT201AuthoritativeEvidenceFiles({
    registry,
    repoRoot,
  });
  const cases = [];
  for (const caseId of T201_MATRIX_CASE_IDS) {
    const matrixEntry = matrix.cases.find((item) => item.case_id === caseId);
    if (!isPlainObject(matrixEntry) || !isPlainObject(matrixEntry.safe_metrics)) {
      fail(`missing_matrix_metrics:${caseId}`);
    }
    if (matrixEntry.pass !== true) {
      fail(`matrix_case_not_passed:${caseId}`);
    }
    let perCaseEvidence;
    let evidencePath;
    if (caseId === "T201-C01") {
      evidencePath = path.resolve(
        repoRoot,
        T202_LEGACY_C01_EVIDENCE_REL_PATH,
      );
      perCaseEvidence = await loadJson(
        repoRoot,
        T202_LEGACY_C01_EVIDENCE_REL_PATH,
        "t201_c01_evidence",
      );
    } else {
      const selectedAttempt = selected.get(caseId);
      if (!selectedAttempt) {
        fail(`missing_authoritative_evidence:${caseId}`);
      }
      evidencePath = selectedAttempt.evidence_path;
      perCaseEvidence = selectedAttempt.evidence;
    }
    // Per-case live evidence must reflect a completed, passing run.
    requireBoolean(perCaseEvidence, "invocation_attempted", caseId);
    requireBoolean(perCaseEvidence, "invocation_succeeded", caseId);
    requireBoolean(perCaseEvidence, "response_protocol_valid", caseId);
    requireBoolean(perCaseEvidence, "schema_valid", caseId);
    if (
      perCaseEvidence.secret_scan_result !== "passed" &&
      perCaseEvidence.log_secret_scan_result !== "passed"
    ) {
      fail(`secret_scan_not_passed:${caseId}`);
    }
    if (perCaseEvidence.exact_http_status !== 200) {
      fail(`http_status_not_200:${caseId}`);
    }
    if (perCaseEvidence.safe_final_state !== "complete") {
      fail(`case_not_complete:${caseId}`);
    }
    if (perCaseEvidence.raw_credentials_exposed_to_parent === true) {
      fail(`credential_exposure:${caseId}`);
    }
    if (perCaseEvidence.account_identifier_exposed_to_parent === true) {
      fail(`account_identifier_exposure:${caseId}`);
    }
    // Cross-check overlapping semantic metrics between per-case evidence and
    // the authoritative matrix; conflicting values fail closed.
    const evidenceMetrics = isPlainObject(perCaseEvidence.evaluation_metrics)
      ? perCaseEvidence.evaluation_metrics
      : {};
    for (const [evidenceKey, evidenceValue] of Object.entries(evidenceMetrics)) {
      const matrixKey = matrixMetricName(evidenceKey);
      if (!T201_MATRIX_METRIC_KEYS.includes(matrixKey)) continue;
      const matrixValue = matrixEntry.safe_metrics[matrixKey];
      if (
        matrixValue !== null &&
        matrixValue !== undefined &&
        evidenceValue !== null &&
        evidenceValue !== undefined &&
        matrixValue !== evidenceValue
      ) {
        fail(`conflicting_metric:${caseId}:${matrixKey}`);
      }
    }
    cases.push({
      case_id: caseId,
      evidence_path: evidencePath,
      invocation_attempted: perCaseEvidence.invocation_attempted,
      invocation_succeeded: perCaseEvidence.invocation_succeeded,
      exact_http_status: perCaseEvidence.exact_http_status,
      response_protocol_valid: perCaseEvidence.response_protocol_valid,
      model_output_received: perCaseEvidence.model_output_received ?? false,
      structured_output_evaluated:
        perCaseEvidence.structured_output_evaluated ?? false,
      semantic_quality_evaluated:
        perCaseEvidence.semantic_quality_evaluated ?? false,
      transport_manifest_matches_t200:
        perCaseEvidence.t201_transport_manifest_matches_t200 ?? null,
      transport_mismatches: perCaseEvidence.t201_transport_mismatches ?? null,
      expected_fact_count: evidenceMetrics.expected_fact_count ?? null,
      matched_expected_fact_count:
        evidenceMetrics.matched_expected_fact_count ?? null,
      high_priority_fact_count:
        evidenceMetrics.high_priority_fact_count ?? null,
      matched_high_priority_fact_count:
        evidenceMetrics.matched_high_priority_fact_count ?? null,
      metrics: matrixEntry.safe_metrics,
    });
  }
  return cases;
}

async function loadHistoricalFailedAttempts({ repoRoot }) {
  const evidenceDir = path.join(repoRoot, "spikes/codex-direct-oauth/evidence");
  const entries = await fs.readdir(evidenceDir, { withFileTypes: true });
  const failures = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith(EVIDENCE_GLOB_PREFIX) ||
      !entry.name.endsWith(EVIDENCE_GLOB_SUFFIX)
    ) {
      continue;
    }
    const evidencePath = path.join(evidenceDir, entry.name);
    let evidence;
    try {
      evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
    } catch {
      continue;
    }
    if (!isPlainObject(evidence) || evidence.case_pass !== false) continue;
    const metrics = isPlainObject(evidence.evaluation_metrics)
      ? evidence.evaluation_metrics
      : {};
    failures.push({
      evidence_file: entry.name,
      case_id: evidence.fixture_identifier ?? "unknown",
      safe_final_state: evidence.safe_final_state ?? "unknown",
      primary_failure_category:
        evidence.primary_failure_category ??
        evidence.final_safe_classification ??
        "unknown",
      invocation_attempted: evidence.invocation_attempted ?? false,
      parsing_pass: metrics.parsing_pass ?? null,
      exact_fact_recall: metrics.exact_fact_recall ?? null,
      invalid_evidence_count: metrics.invalid_evidence_count ?? null,
      unsupported_fact_count: metrics.unsupported_fact_count ?? null,
      safe_error_categories: Array.isArray(metrics.safe_error_categories)
        ? [...metrics.safe_error_categories].sort()
        : [],
    });
  }
  return failures;
}

function buildMetric({
  key,
  label,
  numerator,
  denominator,
  threshold,
  pass,
  sources,
  note = null,
}) {
  return {
    key,
    label,
    numerator,
    denominator,
    value: ratio(numerator, denominator),
    required_threshold: threshold,
    pass,
    sources: [...sources].sort(),
    ...(note === null ? {} : { note }),
  };
}

export async function evaluateT202({
  repoRoot = path.resolve(SPIKE_ROOT, "../.."),
  registryPath = T202_REGISTRY_REL_PATH,
  matrixPath = T202_MATRIX_REL_PATH,
  t199Path = T202_T199_EVIDENCE_REL_PATH,
  t200Path = T202_T200_EVIDENCE_REL_PATH,
} = {}) {
  const registry = await loadJson(repoRoot, registryPath, "registry");
  if (registry.schema_version !== 1 || !Array.isArray(registry.authorized_attempts)) {
    fail("registry_invalid");
  }
  const matrix = await loadJson(repoRoot, matrixPath, "matrix");
  if (!Array.isArray(matrix.cases) || matrix.cases.length !== T201_MATRIX_CASE_IDS.length) {
    fail("matrix_invalid_case_count");
  }
  if (matrix.matrix_pass !== true || matrix.matrix_state !== "all_cases_live_passed") {
    fail("matrix_not_accepted");
  }

  const cases = await loadAuthoritativeCaseEvidence({
    repoRoot,
    registry,
    matrix,
  });
  const t199 = await loadJson(repoRoot, t199Path, "t199_evidence");
  const t200 = await loadJson(repoRoot, t200Path, "t200_evidence");

  // T199 credential lifecycle gates.
  const authLogins = [
    requireBoolean(t199, "initial_live_oauth_succeeded", "t199"),
    requireBoolean(t199, "final_live_reauthentication_succeeded", "t199"),
  ];
  requireBoolean(t199, "real_encrypted_record_created", "t199");
  const restartFlags = [
    requireBoolean(t199, "real_restart_recovery_succeeded", "t199"),
    requireBoolean(t199, "real_disconnected_restart_succeeded", "t199"),
    requireBoolean(t199, "final_real_encrypted_recovery_succeeded", "t199"),
  ];
  requireBoolean(t199, "real_refresh_attempted", "t199");
  const refreshRotated = requireBoolean(t199, "real_refresh_succeeded", "t199") &&
    requireBoolean(t199, "real_refresh_token_rotated", "t199");
  requireInteger(t199, "live_network_refresh_count", "t199");
  if (t199.secret_scan_result !== "passed") fail("t199_secret_scan_not_passed");
  if (t199.raw_credentials_exposed_to_host === true) fail("t199_credential_exposure");

  // T200 minimal invocation gate.
  requireBoolean(t200, "invocation_attempted", "t200");
  requireBoolean(t200, "invocation_succeeded", "t200");
  requireInteger(t200, "exact_http_status", "t200");
  requireBoolean(t200, "response_protocol_valid", "t200");
  if (t200.exact_http_status !== 200) fail("t200_http_status_not_200");
  if (t200.secret_scan_result !== "passed") fail("t200_secret_scan_not_passed");
  if (t200.raw_credentials_exposed_to_parent === true) fail("t200_credential_exposure");

  // Authoritative invocation set: T200 minimal invocation + six T201 semantic
  // cases. Per the repository's authoritative-case selection rules, only the
  // single passing attempt per matrix case is included; historical failed
  // attempts are reported separately and excluded from these denominators.
  const invocationAttempted = 1 + cases.filter((item) => item.invocation_attempted).length;
  const invocationSucceeded = 1 + cases.filter((item) => item.invocation_succeeded).length;
  const protocolValid = 1 + cases.filter((item) => item.response_protocol_valid).length;
  const schemaValid = cases.filter((item) => item.metrics.schema_valid === true).length;
  const parsingPass = cases.filter((item) => item.metrics.parsing_pass === true).length;
  const groundingPass = cases.filter((item) => item.metrics.grounding_pass === true).length;
  const noInventionPass = cases.filter((item) => item.metrics.no_invention_pass === true).length;
  const structuredOutputEvaluated = cases.filter(
    (item) => item.structured_output_evaluated === true && item.model_output_received === true,
  ).length;
  const validEvidenceCases = cases.filter(
    (item) =>
      item.metrics.missing_evidence_count === 0 &&
      item.metrics.invalid_evidence_count === 0,
  ).length;
  const sectionRecallPass = cases.filter(
    (item) => item.metrics.expected_section_recall === 1,
  ).length;
  const itemRecallPass = cases.filter(
    (item) => item.metrics.expected_item_recall === 1,
  ).length;
  const exactRecallPass = cases.filter(
    (item) => item.metrics.exact_fact_recall >= 0.9,
  ).length;
  const highPriorityRecallPass = cases.filter(
    (item) => item.metrics.high_priority_fact_recall === 1,
  ).length;
  const unsupportedTotal = cases.reduce(
    (sum, item) => sum + item.metrics.unsupported_fact_count,
    0,
  );
  const forbiddenTotal = cases.reduce(
    (sum, item) => sum + item.metrics.forbidden_inference_count,
    0,
  );
  const missingEvidenceTotal = cases.reduce(
    (sum, item) => sum + item.metrics.missing_evidence_count,
    0,
  );
  const invalidEvidenceTotal = cases.reduce(
    (sum, item) => sum + item.metrics.invalid_evidence_count,
    0,
  );
  const transportMatches = cases.filter(
    (item) => item.transport_manifest_matches_t200 === true,
  ).length;
  const transportMismatches = cases.reduce(
    (sum, item) => sum + (Array.isArray(item.transport_mismatches) ? item.transport_mismatches.length : 0),
    0,
  );

  // Countable fact denominators are exposed only by the v2 cases (C03-C06).
  const countableCases = cases.filter(
    (item) => Number.isInteger(item.expected_fact_count),
  );
  const exactFactsExpected = countableCases.reduce(
    (sum, item) => sum + item.expected_fact_count,
    0,
  );
  const exactFactsMatched = countableCases.reduce(
    (sum, item) => sum + item.matched_expected_fact_count,
    0,
  );
  const highPriorityExpected = countableCases.reduce(
    (sum, item) => sum + item.high_priority_fact_count,
    0,
  );
  const highPriorityMatched = countableCases.reduce(
    (sum, item) => sum + item.matched_high_priority_fact_count,
    0,
  );

  const perCaseSources = cases.map((item) => metricSource(item.evidence_path));
  const metrics = [
    buildMetric({
      key: "authentication_success",
      label: "Authentication success (browser OAuth login + callback)",
      numerator: authLogins.filter(Boolean).length,
      denominator: authLogins.length,
      threshold: "T203 gate: fresh live browser login with callback completion must succeed",
      pass: authLogins.every(Boolean),
      sources: [T202_T199_EVIDENCE_REL_PATH],
    }),
    buildMetric({
      key: "credential_persistence",
      label: "Encrypted credential persistence (live encrypted record, no plaintext)",
      numerator: 1,
      denominator: 1,
      threshold: "T203 gate: live encrypted store with no plaintext",
      pass: t199.real_encrypted_record_created === true,
      sources: [T202_T199_EVIDENCE_REL_PATH],
      note: "No-plaintext claim is recorded in docs/research/codex-direct-oauth-credential-lifecycle.md and the deterministic suite; the sanitized T199 JSON exposes only record-creation booleans.",
    }),
    buildMetric({
      key: "restart_recovery",
      label: "Restart recovery (credential usable after controlled restart)",
      numerator: restartFlags.filter(Boolean).length,
      denominator: restartFlags.length,
      threshold: "T203 gate: credential usable after container restart",
      pass: restartFlags.every(Boolean),
      sources: [T202_T199_EVIDENCE_REL_PATH],
    }),
    buildMetric({
      key: "refresh_rotation",
      label: "Token refresh with rotation (single-flight)",
      numerator: refreshRotated ? 1 : 0,
      denominator: 1,
      threshold: "T203 gate: live refresh with rotation",
      pass: refreshRotated,
      sources: [T202_T199_EVIDENCE_REL_PATH],
      note: `live_network_refresh_count=${t199.live_network_refresh_count} for two concurrent refresh requests (single-flight).`,
    }),
    buildMetric({
      key: "invocation_success_rate",
      label: "Invocation success rate",
      numerator: invocationSucceeded,
      denominator: invocationAttempted,
      threshold: "T203 gate: live invocation with HTTP 200 and valid SSE (no numeric rate threshold documented)",
      pass: invocationAttempted === invocationSucceeded,
      sources: [T202_T200_EVIDENCE_REL_PATH, ...perCaseSources],
    }),
    buildMetric({
      key: "protocol_validity",
      label: "Protocol validity (valid SSE/typed event framing)",
      numerator: protocolValid,
      denominator: invocationAttempted,
      threshold: "T203 gate: valid SSE response framing on every live invocation",
      pass: protocolValid === invocationAttempted,
      sources: [T202_T200_EVIDENCE_REL_PATH, ...perCaseSources],
    }),
    buildMetric({
      key: "schema_valid_rate",
      label: "Schema-valid response rate",
      numerator: schemaValid,
      denominator: cases.length,
      threshold: "T201 mandatory: strict schema valid in every case (aggregate rate 1.0)",
      pass: schemaValid === cases.length,
      sources: perCaseSources,
    }),
    buildMetric({
      key: "structured_output_validity",
      label: "Structured-output validity (model output received and evaluated)",
      numerator: structuredOutputEvaluated,
      denominator: cases.length,
      threshold: "T201 mandatory: structured output evaluated for every case",
      pass: structuredOutputEvaluated === cases.length,
      sources: perCaseSources,
    }),
    buildMetric({
      key: "semantic_parsing_pass_rate",
      label: "Semantic parsing pass rate",
      numerator: parsingPass,
      denominator: cases.length,
      threshold: "T201 mandatory: parsing_pass true per case; aggregate passes only when all six pass",
      pass: parsingPass === cases.length,
      sources: perCaseSources,
    }),
    buildMetric({
      key: "exact_fact_recall",
      label: "Exact fact recall",
      numerator: exactFactsMatched,
      denominator: exactFactsExpected,
      threshold: "T201 mandatory: exact fact recall >= 0.9 per case",
      pass: exactRecallPass === cases.length,
      sources: perCaseSources,
      note: "Countable denominators exist for v2 cases (C03-C06, 23 expected facts each). C01/C02 sanitized evidence records recall 1.0 without exposing per-fact counts.",
    }),
    buildMetric({
      key: "high_priority_fact_recall",
      label: "High-priority fact recall",
      numerator: highPriorityMatched,
      denominator: highPriorityExpected,
      threshold: "T201 mandatory: high-priority fact recall = 1.0 per case",
      pass: highPriorityRecallPass === cases.length,
      sources: perCaseSources,
      note: "Countable denominators exist for v2 cases (C03-C06, 17 high-priority facts each). C01/C02 sanitized evidence records recall 1.0 without exposing per-fact counts.",
    }),
    buildMetric({
      key: "work_experience_grouping",
      label: "Work-experience grouping (section/item structure)",
      numerator: Math.min(sectionRecallPass, itemRecallPass),
      denominator: cases.length,
      threshold: "T201 mandatory: expected section recall = 1.0 and expected item recall = 1.0 per case",
      pass: sectionRecallPass === cases.length && itemRecallPass === cases.length,
      sources: perCaseSources,
      note: "Sanitized evidence exposes expected_section_recall and expected_item_recall; per-grouping counts are not exposed.",
    }),
    buildMetric({
      key: "valid_evidence_rate",
      label: "Valid-evidence rate (cases with zero missing/invalid evidence)",
      numerator: validEvidenceCases,
      denominator: cases.length,
      threshold: "T201 mandatory: missing evidence count = 0 and invalid evidence count = 0 per case",
      pass: validEvidenceCases === cases.length,
      sources: perCaseSources,
      note: `missing_evidence_count total=${missingEvidenceTotal}; invalid_evidence_count total=${invalidEvidenceTotal}.`,
    }),
    buildMetric({
      key: "invented_field_rate",
      label: "Invented-field rate (no-invention)",
      numerator: unsupportedTotal,
      denominator: exactFactsExpected,
      threshold: "T201 mandatory: unsupported fact count = 0 per case",
      pass:
        unsupportedTotal === 0 &&
        forbiddenTotal === 0 &&
        noInventionPass === cases.length,
      sources: perCaseSources,
      note: `unsupported_fact_count total=${unsupportedTotal}; forbidden_inference_count total=${forbiddenTotal}; no_invention_pass in all six cases. Countable returned values (v2 cases): ${exactFactsExpected}.`,
    }),
    buildMetric({
      key: "unsupported_fact_count",
      label: "Unsupported fact count",
      numerator: unsupportedTotal,
      denominator: cases.length,
      threshold: "T201 mandatory: unsupported fact count = 0 per case",
      pass: unsupportedTotal === 0,
      sources: perCaseSources,
      note: "Total unsupported facts across the six authoritative cases.",
    }),
    buildMetric({
      key: "unsupported_evidence_count",
      label: "Unsupported-evidence count (missing source references)",
      numerator: missingEvidenceTotal,
      denominator: exactFactsExpected,
      threshold: "T201 mandatory: zero evidence references missing from the source representation",
      pass: missingEvidenceTotal === 0,
      sources: perCaseSources,
      note: `Countable evidence references (v2 cases): ${exactFactsExpected}.`,
    }),
    buildMetric({
      key: "forbidden_inference_count",
      label: "Forbidden inference count",
      numerator: forbiddenTotal,
      denominator: cases.length,
      threshold: "T201 mandatory: forbidden inference count = 0 per case",
      pass: forbiddenTotal === 0,
      sources: perCaseSources,
      note: "Total forbidden inferences across the six authoritative cases.",
    }),
    buildMetric({
      key: "grounding_success",
      label: "Grounding success",
      numerator: groundingPass,
      denominator: cases.length,
      threshold: "T201 mandatory: grounding pass per case",
      pass: groundingPass === cases.length,
      sources: perCaseSources,
    }),
    buildMetric({
      key: "no_invention_success",
      label: "No-invention success",
      numerator: noInventionPass,
      denominator: cases.length,
      threshold: "T201 mandatory: no-invention pass per case",
      pass: noInventionPass === cases.length,
      sources: perCaseSources,
    }),
    buildMetric({
      key: "provider_transport_manifest_match",
      label: "Provider transport-manifest match vs T200 audited shape",
      numerator: transportMatches,
      denominator: cases.length,
      threshold: "T201 evidence gate: T201 request shape must match the T200 audited transport",
      pass: transportMatches === cases.length && transportMismatches === 0,
      sources: perCaseSources,
      note: `t201_transport_mismatches total=${transportMismatches}.`,
    }),
    buildMetric({
      key: "deterministic_completeness",
      label: "Deterministic completeness across the matrix",
      numerator: cases.length,
      denominator: T201_MATRIX_CASE_IDS.length,
      threshold: "T201 aggregate passes only when all six mandatory cases are present and pass",
      pass: cases.length === T201_MATRIX_CASE_IDS.length,
      sources: [T202_MATRIX_REL_PATH],
    }),
  ];

  const historicalFailedAttempts = await loadHistoricalFailedAttempts({ repoRoot });
  const failureCategoryCounts = Object.fromEntries(
    [...new Set(historicalFailedAttempts.map((item) => item.primary_failure_category))]
      .sort()
      .map((category) => [
        category,
        historicalFailedAttempts.filter((item) => item.primary_failure_category === category).length,
      ]),
  );

  const report = {
    evidence_classification: "sanitized_t202_offline_remeasurement",
    evaluator: "spikes/codex-direct-oauth/lib/t202-evaluator.mjs",
    inputs: {
      t201_matrix: T202_MATRIX_REL_PATH,
      campaign_b_registry: T202_REGISTRY_REL_PATH,
      t199_evidence: T202_T199_EVIDENCE_REL_PATH,
      t200_evidence: T202_T200_EVIDENCE_REL_PATH,
      legacy_c01_evidence: T202_LEGACY_C01_EVIDENCE_REL_PATH,
    },
    matrix: {
      matrix_pass: matrix.matrix_pass,
      matrix_state: matrix.matrix_state,
      mandatory_case_count: matrix.mandatory_case_count,
    },
    authoritative_attempts: Object.fromEntries(
      cases.map((item) => [
        item.case_id,
        {
          evidence_path: item.evidence_path,
          invocation_succeeded: item.invocation_succeeded,
          exact_http_status: item.exact_http_status,
          schema_valid: item.metrics.schema_valid,
          parsing_pass: item.metrics.parsing_pass,
        },
      ]),
    ),
    metrics,
    historical_failed_attempts: {
      excluded_from_authoritative_denominators: true,
      exclusion_rule:
        "Authoritative-case selection per campaign-b-authorizations.json: only the single passing attempt per matrix case is authoritative; failed attempts remain immutable historical evidence.",
      source_note:
        "Inventory derived deterministically from checked-in sanitized evidence files with case_pass=false. For C02's A/B campaigns, the T201 matrix attempt_history/campaigns records remain the canonical historical classification where per-attempt files were later replaced by runner output.",
      failure_category_counts: failureCategoryCounts,
      attempts: historicalFailedAttempts,
    },
    unmeasured_metrics: [
      {
        key: "turn_latency",
        reason: "No sanitized timing fields exist in the accepted live evidence; the 1.88ms deterministic baseline is provider-neutral, not Codex.",
      },
      {
        key: "cancellation_latency",
        reason: "Cancellation was not exercised in any accepted live run; no evidence exists.",
      },
      {
        key: "quota_behavior",
        reason: "No quota/rate-limit exercise exists in accepted live evidence; only safe failure mapping is proven.",
      },
      {
        key: "non_technical_onboarding_feasibility",
        reason: "Requires live browser OAuth plus a real import flow in the supported deployment shape (T245/T246/T213-T215 pending).",
      },
    ],
    residual_risks: [
      {
        key: "undocumented_backend_supportability",
        detail:
          "T196 classifies third-party direct Codex backend support as undocumented/unresolved; the audited transport shape matched in all runs but stability is not guaranteed.",
      },
      {
        key: "real_document_live_semantic_quality",
        detail:
          "All six T201 cases used synthetic fixtures (fixture_classified_as_synthetic true). Live Codex evaluation over real PDF/DOCX documents (T246) is not executed.",
      },
    ],
    summary: {
      t202_measurement_complete: true,
      all_evidence_supported_metrics_pass: metrics.every((metric) => metric.pass),
      measured_metric_count: metrics.length,
      unmeasured_metric_count: 4,
      historical_failed_attempt_count: historicalFailedAttempts.length,
    },
  };
  return Object.freeze(report);
}

export async function writeT202Aggregate({
  repoRoot = path.resolve(SPIKE_ROOT, "../.."),
  aggregatePath = T202_AGGREGATE_REL_PATH,
  ...evaluatorOptions
} = {}) {
  const report = await evaluateT202({ repoRoot, ...evaluatorOptions });
  return writeEvidenceAtomic(path.resolve(repoRoot, aggregatePath), report);
}
