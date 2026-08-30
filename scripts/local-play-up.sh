#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=local-play-env.sh
source "${script_dir}/local-play-env.sh"

compose() {
  docker compose -f compose.yml -f compose.local.yml "$@"
}

run_step() {
  local label="$1"
  shift
  local log_file
  local status
  log_file="$(mktemp -t "nuvitae-local-play-${label//[^A-Za-z0-9_.-]/_}.XXXXXX.log")"
  if "$@" >"$log_file" 2>&1; then
    status=0
  else
    status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    rm -f "$log_file"
    return 0
  fi
  printf 'Local play startup failed during: %s\n' "$label" >&2
  printf 'Command: %q' "$1" >&2
  shift
  for arg in "$@"; do
    printf ' %q' "$arg" >&2
  done
  printf '\n\n' >&2
  sed \
    -e 's/\(POSTGRES_PASSWORD[=: ][^[:space:]]*\)/POSTGRES_PASSWORD=<redacted>/g' \
    -e 's/\(QUEUE_PASSWORD[=: ][^[:space:]]*\)/QUEUE_PASSWORD=<redacted>/g' \
    -e 's/\(NUVITAE_COMMUNITY_ACCESS_SECRET[=: ][^[:space:]]*\)/NUVITAE_COMMUNITY_ACCESS_SECRET=<redacted>/g' \
    -e 's/\(NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET[=: ][^[:space:]]*\)/NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET=<redacted>/g' \
    -e 's/\(NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET[=: ][^[:space:]]*\)/NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET=<redacted>/g' \
    "$log_file" >&2
  rm -f "$log_file"
  return "$status"
}

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required." >&2
  exit 1
fi

run_step "build workspace" compose build workspace
run_step "build runtime images" compose build api web worker
run_step "start dependencies" compose up -d postgres queue
run_step "run migrations" compose run --rm workspace pnpm db:migration:run
run_step "prepare private storage volume" compose run --rm --user root --entrypoint /bin/sh api -c "mkdir -p /var/lib/nuvitae/private && chown -R 10001:10001 /var/lib/nuvitae/private"
run_step "start application services" compose up -d web api worker
run_step "wait for service health" compose up --wait web api worker postgres queue

printf '%s\n' \
  "Web: http://localhost:3000" \
  "API health: http://localhost:3001/health" \
  "OpenAPI: http://localhost:3001/openapi" \
  "Stop: ./scripts/local-play-down.sh"
