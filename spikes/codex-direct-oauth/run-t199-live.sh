#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"
key_volume=${CODEX_DIRECT_OAUTH_T199_KEY_VOLUME:-nuvitae-codex-direct-oauth-t199-key-live}
credential_volume=${CODEX_DIRECT_OAUTH_T199_CREDENTIAL_VOLUME:-nuvitae-codex-direct-oauth-t199-credentials-live}
image=${CODEX_DIRECT_OAUTH_T199_IMAGE:-nuvitae-codex-direct-oauth-t199-live:local}
container=t199-live-broker
evidence="evidence/codex-direct-oauth-t199-live.json"

docker rm -f "$container" >/dev/null 2>&1 || true
docker build -t "$image" . >/dev/null
docker volume create "$key_volume" >/dev/null
docker volume create "$credential_volume" >/dev/null
docker run --rm --user 0:0 -v "$key_volume:/key" -v "$credential_volume:/credentials" node:24.15.0-alpine sh -eu -c 'umask 077; mkdir -p /key /credentials; chown 1000:1000 /key /credentials; chmod 700 /key /credentials; if [ ! -e /key/master.key ]; then head -c 32 /dev/urandom > /key/master.key; fi; chown 1000:1000 /key/master.key; chmod 600 /key/master.key' >/dev/null

run_broker() {
  command=$1
  ports=""
  if [ "$command" = login ] || [ "$command" = reconnect ]; then
    ports='-p 127.0.0.1:1455:2455 -p [::1]:1455:2455'
  fi
  set +e
  result=$(# shellcheck disable=SC2086
    docker run --rm --log-driver none --name "$container" --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges:true --pids-limit 128 --memory 192m --cpus 0.5 --tmpfs /tmp:rw,noexec,nosuid,size=16m -v "$key_volume:/run/t199-key:ro" -v "$credential_volume:/spike/credentials:rw" $ports "$image" "node" "t199-live-broker.mjs" "$command" | tee /dev/stderr | tail -n 1)
  status=$?
  set -e
  LAST_RESULT=$result
  [ -n "$LAST_RESULT" ] || return 1
  return "$status"
}

require_true() {
  node -e 'const value=JSON.parse(process.argv[1])[process.argv[2]]; process.exit(value === true ? 0 : 1)' "$1" "$2"
}

run_broker login || { echo "T199 live initial login did not complete; safe result: $LAST_RESULT" >&2; exit 1; }
initial_result=$LAST_RESULT
require_true "$initial_result" initial_live_oauth_succeeded
run_broker recover
recovery_result=$LAST_RESULT
require_true "$recovery_result" real_restart_recovery_succeeded
run_broker refresh || { echo "T199 live refresh did not complete; safe result: $LAST_RESULT" >&2; exit 1; }
refresh_result=$LAST_RESULT
require_true "$refresh_result" real_refresh_succeeded
run_broker logout
logout_result=$LAST_RESULT
require_true "$logout_result" real_record_deletion_succeeded
run_broker status
status_result=$LAST_RESULT
require_true "$status_result" real_disconnected_restart_succeeded
run_broker reconnect || { echo "T199 live explicit reconnect did not complete; safe result: $LAST_RESULT" >&2; exit 1; }
final_result=$LAST_RESULT
require_true "$final_result" explicit_reconnect_succeeded
require_true "$final_result" initial_live_oauth_succeeded
run_broker recover
final_recovery_result=$LAST_RESULT
require_true "$final_recovery_result" real_restart_recovery_succeeded

node secret-scan.mjs >/dev/null
secret_scan_result=passed

deterministic_invalid_grant_detected=$(node --input-type=module -e 'import { classifyRefreshResponse } from "./lib/refresh.mjs"; process.stdout.write(String(classifyRefreshResponse({ status: 400, body: { error: "invalid_grant" } }) === "invalid_grant"))')

node --input-type=module - "$evidence" "$key_volume" "$credential_volume" "$secret_scan_result" "$initial_result" "$recovery_result" "$refresh_result" "$logout_result" "$status_result" "$final_result" "$final_recovery_result" "$deterministic_invalid_grant_detected" <<'NODE'
import fs from "node:fs/promises";
import { buildT199LiveEvidence } from "./lib/t199-lifecycle-evidence.mjs";
const [, , evidencePath, keyVolume, credentialVolume, secretScanResult, initialJson, recoveryJson, refreshJson, logoutJson, statusJson, finalJson, finalRecoveryJson, deterministicInvalidGrantDetectedValue] = process.argv;
const initial = JSON.parse(initialJson);
const recovery = JSON.parse(recoveryJson);
const refresh = JSON.parse(refreshJson);
const logout = JSON.parse(logoutJson);
const status = JSON.parse(statusJson);
const final = JSON.parse(finalJson);
const finalRecovery = JSON.parse(finalRecoveryJson);
const result = buildT199LiveEvidence({
  initialLogin: initial,
  recovery,
  refresh,
  logout,
  status,
  reconnect: final,
  finalRecovery,
  secretScanResult,
  keyVolumeName: keyVolume,
  credentialVolumeName: credentialVolume,
  callbackPublication: ["127.0.0.1:1455->2455", "[::1]:1455->2455"],
  deterministicInvalidGrantDetected: deterministicInvalidGrantDetectedValue === "true",
});
await fs.writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
NODE

docker rm -f "$container" >/dev/null 2>&1 || true
echo "T199 live runner complete; preserved named volumes: $key_volume $credential_volume"
