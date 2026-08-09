import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { collectT246CaseProof } from "../lib/t246-corpus-verification.mjs";
import {
  buildFinalT246Evidence,
  processT246RunnerEvidence,
  t246RunnerExitCode,
  validateT246BrokerResult,
} from "../lib/t246-live-runner-evidence.mjs";
import {
  buildValidT246Result,
  evaluateT246Output,
  safeT246EvaluationProjection,
} from "../lib/t246-live-evaluator.mjs";

const proof = await collectT246CaseProof({ caseId: "T246-C01" });
const c02Proof = await collectT246CaseProof({ caseId: "T246-C02" });
const RUN_ID = "c".repeat(64);
const RUNNER_STARTED = "2026-08-07T12:00:00.000Z";

function successfulBrokerResult(overrides = {}) {
  return {
    evidence_classification: "live_t246_semantic_parsing",
    observation_timestamp: "2026-08-07T12:00:05.000Z",
    runner_run_id_hash: RUN_ID,
    case_id: "T246-C01",
    attempt_id: "A01",
    fixture_sha256: proof.row.fixture_sha256,
    transcript_sha256: proof.row.transcript_sha256,
    manifest_sha256: proof.manifestSha256,
    invocation_attempted: true,
    invocation_succeeded: true,
    exact_http_status: 200,
    safe_http_status_category: "2xx",
    response_protocol_valid: true,
    encrypted_state_recovered: true,
    encrypted_state_preserved: true,
    callback_port_absent: true,
    t246_artifact_hashes_validated: true,
    t246_transcript_regeneration_matched: true,
    t246_manifest_binding_valid: true,
    provenance_contract_validated: true,
    schema_valid: true,
    grounding_pass: true,
    no_invention_pass: true,
    parsing_pass: true,
    unsupported_fact_count: 0,
    forbidden_inference_count: 0,
    missing_evidence_count: 0,
    invalid_evidence_count: 0,
    ambiguity_handling_pass: true,
    absent_optional_fields_pass: true,
    exact_fact_recall: 1,
    high_priority_fact_recall: 1,
    document_language_classification_pass: true,
    credential_exposure_boolean: false,
    account_identifier_exposure_boolean: false,
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    raw_response_persisted: false,
    model_output_received: true,
    structured_output_evaluated: true,
    semantic_quality_evaluated: true,
    metrics_measurement_state: "measured",
    primary_failure_category: null,
    primary_failure_phase: null,
    secondary_failure_categories: [],
    safe_error_categories: [],
    safe_final_state: "complete",
    evaluation_metrics: {
      exact_fact_recall: 1,
      high_priority_fact_recall: 1,
      document_language_classification_pass: true,
      unsupported_fact_count: 0,
      forbidden_inference_count: 0,
      missing_evidence_count: 0,
      invalid_evidence_count: 0,
      source_grounding_pass: true,
      no_invention_pass: true,
      parsing_pass: true,
      schema_valid: true,
      JSON_only_valid: true,
    },
    ...overrides,
  };
}

function finalEvidence(result, overrides = {}) {
  return buildFinalT246Evidence({
    brokerResult: result,
    brokerExitCode: 0,
    runnerRunIdHash: RUN_ID,
    runnerStartedAt: RUNNER_STARTED,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    caseId: "T246-C01",
    attemptId: "A01",
    resultChannel: {
      result_state: "valid_broker_result",
      stdout_state: "single_json_stdout",
      infrastructure_category: null,
    },
    readerDiagnostics: {
      reader_exit_code: 0,
      reader_state: "validated_final_json",
      reader_effective_uid: 1000,
      reader_effective_gid: 1000,
    },
    parseOutcome: {
      resultReceived: true,
      rejectionReasons: [],
    },
    ...overrides,
  });
}

// Realistic broker-result shape: the broker emits the canonical metrics only
// nested under `evaluation_metrics` (it never emits top-level recall or
// language-classification fields). This mirrors the actual T246-C01-A01 live
// result that the pre-fix gate misread.
function realisticBrokerResult(metricsOverrides = {}, topLevelOverrides = {}) {
  return {
    evidence_classification: "live_t246_semantic_parsing",
    observation_timestamp: "2026-08-07T12:00:05.000Z",
    runner_run_id_hash: RUN_ID,
    case_id: "T246-C01",
    attempt_id: "A01",
    fixture_sha256: proof.row.fixture_sha256,
    transcript_sha256: proof.row.transcript_sha256,
    manifest_sha256: proof.manifestSha256,
    invocation_attempted: true,
    invocation_succeeded: true,
    exact_http_status: 200,
    safe_http_status_category: "2xx",
    response_protocol_valid: true,
    encrypted_state_recovered: true,
    encrypted_state_preserved: true,
    callback_port_absent: true,
    t246_artifact_hashes_validated: true,
    t246_transcript_regeneration_matched: true,
    t246_manifest_binding_valid: true,
    provenance_contract_validated: true,
    schema_valid: true,
    grounding_pass: true,
    no_invention_pass: true,
    parsing_pass: true,
    unsupported_fact_count: 0,
    forbidden_inference_count: 0,
    missing_evidence_count: 0,
    invalid_evidence_count: 0,
    ambiguity_handling_pass: true,
    absent_optional_fields_pass: true,
    credential_exposure_boolean: false,
    account_identifier_exposure_boolean: false,
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    raw_response_persisted: false,
    model_output_received: true,
    structured_output_evaluated: true,
    semantic_quality_evaluated: true,
    metrics_measurement_state: "measured",
    primary_failure_category: null,
    primary_failure_phase: null,
    secondary_failure_categories: [],
    safe_error_categories: [],
    safe_final_state: "complete",
    evaluation_metrics: {
      schema_valid: true,
      JSON_only_valid: true,
      expected_section_recall: 1,
      expected_item_recall: 1,
      exact_fact_recall: 1,
      high_priority_fact_recall: 1,
      unsupported_fact_count: 0,
      forbidden_inference_count: 0,
      missing_evidence_count: 0,
      invalid_evidence_count: 0,
      ambiguous_fact_handling_count: 1,
      null_for_absent_fields_count: 9,
      source_grounding_pass: true,
      no_invention_pass: true,
      document_language_classification_pass: true,
      absent_optional_fields_pass: true,
      parsing_pass: true,
      primary_failure_category: null,
      primary_failure_phase: null,
      ...metricsOverrides,
    },
    ...topLevelOverrides,
  };
}

test("T246 evidence gate passes only when every mandatory semantic and security condition holds", () => {
  const evidence = finalEvidence(successfulBrokerResult());
  assert.equal(evidence.case_pass, true);
  assert.equal(evidence.t246_complete, false);
  assert.equal(evidence.safe_final_state, "complete");
  assert.equal(evidence.secret_scan_result, "passed");
  assert.equal(evidence.evidence_atomic_replace_succeeded, false);
});

test("T246 evidence gate passes when the canonical metrics are nested under evaluation_metrics only", () => {
  const evidence = finalEvidence(realisticBrokerResult());
  assert.equal(evidence.case_pass, true);
  assert.equal(evidence.safe_final_state, "complete");
  assert.equal(evidence.primary_failure_phase, "none");
  assert.equal(evidence.primary_failure_category, "none");
  assert.equal(t246RunnerExitCode(evidence), 0);
});

test("T246 semantic failure produces an explicit failure classification from nested metrics", () => {
  const evidence = finalEvidence(
    realisticBrokerResult(
      {
        exact_fact_recall: 0.8,
        parsing_pass: false,
        primary_failure_category: "expected_fact_missing",
        primary_failure_phase: "response_semantic_evaluation",
      },
      {
        parsing_pass: false,
        primary_failure_category: "expected_fact_missing",
        primary_failure_phase: "response_semantic_evaluation",
      },
    ),
  );
  assert.equal(evidence.case_pass, false);
  assert.equal(evidence.safe_final_state, "expected_fact_missing");
  assert.equal(evidence.primary_failure_category, "expected_fact_missing");
  assert.equal(evidence.primary_failure_phase, "response_semantic_evaluation");
  assert.equal(t246RunnerExitCode(evidence), 1);
});

test("T246 parent evidence preserves sanitized fact diagnostics from nested metrics", () => {
  const missingFact = "pdf-french-canonical-anonymous:skills[2]";
  const evidence = finalEvidence(
    realisticBrokerResult({
      exact_fact_recall: 0.9583,
      high_priority_fact_recall: 0.9444,
      parsing_pass: false,
      primary_failure_category: "expected_fact_missing",
      primary_failure_phase: "response_semantic_evaluation",
      expected_fact_count: 24,
      matched_expected_fact_count: 23,
      high_priority_fact_count: 18,
      matched_high_priority_fact_count: 17,
      missing_expected_fact_ids: [missingFact],
      missing_high_priority_fact_ids: [missingFact],
      matched_expected_fact_ids: ["pdf-french-canonical-anonymous:basics:name"],
      matched_high_priority_fact_ids: [
        "pdf-french-canonical-anonymous:basics:name",
      ],
    }),
  );
  assert.deepEqual(evidence.evaluation_metrics.missing_expected_fact_ids, [
    missingFact,
  ]);
  assert.deepEqual(evidence.evaluation_metrics.missing_high_priority_fact_ids, [
    missingFact,
  ]);
  assert.deepEqual(evidence.evaluation_metrics.matched_expected_fact_ids, [
    "pdf-french-canonical-anonymous:basics:name",
  ]);
  assert.deepEqual(evidence.evaluation_metrics.matched_high_priority_fact_ids, [
    "pdf-french-canonical-anonymous:basics:name",
  ]);
});

test("T246 C02 evidence preserves sanitized fact IDs without resume or model text", () => {
  const missingFact = "pdf-english-anonymous:skills[2]";
  const matchedFact = "pdf-english-anonymous:basics.full_name";
  const result = realisticBrokerResult(
    {
      exact_fact_recall: 0.963,
      high_priority_fact_recall: 0.9545,
      parsing_pass: false,
      primary_failure_category: "expected_fact_missing",
      primary_failure_phase: "response_semantic_evaluation",
      expected_fact_count: 27,
      matched_expected_fact_count: 26,
      high_priority_fact_count: 22,
      matched_high_priority_fact_count: 21,
      missing_expected_fact_ids: [missingFact],
      missing_high_priority_fact_ids: [missingFact],
      matched_expected_fact_ids: [matchedFact],
      matched_high_priority_fact_ids: [matchedFact],
    },
    {
      case_id: "T246-C02",
      attempt_id: "A01",
      fixture_sha256: c02Proof.row.fixture_sha256,
      transcript_sha256: c02Proof.row.transcript_sha256,
      manifest_sha256: c02Proof.manifestSha256,
      parsing_pass: false,
      primary_failure_category: "expected_fact_missing",
      primary_failure_phase: "response_semantic_evaluation",
    },
  );
  const evidence = buildFinalT246Evidence({
    brokerResult: result,
    brokerExitCode: 1,
    runnerRunIdHash: RUN_ID,
    runnerStartedAt: RUNNER_STARTED,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    caseId: "T246-C02",
    attemptId: "A01",
    resultChannel: {
      result_state: "valid_broker_result",
      stdout_state: "single_json_stdout",
      infrastructure_category: null,
    },
    readerDiagnostics: {
      reader_exit_code: 0,
      reader_state: "validated_final_json",
    },
    parseOutcome: { resultReceived: true, rejectionReasons: [] },
  });
  assert.deepEqual(evidence.evaluation_metrics.missing_expected_fact_ids, [
    missingFact,
  ]);
  assert.deepEqual(evidence.evaluation_metrics.matched_expected_fact_ids, [
    matchedFact,
  ]);
  assert.deepEqual(evidence.evaluation_metrics.missing_high_priority_fact_ids, [
    missingFact,
  ]);
  assert.deepEqual(evidence.evaluation_metrics.matched_high_priority_fact_ids, [
    matchedFact,
  ]);
  const serialized = JSON.stringify(evidence);
  for (const line of c02Proof.lines)
    assert.equal(serialized.includes(line), false);
  assert.equal(serialized.includes("raw_model_output"), false);
  assert.equal(serialized.includes(missingFact), true);
  assert.equal(serialized.includes(matchedFact), true);
});

test("T246 broker projection derives matched high-priority IDs from the C02 manifest", () => {
  const result = buildValidT246Result(c02Proof.transcript, c02Proof.manifest);
  const evaluation = evaluateT246Output(
    result,
    c02Proof.transcript,
    c02Proof.manifest,
    "T246-C02",
  );
  const projection = safeT246EvaluationProjection(evaluation, {
    manifest: c02Proof.manifest,
  });
  assert.equal(
    projection.matched_high_priority_fact_ids.length,
    c02Proof.manifest.high_priority_fact_paths.length,
  );
  assert.deepEqual(
    new Set(projection.matched_high_priority_fact_ids),
    new Set(
      c02Proof.manifest.high_priority_fact_paths.map(
        (factPath) => `${c02Proof.manifest.fixture_id}:${factPath}`,
      ),
    ),
  );
  const serialized = JSON.stringify(projection);
  for (const line of c02Proof.lines)
    assert.equal(serialized.includes(line), false);
});

test("T246 transport failure produces an explicit failure classification", () => {
  const evidence = finalEvidence(
    realisticBrokerResult(
      {},
      {
        invocation_succeeded: false,
        response_protocol_valid: false,
        model_output_received: false,
        semantic_quality_evaluated: false,
        metrics_measurement_state: "not_measured",
        safe_final_state: "transport_failure",
        primary_failure_category: "transport_failure",
        primary_failure_phase: "transport_invocation",
      },
    ),
  );
  assert.equal(evidence.case_pass, false);
  assert.equal(evidence.primary_failure_category, "transport_failure");
  assert.equal(evidence.primary_failure_phase, "transport_invocation");
  assert.equal(t246RunnerExitCode(evidence), 1);
});

test("T246 case_pass is never null after a completed successful semantic evaluation", () => {
  for (const result of [
    realisticBrokerResult(),
    realisticBrokerResult({ exact_fact_recall: 0.8, parsing_pass: false }),
    successfulBrokerResult(),
    successfulBrokerResult({ exact_fact_recall: 0.8 }),
  ]) {
    const evidence = finalEvidence(result);
    assert.equal(typeof evidence.case_pass, "boolean");
    assert.equal(typeof evidence.safe_final_state, "string");
    assert.equal(typeof evidence.primary_failure_phase, "string");
    assert.equal(typeof evidence.primary_failure_category, "string");
  }
});

test("T246 evidence gate fails when exact fact recall is below threshold", () => {
  const evidence = finalEvidence(
    successfulBrokerResult({ exact_fact_recall: 0.8 }),
  );
  assert.equal(evidence.case_pass, false);
  assert.notEqual(evidence.safe_final_state, "complete");
});

test("T246 evidence gate fails when high-priority recall is below 1", () => {
  const evidence = finalEvidence(
    successfulBrokerResult({ high_priority_fact_recall: 0.99 }),
  );
  assert.equal(evidence.case_pass, false);
});

test("T246 evidence gate fails when language classification is not performed", () => {
  const evidence = finalEvidence(
    successfulBrokerResult({ document_language_classification_pass: false }),
  );
  assert.equal(evidence.case_pass, false);
});

test("T246 evidence gate fails on unsupported or forbidden facts and evidence counts", () => {
  for (const overrides of [
    { unsupported_fact_count: 1 },
    { forbidden_inference_count: 1 },
    { missing_evidence_count: 1 },
    { invalid_evidence_count: 1 },
  ]) {
    const evidence = finalEvidence(successfulBrokerResult(overrides));
    assert.equal(evidence.case_pass, false, JSON.stringify(overrides));
  }
});

test("T246 evidence gate fails when raw model output was persisted or secrets were exposed", () => {
  for (const overrides of [
    { raw_model_response_persisted: true },
    { raw_credentials_exposed_to_parent: true },
    { credential_exposure_boolean: true },
  ]) {
    const evidence = finalEvidence(successfulBrokerResult(overrides));
    assert.equal(evidence.case_pass, false, JSON.stringify(overrides));
  }
});

test("T246 evidence gate fails when artifact hashes were not validated", () => {
  const evidence = finalEvidence(
    successfulBrokerResult({ t246_artifact_hashes_validated: false }),
  );
  assert.equal(evidence.case_pass, false);
});

test("T246 broker-result validation rejects hash mismatches against the authorization pins", () => {
  const validation = validateT246BrokerResult(
    successfulBrokerResult({ fixture_sha256: "0".repeat(64) }),
    {
      runnerRunIdHash: RUN_ID,
      runnerStartedAt: RUNNER_STARTED,
      expectedCaseId: "T246-C01",
      expectedAttemptId: "A01",
      fixtureSha256: proof.row.fixture_sha256,
      transcriptSha256: proof.row.transcript_sha256,
      manifestSha256: proof.manifestSha256,
    },
  );
  assert.equal(validation.ok, false);
  assert.match(validation.reasons.join(","), /fixture_sha256_mismatch/);
});

test("T246 broker-result validation rejects a wrong attempt or case", () => {
  const wrongAttempt = validateT246BrokerResult(
    successfulBrokerResult({ attempt_id: "A02" }),
    {
      runnerRunIdHash: RUN_ID,
      runnerStartedAt: RUNNER_STARTED,
      expectedCaseId: "T246-C01",
      expectedAttemptId: "A01",
    },
  );
  assert.equal(wrongAttempt.ok, false);
  assert.match(wrongAttempt.reasons.join(","), /attempt_id_mismatch/);
  const wrongCase = validateT246BrokerResult(
    successfulBrokerResult({ case_id: "T246-C02" }),
    {
      runnerRunIdHash: RUN_ID,
      runnerStartedAt: RUNNER_STARTED,
      expectedCaseId: "T246-C01",
      expectedAttemptId: "A01",
    },
  );
  assert.equal(wrongCase.ok, false);
  assert.match(wrongCase.reasons.join(","), /case_id_mismatch/);
});

test("T246 evidence sanitization strips raw model/transcript/credential fields", () => {
  const dirty = successfulBrokerResult({
    raw_model_text: '{"full_name":"secret-model-output"}',
    raw_response_body: "raw-sse",
    full_transcript: proof.transcript,
    access_token: "plaintext-token",
    account_identifier: "plaintext-account",
    authorization_code: "plaintext-code",
    authorization_url: "https://example.invalid/authorize",
  });
  const evidence = finalEvidence(dirty);
  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes("secret-model-output"), false);
  assert.equal(serialized.includes("raw-sse"), false);
  assert.equal(serialized.includes(proof.lines[0]), false);
  assert.equal(serialized.includes("plaintext-token"), false);
  assert.equal(serialized.includes("plaintext-account"), false);
  assert.equal(serialized.includes("plaintext-code"), false);
  assert.equal(serialized.includes("https://example.invalid/authorize"), false);
});

test("T246 runner evidence writes atomic sanitized evidence and propagates the exit code", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t246-evidence-"),
  );
  const evidencePath = path.join(directory, "evidence.json");
  const readerStdout = path.join(directory, "reader.stdout");
  const readerStderr = path.join(directory, "reader.stderr");
  const brokerStdout = path.join(directory, "broker.stdout");
  const brokerStderr = path.join(directory, "broker.stderr");
  const resultPath = path.join(directory, "result.json");
  const result = successfulBrokerResult();
  await fs.writeFile(resultPath, `${JSON.stringify(result)}\n`);
  await fs.writeFile(brokerStdout, "");
  await fs.writeFile(brokerStderr, "");
  await fs.writeFile(readerStdout, `${JSON.stringify(result)}\n`);
  await fs.writeFile(
    readerStderr,
    "safe_result_reader_success:1000:1000:600:same_filesystem\n",
  );
  const evidence = await processT246RunnerEvidence({
    evidencePath,
    logsPath: "/dev/null",
    runnerRunIdHash: RUN_ID,
    runnerStartedAt: RUNNER_STARTED,
    brokerExitCode: 0,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    caseId: "T246-C01",
    attemptId: "A01",
    resultPath: readerStdout,
    stdoutPath: brokerStdout,
    stderrPath: brokerStderr,
    readerStderrPath: readerStderr,
    readerExitCode: 0,
    fixtureSha256: proof.row.fixture_sha256,
    transcriptSha256: proof.row.transcript_sha256,
    manifestSha256: proof.manifestSha256,
  });
  assert.equal(evidence.case_pass, true);
  assert.equal(t246RunnerExitCode(evidence), 0);
  const written = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  assert.equal(written.evidence_atomic_replace_succeeded, true);
  assert.equal(written.evidence_classification, "live_t246_semantic_parsing");
  assert.equal(written.case_id, "T246-C01");
  assert.equal(written.attempt_id, "A01");
  await fs.rm(directory, { recursive: true, force: true });
});

test("T246 runner exit code is non-zero when the evidence gate fails", () => {
  const failed = finalEvidence(
    successfulBrokerResult({ exact_fact_recall: 0.5 }),
  );
  assert.equal(failed.case_pass, false);
  assert.equal(t246RunnerExitCode(failed), 1);
});
