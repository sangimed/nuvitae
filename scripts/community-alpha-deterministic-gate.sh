#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"

compose() {
  docker compose -f "${repo_root}/compose.yml" "$@"
}

run_phase() {
  local label="$1"
  shift
  printf '\n==> %s\n' "$label"
  "$@"
}

if [[ "$#" -ne 0 ]]; then
  printf 'Usage: %s\n' "${0##*/}" >&2
  exit 2
fi

cd "$repo_root"

# Match the workspace image user to the checkout owner. This is required on
# GitHub-hosted runners (UID/GID 1001) and keeps generated TypeScript/build
# artifacts writable without running the workspace container as root.
export LOCAL_UID="${LOCAL_UID:-$(id -u)}"
export LOCAL_GID="${LOCAL_GID:-$(id -g)}"

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose is required.\n' >&2
  exit 1
fi

# These values only satisfy Compose interpolation while running deterministic
# validation. The gate never starts Community authentication with them and never
# invokes a real provider.
export NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET="${NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:-issue-61-deterministic-storage-signing-secret}"
export NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET="${NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:-issue-61-deterministic-provider-session-secret}"
export NUVITAE_COMMUNITY_ACCESS_SECRET="${NUVITAE_COMMUNITY_ACCESS_SECRET:-issue-61-deterministic-community-access-secret}"
export NUVITAE_COMMUNITY_COOKIE_SECURE="${NUVITAE_COMMUNITY_COOKIE_SECURE:-false}"

run_phase "validate Compose configuration" compose config --quiet
run_phase "build pinned workspace image" compose build workspace
run_phase "install locked dependencies" \
  compose run --rm workspace pnpm install --frozen-lockfile
run_phase "formatting" compose run --rm workspace pnpm format:check
run_phase "lint" compose run --rm workspace pnpm lint
run_phase "type checking" compose run --rm workspace pnpm typecheck
run_phase "deterministic unit, contract, import integration, and security tests" \
  compose run --rm workspace pnpm test
run_phase "isolated persistence integration tests" \
  compose run --rm workspace pnpm test:integration:persistence
run_phase "production dependency vulnerability gate" \
  compose run --rm workspace pnpm audit --prod --audit-level high
run_phase "build application packages" compose run --rm workspace pnpm build
run_phase "network-disabled parser image" compose --profile test build parser-test
run_phase "network-disabled parser checks" compose --profile test run --rm parser-test
run_phase "deterministic Docker-backed product journeys" \
  "${repo_root}/scripts/local-play-e2e.sh"

printf '\n%s\n' \
  "Issue #61 deterministic gate: passed" \
  "No real provider was invoked." \
  "This result is necessary but is not a Community alpha READY verdict."
