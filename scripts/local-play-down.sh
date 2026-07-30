#!/usr/bin/env bash
set -euo pipefail

docker compose -f compose.yml -f compose.local.yml --profile test down --remove-orphans
