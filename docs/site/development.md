# Developer onboarding

## Choose the runtime before starting it

The host needs Git and Docker with Compose; repository workflows also use
GitHub CLI. Do not install Node, pnpm, PostgreSQL, Valkey, LibreOffice, Playwright,
or Python dependencies on the host. Containers own those tools.

```bash
git clone https://github.com/sangimed/nuvitae.git
cd nuvitae
```

Use the existing [Community installation guide](https://github.com/sangimed/nuvitae/blob/main/docs/community-installation.md)
for a same-machine, single-owner installation. It documents generated private
configuration, startup, sign-in, and restart. Keep its configuration private.
Do not use Local Play to bypass Community authentication.

For a development-only instance, follow the
[README Local Play recipe](https://github.com/sangimed/nuvitae/blob/main/README.md#local-playable-stack):

```bash
./scripts/local-play-up.sh
docker compose -f compose.yml -f compose.local.yml ps
```

The launcher prepares the local environment, installs dependencies and runs
migrations through Docker before starting services. These steps mutate local
application data: use a new development installation or explicitly approved
local state, not an important existing database. In an Amp Orb, use the current
web portal URL supplied by the agent; sandbox-local addresses are not reachable
from your browser. Codex uses device authorization; never publish a one-time code
or expose a callback port.

For a first product exercise, use synthetic content to create/save/reopen a
manual draft. To exercise import, use the versioned
[synthetic fixture corpus](https://github.com/sangimed/nuvitae/blob/main/packages/test-fixtures/resume-import/README.md),
then follow the review and confirmation path. Live provider use needs an
authorized connection and a bounded validation scope; it is not required to
build this documentation.

Stop Local Play with `./scripts/local-play-down.sh`. Normal shutdown preserves
named volumes. Never add `-v` or reset data as routine troubleshooting.

## Verify the environment and diagnose first-run failures

- `docker compose -f compose.yml -f compose.local.yml ps` shows service state.
  Web health checks the web process; API liveness checks its process, while
  readiness probes PostgreSQL. Worker readiness requires its initialized
  context, queue bootstrap and database probe.
- A Docker socket permission failure is a host permission problem, not an
  application error. Use your administrator-approved Docker access mechanism;
  do not make the socket world-writable.
- Missing environment configuration: rerun the documented setup for the chosen
  mode. Do not paste `.community.env` or expanded Compose configuration into a
  ticket, and do not invent insecure defaults to pass startup validation.
- Database/migration failure: inspect migration status using the configured
  workspace. `db:migration:show` is read-only; `run` and `revert` change data.
  Do not reset a volume or enable synchronization to resolve a mismatch.
- Worker/queue failure: inspect readiness and safe error categories in local
  logs. Do not dump job payloads or replay provider jobs blindly.
- Browser/API failure: check web/API readiness and the same-origin `/api`
  rewrite. Do not expose database or queue ports to fix browser connectivity.

Exact application tool versions belong in
[package.json](https://github.com/sangimed/nuvitae/blob/main/package.json),
workspace manifests, the lockfile and Dockerfiles. The README's older version
list is not the dependency source of truth.

## Run checks through the workspace

With the chosen Compose environment configured:

```bash
docker compose build workspace
docker compose run --rm --no-deps workspace pnpm install --frozen-lockfile
docker compose run --rm --no-deps workspace pnpm format:check
docker compose run --rm --no-deps workspace pnpm lint
docker compose run --rm --no-deps workspace pnpm typecheck
docker compose run --rm workspace pnpm test
docker compose run --rm --no-deps workspace pnpm build
```

For Community, add `--env-file .community.env` to Compose as the installation
guide requires; for Local Play, retain its documented environment and overlays.
The [quality-gate guide](https://github.com/sangimed/nuvitae/blob/main/docs/development/quality-gates.md)
owns CI policy and focused checks. Examples:

```bash
docker compose run --rm --no-deps workspace pnpm exec vitest run tests/architecture/dependency-direction.test.ts
docker compose run --rm workspace pnpm test:integration:persistence
```

Persistence integration tests use isolated schemas in a database ending in
`_test`; they are not permission to erase a development or Community database.
For parser integration and the real Local Play Playwright suite, use the exact
[README commands](https://github.com/sangimed/nuvitae/blob/main/README.md#deterministic-document-parsers)
and [browser recipe](https://github.com/sangimed/nuvitae/blob/main/README.md#local-playable-stack).
Do not replace their real service boundaries with mocks and report integration
success. Browser/a11y tests and provider smoke validation are different evidence.

## Change persistence deliberately

Follow the [pre-production schema policy](https://github.com/sangimed/nuvitae/blob/main/README.md#pre-production-schema-evolution):
entities, canonical pre-production migration history, fixtures and tests must
agree. `synchronize` stays disabled. A schema iteration is not automatically a
new migration, but preserving an important existing database requires a reviewed
forward migration rather than editing its applied history. Generated migrations
are review inputs, not automatically safe changes.

This foundation links the existing operational recipes rather than moving them.
The complete troubleshooting and test-layer catalog remains [follow-up work](coverage.md).
