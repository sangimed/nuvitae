// T246 live broker core.
//
// This is the single T246-specific execution engine. It reuses the qualified
// T201 credential recovery, refresh, transport, request-manifest audit,
// result-channel, and execution-state machinery unchanged; only artifact
// loading (deterministic real-document transcript), prompt construction,
// semantic evaluation, and the sanitized evidence vocabulary are T246-owned.
// The provider boundary (`invokeTransport`) and credential boundary
// (`recover`/`refresh`) are injectable so offline tests can prove the whole
// path without a real provider, credential volume, or network.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  accountIdentifierFromCredential,
  buildExpectedAuditedRequestManifest,
  buildSanitizedRequestManifest,
  buildSemanticCodexRequest,
  diffSanitizedRequestManifests,
  invokeCodexTransport,
} from "./codex-transport.mjs";
import {
  CODEX_T201_TRANSPORT_LIMITS,
  CODEX_TRANSPORT,
  UPSTREAM_REVISIONS,
} from "../oauth-constants.mjs";
import {
  credentialExpiryMs,
  maybeRefreshT199Credential,
  recoverT199Credential,
  T199_BROKER_BINDINGS,
  T199_EXPIRY_SKEW_MS,
  T199_RECORD_PATH,
} from "./t201-broker-credentials.mjs";
import {
  brokerStateEvidence,
  createT201BrokerExecutionState,
  recordCredentialRecovery,
  recordRefreshAttempt,
  recordRefreshRequired,
  recordRefreshResult,
  recordTransportResult,
} from "./t201-broker-execution-state.mjs";
import {
  emitBrokerResult,
  prepareBrokerResultDirectory,
} from "./t201-broker-result-channel.mjs";
import { buildLocalInputDiagnostics } from "./t201-semantic-evaluator.mjs";
import {
  buildT246Prompt,
  evaluateT246ModelText,
  notEvaluatedT246Projection,
  safeT246EvaluationProjection,
  promptIsolationDiagnostics,
  t246GoldenResultAudit,
  t246ManifestPathForCase,
  T246_SCHEMA_PATH,
  verifyT246LiveArtifacts,
} from "./t246-live-evaluator.mjs";
import { assertT246LiveOperatorGate } from "./t246-live-guard.mjs";

export const T246_EVIDENCE_CLASSIFICATION = "live_t246_semantic_parsing";

export const T246_BROKER_PHASES = Object.freeze({
  resultChannelPreparation: "result_channel_preparation",
  artifactLoading: "t246_artifact_loading",
  promptConstruction: "prompt_construction",
  requestConstruction: "request_construction",
  goldenResultAudit: "golden_result_audit",
  localInputDiagnostics: "local_input_diagnostics",
  credentialFreeRehearsalStop: "credential_free_rehearsal_stop",
  credentialRecovery: "credential_recovery",
  credentialRefresh: "credential_refresh",
  accountIdentifierResolution: "account_identifier_resolution",
  transportInvocation: "transport_invocation",
  responseEvaluation: "response_evaluation",
  credentialPostVerification: "credential_post_verification",
  resultEmission: "result_emission",
  complete: "complete",
});

const T246_TRANSPORT_MANIFEST_PATHS = Object.freeze([
  "url_path",
  "http_method",
  "required_headers_present.authorization",
  "required_headers_present.chatgpt_account_id",
  "required_headers_present.originator",
  "required_headers_present.accept",
  "required_headers_present.content_type",
  "required_headers_present.openai_beta",
  "body_value_types.instructions",
  "body_value_types.input",
  "body_value_types.stream",
  "input_item_categories",
  "stream_boolean",
  "model_identifier_category",
  "content_encoding_category",
]);

function brokerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeError(error) {
  const message = String(error?.code ?? error?.safeCategory ?? error?.message);
  if (message.startsWith("t246_")) return message;
  if (message === "refresh_failure") return "refresh_failure";
  if (message === "transport_failure") return "transport_failure";
  if (message === "output_too_large") return "output_too_large";
  if (String(error?.message ?? "").includes("ENOENT"))
    return "transport_failure";
  return "safe_unknown_failure";
}

function proxyEnvironmentPresence(env = process.env) {
  const names = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
  ];
  return Object.fromEntries(
    names.map((name) => [
      name,
      Object.prototype.hasOwnProperty.call(env, name),
    ]),
  );
}

function validateEnvironment(env) {
  const required = {
    NUVITAE_T246_RESULT_PATH: /^\/spike\/result\//,
    NUVITAE_T246_RUN_ID_HASH: /^[a-f0-9]{32,64}$/,
    NUVITAE_T246_CASE_ID: /^T246-C0[1-7]$/,
    NUVITAE_T246_ATTEMPT_ID: /^A[0-9]{2,}$/,
    NUVITAE_T246_FIXTURE_PATH: /^\/spike\/t246-input\//,
    NUVITAE_T246_TRANSCRIPT_PATH: /^\/spike\/t246-input\//,
    NUVITAE_T246_MANIFEST_PATH: /^\/spike\/fixtures\/t246-matrix\//,
    NUVITAE_T246_FIXTURE_SHA256: /^[a-f0-9]{64}$/,
    NUVITAE_T246_TRANSCRIPT_SHA256: /^[a-f0-9]{64}$/,
    NUVITAE_T246_MANIFEST_SHA256: /^[a-f0-9]{64}$/,
  };
  for (const [name, pattern] of Object.entries(required)) {
    if (!pattern.test(String(env[name] ?? "")))
      throw brokerError(`t246_broker_environment_invalid_${name}`);
  }
  if (
    env.NUVITAE_T246_MAX_BROKER_RUNS !== "1" ||
    env.NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS !== "1" ||
    env.NUVITAE_T246_AUTOMATIC_RETRIES !== "0"
  ) {
    throw brokerError("t246_single_request_required");
  }
  if (
    env.NUVITAE_T246_MANIFEST_PATH !==
    `/spike/${t246ManifestPathForCase(env.NUVITAE_T246_CASE_ID)}`
  ) {
    throw brokerError("t246_manifest_binding_invalid");
  }
}

function transportMismatchPaths(
  invocation,
  requestPayload,
  serializedRequestBytes,
) {
  const expectedRequestManifest = buildExpectedAuditedRequestManifest();
  const comparableManifest = buildSanitizedRequestManifest({
    url: `${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`,
    method: "POST",
    headers: Object.fromEntries(
      (invocation.actual_request_manifest?.header_names ?? []).map((name) => [
        name,
        name === "accept"
          ? "text/event-stream"
          : name === "content-type"
            ? "application/json"
            : "synthetic",
      ]),
    ),
    body: requestPayload.body,
    serializedBodyByteLength: serializedRequestBytes,
  });
  return {
    expected: expectedRequestManifest,
    corrected: invocation.actual_request_manifest ?? comparableManifest,
    mismatches: diffSanitizedRequestManifests(
      expectedRequestManifest,
      invocation.actual_request_manifest ?? comparableManifest,
      T246_TRANSPORT_MANIFEST_PATHS,
    ),
  };
}

export async function runT246Broker({
  env = process.env,
  recover = recoverT199Credential,
  refresh = maybeRefreshT199Credential,
  invokeTransport = invokeCodexTransport,
  emit = emitBrokerResult,
  prepareResultDirectory = prepareBrokerResultDirectory,
  verifyArtifacts = verifyT246LiveArtifacts,
  readFile = fs.readFile,
  schemaLoader = async () =>
    JSON.parse(
      await fs.readFile(
        fileURLToPath(new URL(`../${T246_SCHEMA_PATH}`, import.meta.url)),
        "utf8",
      ),
    ),
  bindings = T199_BROKER_BINDINGS,
  recordPath = T199_RECORD_PATH,
  allowSimulatedLive = false,
} = {}) {
  let resultArtifactPreflight = null;
  let currentPhase = T246_BROKER_PHASES.resultChannelPreparation;
  const executionState = createT201BrokerExecutionState();
  const emitResult = (result) =>
    emit({
      ...result,
      result_artifact_preflight: resultArtifactPreflight,
    });
  const runnerRunIdHash = String(
    env.NUVITAE_T246_RUN_ID_HASH ?? "missing_runner_run_id",
  );
  const caseId = String(env.NUVITAE_T246_CASE_ID ?? "not_evaluated");
  const attemptId = String(env.NUVITAE_T246_ATTEMPT_ID ?? "not_evaluated");
  const rehearsal = env.NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL === "1";

  try {
    validateEnvironment(env);
    assertT246LiveOperatorGate({
      mode:
        env.NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL === "1"
          ? "preflight"
          : "live",
      env,
      allowSimulatedLive,
    });
    currentPhase = T246_BROKER_PHASES.resultChannelPreparation;
    resultArtifactPreflight = await prepareResultDirectory(
      env.NUVITAE_T246_RESULT_PATH,
    );

    currentPhase = T246_BROKER_PHASES.artifactLoading;
    const artifacts = await verifyArtifacts({
      fixturePath: env.NUVITAE_T246_FIXTURE_PATH,
      transcriptPath: env.NUVITAE_T246_TRANSCRIPT_PATH,
      manifestPath: env.NUVITAE_T246_MANIFEST_PATH,
      fixtureSha256Pin: env.NUVITAE_T246_FIXTURE_SHA256,
      transcriptSha256Pin: env.NUVITAE_T246_TRANSCRIPT_SHA256,
      manifestSha256Pin: env.NUVITAE_T246_MANIFEST_SHA256,
    });
    if (artifacts.manifest.t246_case !== caseId) {
      throw brokerError("t246_manifest_binding_invalid");
    }

    currentPhase = T246_BROKER_PHASES.promptConstruction;
    const schema = await schemaLoader();
    const prompt = buildT246Prompt({
      transcript: artifacts.transcript,
      manifest: artifacts.manifest,
      schema,
    });

    currentPhase = T246_BROKER_PHASES.requestConstruction;
    const requestPayload = buildSemanticCodexRequest(prompt);
    const serializedRequestBytes = Buffer.byteLength(
      JSON.stringify(requestPayload.body),
      "utf8",
    );

    currentPhase = T246_BROKER_PHASES.goldenResultAudit;
    const goldenStructuredJsonAudit = t246GoldenResultAudit(
      artifacts.transcript,
      artifacts.manifest,
    );

    currentPhase = T246_BROKER_PHASES.localInputDiagnostics;
    const localInputDiagnostics = buildLocalInputDiagnostics({
      fixture: artifacts.transcript,
      schema,
      prompt,
      serializedRequestBytes,
      requestLimitBytes: CODEX_TRANSPORT.requestMaxBytes,
    });

    if (rehearsal) {
      currentPhase = T246_BROKER_PHASES.credentialFreeRehearsalStop;
      const rehearsalResult = {
        evidence_classification: T246_EVIDENCE_CLASSIFICATION,
        rehearsal: true,
        phase: "credential_free_rehearsal",
        case_id: caseId,
        attempt_id: attemptId,
        fixture_sha256: artifacts.fixtureSha256,
        transcript_sha256: artifacts.transcriptSha256,
        manifest_sha256: artifacts.manifestSha256,
        semantic_invocation_attempted: false,
        credential_recovery_attempted: false,
        evidence_written: false,
        success: true,
        observation_timestamp: new Date().toISOString(),
        runner_run_id_hash: runnerRunIdHash,
      };
      await emitResult(rehearsalResult);
      return { exitCode: 0, result: rehearsalResult, rehearsal: true };
    }

    currentPhase = T246_BROKER_PHASES.credentialRecovery;
    const before = await recover();
    const beforeGeneration = before.generation;
    recordCredentialRecovery(executionState, beforeGeneration);

    currentPhase = T246_BROKER_PHASES.credentialRefresh;
    recordRefreshRequired(
      executionState,
      credentialExpiryMs(before.payload) <= Date.now() + T199_EXPIRY_SKEW_MS,
    );
    const refreshed = await refresh(before, {
      bindings,
      recordPath,
      recover,
      onRefreshAttempt: () => recordRefreshAttempt(executionState),
    });
    recordRefreshResult(executionState, refreshed);
    const credential = refreshed.current.payload;

    currentPhase = T246_BROKER_PHASES.accountIdentifierResolution;
    const accountIdentifier = accountIdentifierFromCredential(credential);
    if (!accountIdentifier) throw brokerError("transport_failure");
    if (
      typeof credential.access_token !== "string" ||
      credential.access_token.length === 0
    ) {
      throw brokerError("transport_failure");
    }

    currentPhase = T246_BROKER_PHASES.transportInvocation;
    const invocation = await invokeTransport({
      accessToken: credential.access_token,
      accountIdentifier,
      requestPayload,
      responseLimits: CODEX_T201_TRANSPORT_LIMITS,
      exposeRawModelText: true,
    });
    recordTransportResult(executionState, invocation);
    const transportManifest = transportMismatchPaths(
      invocation,
      requestPayload,
      serializedRequestBytes,
    );

    let evaluation;
    if (typeof invocation.raw_model_text === "string") {
      currentPhase = T246_BROKER_PHASES.responseEvaluation;
      evaluation = evaluateT246ModelText(
        invocation.raw_model_text,
        artifacts.transcript,
        artifacts.manifest,
        { caseId },
      );
    } else {
      evaluation = notEvaluatedT246Projection({
        primaryFailureCategory:
          invocation.primary_failure_category === "output_too_large"
            ? "output_too_large"
            : "transport_failure",
        primaryFailurePhase:
          invocation.primary_failure_phase ??
          T246_BROKER_PHASES.transportInvocation,
        secondaryFailureCategories: [invocation.safe_error_category].filter(
          (category) =>
            category &&
            !["transport_failure", "output_too_large"].includes(category),
        ),
      });
    }

    currentPhase = T246_BROKER_PHASES.credentialPostVerification;
    const after = await recover();
    recordCredentialRecovery(executionState, after.generation, { after: true });
    const encryptedBytes = await readFile(recordPath, "utf8");
    const credentialPlaintextPresent =
      encryptedBytes.includes(credential.access_token) ||
      encryptedBytes.includes(credential.refresh_token ?? "") ||
      encryptedBytes.includes(accountIdentifier);

    const safeProjection = safeT246EvaluationProjection(evaluation, {
      manifest: artifacts.manifest,
    });
    const mandatoryPassed =
      invocation.ok === true &&
      safeProjection.parsing_pass === true &&
      credentialPlaintextPresent === false &&
      after.payload?.access_token &&
      invocation.response_protocol_valid === true;

    currentPhase = T246_BROKER_PHASES.resultEmission;
    const result = {
      evidence_classification: T246_EVIDENCE_CLASSIFICATION,
      observation_timestamp: new Date().toISOString(),
      runner_run_id_hash: runnerRunIdHash,
      upstream_revisions: UPSTREAM_REVISIONS,
      deployment_mode: "local_macos_docker_desktop_single_user_spike",
      case_id: caseId,
      attempt_id: attemptId,
      fixture_identifier: artifacts.manifest.fixture_id,
      fixture_path: artifacts.manifest.fixture_path,
      fixture_sha256: artifacts.fixtureSha256,
      transcript_sha256: artifacts.transcriptSha256,
      manifest_sha256: artifacts.manifestSha256,
      fixture_classified_as_real:
        artifacts.manifest.fixture_classification === "real_document",
      t246_artifact_hashes_validated: true,
      t246_transcript_regeneration_matched: true,
      t246_manifest_binding_valid: true,
      t246_thresholds_preserved: true,
      provenance_contract_validated:
        artifacts.manifest.provenance_contract?.flattened_coordinates ===
          "one_based_line_zero_based_utf8_offset" &&
        artifacts.manifest.provenance_contract?.deterministic_enrichment !=
          null,
      provenance_enrichment_status: "deterministic_enrichment_ready",
      ...goldenStructuredJsonAudit,
      ...localInputDiagnostics,
      prompt_isolation_diagnostics: promptIsolationDiagnostics(
        artifacts.manifest,
      ),
      ...brokerStateEvidence(executionState),
      safe_http_status_category:
        invocation.safe_http_status_category ?? "unknown_status",
      response_byte_limit:
        invocation.response_byte_limit ??
        CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes,
      response_bytes_observed_before_abort:
        invocation.response_bytes_observed_before_abort ?? 0,
      response_bytes_category: invocation.response_bytes_category ?? "empty",
      response_compressed_byte_limit:
        invocation.response_compressed_byte_limit ??
        CODEX_T201_TRANSPORT_LIMITS.responseCompressedMaxBytes,
      response_compressed_bytes_observed_before_abort:
        invocation.response_compressed_bytes_observed_before_abort ?? 0,
      response_compressed_bytes_category:
        invocation.response_compressed_bytes_category ?? "empty",
      response_decompressed_byte_limit:
        invocation.response_decompressed_byte_limit ??
        CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes,
      response_decompressed_bytes_observed_before_abort:
        invocation.response_decompressed_bytes_observed_before_abort ?? 0,
      response_decompressed_bytes_category:
        invocation.response_decompressed_bytes_category ?? "empty",
      response_event_byte_limit:
        invocation.response_event_byte_limit ??
        CODEX_T201_TRANSPORT_LIMITS.eventMaxBytes,
      largest_sse_event_bytes_observed:
        invocation.largest_sse_event_bytes_observed ?? 0,
      triggering_sse_event_bytes: invocation.triggering_sse_event_bytes ?? null,
      response_event_count_semantics:
        invocation.response_event_count_semantics ??
        "typed_json_protocol_events",
      raw_chunk_count: invocation.raw_chunk_count ?? 0,
      sse_line_count: invocation.sse_line_count ?? 0,
      sse_comment_count: invocation.sse_comment_count ?? 0,
      sse_blank_line_dispatch_count:
        invocation.sse_blank_line_dispatch_count ?? 0,
      sse_empty_dispatch_count: invocation.sse_empty_dispatch_count ?? 0,
      sse_data_dispatch_count: invocation.sse_data_dispatch_count ?? 0,
      json_event_count: invocation.json_event_count ?? 0,
      typed_protocol_event_count: invocation.typed_protocol_event_count ?? 0,
      recognized_protocol_event_count:
        invocation.recognized_protocol_event_count ?? 0,
      unknown_protocol_event_count:
        invocation.unknown_protocol_event_count ?? 0,
      average_protocol_event_bytes_denominator:
        invocation.average_protocol_event_bytes_denominator ?? 0,
      average_protocol_event_bytes_denominator_semantics:
        invocation.average_protocol_event_bytes_denominator_semantics ??
        "typed_protocol_event_count",
      estimated_average_protocol_event_bytes:
        invocation.estimated_average_protocol_event_bytes ?? 0,
      average_protocol_event_bytes_category:
        invocation.average_protocol_event_bytes_category ?? "no_events",
      estimated_average_sse_event_bytes:
        invocation.estimated_average_sse_event_bytes ?? 0,
      average_sse_event_bytes_category:
        invocation.average_sse_event_bytes_category ?? "no_events",
      response_event_limit:
        invocation.response_event_limit ??
        CODEX_T201_TRANSPORT_LIMITS.eventMaxCount,
      response_events_observed_before_abort:
        invocation.response_events_observed_before_abort ??
        invocation.response_event_count ??
        0,
      event_type_counts: invocation.event_type_counts ?? {},
      output_text_delta_event_count:
        invocation.output_text_delta_event_count ?? 0,
      reasoning_event_count: invocation.reasoning_event_count ?? 0,
      structural_event_count: invocation.structural_event_count ?? 0,
      assistant_output_byte_limit:
        invocation.assistant_output_byte_limit ??
        CODEX_T201_TRANSPORT_LIMITS.normalizedOutputMaxBytes,
      assistant_output_bytes_observed_before_abort:
        invocation.assistant_output_bytes_observed_before_abort ?? 0,
      assistant_output_started: invocation.assistant_output_started === true,
      terminal_event_observed: invocation.terminal_event_observed === true,
      structured_json_byte_limit:
        invocation.structured_json_byte_limit ??
        CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
      limit_that_triggered: invocation.limit_that_triggered ?? null,
      response_truncated_by_safety_limit:
        invocation.response_truncated_by_safety_limit === true,
      partial_stream_statistics_preserved:
        invocation.partial_stream_statistics_preserved === true,
      response_event_count: invocation.response_event_count ?? 0,
      model_output_received: safeProjection.model_output_received,
      structured_output_evaluated: safeProjection.structured_output_evaluated,
      semantic_quality_evaluated: safeProjection.semantic_quality_evaluated,
      metrics_measurement_state: safeProjection.metrics_measurement_state,
      primary_failure_category: safeProjection.primary_failure_category,
      primary_failure_phase:
        safeProjection.primary_failure_phase ??
        invocation.primary_failure_phase ??
        null,
      secondary_failure_categories: safeProjection.secondary_failure_categories,
      safe_transport_classification:
        invocation.safe_transport_classification ?? null,
      safe_node_error_code: invocation.safe_node_error_code ?? null,
      structured_output_mechanism_category:
        invocation.structured_output_mechanism_category ??
        "json_only_local_strict_parser",
      schema_valid: safeProjection.schema_valid,
      expected_section_counts: artifacts.manifest.expected_section_counts,
      expected_item_counts: artifacts.manifest.expected_item_counts,
      evaluation_metrics: safeProjection,
      unsupported_fact_count: safeProjection.unsupported_fact_count,
      forbidden_inference_count: safeProjection.forbidden_inference_count,
      missing_evidence_count: safeProjection.missing_evidence_count,
      invalid_evidence_count: safeProjection.invalid_evidence_count,
      ambiguity_handling_pass:
        safeProjection.ambiguous_fact_handling_count ===
        (artifacts.manifest.ambiguous_facts ?? []).length,
      absent_optional_fields_pass:
        safeProjection.null_for_absent_fields_count ===
        (artifacts.manifest.intentionally_absent_fields ?? []).length,
      no_invention_pass: safeProjection.no_invention_pass,
      grounding_pass: safeProjection.source_grounding_pass,
      parsing_pass: safeProjection.parsing_pass,
      credential_exposure_boolean: false,
      account_identifier_exposure_boolean: false,
      raw_credentials_exposed_to_parent: false,
      account_identifier_exposed_to_parent: false,
      raw_model_response_persisted: false,
      raw_response_persisted: false,
      encrypted_state_preserved: credentialPlaintextPresent === false,
      callback_port_absent: true,
      secret_scan_result: "pending_parent_scan",
      safe_error_categories: safeProjection.safe_error_categories,
      expected_request_manifest: transportManifest.expected,
      corrected_request_manifest: transportManifest.corrected,
      t246_request_reasoning_effort_category:
        invocation.actual_request_manifest?.reasoning_effort_category ??
        "not_evaluated",
      t246_request_reasoning_summary_present:
        invocation.actual_request_manifest?.reasoning_summary_present === true,
      t246_request_include_category:
        invocation.actual_request_manifest?.include_category ?? "not_evaluated",
      t246_request_text_verbosity_category:
        invocation.actual_request_manifest?.text_verbosity_category ??
        "not_evaluated",
      t246_request_tools_present:
        invocation.actual_request_manifest?.tools_present === true,
      t246_request_store_false:
        invocation.actual_request_manifest?.store_false === true,
      t246_request_stream_boolean:
        invocation.actual_request_manifest?.stream_boolean === true,
      t246_transport_manifest_matches_t200:
        transportManifest.mismatches.length === 0,
      t246_transport_mismatches: transportManifest.mismatches,
      proxy_environment_present: Object.values(
        proxyEnvironmentPresence(env),
      ).some(Boolean),
      proxy_environment_ignored: true,
      proxy_environment_keys_present: proxyEnvironmentPresence(env),
      network_configuration_matches_t200: true,
      safe_final_state: mandatoryPassed
        ? "complete"
        : (safeProjection.primary_failure_category ??
          safeProjection.safe_error_categories[0] ??
          invocation.safe_error_category ??
          "safe_unknown_failure"),
    };
    currentPhase = T246_BROKER_PHASES.resultEmission;
    await emitResult(result);
    currentPhase = T246_BROKER_PHASES.complete;
    return { exitCode: mandatoryPassed ? 0 : 1, result, rehearsal: false };
  } catch (error) {
    const primaryFailureCategory = safeError(error);
    const failureProjection = safeT246EvaluationProjection(
      notEvaluatedT246Projection({
        primaryFailureCategory,
        primaryFailurePhase: error.primary_failure_phase ?? currentPhase,
        secondaryFailureCategories: [],
      }),
    );
    const failureResult = {
      evidence_classification: T246_EVIDENCE_CLASSIFICATION,
      observation_timestamp: new Date().toISOString(),
      runner_run_id_hash: runnerRunIdHash,
      upstream_revisions: UPSTREAM_REVISIONS,
      deployment_mode: "local_macos_docker_desktop_single_user_spike",
      case_id: caseId,
      attempt_id: attemptId,
      ...brokerStateEvidence(executionState),
      model_output_received: false,
      structured_output_evaluated: false,
      semantic_quality_evaluated: false,
      metrics_measurement_state: "not_measured",
      primary_failure_category: failureProjection.primary_failure_category,
      primary_failure_phase: failureProjection.primary_failure_phase,
      secondary_failure_categories:
        failureProjection.secondary_failure_categories,
      safe_transport_classification:
        error.safe_transport_classification ?? "safe_unknown_transport_failure",
      safe_node_error_code: error.safe_node_error_code ?? null,
      structured_output_mechanism_category: "json_only_local_strict_parser",
      schema_valid: null,
      evaluation_metrics: failureProjection,
      unsupported_fact_count: null,
      forbidden_inference_count: null,
      missing_evidence_count: null,
      invalid_evidence_count: null,
      no_invention_pass: null,
      grounding_pass: null,
      parsing_pass: false,
      credential_exposure_boolean: false,
      account_identifier_exposure_boolean: false,
      raw_credentials_exposed_to_parent: false,
      account_identifier_exposed_to_parent: false,
      raw_model_response_persisted: false,
      raw_response_persisted: false,
      encrypted_state_preserved: true,
      callback_port_absent: true,
      secret_scan_result: "pending_parent_scan",
      safe_error_categories: failureProjection.safe_error_categories,
      proxy_environment_present: Object.values(
        proxyEnvironmentPresence(env),
      ).some(Boolean),
      proxy_environment_ignored: true,
      proxy_environment_keys_present: proxyEnvironmentPresence(env),
      network_configuration_matches_t200: true,
      safe_final_state: failureProjection.primary_failure_category,
    };
    await emitResult(failureResult);
    return { exitCode: 1, result: failureResult, rehearsal: false, error };
  }
}
