import { emitBrokerResult } from "./lib/t201-broker-result-channel.mjs";
import { sanitizeErrorCategory } from "./lib/sanitize.mjs";

const runId = process.env.NUVITAE_T201_RUN_ID_HASH;
if (!/^[a-f0-9]{32,64}$/.test(runId ?? "")) {
  process.stderr.write("offline result broker requires a runner id\n");
  process.exit(2);
} else {
  try {
    await emitBrokerResult({
    evidence_classification: "live_t201_semantic_parsing",
    observation_timestamp: new Date().toISOString(),
    runner_run_id_hash: runId,
    deployment_mode: "offline_result_channel_test",
    fixture_identifier: "T201-C02",
    fixture_classified_as_synthetic: true,
    invocation_attempted: false,
    invocation_succeeded: false,
    response_protocol_valid: false,
    terminal_event_observed: false,
    schema_valid: null,
    evaluation_metrics: { metrics_measurement_state: "not_measured", parsing_pass: false },
    parsing_pass: false,
    primary_failure_category: "safe_unknown_failure",
    primary_failure_phase: "offline_result_channel",
    secondary_failure_categories: [],
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_model_response_persisted: false,
    encrypted_state_preserved: true,
    callback_port_absent: true,
    safe_final_state: "offline_result_channel",
    });
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`offline_result_channel_error=${sanitizeErrorCategory(error?.message)}\n`);
    process.exitCode = 2;
  }
}
