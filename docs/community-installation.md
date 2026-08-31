# Nuvitae Community installation

Nuvitae Community V1 is a local Docker installation for one owner using the
same machine as the browser. Its supported URL is <http://localhost:3000>.
This guide does not support plain-HTTP access over a LAN or the public internet.
Those deployments need a supported HTTPS model, which is outside Community V1.

## Prerequisites

Install Git plus Docker Engine or Docker Desktop with Docker Compose, then clone
the source and enter it:

```sh
git clone <repository-url> nuvitae
cd nuvitae
```

Nuvitae application runtime dependencies run in Docker; do not install host
Node.js, pnpm, or Python for this guide.

## Initialize

From the repository root, create the private Community configuration:

```sh
sh scripts/community-bootstrap.sh
```

It creates `.community.env`, which is gitignored and owner-readable only
(`0600` where the platform supports POSIX permissions). It contains fixed safe
configuration (database user/name, session lifetime, Local Play disabled and
Secure cookies enabled), generated high-entropy database/queue/password and
application secrets, and no user-selected values. Do not commit or share it.

| Configuration                                         | Classification              | Community V1 value                                     |
| ----------------------------------------------------- | --------------------------- | ------------------------------------------------------ |
| `POSTGRES_USER`, `POSTGRES_DB`                        | Fixed safe configuration    | `nuvitae`                                              |
| `POSTGRES_PASSWORD`, `QUEUE_PASSWORD`                 | Generated secret            | 48 CSPRNG bytes, hex encoded                           |
| `NUVITAE_COMMUNITY_ACCESS_SECRET`                     | Generated secret            | Owner sign-in credential                               |
| `NUVITAE_COMMUNITY_SESSION_TTL_SECONDS`               | Fixed safe configuration    | 86400 seconds                                          |
| `NUVITAE_COMMUNITY_COOKIE_SECURE`                     | Fixed safe configuration    | `true`                                                 |
| `NUVITAE_COMMUNITY_FUNNEL_TELEMETRY_ENABLED`          | Optional local telemetry    | `false`                                                |
| `NUVITAE_PRIVATE_STORAGE_SIGNING_SECRET`              | Generated secret            | 48 CSPRNG bytes, hex encoded                           |
| `NUVITAE_PROVIDER_SESSION_ENCRYPTION_SECRET`          | Generated secret            | 48 CSPRNG bytes, hex encoded                           |
| `NUVITAE_LOCAL_PLAY_MODE`                             | Fixed safe configuration    | `false`                                                |
| Storage roots, size limits, ports, and migration flag | Fixed Compose configuration | Internal roots, loopback ports, API migrations enabled |

There are no user-selectable runtime values in this narrow Community V1
bootstrap except the optional local funnel counter described below. The
generated file contains all non-fixed Compose inputs.

## Optional Community funnel counters

Community funnel telemetry is disabled by default. It never sends data to
Nuvitae or a third party. An operator can enable privacy-safe local JSON log
events by setting `NUVITAE_COMMUNITY_FUNNEL_TELEMETRY_ENABLED=true` in
`.community.env` and restarting the API. Set it back to `false` and restart to
disable the product events again. Existing operational logs remain available
for diagnosis.

The event vocabulary, privacy boundary, operational-to-product mapping, and
local counting examples are documented in
[`community-funnel-metrics.md`](community-funnel-metrics.md).

Running the command again preserves an existing configuration and reports that
the installation is already initialized. It never silently rotates the owner,
database, queue, private-storage, or provider-session secrets. Deliberate
recovery or secret rotation is not part of this Community V1 command.

## Start

Build and start the Community services using its generated configuration:

```sh
docker compose --env-file .community.env up -d --build
docker compose --env-file .community.env up --wait
```

Expected services are `postgres`, `queue`, `api`, `worker`, and `web`. On first
boot, the API applies the versioned TypeORM migrations because this Compose path
sets `NUVITAE_RUN_MIGRATIONS=true`; the worker never runs migrations. A migration
failure leaves the API unhealthy or stopped—inspect its bounded service logs and
preserve the error before changing configuration.

Open <http://localhost:3000>. Web is published only as
`127.0.0.1:3000`. Normal browser API requests use `/api` through the web
rewrite to the internal `api:3001` service, so port 3001 is not published.
The direct OAuth callback keeps `127.0.0.1:1455:3001` and `[::1]:1455:3001`
loopback mappings. PostgreSQL and queue are internal only.

## Owner access

Retrieve the generated owner access secret only when ready to sign in:

```sh
sh scripts/community-owner-secret.sh
```

Copy it directly into the owner-access form. Do not put it on a shell command
line, save it in shell history, or share it. This command prints only the owner
access secret—not cookies, provider tokens, encryption/signing secrets, or
database/queue credentials. One installation has one owner identity. Use the
Sign out action to end its browser session.

## First use

After owner sign-in, choose **Create a resume manually** for a blank draft, or
**Import an existing resume**. The import flow contains the Codex connection and
status entrypoint; it does not mean Codex is connected already. This guide does
not perform an upload, OAuth sign-in, or provider invocation.

Secure cookies are intentionally enabled for `http://localhost:3000`; validate
that the session survives a page refresh. The cookie remains HttpOnly, Secure,
and SameSite=Strict. A known compatibility concern remains for a future real
Codex OAuth completion: its cross-site callback may not receive the Strict
Community session cookie. It is not resolved or validated by this installation
guide.

## Stop and restart

For normal operation, stop without deleting data:

```sh
docker compose --env-file .community.env down
docker compose --env-file .community.env up -d
docker compose --env-file .community.env up --wait
```

Ordinary restart preserves the PostgreSQL volume (owner identity, sessions,
manual drafts and application data), queue volume, private-storage volume,
provider connection state, and `.community.env`. Do not use `down -v` for
normal operation.

## Troubleshooting

- Docker/Compose unavailable: run `docker compose version`; start Docker
  Desktop or install Docker Compose before retrying.
- `localhost:3000` busy: identify and stop only the process you own, then run
  the start command again. Do not change the published Community boundary.
- `localhost:1455` busy: it is reserved for the loopback callback; stop only
  the conflicting process you own before a future Codex connection attempt.
- Bootstrap already initialized: this is safe; it preserved `.community.env`.
- Missing or invalid generated config: verify `.community.env` exists and was
  created by the bootstrap helper; rerun does not repair or replace it.
- Unhealthy PostgreSQL, queue, API, worker, or web: inspect
  `docker compose --env-file .community.env ps` and then the affected service
  with `docker compose --env-file .community.env logs api` (or `postgres`,
  `queue`, `worker`, `web`). Do not publish internal services for debugging.
- Migration failure: preserve API logs and the failing migration name; do not
  delete volumes as a first response.
- Invalid owner secret or login/session issue: retrieve the secret again with
  the explicit helper, paste it directly, and confirm the browser is at
  `http://localhost:3000` rather than a LAN address.
- Accidental Local Play configuration: `.community.env` must contain
  `NUVITAE_LOCAL_PLAY_MODE=false`; never substitute `compose.local.yml` for
  this guide.
- Private-storage validation failure: inspect API and worker health/logs and
  confirm `.community.env` has not been edited or replaced.
