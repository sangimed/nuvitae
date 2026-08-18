#!/bin/sh
set -eu

config_path=${NUVITAE_COMMUNITY_CONFIG_PATH:-.community.env}

if [ ! -f "$config_path" ]; then
  printf '%s\n' "Community installation is not initialized: $config_path is missing. Run sh scripts/community-bootstrap.sh first." >&2
  exit 1
fi

owner_secret=$(sed -n 's/^NUVITAE_COMMUNITY_ACCESS_SECRET=//p' "$config_path")
if [ -z "$owner_secret" ] || [ "$(printf '%s\n' "$owner_secret" | wc -l | tr -d ' ')" != "1" ]; then
  printf '%s\n' "Community installation configuration is invalid: owner access secret is missing." >&2
  exit 1
fi

printf '%s\n' 'Community owner access secret (copy it directly; do not save it in shell history):'
printf '%s\n' "$owner_secret"
