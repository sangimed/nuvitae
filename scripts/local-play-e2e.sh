#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
# shellcheck source=local-play-env.sh
source "${script_dir}/local-play-env.sh"
artifact_dir="${repo_root}/.local-play/artifacts"
phase="initialization"
playwright_status=0
keep_running=0
headed=0

for arg in "$@"; do
  case "$arg" in
    --keep-running)
      keep_running=1
      ;;
    --headed)
      headed=1
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

compose() {
  docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" "$@"
}

redact() {
  sed \
    -e 's/\(POSTGRES_PASSWORD[=: ][^[:space:]]*\)/POSTGRES_PASSWORD=<redacted>/g' \
    -e 's/\(QUEUE_PASSWORD[=: ][^[:space:]]*\)/QUEUE_PASSWORD=<redacted>/g' \
    -e 's/\(NUVITAE_COMMUNITY_ACCESS_SECRET[=: ][^[:space:]]*\)/NUVITAE_COMMUNITY_ACCESS_SECRET=<redacted>/g' \
    -e 's/\(NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET[=: ][^[:space:]]*\)/NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET=<redacted>/g' \
    -e 's/\(NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET[=: ][^[:space:]]*\)/NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET=<redacted>/g'
}

collect_compose_diagnostics() {
  mkdir -p "${artifact_dir}/compose"
  compose ps --all >"${artifact_dir}/compose/ps.txt" 2>&1 || true
  compose logs --no-color --tail=200 web api worker postgres queue \
    2>&1 | redact >"${artifact_dir}/compose/logs.txt" || true
}

cleanup() {
  local status=$?
  if [[ "$keep_running" -eq 1 ]]; then
    printf 'Containers left running because --keep-running was supplied.\n'
    exit "$status"
  fi
  phase="cleanup"
  compose --profile test down --remove-orphans >/dev/null 2>&1 || true
  if [[ "$status" -eq 0 ]]; then
    printf 'Containers stopped; volumes preserved\n'
  fi
  exit "$status"
}

run_phase() {
  phase="$1"
  shift
  set +e
  "$@"
  local status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    printf 'Local playable E2E failed during: %s\n' "$phase" >&2
    printf 'Safe artifact directory: %s\n' "$artifact_dir" >&2
    collect_compose_diagnostics
    return "$status"
  fi
}

assert_worker_mode() {
  local expected="$1"
  local actual
  actual="$(compose exec -T worker printenv NUVITAE_SEMANTIC_PROVIDER_MODE)"
  if [[ "$actual" != "$expected" ]]; then
    printf 'Expected worker semantic-provider mode %s, got %s\n' \
      "$expected" "$actual" >&2
    return 1
  fi
}

trap cleanup EXIT INT TERM

mkdir -p "$artifact_dir"
cd "$repo_root"

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose is required.\n' >&2
  exit 1
fi

run_phase "build workspace image" compose build workspace
run_phase "install workspace dependencies" \
  compose run --rm workspace pnpm install --frozen-lockfile
run_phase "generate anonymous fixture" \
  compose run --rm workspace node \
    tests/fixtures/resumes/generate-anonymous-selectable-resume.mjs
run_phase "build runtime images" compose build api web worker
run_phase "build playwright image" compose --profile test build playwright-test
run_phase "start dependencies" compose up -d postgres queue
run_phase "run migrations" compose run --rm workspace pnpm db:migration:run
run_phase "prepare private storage volume" \
  compose run --rm --user root --entrypoint /bin/sh api \
  -c "mkdir -p /var/lib/nuvitae/private && chown -R 10001:10001 /var/lib/nuvitae/private"
run_phase "start local stack" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=production \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    up -d web api worker
run_phase "wait for local stack health" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=production \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    up --wait web api worker postgres queue

run_phase "semantic vertical slice: no provider" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=production \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    --profile test run --rm \
      -e LOCAL_PLAY_ARTIFACT_DIR=/workspace/.local-play/artifacts \
      playwright-test pnpm exec playwright test \
        --config=playwright.local-play.config.ts \
        tests/browser/import-resume/semantic-import-vertical-slice.spec.ts \
        -g "no production semantic provider"

run_phase "switch worker to explicit deterministic E2E composition" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=deterministic-e2e-test \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    up -d --force-recreate worker
run_phase "verify E2E worker mode" \
  assert_worker_mode deterministic-e2e-test
run_phase "wait for E2E worker health" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=deterministic-e2e-test \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    up --wait --no-recreate worker

run_phase "semantic vertical slice: real PDF and DOCX" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=deterministic-e2e-test \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    --profile test run --rm \
      -e LOCAL_PLAY_ARTIFACT_DIR=/workspace/.local-play/artifacts \
      playwright-test pnpm exec playwright test \
        --config=playwright.local-play.config.ts \
        tests/browser/import-resume/semantic-import-vertical-slice.spec.ts \
        -g "real"

run_phase "deterministic import-to-PDF fidelity journeys" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=deterministic-e2e-test \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    --profile test run --rm \
      -e LOCAL_PLAY_ARTIFACT_DIR=/workspace/.local-play/artifacts \
      playwright-test pnpm exec playwright test \
        --config=playwright.local-play.config.ts \
        tests/browser/resume-export/import-to-pdf-fidelity.spec.ts

run_phase "restore production worker composition" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=production \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    up -d --force-recreate worker
run_phase "verify production worker mode" \
  assert_worker_mode production
run_phase "wait for production worker health" \
  env NUVITAE_SEMANTIC_PROVIDER_MODE=production \
    docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
    up --wait --no-recreate worker

phase="playwright regression"
playwright_args=(
  pnpm exec playwright test
  --config=playwright.local-play.config.ts
  tests/e2e/local-play/local-play-user-regression.e2e.test.ts
  tests/e2e/local-play/local-play-flow.e2e.test.ts
)
if [[ "$headed" -eq 1 ]]; then
  playwright_args+=(--headed)
fi

set +e
env NUVITAE_SEMANTIC_PROVIDER_MODE=production \
  docker compose -f "${repo_root}/compose.yml" -f "${repo_root}/compose.local.yml" \
  --profile test run --rm \
    -e LOCAL_PLAY_ARTIFACT_DIR=/workspace/.local-play/artifacts \
    playwright-test "${playwright_args[@]}"
playwright_status=$?
set -e
if [[ "$playwright_status" -ne 0 ]]; then
  printf 'Local playable E2E failed during: %s\n' "$phase" >&2
  printf 'Safe artifact directory: %s\n' "$artifact_dir" >&2
  collect_compose_diagnostics
  exit "$playwright_status"
fi

printf '%s\n' \
  "Local playable E2E: passed" \
  "Manual fresh draft: passed" \
  "Manual stale recovery: passed" \
  "Anonymous PDF import: passed" \
  "Deterministic PDF/DOCX preview-to-export fidelity: passed"
