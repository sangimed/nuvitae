#!/bin/sh
set -eu

mkdir -p /evidence
: > /evidence/sidecar-rejected.txt

{
  echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "id=$(id)"
  echo "uname=$(uname -a)"
  echo "node=$(node --version)"
  echo "codex=$(codex --version)"
  codex app-server --help
} > /evidence/sidecar-runtime-info.txt 2> /evidence/sidecar-runtime-info.stderr

for _ in $(seq 1 50); do
  if [ -S /socket/codex-app-server.sock ]; then
    break
  fi
  sleep 0.1
done

if [ ! -S /socket/codex-app-server.sock ]; then
  echo "socket_missing" > /evidence/sidecar-rejected.txt
  exit 2
fi

ls -l /socket > /evidence/sidecar-socket-ls.txt
set +e
node /probe-client.mjs socket /evidence/sidecar-direct-probe.json
echo "direct_socket_probe_exit=$?" > /evidence/sidecar-results.txt
node /probe-client.mjs socket-proxy /evidence/sidecar-proxy-probe.json
echo "proxy_socket_probe_exit=$?" >> /evidence/sidecar-results.txt
echo "experimentally_rejected_unusable_initialize" >> /evidence/sidecar-results.txt
set -e
