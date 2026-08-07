import assert from "node:assert/strict";
import { test } from "node:test";
import { collectT246CaseProof } from "../lib/t246-corpus-verification.mjs";
import { buildValidT246Result } from "../lib/t246-live-evaluator.mjs";
import { runT246Broker } from "../lib/t246-live-broker-core.mjs";
import { parseT246AttemptArguments } from "../lib/t246-authorization.mjs";

const proof = await collectT246CaseProof({ caseId: "T246-C01" });
const RUN_ID = "a".repeat(64);
const RAW_TRANSCRIPT_SENTINEL = "Léa Dupont-Exemple";

function baseEnv(overrides = {}) {
  return {
    NUVITAE_T246_RESULT_PATH: `/spike/result/${RUN_ID}/result.json`,
    NUVITAE_T246_RUN_ID_HASH: RUN_ID,
    NUVITAE_T246_CASE_ID: "T246-C01",
    NUVITAE_T246_ATTEMPT_ID: "A01",
    NUVITAE_T246_FIXTURE_PATH: "/spike/t246-input/fixture.pdf",
    NUVITAE_T246_TRANSCRIPT_PATH: "/spike/t246-input/transcript.txt",
    NUVITAE_T246_MANIFEST_PATH:
      "/spike/fixtures/t246-matrix/t246-c01.manifest.json",
    NUVITAE_T246_FIXTURE_SHA256: proof.row.fixture_sha256,
    NUVITAE_T246_TRANSCRIPT_SHA256: proof.row.transcript_sha256,
    NUVITAE_T246_MANIFEST_SHA256: proof.manifestSha256,
    NUVITAE_T246_MAX_BROKER_RUNS: "1",
    NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS: "1",
    NUVITAE_T246_AUTOMATIC_RETRIES: "0",
    ...overrides,
  };
}

function fakeArtifacts(overrides = {}) {
  return async () => ({
    fixtureSha256: proof.row.fixture_sha256,
    transcriptSha256: proof.row.transcript_sha256,
    manifestSha256: proof.manifestSha256,
    lines: proof.lines,
    transcript: proof.transcript,
    manifest: proof.manifest,
    ...overrides,
  });
}

function fakeRecover(payload = {}) {
  return async () => ({
    key: "k",
    envelope: {},
    generation: 2,
    payload: {
      access_token: "at-ok",
      refresh_token: "rt-ok",
      chatgpt_account_id: "acct-ok",
      expires_at: Date.now() + 3_600_000,
      ...payload,
    },
  });
}

function fakeTransport(overrides = {}) {
  const golden = buildValidT246Result(proof.transcript, proof.manifest);
  return async () => ({
    ok: true,
    raw_model_text: JSON.stringify(golden),
    response_protocol_valid: true,
    safe_http_status_category: "2xx",
    safe_exact_http_status: 200,
    actual_request_manifest: {
      header_names: [
        "accept",
        "content-type",
        "authorization",
        "chatgpt-account-id",
        "originator",
        "openai-beta",
      ],
      reasoning_effort_category: "low",
      reasoning_summary_present: false,
      include_category: "empty",
      text_verbosity_category: "low",
      tools_present: false,
      store_false: true,
      stream_boolean: true,
    },
    invocation_attempted: true,
    invocation_succeeded: true,
    response_event_count: 1,
    event_type_counts: { "response.completed": 1 },
    assistant_output_bytes_observed_before_abort: 10,
    assistant_output_started: true,
    terminal_event_observed: true,
    ...overrides,
  });
}

function harness({
  env = baseEnv(),
  artifacts = fakeArtifacts(),
  recover = fakeRecover(),
  refresh,
  transport = fakeTransport(),
  readFile = async () => "encrypted-bytes-no-plaintext",
  emit,
  prepareResultDirectory = async () => ({
    effective_uid: 1000,
    effective_gid: 1000,
    directory_uid: 1000,
    directory_gid: 1000,
    directory_mode: 448,
    same_filesystem: true,
  }),
} = {}) {
  const calls = {
    recover: 0,
    refresh: 0,
    transport: 0,
  };
  const emitted = [];
  const deps = {
    env,
    verifyArtifacts: artifacts,
    prepareResultDirectory,
    recover: async (...args) => {
      calls.recover += 1;
      return recover(...args);
    },
    refresh:
      refresh ??
      (async (current) => {
        calls.refresh += 1;
        return {
          current,
          refresh_required: false,
          refresh_attempted: false,
          refresh_succeeded: false,
        };
      }),
    invokeTransport: async (...args) => {
      calls.transport += 1;
      return transport(...args);
    },
    readFile,
    emit:
      emit ??
      (async (result) => {
        emitted.push(result);
        return `${JSON.stringify(result)}\n`;
      }),
  };
  return {
    calls,
    emitted,
    run: () => runT246Broker(deps),
  };
}

test("T246 broker simulates a successful C01 run: one transport call, complete evidence, no raw material", async () => {
  const h = harness();
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.rehearsal, false);
  assert.equal(h.calls.recover, 2); // before + post-verification
  assert.equal(h.calls.transport, 1);
  assert.equal(h.emitted.length, 1);
  const result = h.emitted[0];
  assert.equal(result.evidence_classification, "live_t246_semantic_parsing");
  assert.equal(result.case_id, "T246-C01");
  assert.equal(result.attempt_id, "A01");
  assert.equal(result.fixture_sha256, proof.row.fixture_sha256);
  assert.equal(result.transcript_sha256, proof.row.transcript_sha256);
  assert.equal(result.manifest_sha256, proof.manifestSha256);
  assert.equal(result.t246_artifact_hashes_validated, true);
  assert.equal(result.t246_transcript_regeneration_matched, true);
  assert.equal(result.t246_manifest_binding_valid, true);
  assert.equal(result.t246_thresholds_preserved, true);
  assert.equal(result.provenance_contract_validated, true);
  assert.equal(result.parsing_pass, true);
  assert.equal(result.schema_valid, true);
  assert.equal(result.evaluation_metrics.exact_fact_recall, 1);
  assert.equal(result.evaluation_metrics.high_priority_fact_recall, 1);
  assert.equal(
    result.evaluation_metrics.document_language_classification_pass,
    true,
  );
  assert.equal(result.evaluation_metrics.unsupported_fact_count, 0);
  assert.equal(result.evaluation_metrics.forbidden_inference_count, 0);
  assert.equal(result.evaluation_metrics.missing_evidence_count, 0);
  assert.equal(result.evaluation_metrics.invalid_evidence_count, 0);
  assert.equal(result.evaluation_metrics.source_grounding_pass, true);
  assert.equal(result.evaluation_metrics.no_invention_pass, true);
  assert.equal(result.safe_final_state, "complete");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(RAW_TRANSCRIPT_SENTINEL), false);
  assert.equal(serialized.includes("at-ok"), false);
  assert.equal(serialized.includes("rt-ok"), false);
  assert.equal(serialized.includes("acct-ok"), false);
});

test("T246 broker fails before credential recovery on fixture hash mismatch", async () => {
  const recoverCalls = { count: 0 };
  const h = harness({
    artifacts: async () => {
      throw new Error("t246_fixture_hash_mismatch");
    },
    recover: async () => {
      recoverCalls.count += 1;
      throw new Error("recover_should_not_run");
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(recoverCalls.count, 0);
  assert.equal(h.calls.transport, 0);
  assert.equal(
    outcome.result.primary_failure_category,
    "t246_fixture_hash_mismatch",
  );
  assert.equal(outcome.result.parsing_pass, false);
});

test("T246 broker fails before credential recovery on transcript hash mismatch", async () => {
  const recoverCalls = { count: 0 };
  const h = harness({
    artifacts: async () => {
      throw new Error("t246_transcript_hash_mismatch");
    },
    recover: async () => {
      recoverCalls.count += 1;
      throw new Error("recover_should_not_run");
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(recoverCalls.count, 0);
  assert.equal(h.calls.transport, 0);
  assert.equal(
    outcome.result.primary_failure_category,
    "t246_transcript_hash_mismatch",
  );
});

test("T246 broker fails before credential recovery on manifest hash mismatch", async () => {
  const recoverCalls = { count: 0 };
  const h = harness({
    artifacts: async () => {
      throw new Error("t246_manifest_hash_mismatch");
    },
    recover: async () => {
      recoverCalls.count += 1;
      throw new Error("recover_should_not_run");
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(recoverCalls.count, 0);
  assert.equal(h.calls.transport, 0);
  assert.equal(
    outcome.result.primary_failure_category,
    "t246_manifest_hash_mismatch",
  );
});

test("T246 broker rejects retries > 0 before credential recovery", async () => {
  const recoverCalls = { count: 0 };
  const h = harness({
    env: baseEnv({ NUVITAE_T246_AUTOMATIC_RETRIES: "1" }),
    recover: async () => {
      recoverCalls.count += 1;
      throw new Error("recover_should_not_run");
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(recoverCalls.count, 0);
  assert.equal(h.calls.transport, 0);
  assert.equal(
    outcome.result.primary_failure_category,
    "t246_single_request_required",
  );
});

test("T246 broker does not reach the provider boundary when credential recovery fails", async () => {
  const h = harness({
    recover: async () => {
      throw Object.assign(new Error("credential_recovery_failed"), {
        safeCategory: "transport_failure",
      });
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(h.calls.transport, 0);
  assert.equal(outcome.result.primary_failure_category, "transport_failure");
  assert.equal(outcome.result.parsing_pass, false);
});

test("T246 broker produces sanitized failure evidence on HTTP/protocol failure with at most one request", async () => {
  const h = harness({
    transport: fakeTransport({
      ok: false,
      raw_model_text: null,
      response_protocol_valid: false,
      safe_http_status_category: "5xx",
      safe_exact_http_status: 500,
      primary_failure_category: "transport_failure",
      primary_failure_phase: "transport_invocation",
      safe_error_category: "transport_failure",
      invocation_succeeded: false,
    }),
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(h.calls.transport, 1);
  assert.equal(h.emitted.length, 1);
  const result = h.emitted[0];
  assert.equal(result.invocation_succeeded, false);
  assert.equal(result.response_protocol_valid, false);
  assert.equal(result.schema_valid, null);
  assert.equal(result.parsing_pass, false);
  assert.equal(result.model_output_received, false);
  assert.equal(result.safe_final_state, "transport_failure");
  assert.equal(JSON.stringify(result).includes("at-ok"), false);
});

test("T246 broker produces sanitized failure evidence on semantic failure", async () => {
  const h = harness({
    transport: fakeTransport({
      raw_model_text: "not json at all",
    }),
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(h.calls.transport, 1);
  const result = h.emitted[0];
  assert.equal(result.parsing_pass, false);
  assert.equal(result.schema_valid, false);
  assert.equal(result.semantic_quality_evaluated, false);
  assert.equal(result.safe_final_state, "invalid_json");
  assert.equal(JSON.stringify(result).includes("not json at all"), false);
});

test("T246 credential-free rehearsal completes without credentials or transport", async () => {
  const recoverCalls = { count: 0 };
  const h = harness({
    env: baseEnv({ NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL: "1" }),
    recover: async () => {
      recoverCalls.count += 1;
      throw new Error("recover_should_not_run");
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.rehearsal, true);
  assert.equal(recoverCalls.count, 0);
  assert.equal(h.calls.transport, 0);
  const result = h.emitted[0];
  assert.equal(result.phase, "credential_free_rehearsal");
  assert.equal(result.semantic_invocation_attempted, false);
  assert.equal(result.credential_recovery_attempted, false);
  assert.equal(result.success, true);
  assert.equal(result.fixture_sha256, proof.row.fixture_sha256);
  assert.equal(result.transcript_sha256, proof.row.transcript_sha256);
  assert.equal(result.manifest_sha256, proof.manifestSha256);
});

test("T246 broker rejects a manifest bound to a different case before recovery", async () => {
  const recoverCalls = { count: 0 };
  const h = harness({
    env: baseEnv({
      NUVITAE_T246_MANIFEST_PATH:
        "/spike/fixtures/t246-matrix/t246-c02.manifest.json",
      NUVITAE_T246_MANIFEST_SHA256: "1".repeat(64),
    }),
    recover: async () => {
      recoverCalls.count += 1;
      throw new Error("recover_should_not_run");
    },
  });
  const outcome = await h.run();
  assert.equal(outcome.exitCode, 1);
  assert.equal(recoverCalls.count, 0);
  assert.equal(h.calls.transport, 0);
  assert.equal(
    outcome.result.primary_failure_category,
    "t246_manifest_binding_invalid",
  );
});

test("T246 live-mode command parsing resolves one and only one case", () => {
  const invocation = parseT246AttemptArguments([
    "--campaign",
    "T246-C01",
    "--attempt",
    "A01",
    "--semantic-case",
    "T246-C01",
    "--fixture",
    "tests/fixtures/resumes/anonymous-french-resume.pdf",
    "--manifest",
    "spikes/codex-direct-oauth/fixtures/t246-matrix/t246-c01.manifest.json",
    "--evidence",
    "spikes/codex-direct-oauth/evidence/codex-direct-oauth-t246-c01-a01-semantic-parsing.json",
    "--max-broker-runs",
    "1",
    "--max-semantic-backend-requests",
    "1",
    "--automatic-retries",
    "0",
  ]);
  assert.equal(invocation.semantic_case, "T246-C01");
  assert.equal(invocation.campaign, "T246-C01");
  assert.equal(invocation.attempt, "A01");
  assert.throws(
    () =>
      parseT246AttemptArguments([
        "--campaign",
        "T246-C01",
        "--attempt",
        "A01",
        "--semantic-case",
        "T246-C01",
        "--semantic-case",
        "T246-C02",
      ]),
    (error) => error.code === "t246_invalid_arguments",
  );
});
