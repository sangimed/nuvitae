#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

# Campaign A is closed. Preparation, preflight, and the future explicitly
# authorized B01 runner share one process-local immutable image reference.
exec node ./t201-campaign-b-runner.mjs
