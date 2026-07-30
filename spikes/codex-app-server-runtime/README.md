# Codex App-Server Runtime Spike

Bounded T190-only Docker runtime assets for `@openai/codex@0.146.0`.

Run from this directory:

```bash
docker compose -f compose.yml build
docker compose -f compose.yml run --rm stdio-check
docker compose -f compose.yml run --rm auth-lifecycle
docker compose -f compose.yml --profile sidecar up --abort-on-container-exit --exit-code-from sidecar-client sidecar-client
docker compose -f compose.yml down -v
```

The compose file is dedicated to this spike and is not part of the production
Nuvitae topology.

The T191 authentication lifecycle run uses the named Docker volume
`nuvitae_codex_app_server_auth_state_t191`. Delete it after the Codex
evaluation with:

```bash
docker volume rm nuvitae_codex_app_server_auth_state_t191
```
