#!/usr/bin/env sh
set -eu

rm -f "${WORKER_READY_FILE:-/tmp/nuvitae-worker-ready}"
exec node apps/worker/dist/main.js
