# Runtime architecture

**Current:** Nuvitae is a modular monolith with three deployable process hosts.
API and worker share application workflows and persistence adapters, not HTTP
controllers or a general event bus. The separation keeps long-running parsing
and provider work out of the browser request.

```text
┌─────────┐   HTTP   ┌─────────────┐   /api rewrite   ┌────────────┐
│ Browser │────────▶│ Next.js web │─────────────────▶│ NestJS API │
└─────────┘         └─────────────┘                  └──────┬─────┘
                                                         │
                           ┌─────────────────────────────┼────────────┐
                           ▼                             ▼            ▼
                    ┌────────────┐                ┌──────────┐ ┌─────────────┐
                    │ PostgreSQL │                │ Private  │ │ BullMQ /    │
                    │ state      │                │ volume   │ │ Valkey      │
                    └─────▲──────┘                └────▲─────┘ └──────┬──────┘
                          │                            │              │ async
                          └────────────────┬───────────┘              ▼
                                    ┌──────┴────────────────────────────┐
                                    │ NestJS worker                     │
                                    │ validate → extract → interpret    │
                                    └────────────────┬──────────────────┘
                                                     ▼
                                          ┌──────────────────────┐
                                          │ Codex adapter        │
                                          │ External provider API│
                                          └──────────────────────┘
```

Arrows into stores represent access, not an atomic distributed transaction.
The API publishes jobs; workers re-read owner-scoped persisted state before
acting. Browser polling reads the API, not the queue. PostgreSQL lifecycle
state is authoritative; supplemental queue progress cannot revive a terminal
import. See the [pipeline](import-pipeline.md) for failure boundaries.

## Process and data ownership

| Component      | Owns                                                                                                               | Does not own                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Web            | App Router routes, feature UI/client state, accessible review/editor, canonical resume presentation and print flow | Database queries, trusted identity, parsing, business HTTP API   |
| API            | Verified-principal request boundary, validation, owner-scoped use cases, provider connection, job publication      | Long-running document processing or browser presentation         |
| Worker         | Schema-checked BullMQ delivery, workflow invocation, parser/provider adapters, source-deletion execution           | Public product HTTP endpoints or migration execution             |
| PostgreSQL     | Durable import/review/resume/session state, revisions, constraints and transactional updates                       | Source-file bytes or a substitute for user confirmation          |
| Private volume | Source artifacts and protected provider-session material, API/worker only                                          | Public static assets or arbitrary browser download URLs          |
| Valkey/BullMQ  | Async delivery, delayed work and supplemental progress                                                             | Authoritative public resume state or credentials in job payloads |

The API uses feature-owned runtime modules; the worker assembles ports and
adapters independently. The application package owns workflow policy and
repository ports; persistence owns TypeORM transaction details. Architecture
tests enforce these boundaries rather than relying on directory names alone.

## Runtime modes are not interchangeable

**Community, current:** the default Compose topology is a loopback,
single-installation-owner runtime. Owner access creates a server-side session.
Database and queue ports are internal; API and worker alone mount private
storage. The Community API explicitly enables versioned migrations at startup.
The persistence defaults disable automatic migrations and always disable
TypeORM synchronization; the worker never runs migrations.

**Local Play, current:** a development-only composition uses one server-configured
identity and refuses production mode. Its launcher runs migrations explicitly.
It is useful for browser tests, not an authentication fallback for Community.

**Hosted, future:** multi-user identity, recovery, public deployment, encrypted
service transport, backup/restore operations, hosted quotas and billing are not
established by running these containers. Hosted release requirements remain in
[issues #77](https://github.com/sangimed/nuvitae/issues/77) and
[#78](https://github.com/sangimed/nuvitae/issues/78).

## Editing, export, and retention

Confirmed imported resumes support persisted editing/reopening, live preview,
and a print/export route using the browser's **Save as PDF** destination. Do
not describe this as a separately deployed PDF generation service. Contextual
AI editing applies to supported saved text fields; accepting a proposal and
saving the resume are separate actions. Manual and imported paths do not imply
identical feature coverage; consult the Community guide.

The uploaded source and review artifacts have a temporary lifecycle distinct
from the durable resume. Source-deletion code and queue handling exist. Deleting
the source preserves resume content while reducing source-only provenance.
Normal container shutdown preserves named data volumes. A retention deadline
is not proof that deletion has executed; operational guarantees and recovery
need separate verification.

## Authoritative implementation

- [Compose topology](https://github.com/sangimed/nuvitae/blob/main/compose.yml)
  and [Local Play overlay](https://github.com/sangimed/nuvitae/blob/main/compose.local.yml).
- [Product composition](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/runtime/product-runtime.module.ts)
  and [worker composition](https://github.com/sangimed/nuvitae/blob/main/apps/worker/src/worker.module.ts).
- [Architecture rules and regression tests](https://github.com/sangimed/nuvitae/blob/main/tests/architecture/dependency-direction.test.ts).
- [ADR 0005](https://github.com/sangimed/nuvitae/blob/main/docs/adr/0005-modular-capability-boundaries.md)
  records the modular boundary decision and implemented correction. The older
  architecture audit's proposed tree is not a required directory layout.
