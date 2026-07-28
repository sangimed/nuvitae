# Container-Only Development

## Status

Accepted

Accepted date: 2026-07-28

## Context

Nuvitae depends on a full-stack TypeScript application, PostgreSQL, a
Redis-compatible queue, private object storage, document parsers, headless
LibreOffice, browser-based tests, linters, formatters, compilers, and test
runners. Installing those dependencies directly on developer machines would make
local behavior depend on host operating system, shell setup, package-manager
state, browser installation, native libraries, and office-suite versions.

The project must support Windows with WSL 2, Linux, and macOS without assuming a
developer-specific home directory. It must also keep untrusted resume parsing and
browser execution isolated from the host as much as practical.

## Decision

Nuvitae adopts a container-only development, build, test, and runtime workflow.
Docker is the only supported environment for installing and executing Nuvitae
application dependencies.

The host only needs Docker, Git, GitHub CLI, and the chosen coding agent. Node.js,
npm, pnpm, PostgreSQL, Redis, LibreOffice, Playwright browsers, PDF libraries,
DOCX libraries, linters, formatters, compilers, and test runners are not
installed globally on the host as part of the supported workflow.

The project will define:

- a development workspace image containing pinned Node.js, Corepack, pnpm, and
  shared development tools;
- separate production images or stages for web, API, and worker runtimes;
- Compose services for PostgreSQL, the Redis-compatible queue, private local
  object storage, web, API, worker, and the `workspace` development command
  runner;
- isolated parser execution where LibreOffice headless and parser dependencies
  run only in the worker image or a dedicated parser image;
- a dedicated Playwright test image or test stage containing browser binaries;
- Docker-managed volumes for dependency caches, the pnpm store, `node_modules`,
  database data, queue data, and local private object storage data.

Docker image versions and package-manager versions must be pinned. Production
images must run as non-root users. Development and CI must use the same build
definitions wherever practical.

## Development Workflow

Development source code is mounted into `/workspace` inside development
containers. `/workspace` is the internal container working directory, not the
canonical repository path used in task descriptions.

Supported commands run through Docker Compose, for example:

```bash
docker compose build
docker compose up
docker compose run --rm workspace pnpm install
docker compose run --rm workspace pnpm lint
docker compose run --rm workspace pnpm typecheck
docker compose run --rm workspace pnpm test
docker compose run --rm workspace pnpm build
docker compose down
```

Development dependencies must resolve into Docker-managed volumes, not host
global package installations. Compose may use a `compose.dev.yml` override when
that keeps local mounts, development ports, and debugging settings separate from
shared service definitions.

## Container Responsibilities

- `workspace`: dependency installation, code generation, lint, format,
  typecheck, unit tests, integration test commands, build commands, migrations,
  and general developer tooling.
- `web`: production web runtime image or stage with only runtime dependencies.
- `api`: production API runtime image or stage with only runtime dependencies.
- `worker`: production worker runtime image or stage, including only the parser
  dependencies it must execute.
- parser image or worker parser stage: LibreOffice headless, PDF/DOCX parsing
  dependencies, resource limits, and temporary parser workspaces.
- test image or test stage: Playwright browsers and browser/accessibility test
  dependencies.
- `postgres`: PostgreSQL database for local development and tests.
- `queue`: Redis-compatible queue and rate-limit backend.
- object storage service or volume-backed implementation: private local storage
  for uploads and source-reconstructing artifacts.

## Consequences

Developers get reproducible dependency resolution, host independence, dependency
isolation, parser isolation, CI parity, and a workflow closer to self-hosted
operation. The supported local commands are also easier to document because they
are the same on Windows with WSL 2, Linux, and macOS.

The project no longer supports host-side dependency installation as a normal
development path. Any future tool or package must be added to an image or package
manifest and executed through Compose.

## Risks and Mitigations

- Risk: cold builds are slower than host package installation. Mitigation: use
  pinned base images, layer Dockerfiles carefully, and keep Docker-managed pnpm
  store and `node_modules` volumes.
- Risk: file watching can behave differently under Docker Desktop on macOS and
  Windows. Mitigation: document polling or sync settings in Compose overrides
  when needed, and prefer WSL 2 filesystem paths on Windows.
- Risk: caches and volumes can become stale or large. Mitigation: document
  cleanup and reset commands, and keep named volumes explicit.
- Risk: images require ongoing maintenance. Mitigation: pin versions, review base
  images during dependency updates, and keep dev, test, and production stages
  small and purposeful.
- Risk: WSL 2 integration can be misconfigured. Mitigation: support Windows via
  WSL 2, avoid host-specific paths, and document that repository files should
  live inside the WSL filesystem for best behavior.

## CI Implications

CI must build and run checks through the same Dockerfiles and Compose-compatible
commands wherever practical. CI jobs should use the pinned workspace image for
install, lint, format, typecheck, unit tests, integration tests, migrations, and
builds. Browser and accessibility checks must use the Playwright test image or
test stage. Parser and LibreOffice checks must run in the worker or isolated
parser image.

CI must not rely on runner-level Node.js, pnpm, PostgreSQL, Redis, LibreOffice,
Playwright browser, parser-library, linter, formatter, compiler, or test-runner
installations except for Docker itself and CI platform tooling.

## Revisit Conditions

- Docker is no longer viable for supported developer platforms.
- A future platform requirement prohibits local containers.
- The project moves to a hosted development environment that provides equivalent
  pinned container execution and isolation.
- Container overhead prevents acceptance criteria from being validated locally or
  in CI despite cache and image improvements.
- Security review requires stronger parser isolation than the worker/parser
  container boundary provides.
