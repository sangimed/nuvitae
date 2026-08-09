#!/bin/sh
set -eu

cd "$(dirname "$0")"
export CODEX_DIRECT_OAUTH_HOST_UID="$(id -u)"
export CODEX_DIRECT_OAUTH_HOST_GID="$(id -g)"
if [ -f evidence/codex-direct-oauth-login.json ] && [ ! -f evidence/codex-direct-oauth-login-first-attempt.json ]; then
  cp evidence/codex-direct-oauth-login.json evidence/codex-direct-oauth-login-first-attempt.json
fi
node host-preflight.mjs
selected_redirect_host="$(node -e 'const fs=require("fs"); const e=JSON.parse(fs.readFileSync("evidence/codex-direct-oauth-preflight.json","utf8")); process.stdout.write(e.selected_redirect_hostname)')"
ipv6_publication="$(node -e 'const fs=require("fs"); const e=JSON.parse(fs.readFileSync("evidence/codex-direct-oauth-preflight.json","utf8")); process.stdout.write(e.docker_ipv6_loopback_publication)')"
if [ "$ipv6_publication" = "accepted" ]; then
  CODEX_DIRECT_OAUTH_REDIRECT_HOST="$selected_redirect_host" \
  CODEX_DIRECT_OAUTH_WAIT_MS="${CODEX_DIRECT_OAUTH_WAIT_MS:-600000}" \
  docker compose up --build --abort-on-container-exit --exit-code-from lifecycle-dual lifecycle-dual
else
  CODEX_DIRECT_OAUTH_HOST_BINDINGS="127.0.0.1:1455" \
  CODEX_DIRECT_OAUTH_REDIRECT_HOST="$selected_redirect_host" \
  CODEX_DIRECT_OAUTH_WAIT_MS="${CODEX_DIRECT_OAUTH_WAIT_MS:-600000}" \
  docker compose up --build --abort-on-container-exit --exit-code-from lifecycle lifecycle
fi
docker compose down --remove-orphans --volumes
