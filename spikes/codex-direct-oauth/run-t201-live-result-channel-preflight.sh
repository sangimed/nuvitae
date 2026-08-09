#!/bin/sh
# Credential-free exact-live T201 result-channel topology preflight. The Node
# runner uses argv arrays, records each Docker/Compose operation, and never
# invokes the semantic broker, OAuth, credential store, or transport.
set -u

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$root/t201-live-result-channel-preflight-runner.mjs"
