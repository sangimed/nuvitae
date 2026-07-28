#!/usr/bin/env sh
set -eu

pnpm config set store-dir /pnpm/store >/dev/null
exec "$@"
