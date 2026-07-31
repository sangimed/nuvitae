# Codex Direct OAuth T198 Spike

This directory is a disposable local compatibility spike only. It is not
production application code and is not wired into the API, web app, worker,
domain, queue payloads, or persistence model.

Supported mode:

- macOS with local Docker Desktop or equivalent;
- browser and Docker host on the same physical machine;
- host callback bound only as `127.0.0.1:1455`;
- container relay on `2455`;
- broker callback listener on container `127.0.0.1:1455`;
- disposable broker memory only.

Run deterministic synthetic checks:

```sh
node --test spikes/codex-direct-oauth/test/*.test.mjs
node spikes/codex-direct-oauth/secret-scan.mjs
```

Validate Compose:

```sh
docker compose -f spikes/codex-direct-oauth/compose.yml config
```

Run the live browser proof:

```sh
sh spikes/codex-direct-oauth/run-live.sh
```

The broker prints the full authorization URL only to the live terminal. The
parent lifecycle runner receives only booleans and safe categories.
