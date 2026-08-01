#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

key_volume=${CODEX_DIRECT_OAUTH_T199_KEY_VOLUME:-nuvitae-codex-direct-oauth-t199-key-live}
credential_volume=${CODEX_DIRECT_OAUTH_T199_CREDENTIAL_VOLUME:-nuvitae-codex-direct-oauth-t199-credentials-live}
container=t201-semantic-broker
case_id=T201-C02
evidence=${NUVITAE_T201_EVIDENCE_PATH:-}
result_root="$root/.tmp"

if [ -z "$evidence" ]; then
  echo "NUVITAE_T201_EVIDENCE_PATH is required to preserve prior attempts" >&2
  exit 1
fi

mkdir -p evidence "$result_root"
umask 077
result_dir=$(mktemp -d "$result_root/t201-result.XXXXXX")
stdout_file="$result_dir/broker.stdout"
stderr_file="$result_dir/broker.stderr"
reader_stdout_file="$result_dir/reader.stdout"
reader_stderr_file="$result_dir/reader.stderr"
cleanup() { rm -rf "$result_dir"; }
trap cleanup EXIT HUP INT TERM
chmod 700 "$result_dir"
runner_run_id_hash=$(node --input-type=module -e 'import { generateRunnerRunIdHash } from "./lib/t201-live-runner-evidence.mjs"; process.stdout.write(generateRunnerRunIdHash());')
runner_started_at=$(node --input-type=module -e 'process.stdout.write(new Date().toISOString());')

if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "callback port 1455 is listening; refusing T201" >&2
  exit 1
fi

# This credential-free gate verifies that the image built by Compose is the
# image actually used by the rootless live service before preserved volumes are
# even inspected or mounted. It prevents a stale pre-rootless-result image from
# reaching the semantic broker.
if ! sh ./run-t201-live-result-channel-preflight.sh >/dev/null; then
  echo "credential-free T201 result-channel preflight failed; refusing live semantic run" >&2
  exit 1
fi

docker volume inspect "$key_volume" >/dev/null
docker volume inspect "$credential_volume" >/dev/null
docker compose build t201-semantic t201-result-reader >/dev/null
result_volume="nuvitae-codex-direct-oauth-t201-result-$runner_run_id_hash"
reader_container="t201-result-reader-$runner_run_id_hash"
result_path="/spike/result/$runner_run_id_hash/result.json"
docker volume create "$result_volume" >/dev/null

set +e
docker compose run --name "$container" --no-deps \
  -v "$key_volume:/run/t199-key:ro" \
  -v "$credential_volume:/spike/credentials:rw" \
  -v "$result_volume:/spike/result:rw" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  -e NUVITAE_T201_RUN_ID_HASH="$runner_run_id_hash" \
  -e NUVITAE_T201_CASE_ID="$case_id" \
  t201-semantic >"$stdout_file" 2>"$stderr_file"
status=$?
docker rm -f "$container" >/dev/null 2>&1
docker compose run --name "$reader_container" --no-deps \
  -v "$result_volume:/spike/result:ro" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  t201-result-reader >"$reader_stdout_file" 2>"$reader_stderr_file"
reader_status=$?
docker rm -f "$reader_container" >/dev/null 2>&1
docker volume rm "$result_volume" >/dev/null 2>&1
set -e
process_start_failed=false

broker_removed=true
if docker ps -a --format '{{.Names}}' | grep -Eq '(^|[[:space:]])t201-semantic-broker($|[[:space:]])'; then
  broker_removed=false
fi
if docker ps -a --format '{{.Names}}' | grep -Eq "(^|[[:space:]])$reader_container($|[[:space:]])"; then
  broker_removed=false
fi

callback_port_absent=true
if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then
  callback_port_absent=false
fi

set +e
node secret-scan.mjs >/dev/null
scan_status=$?
set -e
if [ "$scan_status" -eq 0 ]; then
  secret_scan_result=passed
else
  secret_scan_result=failed
fi

set +e
node --input-type=module - "$stdout_file" "$stderr_file" "$reader_stdout_file" "$reader_stderr_file" <<'NODE'
import fs from "node:fs/promises";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";
const [, , stdoutPath, stderrPath, readerStdoutPath, readerStderrPath] = process.argv;
const text = `${await fs.readFile(stdoutPath, "utf8").catch(() => "")}\n${await fs.readFile(stderrPath, "utf8").catch(() => "")}\n${await fs.readFile(readerStdoutPath, "utf8").catch(() => "")}\n${await fs.readFile(readerStderrPath, "utf8").catch(() => "")}`;
if (containsSecretLikeValue(text)) {
  process.stderr.write("secret-like value found in T201 broker diagnostics\n");
  process.exit(1);
}
NODE
log_scan_status=$?
set -e
if [ "$log_scan_status" -eq 0 ]; then
  log_secret_scan_result=passed
else
  log_secret_scan_result=failed
fi

set +e
node lib/t201-live-runner-evidence.mjs \
  "$evidence" \
  /dev/null \
  "$runner_run_id_hash" \
  "$runner_started_at" \
  "$broker_removed" \
  "$callback_port_absent" \
  "$secret_scan_result" \
  "$log_secret_scan_result" \
  "$status" \
  "$case_id" \
  "$reader_stdout_file" \
  "$stdout_file" \
  "$stderr_file" \
  "$process_start_failed" \
  "$reader_stderr_file" \
  "$reader_status"
runner_status=$?
set -e

set +e
node --input-type=module - "$evidence" "evidence/codex-direct-oauth-t201-matrix.json" <<'NODE'
import { updateC02MatrixEvidence } from "./lib/t201-live-runner-evidence.mjs";
const [, , evidencePath, matrixPath] = process.argv;
await updateC02MatrixEvidence({ evidencePath, matrixPath });
NODE
matrix_status=$?
set -e
if [ "$matrix_status" -ne 0 ]; then
  runner_status=1
fi

echo "T201 live runner complete; sanitized evidence: $evidence"
exit "$runner_status"
