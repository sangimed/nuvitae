import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { containsSecretLikeValue } from "./sanitize.mjs";

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
  return Object.fromEntries(SAFE_EVENT_TYPE_COUNT_KEYS.map((key) => [key, isPlainObject(value) ? countValue(value[key]) ?? 0 : 0]));
}

function nullableBoolean(value) {
  if (value === null) return null;
  return typeof value === "boolean" ? value : false;
}

function parseTimestampMs(value) {
  if (typeof value !== "string" || value.length === 0) return NaN;
  return Date.parse(value);
}

export function brokerExitStatusCategory({ brokerExitCode, hasValidCurrentResult }) {
  if (!hasValidCurrentResult) return "runner_or_container_failure";
  if (brokerExitCode === 0) return "success";
  if (brokerExitCode === 1) return "evaluated_gate_failure";
  return "unexpected_exit";
}

export function validateBrokerResult(result, { runnerRunIdHash, runnerStartedAt }) {
  const reasons = [];
  if (!isPlainObject(result)) reasons.push("result_not_object");
  if (!allowedRunIdPattern.test(runnerRunIdHash)) reasons.push("runner_run_id_invalid");
  if (isPlainObject(result) && result.evidence_classification !== EVIDENCE_CLASSIFICATION) {
    reasons.push("classification_mismatch");
  }
  if (isPlainObject(result) && result.runner_run_id_hash !== runnerRunIdHash) {
    reasons.push("runner_run_id_mismatch");
  }
  const brokerTimestampMs = parseTimestampMs(result?.observation_timestamp);
  const runnerStartedMs = parseTimestampMs(runnerStartedAt);
  if (!Number.isFinite(brokerTimestampMs)) reasons.push("broker_timestamp_invalid");
  if (!Number.isFinite(runnerStartedMs)) reasons.push("runner_timestamp_invalid");
  if (Number.isFinite(brokerTimestampMs) && Number.isFinite(runnerStartedMs) && brokerTimestampMs < runnerStartedMs) {
    reasons.push("broker_timestamp_before_runner");
  }
  if (isPlainObject(result) && containsSecretLikeValue(JSON.stringify(result))) {
    reasons.push("secret_like_value_in_broker_result");
  }
  return { ok: reasons.length === 0, reasons };
}

export function parseCurrentBrokerResult(logText, { runnerRunIdHash, runnerStartedAt }) {
  const candidates = [];
  for (const line of String(logText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) continue;
    try {
      candidates.push(JSON.parse(trimmed));
    } catch (_error) {
      // Non-JSON Docker output is ignored; validity is decided below.
    }
  }

  let firstInvalidCurrent = null;
  for (const candidate of candidates) {
    const validation = validateBrokerResult(candidate, { runnerRunIdHash, runnerStartedAt });
    if (validation.ok) {
      return { ok: true, result: candidate, resultReceived: true, schemaValid: true, rejectionReasons: [] };
    }
    if (candidate?.runner_run_id_hash === runnerRunIdHash && firstInvalidCurrent === null) {
      firstInvalidCurrent = validation.reasons;
    }
  }

  return {
    ok: false,
    result: null,
    resultReceived: candidates.length > 0,
    schemaValid: false,
    rejectionReasons: firstInvalidCurrent ?? (candidates.length > 0 ? ["no_current_broker_result"] : ["no_json_broker_result"]),
  };
}

function projectSafeResult(result) {
  const primaryFailureCategory = stringValue(result.primary_failure_category, "none");
  const primaryFailurePhase = stringValue(result.primary_failure_phase, primaryFailureCategory === "none" ? "none" : DEFAULT_PHASE);
  return {
    evidence_classification: result.evidence_classification,
    broker_observation_timestamp: result.observation_timestamp,
    upstream_revisions: result.upstream_revisions,
    deployment_mode: result.deployment_mode,
    fixture_identifier: result.fixture_identifier,
    fixture_sha256: result.fixture_sha256,
    fixture_classified_as_synthetic: booleanValue(result.fixture_classified_as_synthetic),
    golden_structured_json_bytes: countValue(result.golden_structured_json_bytes),
    golden_structured_json_size_category: stringValue(result.golden_structured_json_size_category, "not_evaluated"),
    derived_expected_live_json_ceiling: countValue(result.derived_expected_live_json_ceiling),
    fixture_file_readable: booleanValue(result.fixture_file_readable),
    schema_file_readable: booleanValue(result.schema_file_readable),
    json_schema_parsed_locally: booleanValue(result.json_schema_parsed_locally),
    fixture_bytes_category: stringValue(result.fixture_bytes_category, "not_evaluated"),
    schema_bytes_category: stringValue(result.schema_bytes_category, "not_evaluated"),
    prompt_bytes_category: stringValue(result.prompt_bytes_category, "not_evaluated"),
    serialized_request_bytes_category: stringValue(result.serialized_request_bytes_category, "not_evaluated"),
    serialized_request_within_limit: booleanValue(result.serialized_request_within_limit),
    request_serialization_succeeded: booleanValue(result.request_serialization_succeeded),
    encrypted_state_recovered: booleanValue(result.encrypted_state_recovered),
    refresh_required: booleanValue(result.refresh_required),
    refresh_attempted: booleanValue(result.refresh_attempted),
    refresh_succeeded: booleanValue(result.refresh_succeeded),
    invocation_attempted: booleanValue(result.invocation_attempted),
    invocation_succeeded: booleanValue(result.invocation_succeeded),
    exact_http_status: result.exact_http_status ?? null,
    safe_http_status_category: stringValue(result.safe_http_status_category, "unknown_status"),
    response_byte_limit: countValue(result.response_byte_limit),
    response_bytes_observed_before_abort: countValue(result.response_bytes_observed_before_abort),
    response_bytes_category: stringValue(result.response_bytes_category, "not_evaluated"),
    response_compressed_byte_limit: countValue(result.response_compressed_byte_limit),
    response_compressed_bytes_observed_before_abort: countValue(result.response_compressed_bytes_observed_before_abort),
    response_compressed_bytes_category: stringValue(result.response_compressed_bytes_category, "not_evaluated"),
    response_decompressed_byte_limit: countValue(result.response_decompressed_byte_limit),
    response_decompressed_bytes_observed_before_abort: countValue(result.response_decompressed_bytes_observed_before_abort),
    response_decompressed_bytes_category: stringValue(result.response_decompressed_bytes_category, "not_evaluated"),
    response_event_byte_limit: countValue(result.response_event_byte_limit),
    largest_sse_event_bytes_observed: countValue(result.largest_sse_event_bytes_observed),
    triggering_sse_event_bytes: countValue(result.triggering_sse_event_bytes),
    response_event_count_semantics: stringValue(result.response_event_count_semantics, "not_evaluated"),
    raw_chunk_count: countValue(result.raw_chunk_count),
    sse_line_count: countValue(result.sse_line_count),
    sse_comment_count: countValue(result.sse_comment_count),
    sse_blank_line_dispatch_count: countValue(result.sse_blank_line_dispatch_count),
    sse_empty_dispatch_count: countValue(result.sse_empty_dispatch_count),
    sse_data_dispatch_count: countValue(result.sse_data_dispatch_count),
    json_event_count: countValue(result.json_event_count),
    typed_protocol_event_count: countValue(result.typed_protocol_event_count),
    recognized_protocol_event_count: countValue(result.recognized_protocol_event_count),
    unknown_protocol_event_count: countValue(result.unknown_protocol_event_count),
    average_protocol_event_bytes_denominator: countValue(result.average_protocol_event_bytes_denominator),
    average_protocol_event_bytes_denominator_semantics: stringValue(result.average_protocol_event_bytes_denominator_semantics, "not_evaluated"),
    estimated_average_protocol_event_bytes: countValue(result.estimated_average_protocol_event_bytes),
    average_protocol_event_bytes_category: categoryValue(result.average_protocol_event_bytes_category),
    estimated_average_sse_event_bytes: countValue(result.estimated_average_sse_event_bytes),
    average_sse_event_bytes_category: categoryValue(result.average_sse_event_bytes_category),
    response_event_limit: countValue(result.response_event_limit),
    response_events_observed_before_abort: countValue(result.response_events_observed_before_abort),
    event_type_counts: safeEventTypeCounts(result.event_type_counts),
    output_text_delta_event_count: countValue(result.output_text_delta_event_count),
    reasoning_event_count: countValue(result.reasoning_event_count),
    structural_event_count: countValue(result.structural_event_count),
    assistant_output_byte_limit: countValue(result.assistant_output_byte_limit),
    assistant_output_bytes_observed_before_abort: countValue(result.assistant_output_bytes_observed_before_abort),
    assistant_output_started: booleanValue(result.assistant_output_started),
    terminal_event_observed: booleanValue(result.terminal_event_observed),
    structured_json_byte_limit: countValue(result.structured_json_byte_limit),
    limit_that_triggered: result.limit_that_triggered === null ? null : stringValue(result.limit_that_triggered, "unknown_limit"),
    response_truncated_by_safety_limit: booleanValue(result.response_truncated_by_safety_limit),
    partial_stream_statistics_preserved: booleanValue(result.partial_stream_statistics_preserved),
    response_protocol_valid: booleanValue(result.response_protocol_valid),
    response_event_count: Number.isInteger(result.response_event_count) ? result.response_event_count : 0,
    model_output_received: booleanValue(result.model_output_received),
    structured_output_evaluated: booleanValue(result.structured_output_evaluated),
    semantic_quality_evaluated: booleanValue(result.semantic_quality_evaluated),
    metrics_measurement_state: stringValue(result.metrics_measurement_state, "not_measured"),
    primary_failure_category: primaryFailureCategory,
    primary_failure_phase: primaryFailurePhase,
    secondary_failure_categories: arrayValue(result.secondary_failure_categories),
    safe_transport_classification: result.safe_transport_classification ?? null,
    safe_node_error_code: result.safe_node_error_code ?? null,
    structured_output_mechanism_category: stringValue(result.structured_output_mechanism_category, "json_only_local_strict_parser"),
    schema_valid: nullableBoolean(result.schema_valid),
    expected_section_counts: result.expected_section_counts,
    expected_item_counts: result.expected_item_counts,
    evaluation_metrics: result.evaluation_metrics,
    unsupported_fact_count: countValue(result.unsupported_fact_count),
    forbidden_inference_count: countValue(result.forbidden_inference_count),
    missing_evidence_count: countValue(result.missing_evidence_count),
    invalid_evidence_count: countValue(result.invalid_evidence_count),
    no_invention_pass: nullableBoolean(result.no_invention_pass),
    grounding_pass: nullableBoolean(result.grounding_pass),
    parsing_pass: booleanValue(result.parsing_pass),
    credential_exposure_boolean: booleanValue(result.credential_exposure_boolean),
    account_identifier_exposure_boolean: booleanValue(result.account_identifier_exposure_boolean),
    raw_credentials_exposed_to_parent: booleanValue(result.raw_credentials_exposed_to_parent),
    account_identifier_exposed_to_parent: booleanValue(result.account_identifier_exposed_to_parent),
    raw_model_response_persisted: booleanValue(result.raw_model_response_persisted),
    raw_response_persisted: booleanValue(result.raw_response_persisted),
    encrypted_state_preserved: booleanValue(result.encrypted_state_preserved),
    safe_error_categories: arrayValue(result.safe_error_categories),
    t201_transport_manifest_matches_t200: booleanValue(result.t201_transport_manifest_matches_t200),
    t201_transport_mismatches: arrayValue(result.t201_transport_mismatches),
    t201_request_reasoning_effort_category: stringValue(result.t201_request_reasoning_effort_category, "not_evaluated"),
    t201_request_reasoning_summary_present: booleanValue(result.t201_request_reasoning_summary_present),
    t201_request_include_category: stringValue(result.t201_request_include_category, "not_evaluated"),
    t201_request_text_verbosity_category: stringValue(result.t201_request_text_verbosity_category, "not_evaluated"),
    t201_request_tools_present: booleanValue(result.t201_request_tools_present),
    t201_request_store_false: booleanValue(result.t201_request_store_false),
    t201_request_stream_boolean: booleanValue(result.t201_request_stream_boolean),
    proxy_environment_present: booleanValue(result.proxy_environment_present),
    proxy_environment_ignored: booleanValue(result.proxy_environment_ignored),
    proxy_environment_keys_present: isPlainObject(result.proxy_environment_keys_present) ? result.proxy_environment_keys_present : {},
    network_configuration_matches_t200: booleanValue(result.network_configuration_matches_t200),
    safe_final_state: stringValue(result.safe_final_state, primaryFailureCategory === "none" ? "complete" : primaryFailureCategory),
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
  generatedAt = new Date(),
  parseOutcome,
}) {
  const hasValidCurrentResult = Boolean(brokerResult);
  const exitCategory = brokerExitStatusCategory({ brokerExitCode, hasValidCurrentResult });
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
    callback_port_absent: booleanValue(callbackPortAbsent) && booleanValue(brokerResult?.callback_port_absent, true),
    secret_scan_result: stringValue(secretScanResult, "failed"),
    log_secret_scan_result: stringValue(logSecretScanResult, "failed"),
    evidence_atomic_replace_succeeded: false,
  };

  if (!hasValidCurrentResult) {
    return {
      evidence_classification: EVIDENCE_CLASSIFICATION,
      ...common,
      primary_failure_category: "runner_failure",
      primary_failure_phase: "broker_result_parse",
      model_output_received: false,
      structured_output_evaluated: false,
      semantic_quality_evaluated: false,
      metrics_measurement_state: "not_measured",
      raw_credentials_exposed_to_parent: false,
      account_identifier_exposed_to_parent: false,
      credential_exposure_boolean: false,
      account_identifier_exposure_boolean: false,
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
  evidence.safe_final_state = complete ? "complete" : evidence.safe_final_state === "complete" ? DEFAULT_FAILURE : evidence.safe_final_state;
  evidence.t201_complete = complete;
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
  const tempPath = path.join(path.dirname(evidencePath), `${TMP_PREFIX}${process.pid}-${crypto.randomBytes(8).toString("hex")}`);
  const nextEvidence = { ...evidence, evidence_atomic_replace_succeeded: true };
  await fs.writeFile(tempPath, `${JSON.stringify(nextEvidence, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tempPath, evidencePath);
  return nextEvidence;
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
  generatedAt,
}) {
  const logText = await fs.readFile(logsPath, "utf8").catch(() => "");
  const parseOutcome = parseCurrentBrokerResult(logText, { runnerRunIdHash, runnerStartedAt });
  const evidence = buildFinalEvidence({
    brokerResult: parseOutcome.ok ? parseOutcome.result : null,
    brokerExitCode,
    runnerRunIdHash,
    runnerStartedAt,
    brokerRemoved,
    callbackPortAbsent,
    secretScanResult,
    logSecretScanResult,
    generatedAt,
    parseOutcome,
  });
  return writeEvidenceAtomic(evidencePath, evidence);
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
  });
  process.exit(evidence.t201_complete === true ? 0 : 1);
}
