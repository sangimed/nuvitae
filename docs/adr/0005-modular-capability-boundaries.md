# Modular Capability Boundaries

## Status

Accepted and implemented incrementally

Accepted date: 2026-08-21

## Context

The architecture audit for issue #47 found that Nuvitae's deployment and
workspace boundaries are sound, but the resume-import capability has outgrown
its internal ownership boundaries. In particular, application policy currently
imports persistence and TypeORM details, API import behavior is split between
two feature roots, and the worker processor combines queue delivery with most
of the import workflow.

The project needs a direction that prevents additional coupling before existing
coupling is migrated. It does not need a rewrite, microservices, a new
architecture framework, or identical layer folders in every feature.

## Decision

Nuvitae remains a modular monolith with three explicit deployable applications:
the Next.js web application, the NestJS API, and the NestJS BullMQ worker. The
API and worker are separate process hosts for capabilities in the same product;
they are not separate business domains.

The major capability owners are:

- `resume-import`: upload admission, import-session lifecycle, document and
  semantic processing workflow, draft review, confirmation, and discard;
- `resume`: manual and durable structured resume behavior;
- `provider-connections`: provider-neutral connection and protected-session
  lifecycle;
- `identity-access`: authenticated-principal establishment;
- `document-processing`: safe PDF and DOCX parsing and deterministic source
  fragments; and
- `operations`: process configuration, health, readiness, and telemetry sinks.

These names establish ownership and dependency direction. They do not require
an immediate directory move, and they do not prevent a small feature from using
a simple, flat structure.

### Dependency direction

The following rules apply to new code immediately and to existing code as it is
migrated in focused, behavior-preserving slices:

1. Domain policy does not depend on frameworks, transports, persistence,
   storage, queue, or provider implementations.
2. Contracts contain runtime serialization and validation for HTTP and durable
   jobs. They do not contain application workflows.
3. Import application policy may depend on contracts, domain policy, and the
   public document-extraction boundary. It must not acquire new dependencies on
   TypeORM, the persistence package, NestJS, BullMQ, storage implementations, or
   provider-specific code.
4. Ports are owned by the capability/use case that consumes them. TypeORM,
   BullMQ, filesystem storage, document parser, and semantic-provider adapters
   implement those ports at composition edges.
5. TypeORM entities, migrations, mappers, transaction managers, and repository
   implementations remain persistence details. They are not HTTP models, job
   payloads, or domain records.
6. NestJS controllers and BullMQ processors are delivery adapters. They validate
   or decode input, delegate to a capability use case/workflow, and translate
   its outcome.
7. Cross-capability calls use the target capability's supported public service
   or contract, not its entity, repository implementation, or internal token.
8. Workspace packages are introduced only for a stable cross-process contract,
   genuine multi-application reuse, or a heavyweight/security-sensitive
   technical boundary. No generic `shared`, `common`, `core`, or `utils` package
   is introduced.

The current application-to-persistence imports are recorded as temporary debt
in an architecture regression test. The allowlist is a ratchet: existing entries
may be removed during migration, but new entries require an explicit update to
this ADR and architectural review.

### Implementation strategy

Migration follows independently reviewable slices from the issue #47 audit:

1. protect dependency direction and characterize existing behavior;
2. introduce application-owned persistence ports;
3. hide TypeORM transaction context behind persistence;
4. extract a provider-neutral import workflow from the worker processor;
5. move the concrete Codex adapter behind the semantic-provider boundary;
6. co-locate API import use cases under one Nest feature owner; and
7. narrow package exports and then simplify web feature ownership.

Each slice must preserve HTTP/job contracts, database behavior, authorization,
privacy events, queue retry semantics, and user-visible behavior unless a
separate product change explicitly says otherwise.

### Implemented result

The migration completed the dependency correction without introducing the
rejected framework layers:

- import workflows and persistence ports are application-owned;
- TypeORM transaction context remains inside persistence adapters;
- BullMQ processing delegates to provider-neutral application workflows;
- Codex is confined to its explicit adapter surface and composition edges;
- API runtime wiring is feature-owned rather than centralized in the product
  composition root; and
- architecture tests ratchet package, provider, persistence, API, worker, and
  web dependency rules.

ADR 0006 Semantic V1 readers and ADR 0007 compatibility exports remain by
design and are not exceptions to the production dependency direction.

## Rejected Alternatives

- **Repository-wide Clean Architecture folders:** rejected because identical
  `domain/application/infrastructure` trees would add ceremony to simple
  features without strengthening a real boundary.
- **CQRS or event sourcing:** rejected because Nuvitae does not need command and
  query buses, projections, or an event store to express its current workflows.
- **Capability microservices:** rejected because API/worker process separation
  already handles the meaningful execution boundary, while additional services
  would add distributed operational cost.
- **Generic repositories and service factories:** rejected because import and
  resume lifecycles need explicit operations and transactions rather than a
  universal CRUD abstraction.
- **A new architecture enforcement dependency:** rejected because the required
  import rules can be checked with the TypeScript compiler API already present
  in the workspace.

## Consequences

- Existing debt remains temporarily visible rather than being hidden by a bulk
  move.
- New dependency violations fail an architecture test.
- Composition roots may depend on the concrete adapters they assemble; that is
  intentional and does not make those adapters application policy.
- Some files and package exports remain broader than the target until their
  behavior is characterized and their consumers migrate.
- Maintainers review fewer, safer changes at the cost of a transitional period
  in which current and target structures coexist.

## References

- [Issue #47 architecture audit](../architecture/issue-47-architecture-audit.md)
- [ADR 0003: Application Technology Stack](./0003-application-technology-stack.md)
