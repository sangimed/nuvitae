#!/bin/sh
# Credential-free reproduction of the live T201 runner topology. It never
# invokes the semantic broker, OAuth, credential store, or transport.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
mkdir -p .tmp
umask 077
work_dir=$(mktemp -d "$root/.tmp/t201-live-preflight.XXXXXX")
run_id=$(node --input-type=module -e 'import { generateRunnerRunIdHash } from "./lib/t201-live-runner-evidence.mjs"; process.stdout.write(generateRunnerRunIdHash());')
key_volume="nuvitae-codex-direct-oauth-t201-diagnostic-key-$run_id"
credential_volume="nuvitae-codex-direct-oauth-t201-diagnostic-credentials-$run_id"
result_volume="nuvitae-codex-direct-oauth-t201-result-$run_id"
broker_container="t201-result-preflight-$run_id"
reader_container="t201-result-preflight-reader-$run_id"
cleanup_container="t201-result-preflight-cleanup-$run_id"
if [ "${NUVITAE_T201_PREFLIGHT_LEGACY_PATH:-false}" = "true" ]; then
  # Reproduces the immutable attempt-4 path only; it never touches its volumes.
  result_path="/spike/result/$run_id/result.json"
else
  result_path="/spike/result/$run_id/result.json"
fi

cleanup() {
  docker rm -f "$broker_container" "$reader_container" "$cleanup_container" >/dev/null 2>&1 || true
  docker volume rm "$key_volume" "$credential_volume" "$result_volume" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT HUP INT TERM

# These stand-ins have the same mount declarations as live, but contain no key
# or credential material. The volume creation and service launch match live.
docker volume create "$key_volume" >/dev/null
docker volume create "$credential_volume" >/dev/null
docker compose build t201-semantic t201-result-reader >/dev/null
built_image_id=$(docker image inspect --format '{{.Id}}' codex-direct-oauth-t201-semantic)
docker volume create "$result_volume" >/dev/null

set +e
docker compose run --name "$broker_container" --no-deps \
  -v "$key_volume:/run/t199-key:ro" \
  -v "$credential_volume:/spike/credentials:rw" \
  -v "$result_volume:/spike/result:rw" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  -e NUVITAE_T201_RUN_ID_HASH="$run_id" \
  -e NUVITAE_T201_CASE_ID="T201-C02" \
  --entrypoint node t201-semantic t201-live-result-channel-preflight.mjs >"$work_dir/broker.stdout" 2>"$work_dir/broker.stderr"
broker_status=$?

docker compose run --name "$reader_container" --no-deps \
  -v "$result_volume:/spike/result:ro" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  t201-result-reader >"$work_dir/reader.stdout" 2>"$work_dir/reader.stderr"
reader_status=$?

docker compose run --name "$cleanup_container" --no-deps \
  -v "$key_volume:/run/t199-key:ro" \
  -v "$credential_volume:/spike/credentials:rw" \
  -v "$result_volume:/spike/result:rw" \
  -e NUVITAE_T201_RESULT_PATH="$result_path" \
  --entrypoint node t201-semantic t201-result-channel-cleanup.mjs >"$work_dir/cleanup.stdout" 2>"$work_dir/cleanup.stderr"
cleanup_status=$?
set -e

# Docker may expose only raw IDs in inspect output. Normalize in-stream and
# retain only hashes before printing the diagnostic report.
docker inspect "$broker_container" | node t201-live-result-channel-preflight-report.mjs \
  "$work_dir/broker.stdout" "$work_dir/broker.stderr" "$work_dir/reader.stdout" "$work_dir/reader.stderr" \
  "$work_dir/cleanup.stdout" "$work_dir/cleanup.stderr" "$broker_status" "$reader_status" "$cleanup_status" "$built_image_id"
