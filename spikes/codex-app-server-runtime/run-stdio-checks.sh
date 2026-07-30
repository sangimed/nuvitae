#!/bin/sh
set -eu

mkdir -p /evidence
: > /evidence/isolation.txt
: > /evidence/host-leakage.txt

{
  echo "date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "id=$(id)"
  echo "uname=$(uname -a)"
  echo "node=$(node --version)"
  echo "codex=$(codex --version)"
  echo "help-start"
  codex app-server --help
  echo "help-end"
} > /evidence/runtime-info.txt 2> /evidence/runtime-info.stderr

node /probe-client.mjs stdio /evidence/stdio-probe.json
node /probe-client.mjs stdio /evidence/stdio-restart-probe.json

set +e
codex app-server --definitely-not-a-real-option > /evidence/failed-startup.stdout 2> /evidence/failed-startup.stderr
echo "failed_startup_exit=$?" >> /evidence/isolation.txt
set -e

set +e
test -e /root/.codex
echo "root_codex_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /host-home/.codex
echo "host_home_codex_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /Users/sangimed/Repositories/nuvitae
echo "host_repo_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /private-storage
echo "private_storage_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /var/run/docker.sock
echo "docker_socket_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /codex-state/host-auth.json
echo "host_auth_sentinel_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /codex-state/mcp-config.json
echo "host_mcp_sentinel_visible_exit=$?" >> /evidence/host-leakage.txt
test -e /codex-state/plugins
echo "host_plugin_sentinel_visible_exit=$?" >> /evidence/host-leakage.txt
env | sort > /evidence/env-visible.txt
set -e

touch /workspace/workspace-write-ok
touch /runtime-tmp/tmp-write-ok
touch /codex-state/state-write-ok

set +e
touch /root/should-not-write 2> /evidence/root-write.stderr
echo "root_write_exit=$?" >> /evidence/isolation.txt
touch /usr/local/should-not-write 2> /evidence/usr-local-write.stderr
echo "usr_local_write_exit=$?" >> /evidence/isolation.txt
node -e 'require("node:dns").lookup("host.docker.internal", (error) => process.exit(error ? 1 : 0))' > /evidence/host-docker-internal-node.stdout 2> /evidence/host-docker-internal-node.stderr
echo "host_docker_internal_node_lookup_exit=$?" >> /evidence/isolation.txt
ping -c 1 127.0.0.1 > /evidence/ping.stdout 2> /evidence/ping.stderr
echo "ping_exit=$?" >> /evidence/isolation.txt
getent hosts host.docker.internal > /evidence/host-docker-internal.stdout 2> /evidence/host-docker-internal.stderr
echo "host_docker_internal_lookup_exit=$?" >> /evidence/isolation.txt
node -e 'const net = require("node:net"); const s = net.connect(5432, "127.0.0.1"); const t = setTimeout(() => process.exit(2), 1500); s.on("connect", () => process.exit(0)); s.on("error", () => { clearTimeout(t); process.exit(1); });' > /evidence/postgres.stdout 2> /evidence/postgres.stderr
echo "postgres_connect_exit=$?" >> /evidence/isolation.txt
node -e 'const net = require("node:net"); const s = net.connect(6379, "127.0.0.1"); const t = setTimeout(() => process.exit(2), 1500); s.on("connect", () => process.exit(0)); s.on("error", () => { clearTimeout(t); process.exit(1); });' > /evidence/valkey.stdout 2> /evidence/valkey.stderr
echo "valkey_connect_exit=$?" >> /evidence/isolation.txt
set -e

for status in /proc/[0-9]*/status; do
  pid="$(echo "$status" | sed 's#^/proc/##; s#/status$##')"
  name="$(sed -n 's/^Name:[[:space:]]*//p' "$status" 2>/dev/null)"
  state="$(sed -n 's/^State:[[:space:]]*//p' "$status" 2>/dev/null)"
  ppid="$(sed -n 's/^PPid:[[:space:]]*//p' "$status" 2>/dev/null)"
  echo "$pid ppid=$ppid state=$state name=$name"
done > /evidence/processes-after-stdio.txt
find /workspace /runtime-tmp -maxdepth 2 -mindepth 1 -print | sort > /evidence/temp-artifacts.txt
