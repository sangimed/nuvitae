# Codex App-Server Runtime Spike

Bounded T190-only Docker runtime assets for `@openai/codex@0.146.0`.

Run from this directory:

```bash
docker compose -f compose.yml build
docker compose -f compose.yml run --rm stdio-check
docker compose -f compose.yml --profile sidecar up --abort-on-container-exit --exit-code-from sidecar-client sidecar-client
docker compose -f compose.yml down -v
```

The compose file is dedicated to this spike and is not part of the production
Nuvitae topology.
