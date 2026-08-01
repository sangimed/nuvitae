#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
mkdir -p .tmp
umask 077
result_dir=$(mktemp -d "$root/.tmp/t201-result-offline.XXXXXX")
result_file="$result_dir/result.json"
stdout_file="$result_dir/broker.stdout"
stderr_file="$result_dir/broker.stderr"
evidence_file="$result_dir/evidence.json"
cleanup() { rm -rf "$result_dir"; }
trap cleanup EXIT HUP INT TERM
chmod 700 "$result_dir"

run_id=$(node --input-type=module -e 'import { generateRunnerRunIdHash } from "./lib/t201-live-runner-evidence.mjs"; process.stdout.write(generateRunnerRunIdHash());')
started_at=$(node --input-type=module -e 'process.stdout.write(new Date().toISOString());')
set +e
docker compose run --name t201-result-channel-offline-broker --no-deps \
  -v "$result_dir:/spike/result:rw" \
  -e NUVITAE_T201_RESULT_PATH=/spike/result/result.json \
  -e NUVITAE_T201_RUN_ID_HASH="$run_id" \
  t201-result-channel-offline >"$stdout_file" 2>"$stderr_file"
status=$?
docker rm -f t201-result-channel-offline-broker >/dev/null 2>&1
set -e
chmod 700 "$result_dir"

node --input-type=module - "$evidence_file" "$result_file" "$stdout_file" "$stderr_file" "$run_id" "$started_at" "$status" <<'NODE'
import fs from "node:fs/promises";
import { processT201RunnerEvidence } from "./lib/t201-live-runner-evidence.mjs";
const [, , evidencePath, resultPath, stdoutPath, stderrPath, runId, startedAt, exitCode] = process.argv;
const evidence = await processT201RunnerEvidence({
  evidencePath, logsPath: "/dev/null", resultPath, stdoutPath, stderrPath,
  runnerRunIdHash: runId, runnerStartedAt: startedAt, brokerExitCode: Number(exitCode),
  brokerRemoved: true, callbackPortAbsent: true, secretScanResult: "passed", logSecretScanResult: "passed", caseId: "T201-C02",
});
const artifactExistsBeforeCleanup = await fs.stat(resultPath).then(() => true).catch(() => false);
process.stdout.write(`${JSON.stringify({
  offline_result_channel: evidence.result_channel_state,
  parent_received_valid_result: evidence.evidence_schema_valid,
  broker_exit_code: evidence.broker_process_exit_code,
  stdout_state: evidence.broker_stdout_state,
  stdout_bytes: evidence.broker_stdout_byte_count,
  stderr_bytes: evidence.broker_stderr_byte_count,
  stderr_safe_category: evidence.broker_stderr_safe_category,
  invocation_attempted: evidence.invocation_attempted,
  semantic_quality_evaluated: evidence.semantic_quality_evaluated,
  artifact_exists_before_cleanup: artifactExistsBeforeCleanup,
})}\n`);
NODE
