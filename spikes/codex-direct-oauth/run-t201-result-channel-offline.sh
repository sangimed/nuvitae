#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
mode=${1:-success}
case "$mode" in
  success|unsafe-directory) ;;
  *) echo "usage: $0 [success|unsafe-directory]" >&2; exit 64 ;;
esac
unsafe_directory=false
if [ "$mode" = "unsafe-directory" ]; then unsafe_directory=true; fi

mkdir -p .tmp
umask 077
work_dir=$(mktemp -d "$root/.tmp/t201-result-offline.XXXXXX")
broker_stdout="$work_dir/broker.stdout"
broker_stderr="$work_dir/broker.stderr"
reader_stdout="$work_dir/reader.stdout"
reader_stderr="$work_dir/reader.stderr"
run_id=$(node --input-type=module -e 'import { generateRunnerRunIdHash } from "./lib/t201-live-runner-evidence.mjs"; process.stdout.write(generateRunnerRunIdHash());')
result_volume="nuvitae-codex-direct-oauth-t201-offline-result-$run_id"
broker_container="t201-offline-broker-$run_id"
reader_container="t201-offline-reader-$run_id"
result_path="/spike/result/$run_id/result.json"

cleanup() {
  docker rm -f "$broker_container" "$reader_container" >/dev/null 2>&1 || true
  docker volume rm "$result_volume" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

docker volume create "$result_volume" >/dev/null
set +e
docker compose run --name "$broker_container" --no-deps \
  -v "$result_volume:/spike/result:rw" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  -e NUVITAE_T201_RUN_ID_HASH="$run_id" \
  -e NUVITAE_T201_OFFLINE_UNSAFE_DIRECTORY="$unsafe_directory" \
  --entrypoint node t201-semantic t201-result-channel-topology-offline-broker.mjs >"$broker_stdout" 2>"$broker_stderr"
broker_status=$?

docker compose run --name "$reader_container" --no-deps \
  -v "$result_volume:/spike/result:ro" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  t201-result-reader >"$reader_stdout" 2>"$reader_stderr"
reader_status=$?
set -e

reader_mounts=$(docker inspect --format '{{range .Mounts}}{{.Destination}} {{end}}' "$reader_container")
reader_env_names=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$reader_container" | sed 's/=.*//')
[ "$reader_mounts" = "/spike/result " ]
if printf '%s\n' "$reader_env_names" | rg -q '^(CODEX|OPENAI|OAUTH|NUVITAE_T199_)'; then
  exit 1
fi

docker rm -f "$broker_container" "$reader_container" >/dev/null 2>&1

node --input-type=module - "$mode" "$broker_stdout" "$broker_stderr" "$reader_stdout" "$reader_stderr" "$run_id" "$broker_status" "$reader_status" <<'NODE'
import fs from "node:fs/promises";
const [, , mode, brokerStdoutPath, brokerStderrPath, readerStdoutPath, readerStderrPath, runId, brokerStatus, readerStatus] = process.argv;
const [brokerStdout, brokerStderr, readerStdout, readerStderr] = await Promise.all([
  fs.readFile(brokerStdoutPath, "utf8"), fs.readFile(brokerStderrPath, "utf8"), fs.readFile(readerStdoutPath, "utf8"), fs.readFile(readerStderrPath, "utf8"),
]);
if (mode === "unsafe-directory") {
  if (Number(brokerStatus) === 0 || Number(readerStatus) === 0 || readerStdout.length !== 0 || !readerStderr.includes("safe_result_reader_failure:")) process.exit(1);
  process.stdout.write('{"offline_topology":"unsafe_directory_rejected","credential_mounts":false,"provider_environment":false}\n');
  process.exit(0);
}
const result = JSON.parse(readerStdout);
if (Number(brokerStatus) !== 1 || Number(readerStatus) !== 0 || !brokerStdout.trim().startsWith("{") || result.runner_run_id_hash !== runId) process.exit(1);
if (result.result_artifact_preflight?.effective_uid !== result.result_artifact_preflight?.directory_uid || result.result_artifact_preflight?.effective_gid !== result.result_artifact_preflight?.directory_gid || result.result_artifact_preflight?.directory_mode !== 0o700 || !result.result_artifact_preflight?.same_filesystem || !readerStderr.includes(":600:same_filesystem")) process.exit(1);
process.stdout.write(`${JSON.stringify({
  offline_topology: "passed",
  broker_effective_uid: result.result_artifact_preflight.effective_uid,
  broker_effective_gid: result.result_artifact_preflight.effective_gid,
  reader_effective_uid: result.result_artifact_preflight.directory_uid,
  reader_effective_gid: result.result_artifact_preflight.directory_gid,
  directory_mode: result.result_artifact_preflight.directory_mode,
  temporary_file_mode: 0o600,
  final_file_mode: 0o600,
  fsync_and_atomic_rename: "passed",
  reader_isolation: "credential_and_provider_environment_absent",
  parent_received_one_json_object: true,
  invocation_attempted: false,
})}\n`);
NODE
