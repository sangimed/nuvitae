#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

# Resolve the public child before any image build, credential-volume inspection,
# or Docker operation. Local-only runner files are never an allowed fallback.
target=t201-campaign-b-runner.mjs
if [ ! -f "$target" ]; then
  echo "campaign_b_execution_target_resolution_failed:ENOENT" >&2
  exit 1
fi
if ! git ls-files --error-unmatch -- "$target" >/dev/null 2>&1; then
  echo "campaign_b_execution_target_resolution_failed:ENOTCOMMITTED" >&2
  exit 1
fi

# Campaign A is closed. Preparation, preflight, and the future explicitly
# authorized B01 runner share one process-local immutable image reference.
exec node ./t201-campaign-b-runner.mjs
