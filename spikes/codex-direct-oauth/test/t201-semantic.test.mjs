import assert from "node:assert/strict";
import { test } from "node:test";
import {
  T201_DERIVED_LIMIT_AUDIT,
  T201_LIMITS,
  buildT201Prompt,
  buildValidSyntheticResult,
  byteSizeCategory,
  classifyLocalArtifactFailure,
  evaluateModelText,
  evaluateT201Output,
  fixtureHash,
  fragmentHash,
  loadT201Artifacts,
  notEvaluatedT201Projection,
  parseJsonOnly,
  safeEvaluationProjection,
  structuredJsonSizeAudit,
} from "../lib/t201-semantic-evaluator.mjs";
import { containsSecretLikeValue } from "../lib/sanitize.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFinalEvidence,
  parseCurrentBrokerResult,
  processT201RunnerEvidence,
} from "../lib/t201-live-runner-evidence.mjs";
import { CODEX_T201_TRANSPORT_LIMITS } from "../oauth-constants.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function validFixture() {
  const artifacts = await loadT201Artifacts();
  return { ...artifacts, output: await buildValidSyntheticResult() };
}

function t201RunnerBrokerResult(runId, overrides = {}) {
  return {
    evidence_classification: "live_t201_semantic_parsing",
    observation_timestamp: "2026-07-31T12:00:01.000Z",
    runner_run_id_hash: runId,
    upstream_revisions: { codex: "synthetic" },
    deployment_mode: "synthetic_runner_test",
    fixture_identifier: "t201-synthetic-resume",
    fixture_sha256: "0".repeat(64),
    fixture_classified_as_synthetic: true,
    golden_structured_json_bytes: 7370,
    golden_structured_json_size_category: "small",
    derived_expected_live_json_ceiling:
      CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
    fixture_file_readable: true,
    schema_file_readable: true,
    json_schema_parsed_locally: true,
    fixture_bytes_category: "small",
    schema_bytes_category: "small",
    prompt_bytes_category: "bounded",
    serialized_request_bytes_category: "bounded",
    serialized_request_within_limit: true,
    request_serialization_succeeded: true,
    encrypted_state_recovered: true,
    refresh_required: false,
    refresh_attempted: false,
    refresh_succeeded: false,
    invocation_attempted: true,
    invocation_succeeded: true,
    exact_http_status: 200,
    safe_http_status_category: "2xx",
    response_byte_limit:
      CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes,
    response_bytes_observed_before_abort: 512,
    response_bytes_category: "small",
    response_compressed_byte_limit:
      CODEX_T201_TRANSPORT_LIMITS.responseCompressedMaxBytes,
    response_compressed_bytes_observed_before_abort: 512,
    response_compressed_bytes_category: "small",
    response_decompressed_byte_limit:
      CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes,
    response_decompressed_bytes_observed_before_abort: 512,
    response_decompressed_bytes_category: "small",
    response_event_byte_limit: CODEX_T201_TRANSPORT_LIMITS.eventMaxBytes,
    largest_sse_event_bytes_observed: 256,
    triggering_sse_event_bytes: null,
    estimated_average_sse_event_bytes: 171,
    average_sse_event_bytes_category: "small",
    response_event_limit: CODEX_T201_TRANSPORT_LIMITS.eventMaxCount,
    response_events_observed_before_abort: 3,
    event_type_counts: {
      "response.created": 1,
      "response.in_progress": 0,
      "response.output_item.added": 0,
      "response.content_part.added": 0,
      "response.output_text.delta": 0,
      "response.output_text.done": 0,
      "response.content_part.done": 0,
      "response.output_item.done": 1,
      "response.completed": 1,
      "response.failed": 0,
      "response.reasoning_summary_part.added": 0,
      "response.reasoning_summary_text.delta": 0,
      "response.reasoning_summary_text.done": 0,
      "response.reasoning_summary_part.done": 0,
      encrypted_reasoning_event_category: 0,
      other_known_structural: 0,
      unknown_event_count: 0,
    },
    output_text_delta_event_count: 0,
    reasoning_event_count: 0,
    structural_event_count: 3,
    assistant_output_byte_limit:
      CODEX_T201_TRANSPORT_LIMITS.normalizedOutputMaxBytes,
    assistant_output_bytes_observed_before_abort: 128,
    assistant_output_started: true,
    terminal_event_observed: true,
    structured_json_byte_limit:
      CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
    limit_that_triggered: null,
    response_truncated_by_safety_limit: false,
    response_protocol_valid: true,
    response_event_count: 3,
    model_output_received: true,
    structured_output_evaluated: true,
    semantic_quality_evaluated: true,
    metrics_measurement_state: "measured",
    primary_failure_category: null,
    primary_failure_phase: null,
    secondary_failure_categories: [],
    safe_transport_classification: null,
    safe_node_error_code: null,
    structured_output_mechanism_category: "json_only_local_strict_parser",
    schema_valid: true,
    expected_section_counts: {},
    expected_item_counts: {},
    evaluation_metrics: { parsing_pass: true },
    unsupported_fact_count: 0,
    forbidden_inference_count: 0,
    missing_evidence_count: 0,
    invalid_evidence_count: 0,
    no_invention_pass: true,
    grounding_pass: true,
    parsing_pass: true,
    credential_exposure_boolean: false,
    account_identifier_exposure_boolean: false,
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    raw_response_persisted: false,
    encrypted_state_preserved: true,
    callback_port_absent: true,
    safe_error_categories: [],
    t201_transport_manifest_matches_t200: true,
    t201_transport_mismatches: [],
    proxy_environment_present: false,
    proxy_environment_ignored: true,
    proxy_environment_keys_present: {},
    network_configuration_matches_t200: true,
    safe_final_state: "complete",
    ...overrides,
  };
}

async function runnerEvidenceCase(logLines, options = {}) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-runner-test-"),
  );
  const evidencePath = path.join(
    dir,
    "codex-direct-oauth-t201-semantic-parsing.json",
  );
  const logsPath = path.join(dir, "codex-direct-oauth-t201-docker.log");
  await fs.writeFile(logsPath, `${logLines.join("\n")}\n`);
  const evidence = await processT201RunnerEvidence({
    evidencePath,
    logsPath,
    runnerRunIdHash: options.runnerRunIdHash,
    runnerStartedAt: options.runnerStartedAt ?? "2026-07-31T12:00:00.000Z",
    brokerExitCode: options.brokerExitCode ?? 0,
    brokerRemoved: options.brokerRemoved ?? true,
    callbackPortAbsent: options.callbackPortAbsent ?? true,
    secretScanResult: options.secretScanResult ?? "passed",
    logSecretScanResult: options.logSecretScanResult ?? "passed",
    generatedAt: new Date("2026-07-31T12:00:02.000Z"),
  });
  const persisted = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  return { dir, evidencePath, evidence, persisted };
}

test("T201 valid grounded synthetic result passes all mandatory metrics", async () => {
  const { fixture, manifest, output } = await validFixture();
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.schema_valid, true);
  assert.equal(evaluation.metrics.source_grounding_pass, true);
  assert.equal(evaluation.metrics.no_invention_pass, true);
  assert.equal(evaluation.metrics.parsing_pass, true);
  assert.equal(evaluation.metrics.expected_section_recall, 1);
  assert.equal(evaluation.metrics.expected_item_recall, 1);
});

test("T201 missing evidence fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.basics.full_name.evidence = [];
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.missing_evidence_count, 1);
  assert.equal(evaluation.metrics.parsing_pass, false);
  assert.ok(evaluation.error_categories.includes("evidence_missing"));
});

test("T201 out-of-range evidence fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.basics.email.evidence[0].line = 999;
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.invalid_evidence_count, 1);
  assert.ok(evaluation.error_categories.includes("evidence_out_of_bounds"));
});

test("T201 evidence pointing to wrong source line fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.basics.email.evidence[0] = {
    line: 1,
    start: 0,
    end: "Alex Exemple".length,
    fragment_hash: fragmentHash("Alex Exemple"),
    category: "identity",
  };
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.unsupported_fact_count, 1);
  assert.ok(evaluation.error_categories.includes("unsupported_fact"));
});

test("T201 unsupported invented phone number fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.basics.phone = {
    value: "+1 555 0100",
    evidence: output.basics.full_name.evidence,
  };
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.no_invention_pass, false);
  assert.ok(evaluation.metrics.forbidden_inference_count >= 1);
});

test("T201 invented employer location fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.work_experiences[1].location = {
    value: "Example Harbor",
    evidence: output.work_experiences[1].highlights[1].evidence,
  };
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.no_invention_pass, false);
  assert.ok(evaluation.error_categories.includes("forbidden_inference"));
});

test("T201 invented skill fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.skills[0].value = "Kubernetes";
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.no_invention_pass, false);
  assert.ok(evaluation.metrics.forbidden_inference_count >= 1);
});

test("T201 ambiguous statement represented as warning or ambiguity passes", async () => {
  const { fixture, manifest, output } = await validFixture();
  const ambiguityEvidence = output.ambiguities[0].evidence;
  output.ambiguities = [];
  output.warnings.push({
    code: manifest.ambiguous_facts[0].id,
    message: "The platform reliability line is ambiguous.",
    evidence: ambiguityEvidence,
  });
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.ambiguous_fact_handling_count, 1);
  assert.equal(evaluation.metrics.parsing_pass, true);
});

test("T201 ambiguous statement incorrectly asserted as hard fact fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.ambiguities = [];
  output.warnings = [];
  output.work_experiences[0].highlights.push({
    value: "Owned platform reliability across onboarding and analytics.",
    evidence: output.work_experiences[0].highlights[0].evidence,
  });
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.parsing_pass, false);
  assert.ok(evaluation.error_categories.includes("ambiguity_mishandled"));
  assert.ok(evaluation.error_categories.includes("forbidden_inference"));
});

test("T201 absent optional fields remaining null pass no-invention gate", async () => {
  const { fixture, manifest, output } = await validFixture();
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.null_for_absent_fields_count, 5);
  assert.equal(evaluation.metrics.no_invention_pass, true);
});

test("T201 malformed JSON fails JSON-only gate", async () => {
  const { fixture, manifest } = await loadT201Artifacts();
  const evaluation = evaluateModelText("{not-json}", fixture, manifest);
  assert.equal(evaluation.metrics.JSON_only_valid, false);
  assert.ok(evaluation.error_categories.includes("invalid_json"));
});

test("T201 empty, fenced, and prose-wrapped output fail safely without stripping content", async () => {
  const { fixture, manifest, output } = await validFixture();
  for (const text of [
    "",
    `\`\`\`json\n${JSON.stringify(output)}\n\`\`\``,
    `Here is the JSON: ${JSON.stringify(output)}`,
    `${JSON.stringify(output)} Thank you.`,
    "[]",
  ]) {
    const evaluation = evaluateModelText(text, fixture, manifest);
    assert.equal(evaluation.metrics.JSON_only_valid, false);
    assert.equal(evaluation.metrics.schema_valid, false);
    assert.equal(evaluation.metrics.parsing_pass, false);
    assert.deepEqual(evaluation.error_categories, ["invalid_json"]);
  }
});

test("T201 schema-invalid JSON with missing diagnostic arrays evaluates safely", async () => {
  const { fixture, manifest, output } = await validFixture();
  delete output.ambiguities;
  delete output.warnings;
  const evaluation = evaluateModelText(
    JSON.stringify(output),
    fixture,
    manifest,
  );
  const projection = safeEvaluationProjection(evaluation);
  assert.equal(evaluation.metrics.JSON_only_valid, true);
  assert.equal(evaluation.metrics.schema_valid, false);
  assert.equal(evaluation.metrics.parsing_pass, false);
  assert.equal(projection.primary_failure_category, "schema_validation_failed");
  assert.equal(projection.primary_failure_phase, "response_schema_validation");
});

test("T201 evaluator exceptions become a secret-free safe semantic failure", async () => {
  const { fixture, manifest, output } = await validFixture();
  const evaluation = evaluateModelText(
    JSON.stringify(output),
    fixture,
    manifest,
    {
      evaluateOutput() {
        throw new Error("private evaluator detail");
      },
    },
  );
  const projection = safeEvaluationProjection(evaluation);
  assert.equal(projection.schema_valid, false);
  assert.equal(projection.parsing_pass, false);
  assert.equal(
    projection.primary_failure_phase,
    "response_semantic_evaluation",
  );
  assert.deepEqual(projection.safe_error_categories, ["safe_unknown_failure"]);
  assert.equal(
    JSON.stringify(projection).includes("private evaluator detail"),
    false,
  );
});

test("T201 structured JSON limit is a bounded compatibility budget below the absolute response ceiling", () => {
  assert.equal(
    T201_DERIVED_LIMIT_AUDIT.derivedMaximumMinifiedJsonBytes,
    170213,
  );
  assert.equal(
    T201_LIMITS.outputMaxBytes,
    CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
  );
  assert.equal(T201_LIMITS.outputMaxBytes, 65536);
  assert.equal(
    CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes,
    1048576,
  );
});

test("T201 transport failure prevents structured JSON and semantic evaluation", () => {
  const projection = safeEvaluationProjection(
    notEvaluatedT201Projection({
      primaryFailureCategory: "transport_failure",
      primaryFailurePhase: "DNS_resolution",
      secondaryFailureCategories: ["DNS_failure"],
    }),
  );
  assert.equal(projection.primary_failure_category, "transport_failure");
  assert.equal(projection.primary_failure_phase, "DNS_resolution");
  assert.deepEqual(projection.secondary_failure_categories, ["DNS_failure"]);
  assert.equal(projection.model_output_received, false);
  assert.equal(projection.structured_output_evaluated, false);
  assert.equal(projection.semantic_quality_evaluated, false);
  assert.equal(projection.metrics_measurement_state, "not_measured");
  assert.equal(projection.exact_fact_recall, null);
  assert.equal(projection.unsupported_fact_count, null);
  assert.equal(projection.forbidden_inference_count, null);
  assert.equal(
    projection.safe_error_categories.includes("invalid_json"),
    false,
  );
});

test("T201 output-too-large prevents structured JSON and semantic evaluation", () => {
  const projection = safeEvaluationProjection(
    notEvaluatedT201Projection({
      primaryFailureCategory: "output_too_large",
      primaryFailurePhase: "response_body_read",
      secondaryFailureCategories: ["response_too_large"],
    }),
  );
  assert.equal(projection.primary_failure_category, "output_too_large");
  assert.equal(projection.primary_failure_phase, "response_body_read");
  assert.equal(projection.model_output_received, false);
  assert.equal(projection.structured_output_evaluated, false);
  assert.equal(projection.semantic_quality_evaluated, false);
  assert.equal(projection.metrics_measurement_state, "not_measured");
  assert.equal(projection.schema_valid, null);
  assert.equal(projection.exact_fact_recall, null);
  assert.equal(projection.source_grounding_pass, null);
  assert.equal(projection.no_invention_pass, null);
});

test("T201 invalid JSON is emitted only after model output exists", async () => {
  const { fixture, manifest } = await loadT201Artifacts();
  const evaluated = safeEvaluationProjection(
    evaluateModelText("{not-json}", fixture, manifest),
  );
  assert.equal(evaluated.model_output_received, true);
  assert.equal(evaluated.structured_output_evaluated, true);
  assert.equal(evaluated.semantic_quality_evaluated, false);
  assert.equal(evaluated.primary_failure_category, "invalid_json");
  assert.deepEqual(evaluated.secondary_failure_categories, []);
  assert.ok(evaluated.safe_error_categories.includes("invalid_json"));
});

test("T201 local artifact failures project missing-file and permission classifications", () => {
  assert.deepEqual(
    classifyLocalArtifactFailure({ code: "ENOENT" }, "fixture_read"),
    {
      primary_failure_phase: "fixture_read",
      safe_transport_classification: "missing_file",
      safe_node_error_code: "ENOENT",
    },
  );
  assert.deepEqual(
    classifyLocalArtifactFailure({ code: "EACCES" }, "schema_read"),
    {
      primary_failure_phase: "schema_read",
      safe_transport_classification: "filesystem_permission",
      safe_node_error_code: "EACCES",
    },
  );
});

test("T201 missing fixture classification is deterministic and does not disclose raw paths or stacks", async () => {
  const missing = "/tmp/nuvitae-missing-t201-fixture.txt";
  await fs.rm(missing, { force: true });
  await assert.rejects(
    () =>
      loadT201Artifacts({
        fixturePath: missing,
        manifestPath: missing,
        schemaPath: missing,
      }),
    (error) => {
      assert.equal(error.primary_failure_phase, "fixture_read");
      assert.equal(error.safe_transport_classification, "missing_file");
      assert.equal(error.safe_node_error_code, "ENOENT");
      const projection = safeEvaluationProjection(
        notEvaluatedT201Projection({
          primaryFailureCategory: "transport_failure",
          primaryFailurePhase: error.primary_failure_phase,
        }),
      );
      assert.equal(JSON.stringify(projection).includes(missing), false);
      assert.equal(JSON.stringify(projection).includes("stack"), false);
      return true;
    },
  );
});

test("T201 byte categories keep request-size diagnostics bounded", () => {
  assert.equal(byteSizeCategory(0), "empty");
  assert.equal(byteSizeCategory(512), "small");
  assert.equal(byteSizeCategory(20000), "bounded");
  assert.equal(byteSizeCategory(70000), "over_limit");
});

test("T201 broker source uses the shared transport function and does not fork HTTPS invocation", async () => {
  const source = await fs.readFile(
    new URL("../t201-semantic-broker.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("invokeCodexTransport"), true);
  assert.equal(
    source.includes("responseLimits: CODEX_T201_TRANSPORT_LIMITS"),
    true,
  );
  assert.equal(source.includes("async function invokeSemantic"), false);
  assert.equal(source.includes("new BoundedSseParser"), false);
});

test("T201 result topology uses runtime identity and a credential-free reader before credential recovery", async () => {
  const [broker, channel, compose, offline] = await Promise.all([
    fs.readFile(
      new URL("../t201-semantic-broker.mjs", import.meta.url),
      "utf8",
    ),
    fs.readFile(
      new URL("../lib/t201-broker-result-channel.mjs", import.meta.url),
      "utf8",
    ),
    fs.readFile(new URL("../compose.yml", import.meta.url), "utf8"),
    fs.readFile(
      new URL("../run-t201-result-channel-offline.sh", import.meta.url),
      "utf8",
    ),
  ]);
  assert.equal(channel.includes("stat.uid !== 1000"), false);
  assert.equal(channel.includes("stat.gid !== 1000"), false);
  assert.equal(channel.includes("runtimeIdentity"), true);
  assert.equal(
    broker.indexOf(
      "resultArtifactPreflight = await prepareBrokerResultDirectory",
    ) < broker.indexOf("const before = await recoverCredential"),
    true,
  );
  const readerStart = compose.indexOf("  t201-result-reader:");
  const readerEnd = compose.indexOf(
    "\n  t201-credential-recovery-diagnostic:",
    readerStart,
  );
  const reader = compose.slice(readerStart, readerEnd);
  assert.equal(reader.includes("network_mode: none"), true);
  assert.equal(reader.includes("t199-key-live"), false);
  assert.equal(reader.includes("t199-credentials-live"), false);
  assert.equal(
    /CODEX_DIRECT_OAUTH|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|http_proxy|https_proxy|all_proxy|no_proxy/.test(
      reader,
    ),
    false,
  );
  assert.equal(/ports\s*:/.test(reader), false);
  assert.equal(/privileged\s*:/.test(reader), false);
  assert.equal(/cap_add\s*:/.test(reader), false);
  assert.equal(reader.includes("read_only: true"), true);
  assert.equal(
    offline.includes(
      "--entrypoint node t201-semantic t201-result-channel-topology-offline-broker.mjs",
    ),
    true,
  );
  assert.equal(offline.includes('-v "$result_volume:/spike/result:ro"'), true);
  assert.equal(offline.includes("t199-key-live"), false);
  assert.equal(offline.includes("t199-credentials-live"), false);
});

test("T200 and T201 Docker networking and proxy policy match", async () => {
  const [t200Runner, t201Runner, compose] = await Promise.all([
    fs.readFile(new URL("../run-t200-live.sh", import.meta.url), "utf8"),
    fs.readFile(new URL("../run-t201-live.sh", import.meta.url), "utf8"),
    fs.readFile(new URL("../compose.yml", import.meta.url), "utf8"),
  ]);
  assert.equal(/--network\b/.test(t200Runner), false);
  const diagnosticStart = compose.indexOf(
    "  t201-credential-recovery-diagnostic:",
  );
  const semanticStart = compose.indexOf("  t201-semantic:");
  const readerStart = compose.indexOf("  t201-result-reader:");
  const diagnostic = compose.slice(diagnosticStart);
  const t201Service = compose.slice(semanticStart, readerStart);
  const reader = compose.slice(
    readerStart,
    diagnosticStart,
  );
  assert.equal(/network_mode\s*:/.test(t201Service), false);
  assert.equal(reader.includes("network_mode: none"), true);
  assert.equal(diagnostic.includes("network_mode: none"), true);
  assert.equal(
    /HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|http_proxy|https_proxy|all_proxy|no_proxy/.test(
      t200Runner,
    ),
    false,
  );
  assert.equal(
    /HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|http_proxy|https_proxy|all_proxy|no_proxy/.test(
      t201Runner,
    ),
    false,
  );
  assert.equal(
    /HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|http_proxy|https_proxy|all_proxy|no_proxy/.test(
      t201Service,
    ),
    false,
  );
  assert.equal(t200Runner.includes("--user 1000:1000"), true);
  assert.equal(t201Service.includes('user: "1000:1000"'), false);
  assert.equal(t201Service.includes("uid=1000"), false);
  assert.equal(t201Service.includes("gid=1000"), false);
  assert.equal(t200Runner.includes("--read-only"), true);
  assert.equal(t201Service.includes("read_only: true"), true);
  assert.equal(t200Runner.includes("--memory 192m"), true);
  assert.equal(t201Service.includes("mem_limit: 192m"), true);
  assert.equal(t200Runner.includes("--pids-limit 128"), true);
  assert.equal(t201Service.includes("pids_limit: 128"), true);
});

test("T201 Markdown-wrapped JSON is rejected", async () => {
  const { fixture, manifest, output } = await validFixture();
  const evaluation = evaluateModelText(
    `\`\`\`json\n${JSON.stringify(output)}\n\`\`\``,
    fixture,
    manifest,
  );
  assert.equal(evaluation.metrics.JSON_only_valid, false);
  assert.ok(evaluation.error_categories.includes("invalid_json"));
});

test("T201 duplicate JSON keys are rejected", () => {
  assert.throws(
    () => parseJsonOnly('{"schema_version":1,"schema_version":1}'),
    /duplicate_key/,
  );
});

test("T201 unknown top-level field is rejected", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.extra = true;
  const evaluation = evaluateModelText(
    JSON.stringify(output),
    fixture,
    manifest,
  );
  assert.equal(evaluation.metrics.schema_valid, false);
  assert.ok(evaluation.error_categories.includes("unknown_field"));
});

test("T201 excessive nesting is rejected", () => {
  const nested = `${"[".repeat(T201_LIMITS.maxDepth + 2)}0${"]".repeat(T201_LIMITS.maxDepth + 2)}`;
  assert.throws(() => parseJsonOnly(nested), /invalid_json|excessive_nesting/);
});

test("T201 excessive output size is rejected", async () => {
  const { fixture, manifest } = await loadT201Artifacts();
  const evaluation = evaluateModelText(
    `{"x":"${"a".repeat(T201_LIMITS.outputMaxBytes)}"}`,
    fixture,
    manifest,
  );
  const projection = safeEvaluationProjection(evaluation);
  assert.equal(projection.primary_failure_category, "output_too_large");
  assert.equal(projection.structured_output_evaluated, false);
  assert.equal(projection.semantic_quality_evaluated, false);
  assert.equal(projection.metrics_measurement_state, "not_measured");
  assert.equal(projection.schema_valid, null);
});

test("T201 structured JSON above 65536 bytes fails before semantic evaluation", async () => {
  const { fixture, manifest } = await loadT201Artifacts();
  const projection = safeEvaluationProjection(
    evaluateModelText(`{"x":"${"a".repeat(65537)}"}`, fixture, manifest),
  );
  assert.equal(T201_LIMITS.outputMaxBytes, 65536);
  assert.equal(projection.primary_failure_category, "output_too_large");
  assert.equal(projection.structured_output_evaluated, false);
  assert.equal(projection.semantic_quality_evaluated, false);
  assert.equal(projection.parsing_pass, false);
});

test("T201 valid grounded JSON fixture remains within the derived structured limit", async () => {
  const { fixture, manifest, output } = await validFixture();
  const minified = JSON.stringify(output);
  assert.equal(
    Buffer.byteLength(minified, "utf8") < T201_LIMITS.outputMaxBytes,
    true,
  );
  const evaluation = evaluateModelText(minified, fixture, manifest);
  assert.equal(evaluation.metrics.parsing_pass, true);
});

test("T201 golden structured JSON size is measured and below the live limit", async () => {
  const { output } = await validFixture();
  const audit = structuredJsonSizeAudit(output);
  assert.equal(audit.golden_structured_json_bytes, 7370);
  assert.equal(audit.golden_structured_json_size_category, "small");
  assert.equal(
    audit.derived_expected_live_json_ceiling,
    CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes,
  );
  assert.equal(
    audit.golden_structured_json_bytes <
      audit.derived_expected_live_json_ceiling,
    true,
  );
});

test("T201 missing required section fails", async () => {
  const { fixture, manifest, output } = await validFixture();
  delete output.education;
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.schema_valid, false);
  assert.equal(evaluation.metrics.parsing_pass, false);
});

test("T201 extra work experience fails item/section recall gate", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.work_experiences.push(clone(output.work_experiences[1]));
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.equal(evaluation.metrics.expected_section_recall < 1, true);
  assert.equal(evaluation.metrics.parsing_pass, false);
});

test("T201 altered dates fail exact fact recall", async () => {
  const { fixture, manifest, output } = await validFixture();
  output.work_experiences[1].end_date.value = "February 2022";
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.ok(
    evaluation.missing_expected_facts.includes("work_experiences[1].end_date"),
  );
  assert.equal(evaluation.metrics.parsing_pass, false);
});

test("T201 incorrect metric value would fail independent recomputation", async () => {
  const { fixture, manifest, output } = await validFixture();
  const fakeMetric = { exact_fact_recall: 0 };
  const evaluation = evaluateT201Output(output, fixture, manifest);
  assert.notEqual(
    fakeMetric.exact_fact_recall,
    evaluation.metrics.exact_fact_recall,
  );
  assert.equal(evaluation.metrics.exact_fact_recall, 1);
});

test("T201 parent projection does not disclose parsed resume or raw response", async () => {
  const { fixture, manifest, output } = await validFixture();
  const evaluation = evaluateT201Output(output, fixture, manifest);
  const parentProjection = {
    fixture_identifier: manifest.fixture_id,
    fixture_sha256: fixtureHash(fixture),
    evaluation_metrics: evaluation.metrics,
    credential_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
  };
  const serialized = JSON.stringify(parentProjection);
  assert.equal(serialized.includes("Alex Exemple"), false);
  assert.equal(serialized.includes("alex.exemple@example.invalid"), false);
  assert.equal(serialized.includes("Northstar Example Labs"), false);
  assert.equal(containsSecretLikeValue(serialized), false);
});

test("T201 raw-response non-persistence is represented as a boolean only", () => {
  const evidence = {
    raw_model_response_persisted: false,
    raw_response_sha256: "0".repeat(64),
  };
  assert.equal(Object.hasOwn(evidence, "raw_model_response"), false);
  assert.equal(evidence.raw_model_response_persisted, false);
});

test("T201 prompt boundary excludes host paths and account identifiers", async () => {
  const { fixture, manifest, schema } = await loadT201Artifacts();
  const prompt = buildT201Prompt({ fixture, manifest, schema });
  assert.equal(prompt.includes("/Users/"), false);
  assert.equal(prompt.includes("account_id"), false);
  assert.equal(prompt.includes("access_token"), false);
  assert.equal(prompt.includes("refresh_token"), false);
  assert.equal(prompt.includes("BEGIN SYNTHETIC SOURCE"), true);
  assert.equal(prompt.includes("compact minified JSON object"), true);
  assert.equal(prompt.includes("No Markdown fences"), true);
  assert.equal(prompt.includes("reasoning summaries"), true);
  assert.equal(
    prompt.includes(
      "Evidence objects may contain only line, start, end, fragment_hash, and category.",
    ),
    true,
  );
});

test("T201 runner writes fresh complete evidence for broker exit 0 with current JSON", async () => {
  const runId = "a".repeat(32);
  const { persisted } = await runnerEvidenceCase(
    ["docker noise", JSON.stringify(t201RunnerBrokerResult(runId))],
    {
      runnerRunIdHash: runId,
      brokerExitCode: 0,
    },
  );
  assert.equal(persisted.runner_run_id_hash, runId);
  assert.equal(persisted.broker_exit_status_category, "success");
  assert.equal(persisted.evidence_generated_from_current_run, true);
  assert.equal(persisted.evidence_schema_valid, true);
  assert.equal(persisted.evidence_atomic_replace_succeeded, true);
  assert.equal(persisted.t201_complete, true);
});

test("T201 runner treats broker exit 1 with valid current JSON as evaluated gate failure", async () => {
  const runId = "b".repeat(32);
  const result = t201RunnerBrokerResult(runId, {
    primary_failure_category: "schema_validation_failed",
    primary_failure_phase: "semantic_evaluation",
    schema_valid: false,
    parsing_pass: false,
    safe_final_state: "schema_validation_failed",
  });
  const { persisted } = await runnerEvidenceCase([JSON.stringify(result)], {
    runnerRunIdHash: runId,
    brokerExitCode: 1,
  });
  assert.equal(persisted.broker_exit_status_category, "evaluated_gate_failure");
  assert.equal(persisted.evidence_generated_from_current_run, true);
  assert.equal(persisted.primary_failure_category, "schema_validation_failed");
  assert.equal(persisted.primary_failure_phase, "semantic_evaluation");
  assert.equal(persisted.t201_complete, false);
});

test("T201 runner preserves output-too-large classification and safe limit diagnostics", async () => {
  const runId = "9".repeat(32);
  const result = t201RunnerBrokerResult(runId, {
    invocation_succeeded: false,
    response_protocol_valid: false,
    response_event_count: 81,
    model_output_received: false,
    structured_output_evaluated: false,
    semantic_quality_evaluated: false,
    metrics_measurement_state: "not_measured",
    primary_failure_category: "output_too_large",
    primary_failure_phase: "response_body_read",
    secondary_failure_categories: ["response_too_large"],
    safe_transport_classification: "response_too_large",
    response_events_observed_before_abort: 81,
    event_type_counts: {
      "response.created": 1,
      "response.in_progress": 1,
      "response.output_item.added": 1,
      "response.content_part.added": 1,
      "response.output_text.delta": 2,
      "response.output_text.done": 0,
      "response.content_part.done": 1,
      "response.output_item.done": 0,
      "response.completed": 0,
      "response.failed": 0,
      "response.reasoning_summary_part.added": 1,
      "response.reasoning_summary_text.delta": 70,
      "response.reasoning_summary_text.done": 1,
      "response.reasoning_summary_part.done": 0,
      encrypted_reasoning_event_category: 1,
      other_known_structural: 1,
      unknown_event_count: 0,
    },
    output_text_delta_event_count: 2,
    reasoning_event_count: 73,
    structural_event_count: 8,
    assistant_output_bytes_observed_before_abort: 256,
    assistant_output_started: true,
    terminal_event_observed: false,
    response_event_count_semantics: "typed_json_protocol_events",
    raw_chunk_count: 81,
    sse_line_count: 243,
    sse_comment_count: 2,
    sse_blank_line_dispatch_count: 83,
    sse_empty_dispatch_count: 2,
    sse_data_dispatch_count: 81,
    json_event_count: 81,
    typed_protocol_event_count: 81,
    recognized_protocol_event_count: 81,
    unknown_protocol_event_count: 0,
    average_protocol_event_bytes_denominator: 81,
    average_protocol_event_bytes_denominator_semantics:
      "typed_protocol_event_count",
    estimated_average_protocol_event_bytes: 220,
    average_protocol_event_bytes_category: "small",
    estimated_average_sse_event_bytes: 220,
    average_sse_event_bytes_category: "small",
    limit_that_triggered: "sse_event_count",
    response_truncated_by_safety_limit: true,
    partial_stream_statistics_preserved: true,
    schema_valid: null,
    evaluation_metrics: safeEvaluationProjection(
      notEvaluatedT201Projection({
        primaryFailureCategory: "output_too_large",
        primaryFailurePhase: "response_body_read",
        secondaryFailureCategories: ["response_too_large"],
      }),
    ),
    unsupported_fact_count: null,
    forbidden_inference_count: null,
    missing_evidence_count: null,
    invalid_evidence_count: null,
    no_invention_pass: null,
    grounding_pass: null,
    parsing_pass: false,
    safe_final_state: "output_too_large",
  });
  const { persisted } = await runnerEvidenceCase([JSON.stringify(result)], {
    runnerRunIdHash: runId,
    brokerExitCode: 1,
  });
  assert.equal(persisted.primary_failure_category, "output_too_large");
  assert.equal(persisted.safe_transport_classification, "response_too_large");
  assert.equal(persisted.limit_that_triggered, "sse_event_count");
  assert.equal(persisted.response_truncated_by_safety_limit, true);
  assert.equal(
    persisted.response_event_limit,
    CODEX_T201_TRANSPORT_LIMITS.eventMaxCount,
  );
  assert.equal(persisted.response_events_observed_before_abort, 81);
  assert.equal(
    persisted.event_type_counts["response.reasoning_summary_text.delta"],
    70,
  );
  assert.equal(persisted.output_text_delta_event_count, 2);
  assert.equal(persisted.reasoning_event_count, 73);
  assert.equal(persisted.structural_event_count, 8);
  assert.equal(persisted.assistant_output_bytes_observed_before_abort, 256);
  assert.equal(persisted.assistant_output_started, true);
  assert.equal(persisted.terminal_event_observed, false);
  assert.equal(
    persisted.response_event_count_semantics,
    "typed_json_protocol_events",
  );
  assert.equal(persisted.raw_chunk_count, 81);
  assert.equal(persisted.sse_data_dispatch_count, 81);
  assert.equal(persisted.typed_protocol_event_count, 81);
  assert.equal(persisted.average_protocol_event_bytes_denominator, 81);
  assert.equal(persisted.partial_stream_statistics_preserved, true);
  assert.equal(persisted.estimated_average_sse_event_bytes, 220);
  assert.equal(persisted.average_sse_event_bytes_category, "small");
  assert.equal(persisted.schema_valid, null);
  assert.equal(persisted.evaluation_metrics.exact_fact_recall, null);
  assert.equal(JSON.stringify(persisted).includes("Alex Exemple"), false);
  assert.equal(JSON.stringify(persisted).includes("raw_model_text"), false);
});

test("T201 byte-count diagnostics contain no response content", async () => {
  const runId = "8".repeat(32);
  const result = t201RunnerBrokerResult(runId, {
    response_bytes_observed_before_abort: 123456,
    response_bytes_category: "bounded",
    largest_sse_event_bytes_observed: 4096,
    triggering_sse_event_bytes: null,
    average_sse_event_bytes_category: "bounded",
    event_type_counts: {
      "response.output_text.delta": 1,
      unknown_event_count: 1,
      "response.future_event.private_payload": 99,
      private_value: 88,
    },
    limit_that_triggered: "response_decompressed_bytes",
    response_truncated_by_safety_limit: true,
    raw_model_text: "Alex Exemple private model output",
    response_payload: "Northstar Example Labs",
  });
  const { persisted } = await runnerEvidenceCase([JSON.stringify(result)], {
    runnerRunIdHash: runId,
    brokerExitCode: 0,
  });
  assert.equal(persisted.response_bytes_observed_before_abort, 123456);
  assert.equal(persisted.largest_sse_event_bytes_observed, 4096);
  assert.equal(persisted.event_type_counts["response.output_text.delta"], 1);
  assert.equal(persisted.event_type_counts.unknown_event_count, 1);
  assert.equal(
    Object.hasOwn(
      persisted.event_type_counts,
      "response.future_event.private_payload",
    ),
    false,
  );
  assert.equal(
    Object.hasOwn(persisted.event_type_counts, "private_value"),
    false,
  );
  assert.equal(persisted.limit_that_triggered, "response_decompressed_bytes");
  assert.equal(JSON.stringify(persisted).includes("Alex Exemple"), false);
  assert.equal(
    JSON.stringify(persisted).includes("Northstar Example Labs"),
    false,
  );
});

test("T201 runner broker exit 1 replaces stale evidence instead of leaving it current", async () => {
  const runId = "c".repeat(32);
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-stale-test-"),
  );
  const evidencePath = path.join(
    dir,
    "codex-direct-oauth-t201-semantic-parsing.json",
  );
  const logsPath = path.join(dir, "codex-direct-oauth-t201-docker.log");
  await fs.writeFile(
    evidencePath,
    `${JSON.stringify({ runner_run_id_hash: "stale", observation_timestamp: "2020-01-01T00:00:00.000Z" })}\n`,
  );
  await fs.writeFile(
    logsPath,
    `${JSON.stringify(
      t201RunnerBrokerResult(runId, {
        primary_failure_category: "invalid_json",
        primary_failure_phase: "structured_json_parse",
        model_output_received: true,
        structured_output_evaluated: true,
        semantic_quality_evaluated: false,
        metrics_measurement_state: "not_measured",
        schema_valid: false,
        parsing_pass: false,
        safe_final_state: "invalid_json",
      }),
    )}\n`,
  );
  await processT201RunnerEvidence({
    evidencePath,
    logsPath,
    runnerRunIdHash: runId,
    runnerStartedAt: "2026-07-31T12:00:00.000Z",
    brokerExitCode: 1,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    generatedAt: new Date("2026-07-31T12:00:02.000Z"),
  });
  const persisted = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  assert.equal(persisted.runner_run_id_hash, runId);
  assert.notEqual(persisted.runner_run_id_hash, "stale");
  assert.equal(persisted.primary_failure_category, "invalid_json");
});

test("T201 runner writes sanitized runner-failure evidence when no valid JSON is emitted", async () => {
  const runId = "d".repeat(32);
  const { persisted } = await runnerEvidenceCase(
    ["container failed before JSON"],
    {
      runnerRunIdHash: runId,
      brokerExitCode: 1,
    },
  );
  assert.equal(
    persisted.broker_exit_status_category,
    "runner_or_container_failure",
  );
  assert.equal(persisted.evidence_generated_from_current_run, false);
  assert.equal(persisted.evidence_schema_valid, false);
  assert.equal(persisted.primary_failure_category, "runner_failure");
  assert.equal(persisted.primary_failure_phase, "broker_result_parse");
  assert.equal(persisted.t201_complete, false);
});

test("T201 runner rejects broker output from another run identifier", async () => {
  const currentRunId = "e".repeat(32);
  const otherRunId = "f".repeat(32);
  const { persisted } = await runnerEvidenceCase(
    [JSON.stringify(t201RunnerBrokerResult(otherRunId))],
    {
      runnerRunIdHash: currentRunId,
      brokerExitCode: 0,
    },
  );
  assert.equal(persisted.primary_failure_category, "runner_failure");
  assert.equal(persisted.evidence_generated_from_current_run, false);
  assert.deepEqual(persisted.evidence_rejection_reasons, [
    "no_current_broker_result",
  ]);
});

test("T201 runner rejects old broker timestamps even when JSON is otherwise current", () => {
  const runId = "1".repeat(32);
  const parseOutcome = parseCurrentBrokerResult(
    JSON.stringify(
      t201RunnerBrokerResult(runId, {
        observation_timestamp: "2026-07-31T11:59:59.000Z",
      }),
    ),
    {
      runnerRunIdHash: runId,
      runnerStartedAt: "2026-07-31T12:00:00.000Z",
    },
  );
  assert.equal(parseOutcome.ok, false);
  assert.ok(
    parseOutcome.rejectionReasons.includes("broker_timestamp_before_runner"),
  );
});

test("T201 runner atomic replacement removes abandoned temp files", async () => {
  const runId = "2".repeat(32);
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nuvitae-t201-atomic-test-"),
  );
  const evidencePath = path.join(
    dir,
    "codex-direct-oauth-t201-semantic-parsing.json",
  );
  const logsPath = path.join(dir, "codex-direct-oauth-t201-docker.log");
  await fs.writeFile(
    path.join(
      dir,
      "codex-direct-oauth-t201-semantic-parsing.json.tmp-abandoned",
    ),
    "old",
  );
  await fs.writeFile(
    logsPath,
    `${JSON.stringify(t201RunnerBrokerResult(runId))}\n`,
  );
  await processT201RunnerEvidence({
    evidencePath,
    logsPath,
    runnerRunIdHash: runId,
    runnerStartedAt: "2026-07-31T12:00:00.000Z",
    brokerExitCode: 0,
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    generatedAt: new Date("2026-07-31T12:00:02.000Z"),
  });
  const entries = await fs.readdir(dir);
  assert.equal(
    entries.some((entry) => entry.includes(".tmp-")),
    false,
  );
  const persisted = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  assert.equal(persisted.evidence_atomic_replace_succeeded, true);
});

test("T201 runner mandatory diagnostic fields are never null after attempted run", () => {
  const runId = "3".repeat(32);
  const fields = [
    "primary_failure_category",
    "primary_failure_phase",
    "model_output_received",
    "structured_output_evaluated",
    "semantic_quality_evaluated",
    "metrics_measurement_state",
    "raw_credentials_exposed_to_parent",
    "account_identifier_exposed_to_parent",
  ];
  const successEvidence = buildFinalEvidence({
    brokerResult: t201RunnerBrokerResult(runId),
    brokerExitCode: 0,
    runnerRunIdHash: runId,
    runnerStartedAt: "2026-07-31T12:00:00.000Z",
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    parseOutcome: { resultReceived: true, rejectionReasons: [] },
    generatedAt: new Date("2026-07-31T12:00:02.000Z"),
  });
  const failureEvidence = buildFinalEvidence({
    brokerResult: null,
    brokerExitCode: 1,
    runnerRunIdHash: runId,
    runnerStartedAt: "2026-07-31T12:00:00.000Z",
    brokerRemoved: true,
    callbackPortAbsent: true,
    secretScanResult: "passed",
    logSecretScanResult: "passed",
    parseOutcome: {
      resultReceived: false,
      rejectionReasons: ["no_json_broker_result"],
    },
    generatedAt: new Date("2026-07-31T12:00:02.000Z"),
  });
  for (const evidence of [successEvidence, failureEvidence]) {
    for (const field of fields) assert.notEqual(evidence[field], null, field);
  }
});

test("T201 runner includes broker and callback cleanup checks in completion gate", async () => {
  const runId = "4".repeat(32);
  const { persisted } = await runnerEvidenceCase(
    [JSON.stringify(t201RunnerBrokerResult(runId))],
    {
      runnerRunIdHash: runId,
      brokerExitCode: 0,
      brokerRemoved: false,
      callbackPortAbsent: false,
    },
  );
  assert.equal(persisted.broker_removed, false);
  assert.equal(persisted.callback_port_absent, false);
  assert.equal(persisted.t201_complete, false);
});

test("T201 runner evidence excludes credential and account identifiers", async () => {
  const runId = "5".repeat(32);
  const result = t201RunnerBrokerResult(runId, {
    account_identifier: "acct_synthetic_private_identifier",
    credential_namespace: "owner-private-namespace",
  });
  const { persisted } = await runnerEvidenceCase([JSON.stringify(result)], {
    runnerRunIdHash: runId,
    brokerExitCode: 0,
  });
  const serialized = JSON.stringify(persisted);
  assert.equal(serialized.includes("acct_synthetic_private_identifier"), false);
  assert.equal(serialized.includes("owner-private-namespace"), false);
  assert.equal(containsSecretLikeValue(serialized), false);
  assert.equal(persisted.raw_credentials_exposed_to_parent, false);
  assert.equal(persisted.account_identifier_exposed_to_parent, false);
});
