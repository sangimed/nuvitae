# Codex Direct OAuth T198 Spike

This directory is a disposable local compatibility spike only. It is not
production application code and is not wired into the API, web app, worker,
domain, queue payloads, or persistence model.

Supported mode:

- macOS with local Docker Desktop or equivalent;
- browser and Docker host on the same physical machine;
- host callback bound only as `127.0.0.1:1455`, plus `[::1]:1455`
  when Docker Desktop accepts explicit IPv6 loopback publication;
- container relay on `2455`;
- broker callback listener on container `127.0.0.1:1455`;
- disposable broker memory only.

Run deterministic synthetic checks:

```sh
node --test spikes/codex-direct-oauth/test/*.test.mjs
node spikes/codex-direct-oauth/secret-scan.mjs
```

Run the non-OAuth loopback preflight:

```sh
cd spikes/codex-direct-oauth
node host-preflight.mjs
```

Validate Compose:

```sh
docker compose -f spikes/codex-direct-oauth/compose.yml config
```

Run the live browser proof:

```sh
sh spikes/codex-direct-oauth/run-live.sh
```

Run the T199 live credential lifecycle proof (two browser authentications):

```sh
sh spikes/codex-direct-oauth/run-t199-live.sh
```

The T199 runner creates and preserves two dedicated Docker named volumes by
default: `nuvitae-codex-direct-oauth-t199-key-live` and
`nuvitae-codex-direct-oauth-t199-credentials-live`. The key is never a macOS
bind mount. The broker runs as UID 1000 with a read-only root filesystem,
read-only key volume, read/write credential volume, dropped capabilities, and
no-new-privileges. Only safe result JSON is consumed by the host; the full
authorization URL is printed live and is not persisted.

The broker prints the full authorization URL only to the live terminal. The
parent lifecycle runner receives only booleans, sanitized redirect metadata, and
safe categories. The first live-attempt JSON is archived before the second live
attempt writes current evidence.
