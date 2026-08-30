#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=local-play-env.sh
source "${script_dir}/local-play-env.sh"

docker compose -f compose.yml -f compose.local.yml --profile test down --remove-orphans
