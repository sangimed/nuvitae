#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

key_volume=${CODEX_DIRECT_OAUTH_T199_KEY_VOLUME:-nuvitae-codex-direct-oauth-t199-key-live}
credential_volume=${CODEX_DIRECT_OAUTH_T199_CREDENTIAL_VOLUME:-nuvitae-codex-direct-oauth-t199-credentials-live}
image=${CODEX_DIRECT_OAUTH_T200_IMAGE:-nuvitae-codex-direct-oauth-t200-live:local}
container=t200-invocation-broker
evidence="evidence/codex-direct-oauth-t200-invocation.json"
logs="evidence/codex-direct-oauth-t200-docker.log"

mkdir -p evidence

if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "callback port 1455 is listening; refusing T200" >&2
  exit 1
fi

if docker ps --format '{{.Names}}' | grep -Eq '(^|[[:space:]])t199-live-broker($|[[:space:]])'; then
  echo "T199 login broker is active; refusing T200" >&2
  exit 1
fi

docker volume inspect "$key_volume" >/dev/null
docker volume inspect "$credential_volume" >/dev/null
docker rm -f "$container" >/dev/null 2>&1 || true
docker build -t "$image" . >/dev/null

set +e
docker run \
  --name "$container" \
  --user 1000:1000 \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 128 \
  --memory 192m \
  --cpus 0.5 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -v "$key_volume:/run/t199-key:ro" \
  -v "$credential_volume:/spike/credentials:rw" \
  "$image" node t200-invocation-broker.mjs >"$logs" 2>&1
status=$?
set -e

result=$(tail -n 1 "$logs")
test -n "$result"

docker rm -f "$container" >/dev/null 2>&1 || true
broker_removed=true
if docker ps -a --format '{{.Names}}' | grep -Eq '(^|[[:space:]])t200-invocation-broker($|[[:space:]])'; then
  broker_removed=false
fi

callback_port_absent=true
if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then
  callback_port_absent=false
fi

node secret-scan.mjs >/dev/null
secret_scan_result=passed

node --input-type=module - "$evidence" "$result" "$broker_removed" "$callback_port_absent" "$secret_scan_result" "$status" <<'NODE'
import fs from "node:fs/promises";
const [, , evidencePath, resultJson, brokerRemovedValue, callbackAbsentValue, secretScanResult, statusValue] = process.argv;
const result = JSON.parse(resultJson);
const evidence = {
  ...result,
  broker_removed: brokerRemovedValue === "true",
  callback_port_absent: callbackAbsentValue === "true" && result.callback_port_absent === true,
  secret_scan_result: secretScanResult,
};
const complete =
  Number(statusValue) === 0 &&
  evidence.encrypted_state_recovered === true &&
  evidence.authorization_header_applied === true &&
  evidence.account_header_applied === true &&
  evidence.audited_originator_applied === true &&
  evidence.invocation_succeeded === true &&
  evidence.response_protocol_valid === true &&
  evidence.expected_synthetic_marker_present === true &&
  evidence.raw_credentials_exposed_to_parent === false &&
  evidence.account_identifier_exposed_to_parent === false &&
  evidence.raw_response_persisted === false &&
  evidence.encrypted_state_preserved === true &&
  evidence.broker_removed === true &&
  evidence.callback_port_absent === true &&
  evidence.secret_scan_result === "passed";
evidence.safe_final_state = complete ? "complete" : evidence.safe_final_state ?? "safe_unknown_failure";
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
process.exit(complete ? 0 : 1);
NODE

node --input-type=module - "$logs" <<'NODE'
import fs from "node:fs/promises";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";
const [, , logs] = process.argv;
const text = await fs.readFile(logs, "utf8");
if (containsSecretLikeValue(text)) {
  process.stderr.write("secret-like value found in T200 Docker logs\n");
  process.exit(1);
}
NODE

echo "T200 live runner complete; sanitized evidence: $evidence"
