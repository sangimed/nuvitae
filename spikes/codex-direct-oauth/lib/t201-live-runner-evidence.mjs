import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsSecretLikeValue } from "./sanitize.mjs";
import { inspectBrokerResultChannel } from "./t201-broker-result-channel.mjs";
import { T201_MATRIX_CASE_IDS } from "./t201-matrix-evaluator.mjs";

const DEFAULT_PHASE = "safe_unknown_phase";
const DEFAULT_FAILURE = "safe_unknown_failure";
const EVIDENCE_CLASSIFICATION = "live_t201_semantic_parsing";
const TMP_PREFIX = "codex-direct-oauth-t201-semantic-parsing.json.tmp-";

const allowedRunIdPattern = /^[a-f0-9]{32,64}$/;
const SAFE_EVENT_TYPE_COUNT_KEYS = Object.freeze([
  "response.created",
  "response.in_progress",
  "response.output_item.added",
  "response.content_part.added",
  "response.output_text.delta",
  "response.output_text.done",
  "response.content_part.done",
  "response.output_item.done",
  "response.completed",
  "response.failed",
  "response.reasoning_summary_part.added",
  "response.reasoning_summary_text.delta",
  "response.reasoning_summary_text.done",
  "response.reasoning_summary_part.done",
  "encrypted_reasoning_event_category",
  "other_known_structural",
  "unknown_event_count",
]);

export function generateRunnerRunIdHash() {
  return crypto.randomBytes(16).toString("hex");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function booleanValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value, fallback) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function countValue(value) {
  return Number.isInteger(value) ? value : null;
}

function categoryValue(value) {
  return stringValue(value, "not_evaluated");
}

function safeEventTypeCounts(value) {
  return Object.fromEntries(
    SAFE_EVENT_TYPE_COUNT_KEYS.map((key) => [
      key,
      isPlainObject(value) ? (countValue(value[key]) ?? 0) : 0,
    ]),
  );
}

function safeResultArtifactPreflight(value) {
  if (!isPlainObject(value)) return null;
  return {
    effective_uid: countValue(value.effective_uid),
    effective_gid: countValue(value.effective_gid),
    directory_uid: countValue(value.directory_uid),
    directory_gid: countValue(value.directory_gid),
    directory_mode: countValue(value.directory_mode),
    same_filesystem: nullableBoolean(value.same_filesystem),
  };
}

export function parseReaderDiagnostics(value, exitCode) {
  const text = String(value ?? "");
  const success = text.match(
    /safe_result_reader_success:(\d+):(\d+):(600|[0-7]{3}):(same_filesystem|different_filesystem)/,
  );
  if (success) {
    return {
      reader_exit_code: Number.isInteger(exitCode) ? exitCode : null,
      reader_state: "validated_final_json",
      reader_effective_uid: Number(success[1]),
      reader_effective_gid: Number(success[2]),
      final_file_mode: Number.parseInt(success[3], 8),
      same_filesystem: success[4] === "same_filesystem",
      failure_operation: null,
      failure_errno: null,
    };
  }
  const failure = text.match(
    /safe_result_reader_failure:([a-z_]+):(E[A-Z]+|unknown)/,
  );
  return {
    reader_exit_code: Number.isInteger(exitCode) ? exitCode : null,
    reader_state: failure ? "safe_reader_failure" : "not_measured",
    reader_effective_uid: null,
    reader_effective_gid: null,
    final_file_mode: null,
    same_filesystem: null,
    failure_operation: failure?.[1] ?? null,
    failure_errno: failure?.[2] ?? null,
  };
}

function nullableBoolean(value) {
  if (value === null) return null;
  return typeof value === "boolean" ? value : false;
}

function parseTimestampMs(value) {
  if (typeof value !== "string" || value.length === 0) return NaN;
  return Date.parse(value);
}

export function brokerExitStatusCategory({
  brokerExitCode,
  hasValidCurrentResult,
}) {
  if (!hasValidCurrentResult) return "runner_or_container_failure";
  if (brokerExitCode === 0) return "success";
  if (brokerExitCode === 1) return "evaluated_gate_failure";
  return "unexpected_exit";
}

export function validateBrokerResult(
  result,
  { runnerRunIdHash, runnerStartedAt, expectedCaseId },
) {
  const reasons = [];
  if (!isPlainObject(result)) reasons.push("result_not_object");
  if (!allowedRunIdPattern.test(runnerRunIdHash))
    reasons.push("runner_run_id_invalid");
  if (
    isPlainObject(result) &&
    result.evidence_classification !== EVIDENCE_CLASSIFICATION
  ) {
    reasons.push("classification_mismatch");
  }
  if (isPlainObject(result) && result.runner_run_id_hash !== runnerRunIdHash) {
    reasons.push("runner_run_id_mismatch");
  }
  if (expectedCaseId && result?.fixture_identifier !== expectedCaseId) {
    reasons.push("fixture_identifier_mismatch");
  }
  const brokerTimestampMs = parseTimestampMs(result?.observation_timestamp);
  const runnerStartedMs = parseTimestampMs(runnerStartedAt);
  if (!Number.isFinite(brokerTimestampMs))
    reasons.push("broker_timestamp_invalid");
  if (!Number.isFinite(runnerStartedMs))
    reasons.push("runner_timestamp_invalid");
  if (
    Number.isFinite(brokerTimestampMs) &&
    Number.isFinite(runnerStartedMs) &&
    brokerTimestampMs < runnerStartedMs
  ) {
    reasons.push("broker_timestamp_before_runner");
  }
  if (
    isPlainObject(result) &&
    containsSecretLikeValue(JSON.stringify(result))
  ) {
    reasons.push("secret_like_value_in_broker_result");
  }
  return { ok: reasons.length === 0, reasons };
}

export function parseCurrentBrokerResult(
  logText,
  { runnerRunIdHash, runnerStartedAt, expectedCaseId },
) {
  const candidates = [];
  for (const line of String(logText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) continue;
    try {
      candidates.push(JSON.parse(trimmed));
    } catch {
      // Non-JSON Docker output is ignored; validity is decided below.
    }
  }

  let firstInvalidCurrent = null;
  for (const candidate of candidates) {
    const validation = validateBrokerResult(candidate, {
      runnerRunIdHash,
      runnerStartedAt,
      expectedCaseId,
    });
    if (validation.ok) {
      return {
        ok: true,
        result: candidate,
        resultReceived: true,
        schemaValid: true,
        rejectionReasons: [],
      };
    }
    if (
      candidate?.runner_run_id_hash === runnerRunIdHash &&
      firstInvalidCurrent === null
    ) {
      firstInvalidCurrent = validation.reasons;
    }
  }

  return {
    ok: false,
    result: null,
    resultReceived: candidates.length > 0,
    schemaValid: false,
    rejectionReasons:
      firstInvalidCurrent ??
      (candidates.length > 0
        ? ["no_current_broker_result"]
        : ["no_json_broker_result"]),
  };
}

function projectSafeResult(result) {
  const primaryFailureCategory = stringValue(
    result.primary_failure_category,
    "none",
  );
  const primaryFailurePhase = stringValue(
    result.primary_failure_phase,
    primaryFailureCategory === "none" ? "none" : DEFAULT_PHASE,
  );
  return {
    evidence_classification: result.evidence_classification,
    broker_observation_timestamp: result.observation_timestamp,
    upstream_revisions: result.upstream_revisions,
    deployment_mode: result.deployment_mode,
    fixture_identifier: result.fixture_identifier,
    fixture_sha256: result.fixture_sha256,
    fixture_classified_as_synthetic: booleanValue(
      result.fixture_classified_as_synthetic,
    ),
    result_artifact_preflight: safeResultArtifactPreflight(
      result.result_artifact_preflight,
    ),
    golden_structured_json_bytes: countValue(
      result.golden_structured_json_bytes,
    ),
    golden_structured_json_size_category: stringValue(
      result.golden_structured_json_size_category,
      "not_evaluated",
    ),
    derived_expected_live_json_ceiling: countValue(
      result.derived_expected_live_json_ceiling,
    ),
    fixture_file_readable: booleanValue(result.fixture_file_readable),
    schema_file_readable: booleanValue(result.schema_file_readable),
    json_schema_parsed_locally: booleanValue(result.json_schema_parsed_locally),
    fixture_bytes_category: stringValue(
      result.fixture_bytes_category,
      "not_evaluated",
    ),
    schema_bytes_category: stringValue(
      result.schema_bytes_category,
      "not_evaluated",
    ),
    prompt_bytes_category: stringValue(
      result.prompt_bytes_category,
      "not_evaluated",
    ),
    serialized_request_bytes_category: stringValue(
      result.serialized_request_bytes_category,
      "not_evaluated",
    ),
    serialized_request_within_limit: booleanValue(
      result.serialized_request_within_limit,
    ),
    request_serialization_succeeded: booleanValue(
      result.request_serialization_succeeded,
    ),
    encrypted_state_recovered: booleanValue(result.encrypted_state_recovered),
    credential_generation_before: countValue(
      result.credential_generation_before,
    ),
    refresh_required: booleanValue(result.refresh_required),
    refresh_attempted: booleanValue(result.refresh_attempted),
    refresh_succeeded: booleanValue(result.refresh_succeeded),
    credential_generation_after: countValue(result.credential_generation_after),
    invocation_attempted: booleanValue(result.invocation_attempted),
    invocation_succeeded: booleanValue(result.invocation_succeeded),
    exact_http_status: result.exact_http_status ?? null,
    safe_http_status_category: stringValue(
      result.safe_http_status_category,
      "unknown_status",
    ),
    response_byte_limit: countValue(result.response_byte_limit),
    response_bytes_observed_before_abort: countValue(
      result.response_bytes_observed_before_abort,
    ),
    response_bytes_category: stringValue(
      result.response_bytes_category,
      "not_evaluated",
    ),
    response_compressed_byte_limit: countValue(
      result.response_compressed_byte_limit,
    ),
    response_compressed_bytes_observed_before_abort: countValue(
      result.response_compressed_bytes_observed_before_abort,
    ),
    response_compressed_bytes_category: stringValue(
      result.response_compressed_bytes_category,
      "not_evaluated",
    ),
    response_decompressed_byte_limit: countValue(
      result.response_decompressed_byte_limit,
    ),
    response_decompressed_bytes_observed_before_abort: countValue(
      result.response_decompressed_bytes_observed_before_abort,
    ),
    response_decompressed_bytes_category: stringValue(
      result.response_decompressed_bytes_category,
      "not_evaluated",
    ),
    response_event_byte_limit: countValue(result.response_event_byte_limit),
    largest_sse_event_bytes_observed: countValue(
      result.largest_sse_event_bytes_observed,
    ),
    triggering_sse_event_bytes: countValue(result.triggering_sse_event_bytes),
    response_event_count_semantics: stringValue(
      result.response_event_count_semantics,
      "not_evaluated",
    ),
    raw_chunk_count: countValue(result.raw_chunk_count),
    sse_line_count: countValue(result.sse_line_count),
    sse_comment_count: countValue(result.sse_comment_count),
    sse_blank_line_dispatch_count: countValue(
      result.sse_blank_line_dispatch_count,
    ),
    sse_empty_dispatch_count: countValue(result.sse_empty_dispatch_count),
    sse_data_dispatch_count: countValue(result.sse_data_dispatch_count),
    json_event_count: countValue(result.json_event_count),
    typed_protocol_event_count: countValue(result.typed_protocol_event_count),
    recognized_protocol_event_count: countValue(
      result.recognized_protocol_event_count,
    ),
    unknown_protocol_event_count: countValue(
      result.unknown_protocol_event_count,
    ),
    average_protocol_event_bytes_denominator: countValue(
      result.average_protocol_event_bytes_denominator,
    ),
    average_protocol_event_bytes_denominator_semantics: stringValue(
      result.average_protocol_event_bytes_denominator_semantics,
      "not_evaluated",
    ),
    estimated_average_protocol_event_bytes: countValue(
      result.estimated_average_protocol_event_bytes,
    ),
    average_protocol_event_bytes_category: categoryValue(
      result.average_protocol_event_bytes_category,
    ),
    estimated_average_sse_event_bytes: countValue(
      result.estimated_average_sse_event_bytes,
    ),
    average_sse_event_bytes_category: categoryValue(
      result.average_sse_event_bytes_category,
    ),
    response_event_limit: countValue(result.response_event_limit),
    response_events_observed_before_abort: countValue(
      result.response_events_observed_before_abort,
    ),
    event_type_counts: safeEventTypeCounts(result.event_type_counts),
    output_text_delta_event_count: countValue(
      result.output_text_delta_event_count,
    ),
    reasoning_event_count: countValue(result.reasoning_event_count),
    structural_event_count: countValue(result.structural_event_count),
    assistant_output_byte_limit: countValue(result.assistant_output_byte_limit),
    assistant_output_bytes_observed_before_abort: countValue(
      result.assistant_output_bytes_observed_before_abort,
    ),
    assistant_output_started: booleanValue(result.assistant_output_started),
    terminal_event_observed: booleanValue(result.terminal_event_observed),
    structured_json_byte_limit: countValue(result.structured_json_byte_limit),
    limit_that_triggered:
      result.limit_that_triggered === null
        ? null
        : stringValue(result.limit_that_triggered, "unknown_limit"),
    response_truncated_by_safety_limit: booleanValue(
      result.response_truncated_by_safety_limit,
    ),
    partial_stream_statistics_preserved: booleanValue(
      result.partial_stream_statistics_preserved,
    ),
    response_protocol_valid: booleanValue(result.response_protocol_valid),
    response_event_count: Number.isInteger(result.response_event_count)
      ? result.response_event_count
      : 0,
    model_output_received: booleanValue(result.model_output_received),
    structured_output_evaluated: booleanValue(
      result.structured_output_evaluated,
    ),
    semantic_quality_evaluated: booleanValue(result.semantic_quality_evaluated),
    metrics_measurement_state: stringValue(
      result.metrics_measurement_state,
      "not_measured",
    ),
    primary_failure_category: primaryFailureCategory,
    primary_failure_phase: primaryFailurePhase,
    secondary_failure_categories: arrayValue(
      result.secondary_failure_categories,
    ),
    safe_transport_classification: result.safe_transport_classification ?? null,
    safe_node_error_code: result.safe_node_error_code ?? null,
    structured_output_mechanism_category: stringValue(
      result.structured_output_mechanism_category,
      "json_only_local_strict_parser",
    ),
    schema_valid: nullableBoolean(result.schema_valid),
    expected_section_counts: result.expected_section_counts,
    expected_item_counts: result.expected_item_counts,
    evaluation_metrics: result.evaluation_metrics,
    unsupported_fact_count: countValue(result.unsupported_fact_count),
    forbidden_inference_count: countValue(result.forbidden_inference_count),
    missing_evidence_count: countValue(result.missing_evidence_count),
    invalid_evidence_count: countValue(result.invalid_evidence_count),
    ambiguity_handling_pass: booleanValue(result.ambiguity_handling_pass),
    absent_optional_fields_pass: booleanValue(
      result.absent_optional_fields_pass,
    ),
    no_invention_pass: nullableBoolean(result.no_invention_pass),
    grounding_pass: nullableBoolean(result.grounding_pass),
    parsing_pass: booleanValue(result.parsing_pass),
    credential_exposure_boolean: booleanValue(
      result.credential_exposure_boolean,
    ),
    account_identifier_exposure_boolean: booleanValue(
      result.account_identifier_exposure_boolean,
    ),
    raw_credentials_exposed_to_parent: booleanValue(
      result.raw_credentials_exposed_to_parent,
    ),
    account_identifier_exposed_to_parent: booleanValue(
      result.account_identifier_exposed_to_parent,
    ),
    raw_model_response_persisted: booleanValue(
      result.raw_model_response_persisted,
    ),
    raw_response_persisted: booleanValue(result.raw_response_persisted),
    encrypted_state_preserved: booleanValue(result.encrypted_state_preserved),
    safe_error_categories: arrayValue(result.safe_error_categories),
    t201_transport_manifest_matches_t200: booleanValue(
      result.t201_transport_manifest_matches_t200,
    ),
    t201_transport_mismatches: arrayValue(result.t201_transport_mismatches),
    t201_request_reasoning_effort_category: stringValue(
      result.t201_request_reasoning_effort_category,
      "not_evaluated",
    ),
    t201_request_reasoning_summary_present: booleanValue(
      result.t201_request_reasoning_summary_present,
    ),
    t201_request_include_category: stringValue(
      result.t201_request_include_category,
      "not_evaluated",
    ),
    t201_request_text_verbosity_category: stringValue(
      result.t201_request_text_verbosity_category,
      "not_evaluated",
    ),
    t201_request_tools_present: booleanValue(result.t201_request_tools_present),
    t201_request_store_false: booleanValue(result.t201_request_store_false),
    t201_request_stream_boolean: booleanValue(
      result.t201_request_stream_boolean,
    ),
    proxy_environment_present: booleanValue(result.proxy_environment_present),
    proxy_environment_ignored: booleanValue(result.proxy_environment_ignored),
    proxy_environment_keys_present: isPlainObject(
      result.proxy_environment_keys_present,
    )
      ? result.proxy_environment_keys_present
      : {},
    network_configuration_matches_t200: booleanValue(
      result.network_configuration_matches_t200,
    ),
    safe_final_state: stringValue(
      result.safe_final_state,
      primaryFailureCategory === "none" ? "complete" : primaryFailureCategory,
    ),
  };
}

export function buildFinalEvidence({
  brokerResult,
  brokerExitCode,
  runnerRunIdHash,
  runnerStartedAt,
  brokerRemoved,
  callbackPortAbsent,
  secretScanResult,
  logSecretScanResult,
  caseId,
  resultChannel,
  readerDiagnostics,
  generatedAt = new Date(),
  parseOutcome,
}) {
  const hasValidCurrentResult = Boolean(brokerResult);
  const exitCategory = brokerExitStatusCategory({
    brokerExitCode,
    hasValidCurrentResult,
  });
  const common = {
    observation_timestamp: generatedAt.toISOString(),
    runner_run_id_hash: runnerRunIdHash,
    runner_started_at: runnerStartedAt,
    broker_result_received: booleanValue(parseOutcome?.resultReceived),
    broker_exit_code: brokerExitCode,
    broker_exit_status_category: exitCategory,
    evidence_generated_from_current_run: hasValidCurrentResult,
    evidence_schema_valid: hasValidCurrentResult,
    evidence_rejection_reasons: arrayValue(parseOutcome?.rejectionReasons),
    broker_removed: booleanValue(brokerRemoved),
    callback_port_absent:
      booleanValue(callbackPortAbsent) &&
      booleanValue(brokerResult?.callback_port_absent, true),
    secret_scan_result: stringValue(secretScanResult, "failed"),
    log_secret_scan_result: stringValue(logSecretScanResult, "failed"),
    evidence_atomic_replace_succeeded: false,
    broker_process_exit_code: brokerExitCode,
    result_channel_state: resultChannel?.result_state ?? "legacy_stdout_log",
    broker_stdout_state: resultChannel?.stdout_state ?? "not_measured",
    broker_stdout_byte_count: resultChannel?.stdout_byte_count ?? null,
    broker_stderr_byte_count: resultChannel?.stderr_byte_count ?? null,
    broker_stdout_sha256: resultChannel?.stdout_sha256 ?? null,
    broker_stderr_sha256: resultChannel?.stderr_sha256 ?? null,
    broker_stderr_safe_category:
      resultChannel?.stderr_safe_category ?? "not_measured",
    result_reader_diagnostics:
      readerDiagnostics ?? parseReaderDiagnostics(undefined, null),
  };

  if (!hasValidCurrentResult) {
    return {
      evidence_classification: EVIDENCE_CLASSIFICATION,
      fixture_identifier: caseId ?? "not_evaluated",
      fixture_classified_as_synthetic: caseId === "T201-C02",
      ...common,
      primary_failure_category:
        resultChannel?.infrastructure_category ?? "runner_failure",
      primary_failure_phase: resultChannel
        ? "broker_result_channel"
        : "broker_result_parse",
      model_output_received: false,
      structured_output_evaluated: false,
      semantic_quality_evaluated: false,
      metrics_measurement_state: "not_measured",
      raw_credentials_exposed_to_parent: false,
      account_identifier_exposed_to_parent: false,
      credential_exposure_boolean: false,
      account_identifier_exposure_boolean: false,
      raw_model_response_persisted: false,
      raw_response_persisted: false,
      encrypted_state_preserved: true,
      invocation_attempted: false,
      invocation_succeeded: false,
      response_protocol_valid: false,
      event_type_counts: {},
      output_text_delta_event_count: 0,
      reasoning_event_count: 0,
      structural_event_count: 0,
      assistant_output_bytes_observed_before_abort: 0,
      assistant_output_started: false,
      terminal_event_observed: false,
      estimated_average_sse_event_bytes: 0,
      average_sse_event_bytes_category: "no_events",
      parsing_pass: false,
      safe_final_state: "runner_failure",
      case_pass: false,
      t201_complete: false,
    };
  }

  const evidence = {
    ...projectSafeResult(brokerResult),
    ...common,
  };
  const complete =
    exitCategory === "success" &&
    evidence.encrypted_state_recovered === true &&
    evidence.invocation_succeeded === true &&
    evidence.response_protocol_valid === true &&
    evidence.schema_valid === true &&
    evidence.grounding_pass === true &&
    evidence.no_invention_pass === true &&
    evidence.parsing_pass === true &&
    evidence.unsupported_fact_count === 0 &&
    evidence.forbidden_inference_count === 0 &&
    evidence.missing_evidence_count === 0 &&
    evidence.invalid_evidence_count === 0 &&
    evidence.credential_exposure_boolean === false &&
    evidence.account_identifier_exposure_boolean === false &&
    evidence.raw_credentials_exposed_to_parent === false &&
    evidence.account_identifier_exposed_to_parent === false &&
    evidence.raw_model_response_persisted === false &&
    evidence.encrypted_state_preserved === true &&
    evidence.broker_removed === true &&
    evidence.callback_port_absent === true &&
    evidence.secret_scan_result === "passed" &&
    evidence.log_secret_scan_result === "passed";
  evidence.safe_final_state = complete
    ? "complete"
    : evidence.safe_final_state === "complete"
      ? DEFAULT_FAILURE
      : evidence.safe_final_state;
  evidence.case_pass = complete;
  evidence.t201_complete = caseId === "T201-C02" ? false : complete;
  return evidence;
}

export async function removeAbandonedTempEvidence(evidencePath) {
  const dir = path.dirname(evidencePath);
  const entries = await fs.readdir(dir).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(TMP_PREFIX))
      .map((entry) => fs.rm(path.join(dir, entry), { force: true })),
  );
}

export async function writeEvidenceAtomic(evidencePath, evidence) {
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await removeAbandonedTempEvidence(evidencePath);
  const tempPath = path.join(
    path.dirname(evidencePath),
    `${TMP_PREFIX}${process.pid}-${crypto.randomBytes(8).toString("hex")}`,
  );
  const nextEvidence = { ...evidence, evidence_atomic_replace_succeeded: true };
  await fs.writeFile(tempPath, `${JSON.stringify(nextEvidence, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(tempPath, evidencePath);
  return nextEvidence;
}

const MATRIX_SAFE_METRIC_KEYS = Object.freeze([
  "schema_valid",
  "expected_section_recall",
  "expected_item_recall",
  "exact_fact_recall",
  "high_priority_fact_recall",
  "unsupported_fact_count",
  "forbidden_inference_count",
  "missing_evidence_count",
  "invalid_evidence_count",
  "grounding_pass",
  "no_invention_pass",
  "parsing_pass",
]);
const MATRIX_STATE_PARTIAL = "partially_live_evaluated";
const MATRIX_STATE_ALL_CASES_LIVE_PASSED = "all_cases_live_passed";

function applyT201MatrixCaseEvidence(target, evidence) {
  const groundingPass =
    evidence.grounding_pass ??
    evidence.evaluation_metrics?.grounding_pass ??
    null;
  target.safe_metrics = {
    ...Object.fromEntries(
      MATRIX_SAFE_METRIC_KEYS.map((key) => [
        key,
        key === "grounding_pass"
          ? groundingPass
          : (evidence.evaluation_metrics?.[key] ?? null),
      ]),
    ),
    ambiguity_handling_pass: evidence.ambiguity_handling_pass === true,
  };
  target.pass = evidence.case_pass === true;
  target.privacy_safe =
    evidence.raw_credentials_exposed_to_parent === false &&
    evidence.account_identifier_exposed_to_parent === false &&
    evidence.raw_model_response_persisted === false;
  target.credential_isolation =
    evidence.encrypted_state_preserved === true &&
    evidence.broker_removed === true;
}

function recomputeT201MatrixPass(matrix) {
  matrix.matrix_pass =
    matrix.cases.length === T201_MATRIX_CASE_IDS.length &&
    matrix.cases.every((item) => item.pass === true);
  matrix.matrix_state = matrix.matrix_pass
    ? MATRIX_STATE_ALL_CASES_LIVE_PASSED
    : MATRIX_STATE_PARTIAL;
}

async function evidenceForMatrixCase(evidencePath, caseId) {
  const evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  if (
    evidence.fixture_identifier !== caseId ||
    evidence.evidence_classification !== EVIDENCE_CLASSIFICATION
  ) {
    throw new Error(
      caseId === "T201-C02"
        ? "invalid_c02_evidence_for_matrix_update"
        : "invalid_t201_evidence_for_matrix_update",
    );
  }
  if (caseId === "T201-C02" && evidence.t201_complete !== false) {
    throw new Error("invalid_c02_evidence_for_matrix_update");
  }
  return evidence;
}

export async function updateC02MatrixEvidence({ evidencePath, matrixPath }) {
  return updateT201MatrixCaseEvidence({
    evidencePath,
    matrixPath,
    caseId: "T201-C02",
  });
}

// Every runner path (shell or library) dispatches sanitized live evidence
// through this centralized case gate. Any T201 matrix case may be updated;
// unknown case identifiers are a no-op so the bounded runner tail never
// mutates unrelated evidence.
export async function updateMatrixEvidenceForCase({
  evidencePath,
  matrixPath,
  caseId,
}) {
  if (!T201_MATRIX_CASE_IDS.includes(caseId)) return null;
  return updateT201MatrixCaseEvidence({ evidencePath, matrixPath, caseId });
}

export async function updateT201MatrixCaseEvidence({
  evidencePath,
  matrixPath,
  caseId,
}) {
  if (!T201_MATRIX_CASE_IDS.includes(caseId)) return null;
  const evidence = await evidenceForMatrixCase(evidencePath, caseId);
  const matrix = JSON.parse(await fs.readFile(matrixPath, "utf8"));
  if (
    !Array.isArray(matrix.cases) ||
    matrix.cases.length !== T201_MATRIX_CASE_IDS.length
  )
    throw new Error("invalid_t201_matrix");
  const target = matrix.cases.find((item) => item.case_id === caseId);
  if (!target) throw new Error(`missing_t201_matrix_entry:${caseId}`);
  applyT201MatrixCaseEvidence(target, evidence);
  recomputeT201MatrixPass(matrix);
  await writeEvidenceAtomic(matrixPath, matrix);
  return matrix;
}

function evidencePassesMatrixGate(caseId, evidence) {
  return (
    evidence.fixture_identifier === caseId &&
    evidence.evidence_classification === EVIDENCE_CLASSIFICATION &&
    evidence.case_pass === true &&
    evidence.safe_final_state === "complete" &&
    evidence.evaluation_metrics?.parsing_pass === true
  );
}

// Deterministic offline selection of the authoritative sanitized evidence for
// every T201 matrix case. Only attempts recorded in the Campaign-B
// authorization registry are considered. Zero passing attempts leaves the case
// unmatched (recorded as not passed); more than one passing attempt fails
// closed instead of guessing.
export async function selectT201AuthoritativeEvidenceFiles({
  registry,
  repoRoot,
}) {
  const selected = new Map();
  for (const entry of registry.authorized_attempts ?? []) {
    const caseId = entry.semantic_case;
    if (!T201_MATRIX_CASE_IDS.includes(caseId)) continue;
    const evidencePath = path.resolve(repoRoot, entry.evidence);
    let evidence;
    try {
      evidence = JSON.parse(await fs.readFile(evidencePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!evidencePassesMatrixGate(caseId, evidence)) continue;
    if (selected.has(caseId))
      throw new Error("t201_matrix_authoritative_attempt_ambiguous");
    selected.set(caseId, {
      campaign: entry.campaign,
      attempt: entry.attempt,
      evidence_path: evidencePath,
      evidence,
    });
  }
  return selected;
}

// Fully offline consolidation of the checked-in T201 matrix from sanitized
// evidence. C01 predates Campaign B and its canonical live evidence is
// preserved unchanged; the legacy matrix entry is the authoritative record.
// All other cases are re-projected from the single passing authorized attempt.
export async function consolidateT201MatrixEvidence({
  matrixPath,
  registryPath,
  repoRoot,
}) {
  const matrix = JSON.parse(await fs.readFile(matrixPath, "utf8"));
  if (
    !Array.isArray(matrix.cases) ||
    matrix.cases.length !== T201_MATRIX_CASE_IDS.length
  )
    throw new Error("invalid_t201_matrix");
  let registry;
  try {
    registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
  } catch {
    throw new Error("campaign_b_authorization_registry_invalid");
  }
  if (
    registry?.schema_version !== 1 ||
    !Array.isArray(registry.authorized_attempts)
  )
    throw new Error("campaign_b_authorization_registry_invalid");
  const authoritative = await selectT201AuthoritativeEvidenceFiles({
    registry,
    repoRoot,
  });
  for (const caseId of T201_MATRIX_CASE_IDS) {
    const target = matrix.cases.find((item) => item.case_id === caseId);
    if (!target) throw new Error(`missing_t201_matrix_entry:${caseId}`);
    if (caseId === "T201-C01") {
      if (target.pass !== true || !target.safe_metrics)
        throw new Error("t201_c01_legacy_matrix_entry_invalid");
      continue;
    }
    const selected = authoritative.get(caseId);
    if (!selected) {
      target.pass = false;
      target.safe_metrics = null;
      continue;
    }
    applyT201MatrixCaseEvidence(target, selected.evidence);
  }
  recomputeT201MatrixPass(matrix);
  await writeEvidenceAtomic(matrixPath, matrix);
  return matrix;
}

export async function processT201RunnerEvidence({
  evidencePath,
  logsPath,
  runnerRunIdHash,
  runnerStartedAt,
  brokerExitCode,
  brokerRemoved,
  callbackPortAbsent,
  secretScanResult,
  logSecretScanResult,
  caseId,
  resultPath,
  stdoutPath,
  stderrPath,
  readerStderrPath,
  readerExitCode,
  processStartFailed = false,
  generatedAt,
}) {
  const resultChannel = resultPath
    ? await inspectBrokerResultChannel({
        resultPath,
        stdoutPath,
        stderrPath,
        brokerExitCode,
        processStartFailed,
      })
    : null;
  const logText = resultChannel
    ? ""
    : await fs.readFile(logsPath, "utf8").catch(() => "");
  const readerDiagnostics = parseReaderDiagnostics(
    await fs.readFile(readerStderrPath, "utf8").catch(() => ""),
    readerExitCode,
  );
  const parsed = resultChannel?.result;
  const validation = parsed
    ? validateBrokerResult(parsed, {
        runnerRunIdHash,
        runnerStartedAt,
        expectedCaseId: caseId,
      })
    : null;
  const parseOutcome = resultChannel
    ? validation?.ok
      ? {
          ok: true,
          result: parsed,
          resultReceived: true,
          schemaValid: true,
          rejectionReasons: [],
          infrastructureCategory: null,
        }
      : {
          ok: false,
          result: null,
          resultReceived: resultChannel.result_state !== "empty_result",
          schemaValid: false,
          rejectionReasons: validation?.reasons ?? [
            resultChannel.infrastructure_category,
          ],
          infrastructureCategory: resultChannel.infrastructure_category,
        }
    : parseCurrentBrokerResult(logText, {
        runnerRunIdHash,
        runnerStartedAt,
        expectedCaseId: caseId,
      });
  const evidence = buildFinalEvidence({
    brokerResult: parseOutcome.ok ? parseOutcome.result : null,
    brokerExitCode,
    runnerRunIdHash,
    runnerStartedAt,
    brokerRemoved,
    callbackPortAbsent,
    secretScanResult,
    logSecretScanResult,
    caseId,
    resultChannel,
    readerDiagnostics,
    generatedAt,
    parseOutcome,
  });
  return writeEvidenceAtomic(evidencePath, evidence);
}

// Evidence existence is not a success signal: a failed attempt deliberately
// writes atomic evidence before the parent returns a non-zero status.
export function runnerExitCode(evidence, evidenceWriteSucceeded = true) {
  return evidenceWriteSucceeded && evidence?.case_pass === true ? 0 : 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const [
    ,
    ,
    evidencePath,
    logsPath,
    runnerRunIdHash,
    runnerStartedAt,
    brokerRemovedValue,
    callbackAbsentValue,
    secretScanResult,
    logSecretScanResult,
    brokerExitCodeValue,
    caseId,
    resultPath,
    stdoutPath,
    stderrPath,
    processStartFailedValue,
  ] = process.argv;
  const evidence = await processT201RunnerEvidence({
    evidencePath,
    logsPath,
    runnerRunIdHash,
    runnerStartedAt,
    brokerExitCode: Number(brokerExitCodeValue),
    brokerRemoved: brokerRemovedValue === "true",
    callbackPortAbsent: callbackAbsentValue === "true",
    secretScanResult,
    logSecretScanResult,
    caseId,
    resultPath,
    stdoutPath,
    stderrPath,
    processStartFailed: processStartFailedValue === "true",
    readerStderrPath: process.argv[16],
    readerExitCode: Number(process.argv[17]),
  });
  process.exit(runnerExitCode(evidence));
}
