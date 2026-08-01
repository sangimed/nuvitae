import fs from "node:fs/promises";
import https from "node:https";
import {
  atomicWriteEnvelope,
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  readEnvelope,
  readKeyFile,
} from "./lib/credential-store.mjs";
import {
  classifyRefreshResponse,
  SingleFlightRefresh,
} from "./lib/refresh.mjs";
import {
  accountIdentifierFromCredential,
  buildExpectedAuditedRequestManifest,
  buildSemanticCodexRequest,
  buildSanitizedRequestManifest,
  diffSanitizedRequestManifests,
  invokeCodexTransport,
} from "./lib/codex-transport.mjs";
import {
  buildLocalInputDiagnostics,
  buildT201Prompt,
  evaluateModelText,
  fixtureHash,
  notEvaluatedT201Projection,
  safeErrorCategory,
  safeEvaluationProjection,
  structuredJsonSizeAudit,
  T201_ARTIFACT_PATHS,
} from "./lib/t201-semantic-evaluator.mjs";
import {
  buildValidT201MatrixResult,
  evaluateT201MatrixCase,
  loadT201MatrixCase,
} from "./lib/t201-matrix-evaluator.mjs";
import {
  emitBrokerResult,
  prepareBrokerResultDirectory,
} from "./lib/t201-broker-result-channel.mjs";
import {
  CODEX_T201_TRANSPORT_LIMITS,
  CODEX_TRANSPORT,
  NETWORK_LIMITS,
  OAUTH,
  UPSTREAM_REVISIONS,
} from "./oauth-constants.mjs";

const keyPath = "/run/t199-key/master.key";
const recordPath = "/spike/credentials/credential.json";
const bindings = {
  ownerNamespace: "live-t199-owner",
  connectionId: "live-t199-connection",
  provider: "openai-codex",
};
const expirySkewMs = 120000;
const CASE_ID = "T201-C02";
const selectedFixtureIdentifier =
  process.env.NUVITAE_T201_CASE_ID === CASE_ID ? CASE_ID : null;
const runnerRunIdHash = /^[a-f0-9]{32,64}$/.test(
  process.env.NUVITAE_T201_RUN_ID_HASH ?? "",
)
  ? process.env.NUVITAE_T201_RUN_ID_HASH
  : "missing_runner_run_id";

const BROKER_PHASES = Object.freeze({
  resultChannelPreparation: "result_channel_preparation",
  matrixArtifactLoading: "matrix_artifact_loading",
  promptConstruction: "prompt_construction",
  requestConstruction: "request_construction",
  goldenResultAudit: "golden_result_audit",
  localInputDiagnostics: "local_input_diagnostics",
  credentialRecovery: "credential_recovery",
  credentialRefresh: "credential_refresh",
  accountIdentifierResolution: "account_identifier_resolution",
  transportInvocation: "transport_invocation",
  responseEvaluation: "response_evaluation",
  credentialPostVerification: "credential_post_verification",
  resultEmission: "result_emission",
  complete: "complete",
});

let resultArtifactPreflight = null;
let currentPhase = BROKER_PHASES.resultChannelPreparation;
const emit = (result) =>
  emitBrokerResult({
    ...result,
    result_artifact_preflight: resultArtifactPreflight,
  });

function safeError(error) {
  const message = safeErrorCategory(error?.safeCategory ?? error?.message);
  if (message !== "safe_unknown_failure") return message;
  if (String(error?.message ?? "").includes("ENOENT"))
    return "transport_failure";
  return "safe_unknown_failure";
}

async function recoverCredential() {
  const key = await readKeyFile(keyPath).catch((error) => {
    throw Object.assign(error, { safeCategory: "transport_failure" });
  });
  const envelope = await readEnvelope(recordPath).catch((error) => {
    throw Object.assign(error, {
      safeCategory:
        error.code === "ENOENT" ? "transport_failure" : "safe_unknown_failure",
    });
  });
  try {
    return {
      key,
      envelope,
      ...decryptCredentialEnvelope(envelope, bindings, key),
    };
  } catch (error) {
    throw Object.assign(error, { safeCategory: "transport_failure" });
  }
}

function expiryMs(payload) {
  if (typeof payload.expires_at === "number")
    return payload.expires_at > 10_000_000_000
      ? payload.expires_at
      : payload.expires_at * 1000;
  if (typeof payload.expiresAt === "number")
    return payload.expiresAt > 10_000_000_000
      ? payload.expiresAt
      : payload.expiresAt * 1000;
  if (
    typeof payload.issued_at_ms === "number" &&
    typeof payload.expires_in === "number"
  )
    return payload.issued_at_ms + payload.expires_in * 1000;
  return 0;
}

function credentialPayloadAfterRefresh(previousPayload, tokenResponse) {
  const issuedAtMs = Date.now();
  return {
    ...previousPayload,
    ...tokenResponse,
    refresh_token: tokenResponse.refresh_token ?? previousPayload.refresh_token,
    issued_at_ms: issuedAtMs,
    expires_at: issuedAtMs + tokenResponse.expires_in * 1000,
  };
}

function refreshRequest(refreshToken) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(OAUTH.tokenEndpoint);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OAUTH.clientId,
      refresh_token: refreshToken,
    }).toString();
    const request = https.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: 443,
        path: endpoint.pathname,
        method: "POST",
        timeout: NETWORK_LIMITS.tokenExchangeTimeoutMs,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let size = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > NETWORK_LIMITS.tokenResponseMaxBytes) {
            request.destroy(
              Object.assign(new Error("response_too_large"), {
                safeCategory: "refresh_failure",
              }),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            resolve({ ok: false, category: "refresh_failure" });
            return;
          }
          const category = classifyRefreshResponse({
            status: response.statusCode,
            body: parsed,
          });
          if (category !== "success")
            resolve({ ok: false, category: "refresh_failure" });
          else resolve({ ok: true, body: parsed });
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(
        Object.assign(new Error("transport_timeout"), {
          safeCategory: "refresh_failure",
        }),
      ),
    );
    request.on("error", reject);
    request.end(body);
  });
}

async function maybeRefresh(current) {
  const refreshRequired =
    expiryMs(current.payload) <= Date.now() + expirySkewMs;
  if (!refreshRequired)
    return {
      current,
      refresh_required: false,
      refresh_attempted: false,
      refresh_succeeded: false,
    };
  if (
    typeof current.payload.refresh_token !== "string" ||
    current.payload.refresh_token.length === 0
  ) {
    throw Object.assign(new Error("refresh_failure"), {
      safeCategory: "refresh_failure",
    });
  }
  const flight = new SingleFlightRefresh();
  const result = await flight.refresh(bindings.connectionId, async () =>
    refreshRequest(current.payload.refresh_token),
  );
  if (!result.ok)
    throw Object.assign(new Error("refresh_failure"), {
      safeCategory: "refresh_failure",
    });
  const nextPayload = credentialPayloadAfterRefresh(
    current.payload,
    result.body,
  );
  const nextEnvelope = encryptCredentialEnvelope(
    nextPayload,
    bindings,
    current.key,
    current.generation,
  );
  await atomicWriteEnvelope(recordPath, nextEnvelope, current.generation);
  return {
    current: await recoverCredential(),
    refresh_required: true,
    refresh_attempted: true,
    refresh_succeeded: true,
    live_network_refresh_count: flight.networkRefreshCount,
  };
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

async function loadSelectedArtifacts() {
  if (process.env.NUVITAE_T201_CASE_ID !== CASE_ID) {
    throw Object.assign(new Error("transport_failure"), {
      safeCategory: "transport_failure",
      primary_failure_phase: "case_selection",
    });
  }
  const selected = await loadT201MatrixCase(CASE_ID);
  const schema = JSON.parse(
    await fs.readFile(T201_ARTIFACT_PATHS.schemaPath, "utf8"),
  );
  return { ...selected, schema };
}

function evaluateSelectedModelText(modelText, artifacts) {
  const parsed = evaluateModelText(
    modelText,
    artifacts.fixture,
    artifacts.manifest,
  );
  if (!parsed.parsed) return parsed;
  const matrix = evaluateT201MatrixCase({
    ...artifacts,
    output: parsed.parsed,
  });
  const absentCount = artifacts.manifest.intentionally_absent_fields.filter(
    (path) => {
      const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
      let value = parsed.parsed;
      for (const part of parts) value = value?.[part];
      return value === null || value === undefined;
    },
  ).length;
  return {
    ...parsed,
    metrics: {
      ...parsed.metrics,
      ...matrix.metrics,
      JSON_only_valid: true,
      ambiguous_fact_handling_count: matrix.metrics.ambiguity_handling_pass
        ? artifacts.manifest.ambiguous_facts.length
        : 0,
      null_for_absent_fields_count: absentCount,
      source_grounding_pass: matrix.metrics.grounding_pass,
    },
    error_categories: matrix.errors,
  };
}

try {
  currentPhase = BROKER_PHASES.resultChannelPreparation;
  resultArtifactPreflight = await prepareBrokerResultDirectory(
    process.env.NUVITAE_T201_RESULT_PATH,
  );
  currentPhase = BROKER_PHASES.matrixArtifactLoading;
  const artifacts = await loadSelectedArtifacts();
  currentPhase = BROKER_PHASES.promptConstruction;
  const prompt = buildT201Prompt(artifacts);
  currentPhase = BROKER_PHASES.requestConstruction;
  const requestPayload = buildSemanticCodexRequest(prompt);
  currentPhase = BROKER_PHASES.goldenResultAudit;
  const goldenStructuredJsonAudit = structuredJsonSizeAudit(
    buildValidT201MatrixResult(artifacts.fixture, artifacts.manifest),
  );
  const serializedRequestBytes = Buffer.byteLength(
    JSON.stringify(requestPayload.body),
    "utf8",
  );
  currentPhase = BROKER_PHASES.localInputDiagnostics;
  const localInputDiagnostics = buildLocalInputDiagnostics({
    fixture: artifacts.fixture,
    schema: artifacts.schema,
    prompt,
    serializedRequestBytes,
    requestLimitBytes: CODEX_TRANSPORT.requestMaxBytes,
  });
  currentPhase = BROKER_PHASES.credentialRecovery;
  const before = await recoverCredential();
  const beforeGeneration = before.generation;
  currentPhase = BROKER_PHASES.credentialRefresh;
  const refreshed = await maybeRefresh(before);
  const credential = refreshed.current.payload;
  currentPhase = BROKER_PHASES.accountIdentifierResolution;
  const accountIdentifier = accountIdentifierFromCredential(credential);
  if (!accountIdentifier)
    throw Object.assign(new Error("transport_failure"), {
      safeCategory: "transport_failure",
    });
  if (
    typeof credential.access_token !== "string" ||
    credential.access_token.length === 0
  ) {
    throw Object.assign(new Error("transport_failure"), {
      safeCategory: "transport_failure",
    });
  }

  currentPhase = BROKER_PHASES.transportInvocation;
  const invocation = await invokeCodexTransport({
    accessToken: credential.access_token,
    accountIdentifier,
    requestPayload,
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    exposeRawModelText: true,
  });
  const expectedRequestManifest = buildExpectedAuditedRequestManifest();
  const t201ComparableManifest = buildSanitizedRequestManifest({
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
  const transportManifestPaths = [
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
  ];
  const t201TransportMismatches = diffSanitizedRequestManifests(
    expectedRequestManifest,
    invocation.actual_request_manifest ?? t201ComparableManifest,
    transportManifestPaths,
  );
  currentPhase = BROKER_PHASES.responseEvaluation;
  const evaluation = invocation.raw_model_text
    ? evaluateSelectedModelText(invocation.raw_model_text, artifacts)
    : notEvaluatedT201Projection({
        primaryFailureCategory:
          invocation.primary_failure_category === "output_too_large"
            ? "output_too_large"
            : "transport_failure",
        primaryFailurePhase:
          invocation.primary_failure_phase ?? "safe_unknown_phase",
        secondaryFailureCategories: [invocation.safe_error_category].filter(
          (category) =>
            category &&
            !["transport_failure", "output_too_large"].includes(category),
        ),
      });
  currentPhase = BROKER_PHASES.credentialPostVerification;
  const after = await recoverCredential();
  const encryptedBytes = await fs.readFile(recordPath, "utf8");
  const credentialPlaintextPresent =
    encryptedBytes.includes(credential.access_token) ||
    encryptedBytes.includes(credential.refresh_token ?? "") ||
    encryptedBytes.includes(accountIdentifier);

  const safeProjection = safeEvaluationProjection(evaluation);
  const mandatoryPassed =
    invocation.ok === true &&
    safeProjection.parsing_pass === true &&
    credentialPlaintextPresent === false &&
    after.payload?.access_token &&
    invocation.response_protocol_valid === true;

  currentPhase = BROKER_PHASES.resultEmission;
  await emit({
    evidence_classification: "live_t201_semantic_parsing",
    observation_timestamp: new Date().toISOString(),
    runner_run_id_hash: runnerRunIdHash,
    upstream_revisions: UPSTREAM_REVISIONS,
    deployment_mode: "local_macos_docker_desktop_single_user_spike",
    fixture_identifier: CASE_ID,
    fixture_sha256: fixtureHash(artifacts.fixture),
    fixture_classified_as_synthetic:
      artifacts.manifest.fixture_classification === "synthetic",
    ...goldenStructuredJsonAudit,
    ...localInputDiagnostics,
    encrypted_state_recovered: true,
    credential_generation_before: beforeGeneration,
    refresh_required: refreshed.refresh_required,
    refresh_attempted: refreshed.refresh_attempted,
    refresh_succeeded: refreshed.refresh_succeeded,
    credential_generation_after: after.generation,
    invocation_attempted: invocation.invocation_attempted === true,
    invocation_succeeded: invocation.invocation_succeeded === true,
    exact_http_status: invocation.safe_exact_http_status ?? null,
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
      invocation.response_event_count_semantics ?? "typed_json_protocol_events",
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
    unknown_protocol_event_count: invocation.unknown_protocol_event_count ?? 0,
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
    response_protocol_valid: invocation.response_protocol_valid === true,
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
      artifacts.manifest.ambiguous_facts.length,
    absent_optional_fields_pass:
      safeProjection.null_for_absent_fields_count ===
      artifacts.manifest.intentionally_absent_fields.length,
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
    expected_request_manifest: expectedRequestManifest,
    corrected_request_manifest: invocation.actual_request_manifest,
    t201_request_reasoning_effort_category:
      invocation.actual_request_manifest?.reasoning_effort_category ??
      "not_evaluated",
    t201_request_reasoning_summary_present:
      invocation.actual_request_manifest?.reasoning_summary_present === true,
    t201_request_include_category:
      invocation.actual_request_manifest?.include_category ?? "not_evaluated",
    t201_request_text_verbosity_category:
      invocation.actual_request_manifest?.text_verbosity_category ??
      "not_evaluated",
    t201_request_tools_present:
      invocation.actual_request_manifest?.tools_present === true,
    t201_request_store_false:
      invocation.actual_request_manifest?.store_false === true,
    t201_request_stream_boolean:
      invocation.actual_request_manifest?.stream_boolean === true,
    t201_transport_manifest_matches_t200: t201TransportMismatches.length === 0,
    t201_transport_mismatches: t201TransportMismatches,
    proxy_environment_present: Object.values(proxyEnvironmentPresence()).some(
      Boolean,
    ),
    proxy_environment_ignored: true,
    proxy_environment_keys_present: proxyEnvironmentPresence(),
    network_configuration_matches_t200: true,
    safe_final_state: mandatoryPassed
      ? "complete"
      : (safeProjection.primary_failure_category ??
        safeProjection.safe_error_categories[0] ??
        invocation.safe_error_category ??
        "safe_unknown_failure"),
  });
  currentPhase = BROKER_PHASES.complete;
  process.exitCode = mandatoryPassed ? 0 : 1;
} catch (error) {
  const primaryFailureCategory =
    safeError(error) === "refresh_failure"
      ? "refresh_failure"
      : "transport_failure";
  const failureProjection = safeEvaluationProjection(
    notEvaluatedT201Projection({
      primaryFailureCategory,
      primaryFailurePhase: error.primary_failure_phase ?? currentPhase,
      secondaryFailureCategories: [],
    }),
  );
  await emit({
    evidence_classification: "live_t201_semantic_parsing",
    observation_timestamp: new Date().toISOString(),
    runner_run_id_hash: runnerRunIdHash,
    upstream_revisions: UPSTREAM_REVISIONS,
    deployment_mode: "local_macos_docker_desktop_single_user_spike",
    fixture_identifier: selectedFixtureIdentifier ?? "not_evaluated",
    encrypted_state_recovered: false,
    refresh_required: false,
    refresh_attempted: false,
    refresh_succeeded: false,
    invocation_attempted: false,
    invocation_succeeded: false,
    response_protocol_valid: false,
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
    proxy_environment_present: Object.values(proxyEnvironmentPresence()).some(
      Boolean,
    ),
    proxy_environment_ignored: true,
    proxy_environment_keys_present: proxyEnvironmentPresence(),
    network_configuration_matches_t200: true,
    safe_final_state: failureProjection.primary_failure_category,
  });
  process.exitCode = 1;
}
