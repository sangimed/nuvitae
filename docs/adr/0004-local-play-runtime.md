# ADR 0004: Local Play Runtime

## Status

Accepted.

## Context

The implemented manual draft, import, review, confirmation, queue, worker, and
persistence flows need to be usable from a local browser without adding
production authentication or production rate-limit storage.

## Decision

Local play mode is an explicit runtime composition enabled only by
`NUVITAE_LOCAL_PLAY_MODE=true`. It is disabled by default and refuses startup
when `NODE_ENV=production`.

The API attaches a verified principal only through a local-play middleware that
uses one validated server-configured UUID. It does not read identity headers,
query strings, request bodies, cookies, unsigned JWT payloads, passwords, OAuth
callbacks, or mutable browser-controlled user state. The middleware runs before
`VerifiedPrincipalGuard`; the guard itself remains unchanged.

The browser uses a same-origin `/api` prefix. In Compose, Next.js rewrites that
prefix to the internal API service. This keeps internal service names out of
browser code, avoids CORS, preserves multipart and JSON request handling, and
keeps business logic and database access out of Next.js.

Reusable import application use cases now live in `packages/import-application`.
API and worker can share validation and extraction orchestration without the
worker importing files from `apps/api`. The package depends only on shared
contracts, domain, extraction, and persistence abstractions.

Local play mode uses a process-local `AtomicImportLimitStore` for deterministic
single-API-process reservation, transition, release, and rollback behavior. It
is intentionally not exported as production storage and is unsuitable for
multiple API replicas because each process would have independent counters.
Production remains fail-closed until a production atomic store is supplied.

## Consequences

Developers can run the local stack with Docker and exercise real API,
PostgreSQL, Valkey, BullMQ, worker, private storage, PDF, DOCX, review,
confirmation, and persistence flows.

Local play identity is visibly marked in the web UI and cannot be mistaken for
production authentication. Production authentication, production sessions, and
production distributed import limiting remain separate work.
