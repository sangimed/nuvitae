#!/bin/sh
# Canonical T246 execution body. The runner supplies a validated, bounded
# T246 contract, one local content-addressed image ID in memory, the accepted
# deterministic transcript, and the canonical real-document fixture. This
# script reuses the qualified T201 services (`t201-semantic` runtime topology
# with a T246 broker command override, and the network-isolated
# `t201-result-reader`) and the T199 encrypted credential volumes. The
# credential-free rehearsal branch never mounts credentials and never touches
# the network; the live branch mounts the preserved T199 volumes only after
# every pre-credential gate has passed.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
repo_root=$(CDPATH= cd -- "$root/../.." && pwd)

image=${NUVITAE_T246_IMMUTABLE_IMAGE:-}
case "$image" in
  sha256:[0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef]*) ;;
  *) echo "immutable local image reference is required" >&2; exit 1 ;;
esac

# The compose services resolve the same content-addressed spike image used by
# the qualified T201 path; keep both variables pointed at the same reference.
export NUVITAE_T201_IMMUTABLE_IMAGE=${NUVITAE_T201_IMMUTABLE_IMAGE:-"$image"}

resolved=$(docker image inspect --format '{{.Id}}' "$image")
[ "$resolved" = "$image" ] || { echo "prepared image identity changed" >&2; exit 1; }

container=t246-semantic-broker
campaign=${NUVITAE_T246_CAMPAIGN_ID:-}
attempt=${NUVITAE_T246_ATTEMPT_ID:-}
case_id=${NUVITAE_T246_CASE_ID:-}
fixture=${NUVITAE_T246_FIXTURE_PATH:-}
manifest=${NUVITAE_T246_MANIFEST_PATH:-}
transcript=${NUVITAE_T246_TRANSCRIPT_PATH:-}
evidence=${NUVITAE_T246_EVIDENCE_PATH:-}
fixture_sha256=${NUVITAE_T246_FIXTURE_SHA256:-}
transcript_sha256=${NUVITAE_T246_TRANSCRIPT_SHA256:-}
manifest_sha256=${NUVITAE_T246_MANIFEST_SHA256:-}
max_broker_runs=${NUVITAE_T246_MAX_BROKER_RUNS:-}
max_backend_requests=${NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS:-}
automatic_retries=${NUVITAE_T246_AUTOMATIC_RETRIES:-}
result_root="$root/.tmp"

# Resolve the evidence path exactly once. The bridge passes the canonical
# absolute host path; a repository-relative operator path is resolved against
# the repository root (never against this script's cwd), so the evidence can
# never be written to a double-prefixed nested path such as
# `spikes/codex-direct-oauth/spikes/codex-direct-oauth/evidence/...`.
case "$evidence" in
  /*) ;;
  *) evidence=$(CDPATH= cd -- "$repo_root" && printf '%s' "$PWD/$evidence") ;;
esac

if [ -z "$campaign" ] || [ -z "$attempt" ] || [ -z "$case_id" ] || [ -z "$fixture" ] || [ -z "$manifest" ] || [ -z "$transcript" ] || [ -z "$evidence" ]; then
  echo "validated T246 contract is required" >&2
  exit 1
fi
case "$max_broker_runs:$max_backend_requests:$automatic_retries" in 1:1:0) ;; *) echo "bounded T246 contract is required" >&2; exit 1 ;; esac
for pinned in "$fixture_sha256" "$transcript_sha256" "$manifest_sha256"; do
  case "$pinned" in
    *[!0-9a-f]*|'') echo "pinned sha256 is required" >&2; exit 1 ;;
  esac
  [ "${#pinned}" -eq 64 ] || { echo "pinned sha256 is required" >&2; exit 1; }
done
[ -f "$fixture" ] && [ -f "$manifest" ] && [ -f "$transcript" ] || { echo "validated T246 artifacts are required" >&2; exit 1; }
[ ! -e "$evidence" ] || { echo "T246 evidence path must be fresh" >&2; exit 1; }

key_volume=${CODEX_DIRECT_OAUTH_T199_KEY_VOLUME:-nuvitae-codex-direct-oauth-t199-key-live}
credential_volume=${CODEX_DIRECT_OAUTH_T199_CREDENTIAL_VOLUME:-nuvitae-codex-direct-oauth-t199-credentials-live}

mkdir -p "$(dirname -- "$evidence")" "$result_root"
umask 077
result_dir=$(mktemp -d "$result_root/t246-result.XXXXXX")
stdout_file="$result_dir/broker.stdout"
stderr_file="$result_dir/broker.stderr"
reader_stdout_file="$result_dir/reader.stdout"
reader_stderr_file="$result_dir/reader.stderr"
cleanup() {
  if [ "${NUVITAE_T246_KEEP_TMP:-0}" != "1" ]; then
    rm -rf "$result_dir"
  fi
}
trap cleanup EXIT HUP INT TERM
chmod 700 "$result_dir"
runner_run_id_hash=$(node --input-type=module -e 'import { generateT246RunnerRunIdHash } from "./lib/t246-live-runner-evidence.mjs"; process.stdout.write(generateT246RunnerRunIdHash());')
runner_started_at=$(node --input-type=module -e 'process.stdout.write(new Date().toISOString());')

if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "callback port 1455 is listening; refusing T246" >&2
  exit 1
fi

result_volume="nuvitae-codex-direct-oauth-t246-result-$runner_run_id_hash"
reader_container="t246-result-reader-$runner_run_id_hash"
result_path="/spike/result/$runner_run_id_hash/result.json"
docker volume create "$result_volume" >/dev/null

broker_env="-e NUVITAE_T246_RESULT_PATH=$result_path -e NUVITAE_T201_RESULT_PATH=$result_path -e NUVITAE_T246_RUN_ID_HASH=$runner_run_id_hash -e NUVITAE_T246_CASE_ID=$case_id -e NUVITAE_T246_ATTEMPT_ID=$attempt -e NUVITAE_T246_FIXTURE_PATH=/spike/t246-input/fixture.pdf -e NUVITAE_T246_TRANSCRIPT_PATH=/spike/t246-input/transcript.txt -e NUVITAE_T246_MANIFEST_PATH=/spike/$manifest -e NUVITAE_T246_FIXTURE_SHA256=$fixture_sha256 -e NUVITAE_T246_TRANSCRIPT_SHA256=$transcript_sha256 -e NUVITAE_T246_MANIFEST_SHA256=$manifest_sha256 -e NUVITAE_T246_MAX_BROKER_RUNS=$max_broker_runs -e NUVITAE_T246_MAX_SEMANTIC_BACKEND_REQUESTS=$max_backend_requests -e NUVITAE_T246_AUTOMATIC_RETRIES=$automatic_retries -e NUVITAE_T246_OPERATOR_LIVE_OPT_IN=${NUVITAE_T246_OPERATOR_LIVE_OPT_IN:-}"

if [ "${NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL:-0}" = "1" ]; then
  # This public-entrypoint rehearsal deliberately exercises the exact
  # immutable-image/result-channel topology and the T246 broker pre-credential
  # path (artifact hashes, transcript, prompt, request construction, golden
  # audit, local diagnostics) without any credential mounts, OAuth/provider
  # environment, broker semantic request, or evidence write.
  set +e
  docker compose run --name "$container" --no-deps \
    -v "$transcript:/spike/t246-input/transcript.txt:ro" \
    -v "$fixture:/spike/t246-input/fixture.pdf:ro" \
    -v "$result_volume:/spike/result:rw" \
    $broker_env \
    -e NUVITAE_T246_CREDENTIAL_FREE_REHEARSAL=1 \
    t201-semantic node t246-live-broker.mjs >"$stdout_file" 2>"$stderr_file"
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
  [ "$status" -eq 0 ] && [ "$reader_status" -eq 0 ] || exit 1
  printf '%s\n' "{\"campaign\":\"$campaign\",\"attempt\":\"$attempt\",\"phase\":\"credential_free_rehearsal\",\"success\":true,\"semantic_backend_requests\":0,\"evidence_written\":false}"
  exit 0
fi

# Independent final boundary: registry authorization and `--mode live` are
# necessary but not sufficient. This check runs before either credential
# volume is inspected or mounted. Test runners cannot opt into real traffic.
if [ "${NODE_ENV:-}" = "test" ] || [ -n "${NODE_TEST_CONTEXT:-}" ] || [ -n "${VITEST:-}" ] || [ -n "${JEST_WORKER_ID:-}" ] || [ "${NUVITAE_T246_TEST_MODE:-0}" = "1" ]; then
  echo "T246 real live execution is forbidden in test environments" >&2
  exit 1
fi
[ "${NUVITAE_T246_OPERATOR_LIVE_OPT_IN:-}" = "1" ] || {
  echo "explicit T246 operator live opt-in is required" >&2
  exit 1
}

docker volume inspect "$key_volume" >/dev/null
docker volume inspect "$credential_volume" >/dev/null

set +e
docker compose run --name "$container" --no-deps \
  -v "$key_volume:/run/t199-key:ro" \
  -v "$credential_volume:/spike/credentials:rw" \
  -v "$transcript:/spike/t246-input/transcript.txt:ro" \
  -v "$fixture:/spike/t246-input/fixture.pdf:ro" \
  -v "$result_volume:/spike/result:rw" \
  $broker_env \
  t201-semantic node t246-live-broker.mjs >"$stdout_file" 2>"$stderr_file"
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
if docker ps -a --format '{{.Names}}' | grep -Eq '(^|[[:space:]])t246-semantic-broker($|[[:space:]])'; then broker_removed=false; fi
if docker ps -a --format '{{.Names}}' | grep -Eq "(^|[[:space:]])$reader_container($|[[:space:]])"; then broker_removed=false; fi

callback_port_absent=true
if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then callback_port_absent=false; fi

set +e
node secret-scan.mjs >/dev/null
scan_status=$?
set -e
if [ "$scan_status" -eq 0 ]; then secret_scan_result=passed; else secret_scan_result=failed; fi

set +e
node --input-type=module - "$stdout_file" "$stderr_file" "$reader_stdout_file" "$reader_stderr_file" <<'NODE'
import fs from "node:fs/promises";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";
const [, , stdoutPath, stderrPath, readerStdoutPath, readerStderrPath] = process.argv;
const text = `${await fs.readFile(stdoutPath, "utf8").catch(() => "")}\n${await fs.readFile(stderrPath, "utf8").catch(() => "")}\n${await fs.readFile(readerStdoutPath, "utf8").catch(() => "")}\n${await fs.readFile(readerStderrPath, "utf8").catch(() => "")}`;
if (containsSecretLikeValue(text)) process.exit(1);
NODE
log_scan_status=$?
set -e
if [ "$log_scan_status" -eq 0 ]; then log_secret_scan_result=passed; else log_secret_scan_result=failed; fi

set +e
node lib/t246-live-runner-evidence.mjs \
  "$evidence" /dev/null "$runner_run_id_hash" "$runner_started_at" \
  "$broker_removed" "$callback_port_absent" "$secret_scan_result" "$log_secret_scan_result" \
  "$status" "$case_id" "$reader_stdout_file" "$stdout_file" "$stderr_file" \
  "$process_start_failed" "$reader_stderr_file" "$reader_status" \
  "$attempt" "$fixture_sha256" "$transcript_sha256" "$manifest_sha256"
runner_status=$?
set -e

echo "T246 live runner complete; sanitized evidence: $evidence"
exit "$runner_status"
