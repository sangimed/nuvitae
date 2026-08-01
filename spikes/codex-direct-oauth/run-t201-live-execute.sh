#!/bin/sh
# Future B01-only execution half. The preparation process supplies a local
# content-addressed image ID in memory; this script never builds, pulls, or tags.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

image=${NUVITAE_T201_IMMUTABLE_IMAGE:-}
case "$image" in
  sha256:[0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef][0123456789abcdef]*) ;;
  *) echo "immutable local image reference is required" >&2; exit 1 ;;
esac

# Fail closed before checking only the existence (never contents) of preserved
# volumes. Docker's inspected ID must equal the prepared immutable reference.
resolved=$(docker image inspect --format '{{.Id}}' "$image")
[ "$resolved" = "$image" ] || { echo "prepared image identity changed" >&2; exit 1; }

key_volume=${CODEX_DIRECT_OAUTH_T199_KEY_VOLUME:-nuvitae-codex-direct-oauth-t199-key-live}
credential_volume=${CODEX_DIRECT_OAUTH_T199_CREDENTIAL_VOLUME:-nuvitae-codex-direct-oauth-t199-credentials-live}
docker volume inspect "$key_volume" >/dev/null
docker volume inspect "$credential_volume" >/dev/null

# Compose is pinned to $NUVITAE_T201_IMMUTABLE_IMAGE, pull_policy is never,
# and --no-build precludes an implicit service rebuild. The created containers
# are inspected immediately after creation by the existing evidence path.
exec sh ./run-t201-live-legacy-pinned.sh
