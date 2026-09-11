# Repository and module map

**Current:** this is a pnpm workspace (`apps/*`, `packages/*`). Package manifests
declare supported exports; `workspace:*` identifies local dependencies. Start
at a feature's public facade rather than reaching into a historical file just
because its name looks useful.

| Area                                             | Responsibility and when to change it                                      | Dependency boundary                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/src/app`                               | Thin Next.js route/layout entries                                         | Delegate product interaction to features; no persistence                            |
| `apps/web/src/features`                          | Import/review, resume editor, feature-owned browser clients and state     | Use HTTP contracts and feature client facades, not backend internals                |
| `apps/api/src/import-resume`                     | Import HTTP transport, use cases and runtime composition                  | Verified principal, application ports and contracts; no ORM in controllers          |
| `apps/api/src/identity-access`, `community-auth` | Principal enforcement and Community session policy                        | Establish identity; resource use cases still enforce ownership                      |
| `apps/api/src/provider-connections`              | Provider connection runtime composition                                   | Keep credentials behind protected server adapters                                   |
| `apps/api/src/manual-resume`                     | Manual resume creation and updates                                        | Feature-owned repositories; no direct browser persistence                           |
| `apps/worker/src/import-resume`                  | Queue delivery and parser/provider wiring                                 | Decode jobs and invoke shared workflows; no API-module imports                      |
| `packages/contracts`                             | Zod HTTP/job/provider envelope schemas and inferred types                 | Contract-local code and Zod; no business orchestration                              |
| `packages/domain`                                | Pure review, confirmation, validation, resume and provenance policy       | No framework, persistence, provider or transport dependencies                       |
| `packages/import-application`                    | Import workflows, semantic normalization, owned ports                     | Domain/contracts/extraction; no concrete persistence or Nest/BullMQ policy coupling |
| `packages/persistence`                           | TypeORM entities, migrations, mappers and transaction-scoped repositories | Implement ports; do not leak entities into HTTP, jobs or UI                         |
| `packages/extraction`                            | Bounded deterministic PDF/DOCX parsing and source evidence                | Technical parser boundary, not semantic provider or persistence orchestration       |
| `packages/storage`                               | Private object/session storage adapters                                   | Server-side filesystem and cryptographic boundary, never web assets                 |
| `packages/test-fixtures`                         | Synthetic documents, semantic cases and fixture generation                | Test-only data, not a production dependency                                         |

The application package's `./codex` export is an explicit adapter surface;
`./testing` is test-only. Persistence exposes `./ports` and `./typeorm` for
intentional consumers. Compatibility root barrels/historical physical paths
remain under [ADR 0007](https://github.com/sangimed/nuvitae/blob/main/docs/adr/0007-compatibility-surfaces-and-historical-files.md).
Their existence is not permission for new catch-all imports.

## Supporting areas

- `tests/architecture`: dependency-direction and tooling-policy regression tests.
- `tests/contracts`, `tests/integration`, `tests/security`, `tests/e2e`: boundary,
  real-infrastructure, negative-security and browser evidence; co-located unit
  tests protect module behavior. Inspect the actual test configuration before
  deciding whether a test exercises a real service.
- `docker/`, `compose*.yml`, `scripts/`: container build/runtime and supported
  launch/check recipes. `compose.docs.yml` is documentation-only and standalone.
- `docs/security`, `docs/adr`, `docs/development`: authoritative specialist
  guides and decisions; linked by this site's [reference map](reference.md).
- `docs/research`, `spikes/`, `specs/001-import-resume`: dated investigations,
  prototypes and planning/acceptance artifacts, not a current runtime inventory.
- `CONTEXT.md`: existing domain glossary. Domain discovery and EventStorming
  outputs belong to issue #39; this module map does not redefine its concepts.

## Where a change belongs

For a new import field, examine its wire schema, domain meaning, extraction or
semantic mapping, review/confirmation behavior, and persistence together. Do not
add only a UI field and assume the API will retain it. For a queue change,
update the job contract and worker failure/replay evidence. For a new external
adapter, keep the workflow's port provider-neutral and add negative validation
tests. A change to a runtime mode belongs at composition, not scattered feature
conditionals.

The exact enforceable rules live in
[the architecture tests](https://github.com/sangimed/nuvitae/blob/main/tests/architecture/dependency-direction.test.ts)
and [provider-independence tests](https://github.com/sangimed/nuvitae/blob/main/tests/architecture/import-resume/provider-independence.architecture.test.ts).
Add a package only for a real cross-process contract, multi-host reuse, or an
isolated heavyweight/security-sensitive capability. Do not create generic
`shared`, `common`, or `utils` packages to avoid deciding ownership.
