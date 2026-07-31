#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

key_volume=${CODEX_DIRECT_OAUTH_T199_KEY_VOLUME:-nuvitae-codex-direct-oauth-t199-key-live}
credential_volume=${CODEX_DIRECT_OAUTH_T199_CREDENTIAL_VOLUME:-nuvitae-codex-direct-oauth-t199-credentials-live}
container=t201-semantic-broker
evidence="evidence/codex-direct-oauth-t201-semantic-parsing.json"
logs="evidence/codex-direct-oauth-t201-docker.log"

mkdir -p evidence
runner_run_id_hash=$(node --input-type=module -e 'import { generateRunnerRunIdHash } from "./lib/t201-live-runner-evidence.mjs"; process.stdout.write(generateRunnerRunIdHash());')
runner_started_at=$(node --input-type=module -e 'process.stdout.write(new Date().toISOString());')

if lsof -nP -iTCP:1455 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "callback port 1455 is listening; refusing T201" >&2
  exit 1
fi

docker volume inspect "$key_volume" >/dev/null
docker volume inspect "$credential_volume" >/dev/null
docker compose build t201-semantic >/dev/null

set +e
docker compose run --rm --name "$container" -e NUVITAE_T201_RUN_ID_HASH="$runner_run_id_hash" t201-semantic >"$logs" 2>&1
status=$?
set -e

broker_removed=true
if docker ps -a --format '{{.Names}}' | grep -Eq '(^|[[:space:]])t201-semantic-broker($|[[:space:]])'; then
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
node --input-type=module - "$logs" <<'NODE'
import fs from "node:fs/promises";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";
const [, , logs] = process.argv;
const text = await fs.readFile(logs, "utf8");
if (containsSecretLikeValue(text)) {
  process.stderr.write("secret-like value found in T201 Docker logs\n");
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
  "$logs" \
  "$runner_run_id_hash" \
  "$runner_started_at" \
  "$broker_removed" \
  "$callback_port_absent" \
  "$secret_scan_result" \
  "$log_secret_scan_result" \
  "$status"
runner_status=$?
set -e

echo "T201 live runner complete; sanitized evidence: $evidence"
exit "$runner_status"
