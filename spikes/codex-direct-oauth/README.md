# Codex Direct OAuth Compatibility Spike

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

Consolidate sanitized T201 live evidence into the checked-in aggregate matrix
(fully offline; no OAuth, Codex, Docker, or live Campaign-B attempt). The
authoritative evidence for each case is the single passing attempt recorded in
`campaign-b-authorizations.json`; C01's legacy canonical evidence is preserved
unchanged. The command fails closed on ambiguous successful attempts:

```sh
node spikes/codex-direct-oauth/consolidate-t201-matrix.mjs
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

The completed T200 live direct invocation proof used the preserved T199 volumes:

```sh
sh spikes/codex-direct-oauth/run-t200-live.sh
```

T200 did not publish callback ports and did not perform browser OAuth. It
builds a disposable image, runs the broker as UID 1000 with the T199 key volume
mounted read-only and the T199 credential volume mounted read/write, performs at
most one refresh only when the encrypted access credential is near expiry, then
executes one fixed synthetic Codex Responses request for `NUVITAE_T200_OK`.
Evidence is sanitized and written to
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`.

The single bounded invocation succeeded with HTTP 200 and valid SSE framing
detected from body bytes despite a missing `Content-Type`; 15 events were
processed and `NUVITAE_T200_OK` was verified. This is compatibility evidence
for the tested local topology only, not proof of a stable or officially
supported third-party public API. OpenClaw and Hermes are corroborating audited
references; official Codex source remains the primary behavioral reference.
