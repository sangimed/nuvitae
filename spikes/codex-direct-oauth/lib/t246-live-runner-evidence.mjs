// T246 parent-side sanitized evidence assembly.
//
// Mirrors the qualified T201 runner-evidence pattern (atomic write, reader
// diagnostics, broker result validation, secret scans, exit propagation) with
// the T246 evidence vocabulary and the T246 mandatory pass gate: real-document
// artifact hashes validated, recall thresholds unchanged (exact >= 0.9,
// high-priority = 1.0), language classification, grounding, no-invention, and
// sanitization. A failed attempt deliberately writes atomic evidence before
// the parent exits non-zero.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { containsSecretLikeValue } from "./sanitize.mjs";
import { inspectBrokerResultChannel } from "./t201-broker-result-channel.mjs";
import {
  brokerExitStatusCategory,
  generateRunnerRunIdHash,
  parseReaderDiagnostics,
  writeEvidenceAtomic,
} from "./t201-live-runner-evidence.mjs";
import { T246_EVIDENCE_CLASSIFICATION } from "./t246-live-broker-core.mjs";

const DEFAULT_FAILURE = "safe_unknown_failure";
const ALLOWED_RUN_ID = /^[a-f0-9]{32,64}$/;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "raw_model_text",
  "raw_model_output",
  "raw_response",
  "raw_response_body",
  "model_output_text",
  "transcript_text",
  "full_transcript",
  "fixture_text",
  "access_token",
  "refresh_token",
  "authorization_code",
  "authorization_url",
  "account_identifier",
  "credential",
  "credentials",
]);
const isForbiddenKey = (key) => FORBIDDEN_EVIDENCE_KEYS.has(String(key));

export function generateT246RunnerRunIdHash() {
  return generateRunnerRunIdHash();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value, fallback = false) {
  return value === true || value === false ? value : fallback;
}

function parseTimestampMs(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isNaN(timestamp) ? NaN : timestamp;
}

function safeProjection(result) {
  const projection = {};
  for (const [key, value] of Object.entries(result ?? {})) {
    if (isForbiddenKey(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      value === null
    ) {
      projection[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      projection[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      projection[key] = value.map((item) =>
        isPlainObject(item)
          ? Object.fromEntries(
              Object.entries(item).filter(
                ([itemKey, itemValue]) =>
                  !isForbiddenKey(itemKey) &&
                  (typeof itemValue !== "object" || itemValue === null),
              ),
            )
          : item,
      );
      continue;
    }
    if (isPlainObject(value)) {
      projection[key] = Object.fromEntries(
        Object.entries(value).filter(
          ([itemKey, itemValue]) =>
            !isForbiddenKey(itemKey) &&
            (["string", "number", "boolean"].includes(typeof itemValue) ||
              itemValue === null),
        ),
      );
      continue;
    }
    projection[key] = null;
  }
  return projection;
}

export function validateT246BrokerResult(
  result,
  {
    runnerRunIdHash,
    runnerStartedAt,
    expectedCaseId,
    expectedAttemptId,
    fixtureSha256,
    transcriptSha256,
    manifestSha256,
  },
) {
  const reasons = [];
  if (!isPlainObject(result)) reasons.push("result_not_object");
  if (!ALLOWED_RUN_ID.test(String(runnerRunIdHash ?? "")))
    reasons.push("runner_run_id_invalid");
  if (
    isPlainObject(result) &&
    result.evidence_classification !== T246_EVIDENCE_CLASSIFICATION
  ) {
    reasons.push("classification_mismatch");
  }
  if (isPlainObject(result) && result.runner_run_id_hash !== runnerRunIdHash)
    reasons.push("runner_run_id_mismatch");
  if (expectedCaseId && result?.case_id !== expectedCaseId)
    reasons.push("case_id_mismatch");
  if (expectedAttemptId && result?.attempt_id !== expectedAttemptId)
    reasons.push("attempt_id_mismatch");
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
  if (fixtureSha256 && result?.fixture_sha256 !== fixtureSha256)
    reasons.push("fixture_sha256_mismatch");
  if (transcriptSha256 && result?.transcript_sha256 !== transcriptSha256)
    reasons.push("transcript_sha256_mismatch");
  if (manifestSha256 && result?.manifest_sha256 !== manifestSha256)
    reasons.push("manifest_sha256_mismatch");
  if (isPlainObject(result) && containsSecretLikeValue(JSON.stringify(result)))
    reasons.push("secret_like_value_in_broker_result");
  return { ok: reasons.length === 0, reasons };
}

export function parseCurrentT246BrokerResult(
  logText,
  {
    runnerRunIdHash,
    runnerStartedAt,
    expectedCaseId,
    expectedAttemptId,
    fixtureSha256,
    transcriptSha256,
    manifestSha256,
  },
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
    const validation = validateT246BrokerResult(candidate, {
      runnerRunIdHash,
      runnerStartedAt,
      expectedCaseId,
      expectedAttemptId,
      fixtureSha256,
      transcriptSha256,
      manifestSha256,
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

function t246CompleteGate(evidence, exitCategory) {
  return (
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
    evidence.exact_fact_recall >= 0.9 &&
    evidence.high_priority_fact_recall >= 1 &&
    evidence.document_language_classification_pass === true &&
    evidence.ambiguity_handling_pass === true &&
    evidence.absent_optional_fields_pass === true &&
    evidence.credential_exposure_boolean === false &&
    evidence.account_identifier_exposure_boolean === false &&
    evidence.raw_credentials_exposed_to_parent === false &&
    evidence.account_identifier_exposed_to_parent === false &&
    evidence.raw_model_response_persisted === false &&
    evidence.encrypted_state_preserved === true &&
    evidence.broker_removed === true &&
    evidence.callback_port_absent === true &&
    evidence.secret_scan_result === "passed" &&
    evidence.log_secret_scan_result === "passed" &&
    evidence.t246_artifact_hashes_validated === true &&
    evidence.t246_transcript_regeneration_matched === true &&
    evidence.t246_manifest_binding_valid === true &&
    evidence.provenance_contract_validated === true
  );
}

export function buildFinalT246Evidence({
  brokerResult,
  brokerExitCode,
  runnerRunIdHash,
  runnerStartedAt,
  brokerRemoved,
  callbackPortAbsent,
  secretScanResult,
  logSecretScanResult,
  caseId,
  attemptId,
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
    evidence_rejection_reasons: Array.isArray(parseOutcome?.rejectionReasons)
      ? parseOutcome.rejectionReasons
      : [],
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
    broker_stdout_byte_count: resultChannel?.broker_stdout_byte_count ?? null,
    broker_stderr_byte_count: resultChannel?.broker_stderr_byte_count ?? null,
    broker_stdout_sha256: resultChannel?.stdout_sha256 ?? null,
    broker_stderr_sha256: resultChannel?.stderr_sha256 ?? null,
    broker_stderr_safe_category:
      resultChannel?.stderr_safe_category ?? "not_measured",
    result_reader_diagnostics:
      readerDiagnostics ?? parseReaderDiagnostics(undefined, null),
  };

  if (!hasValidCurrentResult) {
    return {
      evidence_classification: T246_EVIDENCE_CLASSIFICATION,
      case_id: caseId ?? "not_evaluated",
      attempt_id: attemptId ?? "not_evaluated",
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
      t246_complete: false,
    };
  }

  const evidence = {
    ...safeProjection(brokerResult),
    ...common,
    case_id: brokerResult.case_id ?? caseId,
    attempt_id: brokerResult.attempt_id ?? attemptId,
  };
  const complete = t246CompleteGate(evidence, exitCategory);
  evidence.safe_final_state = complete
    ? "complete"
    : evidence.safe_final_state === "complete"
      ? DEFAULT_FAILURE
      : evidence.safe_final_state;
  evidence.case_pass = complete;
  evidence.t246_complete = false;
  return evidence;
}

export async function processT246RunnerEvidence({
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
  attemptId,
  resultPath,
  stdoutPath,
  stderrPath,
  readerStderrPath,
  readerExitCode,
  processStartFailed = false,
  fixtureSha256,
  transcriptSha256,
  manifestSha256,
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
    ? validateT246BrokerResult(parsed, {
        runnerRunIdHash,
        runnerStartedAt,
        expectedCaseId: caseId,
        expectedAttemptId: attemptId,
        fixtureSha256,
        transcriptSha256,
        manifestSha256,
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
    : parseCurrentT246BrokerResult(logText, {
        runnerRunIdHash,
        runnerStartedAt,
        expectedCaseId: caseId,
        expectedAttemptId: attemptId,
        fixtureSha256,
        transcriptSha256,
        manifestSha256,
      });
  const evidence = buildFinalT246Evidence({
    brokerResult: parseOutcome.ok ? parseOutcome.result : null,
    brokerExitCode,
    runnerRunIdHash,
    runnerStartedAt,
    brokerRemoved,
    callbackPortAbsent,
    secretScanResult,
    logSecretScanResult,
    caseId,
    attemptId,
    resultChannel,
    readerDiagnostics,
    generatedAt,
    parseOutcome,
  });
  return writeEvidenceAtomic(evidencePath, evidence);
}

export function t246RunnerExitCode(evidence, evidenceWriteSucceeded = true) {
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
    readerStderrPath,
    readerExitCode,
    attemptId,
    fixtureSha256,
    transcriptSha256,
    manifestSha256,
  ] = process.argv;
  const evidence = await processT246RunnerEvidence({
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
    attemptId,
    resultPath,
    stdoutPath,
    stderrPath,
    processStartFailed: processStartFailedValue === "true",
    readerStderrPath,
    readerExitCode: Number(readerExitCode),
    fixtureSha256,
    transcriptSha256,
    manifestSha256,
  });
  process.exit(t246RunnerExitCode(evidence));
}
