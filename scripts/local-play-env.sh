#!/usr/bin/env bash

# These values exist only to satisfy compose.yml's required interpolation while
# local-play overlays its development configuration. They are deliberately not
# defaults in compose.yml, which remains strict for Community deployments.
export NUVITAE_COMMUNITY_ACCESS_SECRET="${NUVITAE_COMMUNITY_ACCESS_SECRET:-local-play-community-access-secret-not-for-production}"
export NUVITAE_COMMUNITY_COOKIE_SECURE="${NUVITAE_COMMUNITY_COOKIE_SECURE:-false}"
export NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET="${NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET:-local-play-storage-signing-secret-not-for-production}"
export NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET="${NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET:-local-play-provider-session-encryption-secret-not-for-production}"
