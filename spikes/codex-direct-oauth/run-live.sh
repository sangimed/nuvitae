#!/bin/sh
set -eu

cd "$(dirname "$0")"
docker compose up --build --abort-on-container-exit --exit-code-from lifecycle lifecycle
docker compose down --remove-orphans --volumes
