# Issue #47 architecture audit and target proposal

**Status:** proposal only; no migration has started  
**Audit date:** 2026-08-20  
**Scope:** phases 1–4 of issue #47, plus the requested current-to-target map and incremental migration plan  
**Decision state:** ready for maintainer review; every statement labelled **Observed** describes the repository at commit `ecc4365`, while **Proposed** and **Judgment** describe a possible future.

> This document deliberately does not authorize file moves or code changes. The target tree is illustrative, not a checklist. A move is justified only when it strengthens an ownership boundary or makes a later change safer.

## A. Executive assessment

Nuvitae is already a monorepo and already contains several good architectural boundaries: independently deployable API, worker, and web applications; runtime-validated HTTP/job contracts; a domain package without framework dependencies; persistence mappers and repository interfaces; isolated document parsing; and an architecture test that protects provider neutrality. The right direction is therefore **not** a rewrite or a repository-wide imposition of `domain/application/infrastructure` folders.

The principal risk is that the resume-import capability has outgrown its present seams:

1. **Composition, transport, use cases, persistence ports, and provider adapters do not have one obvious owner.** API import code is split between `import-resume/`, `services/import-resume/`, `runtime/`, `persistence/`, `config/`, and `observability/`. The shared `import-application` package then contains application policy, TypeORM integration, extraction orchestration, semantic normalization, observability, and the concrete Codex transport.
2. **A few files are change hotspots rather than merely long files.** The 1,249-line semantic worker processor, 1,795-line Codex transport, 1,767-line import event catalog, 1,603-line semantic canonicalizer, 1,012-line entity file, 1,076-line resume editor, and several 500–800-line use cases/components each combine distinct reasons to change.
3. **The intended abstraction direction is contradicted by package dependencies.** `@nuvitae/import-application` imports `@nuvitae/persistence`, and even TypeORM, while also exporting concrete provider adapters. This makes the nominal application layer a dependency magnet and prevents persistence/provider details from being replaceable edges.
4. **The worker is a second composition root but not a thin delivery adapter.** Its semantic processor coordinates extraction, provider invocation, validation, persistence, capacity, status transitions, logging, retry/failure classification, and cleanup. API and worker consequently share packages but not a single, explicit import workflow boundary.
5. **The web is sensibly feature-oriented, but the largest client components own networking, state machines, focus management, telemetry, rendering, and detailed form mechanics.** The `services/` split also makes feature ownership less obvious.

The recommended destination is a **boring modular monolith with two backend process hosts**. Keep one deployable API and one deployable worker. Organize backend code around capabilities (`resume-import`, `resume`, `provider-connections`, `identity/access`, `operations`) and expose narrow module APIs. Apply ports and adapters only at expensive or volatile boundaries (database, queue, private object/session storage, semantic provider, document parser). Keep simple CRUD/use cases simple. Adopt neither repository-wide Clean Architecture ceremony, full DDD, nor CQRS.

### Overall priority

| Priority | Concern                                                                               |   Risk | First safe action                                                                                                             |
| -------- | ------------------------------------------------------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------- |
| P0       | `import-application` depends on persistence/TypeORM and exports Codex implementations |   High | Record and enforce the intended dependency graph; define application-owned ports before moving implementations                |
| P0       | Worker semantic orchestration is concentrated in one processor                        |   High | Add characterization tests around stage transitions, then extract a provider-neutral workflow without changing queue behavior |
| P1       | Import API has two parallel feature roots and a large runtime wiring module           |   High | Consolidate ownership conceptually, then migrate one use case at a time behind the existing Nest module                       |
| P1       | Persistence package exposes entities and TypeORM types broadly                        |   High | Narrow exports and make transaction/repository ports framework-neutral                                                        |
| P1       | Concrete Codex transport sits in the application package                              |   High | Move it only after its port and contract tests are stable                                                                     |
| P2       | Large web editor/review/import components                                             | Medium | Split by cohesive UI responsibility, co-locating feature clients and tests                                                    |
| P2       | Contracts barrel and semantic schemas are broad                                       | Medium | Introduce intentional subpath exports; do not duplicate models                                                                |
| P3       | Naming and cosmetic folder consistency                                                |    Low | Leave alone unless touched by a higher-value slice                                                                            |

## B. Repository architecture map

### B.1 Workspace and deployment boundaries (**Observed**)

```text
nuvitae/
├── apps/
│   ├── api/       NestJS HTTP process
│   ├── worker/    NestJS application-context + BullMQ consumer process
│   └── web/       Next.js App Router application
├── packages/
│   ├── contracts/           Zod wire/job contracts and inferred types
│   ├── domain/              resume-import rules and domain records
│   ├── extraction/          PDF/DOCX safety and deterministic extraction
│   ├── import-application/  import policy, semantic processing, provider code
│   ├── persistence/         TypeORM entities, migrations, mappers, repositories
│   ├── storage/             local private object/session stores
│   └── test-fixtures/       semantic/resume test data
└── tests/                   contract, integration, security, browser, a11y
```

`pnpm-workspace.yaml` includes only `apps/*` and `packages/*`, which is a clear and appropriately small workspace boundary. Turbo orchestrates root development/build tasks. The apps depend on workspace packages by package name rather than reaching into sibling source directories.

### B.2 Runtime paths (**Observed**)

**Import write path:** Next feature client → API controller/interceptor/guard → `StartImportService` → rate-limit reservation → private storage → repository transaction → BullMQ publication → worker processor → isolated document extraction → semantic provider → validation/canonicalization → persistence → API polling/review/confirmation.

**Manual resume path:** Next manual feature → API manual-resume controller → create/get/update services → persistence repository. This is much smaller and demonstrates that not every capability needs elaborate layering.

**Composition:**

- `apps/api/src/app.module.ts` selects a local-play or community runtime and separately mounts persistence/manual resume/health.
- `apps/api/src/runtime/product-runtime.module.ts` creates queue, storage, provider-session, repository, limit, clock, ID, and logging adapters and dynamically registers the import module.
- `apps/worker/src/worker.module.ts` registers BullMQ, persistence, the processor, and a provider array; the e2e module substitutes provider wiring.
- `apps/web/src/app/**/page.tsx` files are thin route entries and delegate to feature components.

### B.3 Package dependency graph (**Observed**)

```text
web ───────────────→ contracts
api ───────────────→ contracts, domain, import-application, persistence, storage
worker ────────────→ contracts, domain, extraction, import-application,
                     persistence, storage
import-application → contracts, domain, extraction, persistence (+ TypeORM dev dep)
persistence ───────→ contracts, domain, Nest TypeORM, TypeORM, PostgreSQL
test-fixtures ─────→ contracts, import-application (dev dependencies)
domain ────────────→ no runtime dependencies
extraction ────────→ parsing libraries only
storage ───────────→ no runtime dependencies
```

There is no manifest-level package cycle. The suspicious direction is application → persistence, not a literal cycle. Within the API, `import-resume` and `services/import-resume` mutually know each other's tokens/types, while `runtime` knows both; that is a **conceptual ownership cycle** even though TypeScript can compile it.

### B.4 Capability ownership today (**Observed**)

| Concept                                | Current owners                                                                          | Assessment                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Import transport/status/review/confirm | API `import-resume`, API `services/import-resume`, contracts                            | Split ownership                                                    |
| Import orchestration                   | API services, worker processors, `import-application`                                   | Split across three roots                                           |
| Structured resume                      | domain mapper/types, persistence entities, import confirmation API, web editor          | Ownership is implicit                                              |
| Semantic parsing                       | contracts, `import-application/semantic-parser`, `import-application/providers`, worker | Broad but partly protected                                         |
| Provider connection/session            | API import feature, API service folder, domain, persistence, storage                    | No single public boundary                                          |
| Document extraction                    | `extraction`, `import-application`, worker                                              | Parser ownership is good; workflow ownership is not                |
| Auth/principal                         | API `auth`, `community-auth`, import guard, local-play middleware                       | Cross-feature concern with duplicated placement                    |
| Operations/health                      | API health, worker readiness, runtime config, observability                             | Appropriately host-specific, though import telemetry is duplicated |

## C. Highest-risk architecture problems

Severity measures the cost/risk of future change, not code quality. “Architectural” means ownership/dependency/test seams are affected; “stylistic” means readability only.

### C.1 Significant findings

| Evidence                                                                                                                                                                                                                      | Problem and consequence                                                                                                                                                                                                                                                                                                         |       Severity | Debt             | Likely remediation direction                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------: | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/import-application/package.json`; `src/typeorm-import-limit-store.ts`; imports from persistence in `process-extraction.ts`, `validate-document.ts`, provider connections, and provider adapter                      | The application package depends on the concrete persistence package and includes a TypeORM-named adapter. Application policy cannot be understood or tested independently from infrastructure types, and dependency direction is reversed.                                                                                      |       **High** | Architectural    | Put required repository/transaction/capacity ports with the owning use cases (or a small capability API); implement them in persistence; remove TypeORM from application after callers migrate.                                                     |
| `packages/import-application/src/providers/codex-direct-transport.ts` (1,795 lines), adapter (746), model/session/benchmark files; root barrel exports the concrete Codex types                                               | Provider-specific protocol, authentication/session parsing, HTTP transport, model policy, benchmark support, and audit behavior occupy the nominal application package and public barrel. New providers would depend on a Codex-shaped surface.                                                                                 |       **High** | Architectural    | Preserve `ResumeSemanticParserProvider` as the inward-facing port; locate Codex code at a provider adapter edge with a narrow package/module export. Keep benchmark/spike-only policy out of the production public API.                             |
| `apps/worker/src/import-resume/semantic-import.processor.ts` (1,249 lines)                                                                                                                                                    | One processor performs stage orchestration, deterministic extraction, semantic request building, provider invocation, validation, fallback, persistence, event emission, error classification, and lifecycle transitions. Queue retry and business policy are difficult to change independently.                                |       **High** | Architectural    | Keep the BullMQ processor thin: decode job, call an import workflow, map retry/terminal result. Extract cohesive stages only where tests demonstrate a seam; avoid one class per function.                                                          |
| `apps/api/src/import-resume/` plus `apps/api/src/services/import-resume/`; services import feature tokens/ports while controllers/module import services                                                                      | Two roots claim the same capability. A reader cannot tell whether a new use case belongs beside controllers or in the generic `services` directory. Cross-imports make the physical layer split misleading.                                                                                                                     |       **High** | Architectural    | Make `import-resume` the feature owner. Co-locate use cases, transport, and feature-owned ports under it; keep the Nest module as public entry. Do this use case by use case, not a bulk move.                                                      |
| `apps/api/src/runtime/product-runtime.module.ts` (183 lines)                                                                                                                                                                  | A host-level dynamic module knows import tokens, queue details, persistence implementations, Codex connection implementation, storage construction, limits, logging, and feature controllers. It is a composition root, but its knowledge of feature internals is too broad and dynamic registration obscures module ownership. |       **High** | Architectural    | Let capability infrastructure modules provide adapters and have one root composition module import them. Prefer ordinary static Nest modules for fixed product wiring; reserve `register()` for genuine caller-supplied configuration.              |
| `packages/persistence/src/index.ts` exports all entities, mappers, repositories, TypeORM implementations, `DataSource`, and `EntityManager`; `import-resume.entities.ts` is 1,012 lines                                       | The package is a broad database SDK. Callers can bypass repositories and couple to table/entity shapes. Unrelated persistence concepts share one file and public barrel.                                                                                                                                                        |       **High** | Architectural    | Export feature-oriented repository implementations/modules from explicit subpaths. Treat entities/mappers as internal where feasible. Split entity files by aggregate/table only during a behavior-preserving persistence slice.                    |
| API confirmation service imports TypeORM `EntityManager`; repository methods accept optional manager; application functions know persistence transaction mechanics                                                            | TypeORM types cross the persistence boundary even where entities do not. Unit tests must model database-specific transaction context.                                                                                                                                                                                           |       **High** | Architectural    | Define a capability transaction abstraction or transaction-scoped repository callback that does not expose `EntityManager`; keep TypeORM transaction adaptation in persistence. Do not invent a general unit-of-work framework.                     |
| `packages/import-application/src/observability/import-events.ts` (1,767 lines) and API `src/observability/import-events.ts` (with mirrored re-exports/wrapping)                                                               | Event vocabulary, validation, privacy policy, timing, and runtime emission are duplicated or layered across packages. The large catalog changes for many workflow reasons and invites drift.                                                                                                                                    |     **Medium** | Architectural    | Give import telemetry one owner. Keep stable event names/metadata near the capability and host-specific sinks at composition edges; retain privacy/security tests.                                                                                  |
| `packages/import-application/src/semantic-parser/` includes canonicalization (1,603), fallback (1,092), mapping (848), diagnostics (685), warnings (517), source registry, validation; multiple “v2” and non-v2 paths coexist | The folder is a dumping ground for a complex semantic pipeline. Version migration history is encoded in filenames and parallel abstractions, increasing cognitive load and the chance that the wrong path is modified.                                                                                                          |       **High** | Architectural    | Document the canonical pipeline and compatibility obligations first. Group by stage (`request`, `normalize`, `validate`, `map`, `fallback`) only as files are changed. Decide when v1 is removable; do not delete compatibility code in this audit. |
| API `start-import.service.ts` (583) and confirmation service (762)                                                                                                                                                            | Each use case mixes request contract parsing, domain decisions, persistence transactions, storage/queue coordination, error-to-HTTP-ish result shapes, and event emission. Failure rollback is particularly coupled to infrastructure ordering.                                                                                 |       **High** | Architectural    | Keep one use-case service when cohesion permits, but separate HTTP mapping and isolate durable workflow/compensation policy behind explicit ports. Add failure-order characterization tests before extraction.                                      |
| `apps/web/src/features/resume-editor/StructuredResumeSections.tsx` (1,076), `ReviewStep.tsx` (595), `ImportFlow.tsx` (425)                                                                                                    | Large client components own async calls, transitions, accessibility focus/announcements, telemetry, state, and extensive rendering. Changes have broad regression surfaces and tests lean on exported helpers.                                                                                                                  |     **Medium** | Architectural    | Keep feature orientation. Extract cohesive hooks/controllers and section components with user-visible tests; co-locate feature clients. Do not create generic component/hook layers for one use.                                                    |
| Web `features/*` depend on `services/import-resume/*`, while `resume-editor` imports `import-resume/review-date` and manual client imports import config                                                                      | The generic service directory and cross-feature utility import blur ownership. `resume-editor` and `manual-resume` rely on import-resume implementation details.                                                                                                                                                                |     **Medium** | Architectural    | Put API clients with their owning web feature; place truly cross-feature resume presentation logic under a `resume` feature, not a generic utility folder. Keep route files thin.                                                                   |
| `packages/contracts/src/index.ts` re-exports all import, semantic v1/v2, provider-connection, fallback, and manual schemas                                                                                                    | Contracts are useful but the single barrel makes every consumer see a dependency magnet and obscures which contracts cross HTTP, queue, or provider boundaries.                                                                                                                                                                 |     **Medium** | Architectural    | Add supported subpath exports grouped by capability/channel. Keep schemas as wire types; do not move domain behavior into contracts or create a “shared everything” package.                                                                        |
| `packages/domain/src/resume-import/` owns manual draft, provider runtime connection, semantic persistence records, review, confirmation, and structured mapping                                                               | “resume-import” has become the home for concepts whose lifecycle extends beyond import. It remains framework-free, but aggregate/capability ownership is unclear.                                                                                                                                                               |     **Medium** | Architectural    | During feature work, distinguish import session/draft concepts from durable resume and provider connection concepts. Do not perform a wholesale taxonomy move.                                                                                      |
| Test suites include 1,200–1,800-line security/integration files and build large in-test dependency graphs; the worker processor test is 688 lines                                                                             | Strong coverage exists, but setup often mirrors wiring and internal types, making refactors expensive and obscuring behavior. Some unit tests assert helper-level transformations rather than module outcomes.                                                                                                                  |     **Medium** | Architectural    | Preserve contract/security tests as black-box safety nets; introduce small reusable harness builders with explicit scope; test workflow stage results and module public surfaces rather than private call order.                                    |
| `packages/test-fixtures` depends on `import-application`, while many fixtures/builders remain under `tests/fixtures`, extraction `src/testing`, provider `src/providers/testing`, and browser test support                    | Fixture ownership is fragmented and the fixtures package can inherit application/provider coupling.                                                                                                                                                                                                                             |     **Medium** | Architectural    | Keep format-specific builders with extraction tests, public cross-suite corpus in test-fixtures, and host harnesses beside host tests. Ensure fixture packages never become production dependencies.                                                |
| `auth`, `community-auth`, local-play principal middleware, and import-specific `verified-principal.guard.ts` share principal concerns                                                                                         | Identity verification and feature authorization are physically mixed. Manual resume imports a guard from import resume, a concrete ownership smell.                                                                                                                                                                             |     **Medium** | Architectural    | Give authenticated principal establishment to an identity/access module; keep resource ownership checks in each capability. Preserve community/local-play adapters at the runtime edge.                                                             |
| Many token/port files contain very small one-use interfaces and factories                                                                                                                                                     | Some indirection is justified for queue/storage/provider testing, but uniform token wrappers make navigation costly and look generated when no substitution is valuable.                                                                                                                                                        | **Low–Medium** | Mixed            | Retain boundaries with real alternate implementations or side effects. Inject ordinary services directly inside a module; reject interface/factory pairs with one implementation and no test seam.                                                  |
| Flat `community-auth`, `manual-resume`, and `import-resume` feature folders                                                                                                                                                   | Flatness alone is not a defect. Manual resume is readable; import resume is not because of scale and the second services root.                                                                                                                                                                                                  |        **Low** | Mostly stylistic | Add subfolders only after a cohesive cluster exists. Never reorganize solely for visual symmetry.                                                                                                                                                   |

### C.2 Entity leakage assessment

**Observed:** Domain-facing repository methods usually map TypeORM entities to domain records, which is good. The more significant leakage is that the persistence barrel publicly exports entity constants/classes and TypeORM transaction types, and application/API code imports `EntityManager`. Tests also directly import entities to verify persistence/provider behavior.

**Judgment:** This is not a call for pure persistence ignorance everywhere. Migration tests and persistence integration tests should use entities/DataSource. HTTP controllers, semantic policy, and ordinary use cases should not. The boundary should be enforced by import location, not by wrapping every primitive in another class.

### C.3 Cycles and suspicious imports

- No workspace package cycle was found in the manifests.
- API feature ↔ API service imports form a conceptual cycle of ownership.
- Manual resume importing `VerifiedPrincipalGuard` from import resume is a concrete cross-feature dependency.
- Resume editor importing `review-date` from import resume means durable resume UI depends on an import workflow helper.
- Application → persistence is an inverted dependency for the intended layering.
- Provider independence is partially enforced, but the architecture test explicitly exempts concrete Codex files and the application barrel exports them, so package consumers remain provider-aware.

## D. Things that are already well structured and should be preserved

1. **Process boundaries are honest.** API, worker, and web have separate manifests and entry points; the worker is not hidden inside an HTTP server.
2. **Thin Next route entries.** App Router pages primarily select feature screens, leaving route conventions visible and feature code testable.
3. **Framework-free domain package.** `@nuvitae/domain` has no runtime dependency, and its validation/review/confirmation tests exercise meaningful rules.
4. **Runtime contracts.** Zod schemas validate external payloads and queue messages; inferred TypeScript types avoid hand-maintained DTO drift.
5. **Persistence mappers and repository abstractions.** The repository already recognizes that database entities and domain records differ. Refactoring should narrow this boundary, not replace it with a generic repository framework.
6. **Extraction isolation and safety.** PDF/DOCX parsers, safety checks, subprocess isolation, and hostile-document tests form a coherent technical capability with strong reasons to remain a package.
7. **Provider-neutral core intent.** `ResumeSemanticParserProvider`, provider error normalization, dedicated testing exports, credential-isolation tests, and the provider-independence architecture test are valuable safeguards.
8. **Broad behavior protection.** Contract, persistence integration, security, browser, accessibility, and local-play suites cover risks that unit tests alone would miss.
9. **Local-play/community composition distinction.** Alternate runtime adapters are explicit rather than scattered conditionals throughout domain logic.
10. **Explicit package list.** There is no generic `shared`, `common`, or `utils` package. Preserve that restraint.
11. **Simple features remain simple.** Health and manual resume do not need the same internal ceremony as semantic import.

## E. Official framework guidance findings

Legend: **A** = documented by the framework/tool; **B** = common ecosystem convention; **C** = this audit's judgment. A recommendation can have multiple labels, but B/C are not presented as official rules.

### E.1 NestJS

Primary references: [NestJS Modules](https://docs.nestjs.com/modules), [Providers](https://docs.nestjs.com/providers), [Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules), [BullMQ queues](https://docs.nestjs.com/techniques/queues), and [NestJS monorepo mode](https://docs.nestjs.com/cli/monorepo).

| Finding                                                                                                                                       | Class   | Nuvitae consequence                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A module encapsulates providers by default; only exported providers form its public interface. Modules organize closely related capabilities. | **A**   | `ImportResumeModule` should own/import its implementations and export only services genuinely used by another module. A broad runtime module should not reach into all internal tokens.         |
| Feature modules group code relevant to a feature and establish boundaries.                                                                    | **A**   | Nest's convention supports an API `resume-import` module rather than a global `services/` layer parallel to it. Nest does **not** prescribe Clean Architecture folders inside every feature.    |
| Dynamic modules are for configurable modules whose provider set/options are determined by consumers.                                          | **A**   | Dynamic registration is justified for reusable/configurable infrastructure. Fixed product assembly can use ordinary modules; `register()` should not be used merely as a manual dependency bag. |
| Providers are injectable classes/values/factories managed by the container. Custom providers support substitutions and aliases.               | **A**   | Use tokens at real external seams. A token/interface for every internal function is not required by Nest.                                                                                       |
| BullMQ processors are registered providers and queues are registered/imported through Bull modules.                                           | **A**   | Existing queue registration is conventional. The architectural judgment is to keep processors thin; Nest itself does not mandate this.                                                          |
| One module per business capability, with controllers/use cases nearby, is widely used in Nest projects.                                       | **B**   | Adopt feature-oriented module roots, while allowing internal subfolders only for complex features.                                                                                              |
| Keep the application root as composition and avoid “god modules.”                                                                             | **B/C** | Split adapter wiring by capability and let the root compose modules.                                                                                                                            |

**Important correction to a common claim:** Nest does not require folders named `domain`, `application`, and `infrastructure`, does not require one class per use case, and does not make a module boundary merely because a directory exists.

### E.2 Next.js and React

Primary references: [Next.js Project structure](https://nextjs.org/docs/app/getting-started/project-structure), [Layouts and pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages), [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups), and React's [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure).

| Finding                                                                                                                                                                                                                      | Class   | Nuvitae consequence                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Next reserves App Router file conventions and permits project files outside `app`, top-level project folders inside `src`, private folders, and route groups. It explicitly presents multiple valid organization strategies. | **A**   | Current thin `app` routes plus `features` is valid. Do not claim that Next officially requires feature folders or colocation.            |
| Client Components are required for state, effects, event handlers, and browser APIs; boundaries should be placed where interactivity is needed.                                                                              | **A**   | Import/review/editor flows appropriately use `"use client"`, but leaf interactive boundaries can be smaller after careful decomposition. |
| React recommends avoiding redundant/duplicated state and structuring state around transitions.                                                                                                                               | **A**   | Preserve the explicit import state transition module; reduce parallel component booleans only where behavior tests prove equivalence.    |
| Co-locating feature UI, hooks, clients, and tests is common in large Next apps.                                                                                                                                              | **B**   | Move feature-specific API clients only as their feature changes; keep genuinely reusable accessible primitives in `components`.          |
| Route files should be adapters into features rather than giant screens.                                                                                                                                                      | **B/C** | Current pages are good and should remain thin.                                                                                           |

### E.3 TypeORM

Primary references: [Data Mapper vs Active Record](https://typeorm.io/docs/guides/active-record-data-mapper/), [Custom repositories](https://typeorm.io/docs/working-with-entity-manager/custom-repository/), [Transactions](https://typeorm.io/docs/advanced-topics/transactions/), [Entities](https://typeorm.io/docs/entity/entities/), and [Migrations](https://typeorm.io/docs/advanced-topics/migrations/).

| Finding                                                                                                                    | Class   | Nuvitae consequence                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeORM supports both Active Record and Data Mapper; its guidance describes Data Mapper as helpful in larger applications. | **A**   | Nuvitae already uses the preferable direction for its size: repositories/mappers rather than domain objects calling `save()`. Preserve it.       |
| All operations in a transaction must use the provided transactional entity manager.                                        | **A**   | Existing manager threading reflects a real constraint. Hide it behind persistence-owned transaction-scoped repositories rather than ignoring it. |
| Entities define persisted table mappings and migrations evolve schema.                                                     | **A**   | Entities belong in persistence. The docs do not say entities are domain models or should be returned to controllers.                             |
| Mapping persistence records into domain/read models is an application architecture choice, not a TypeORM mandate.          | **C**   | Keep mappers where different lifecycles/shapes justify them; avoid pointless 1:1 mapping ceremony for trivial operational tables.                |
| Repository interfaces should be feature-specific instead of a universal generic repository.                                | **B/C** | Preserve meaningful methods such as lifecycle transitions; reject a generic CRUD abstraction.                                                    |

### E.4 pnpm workspaces and monorepo organization

Primary references: [pnpm Workspaces](https://pnpm.io/workspaces), [workspace protocol](https://pnpm.io/workspaces#workspace-protocol-workspace), [catalogs](https://pnpm.io/catalogs), and [filtering](https://pnpm.io/filtering).

| Finding                                                                                                           | Class | Nuvitae consequence                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A workspace is rooted by `pnpm-workspace.yaml`; `workspace:` forces resolution to a local workspace package.      | **A** | Existing `workspace:*` dependencies are good. Continue to make cross-package dependencies explicit.                                                            |
| pnpm supports filtering packages and does not prescribe business-layer topology.                                  | **A** | Package boundaries should reflect build/deploy/reuse/test needs, not merely folders that look architectural.                                                   |
| Apps for deployables and packages for libraries is common monorepo convention.                                    | **B** | Existing top-level split is appropriate.                                                                                                                       |
| A package should have a clear API and independent reason to exist; internal modules need not all become packages. | **C** | Prefer a module within API/worker before creating another workspace package. Keep extraction/contracts/persistence because they have real cross-process roles. |

## F. Real-world repository comparison

The comparison is based on source organization, package manifests, and module boundaries—not architecture labels. Links point to the inspected source roots so the comparison is reviewable. No project is a template for Nuvitae.

### F.1 Twenty — TypeScript monorepo, NestJS backend, React frontend

Source: [repository](https://github.com/twentyhq/twenty), [server modules](https://github.com/twentyhq/twenty/tree/main/packages/twenty-server/src/modules), [front modules](https://github.com/twentyhq/twenty/tree/main/packages/twenty-front/src/modules).

- **Relevance:** substantial product with a Nest backend, React client, PostgreSQL/ORM concerns, queues/jobs, and monorepo packages.
- **Organization:** server and frontend both use feature/module roots; server modules commonly contain their own controllers, services, jobs, entities or supporting subareas, while platform-wide engine concerns have explicit roots.
- **Useful:** matching frontend/backend feature vocabulary; clear Nest module ownership; jobs stay associated with a feature; shared packages have named roles.
- **Do not copy:** Twenty's metadata-driven platform and numerous layers are justified by a customizable CRM engine. Nuvitae should not import its engine abstractions, deep module nesting, or scale-driven package count.

### F.2 Immich — monorepo, modular TypeScript backend, PostgreSQL, workers

Source: [repository](https://github.com/immich-app/immich), [server source](https://github.com/immich-app/immich/tree/main/server/src), [web source](https://github.com/immich-app/immich/tree/main/web/src).

- **Relevance:** media ingestion has analogous upload, durable job, extraction/ML adapter, storage, persistence, and status concerns.
- **Organization:** separately deployed server/machine-learning/web processes, centralized job names/payloads, service/repository boundaries, explicit storage and external-process adapters, extensive integration/e2e tests.
- **Useful:** treat queue messages as durable contracts; make workers invoke the same capability services rather than inventing a second domain; protect storage/job/database behavior with integration tests.
- **Do not copy:** Immich has historically large central service/repository files and broad service registries. Its scale-specific job/platform machinery would worsen Nuvitae's current hotspots if copied mechanically.

### F.3 Cal.com — large pnpm/Turborepo Next.js application

Source: [repository](https://github.com/calcom/cal.com), [apps](https://github.com/calcom/cal.com/tree/main/apps), [packages](https://github.com/calcom/cal.com/tree/main/packages).

- **Relevance:** mature Next.js/React product in a pnpm-style monorepo with database, API, integrations, background tasks, and shared packages.
- **Organization:** deployable apps are separated from packages; route surfaces delegate into feature/domain packages; integration implementations are isolated; package boundaries are enforced through manifests and exports.
- **Useful:** thin route entry points, explicit integration packages, and named shared packages rather than a universal `shared` package.
- **Do not copy:** its very high package count, legacy overlap, central package barrels, and integration framework reflect a much larger marketplace/product. Nuvitae should not make every feature a package.

### F.4 Trigger.dev — TypeScript monorepo centered on background jobs

Source: [repository](https://github.com/triggerdotdev/trigger.dev), [apps](https://github.com/triggerdotdev/trigger.dev/tree/main/apps), [packages](https://github.com/triggerdotdev/trigger.dev/tree/main/packages).

- **Relevance:** durable job execution, worker/runtime separation, typed payloads, retries, telemetry, and a React web application are core concerns.
- **Organization:** runtime/worker concerns are separate packages/processes; protocol and SDK contracts are explicit; orchestration is separated from transport/execution implementation.
- **Useful:** distinguish durable job protocol from in-process calls; centralize retry/outcome semantics; make worker bootstrap and execution adapters replaceable at composition.
- **Do not copy:** an execution platform necessarily has protocol/SDK/versioning abstractions far beyond a resume import worker. Nuvitae needs one queue contract, not a general task SDK.

### F.5 Recurring practices, not a canonical template

Across these repositories the reusable lessons are:

1. deployable processes are explicit;
2. substantial business capabilities have named module roots;
3. external integrations and job protocols are visible boundaries;
4. route/controller layers generally delegate;
5. shared code is split by purpose, not dumped into `common`;
6. scale creates its own over-abstraction and hotspots, so copying directory trees is unsafe.

## G. Architecture patterns evaluated

### G.1 Adopt

#### Modular monolith

- **Problem solved:** unclear ownership and cross-feature reach inside a codebase that does not need microservices.
- **Complexity:** module APIs and dependency checks; no distributed systems cost.
- **Use:** backend capability boundaries and one shared codebase, with API/worker as separate process hosts.
- **Overengineering boundary:** do not add network APIs between API and worker beyond the already necessary queue; do not create separately versioned services.

#### Feature-oriented modules

- **Problem solved:** parallel `services`, `runtime`, `persistence`, and feature folders obscure where changes belong.
- **Complexity:** deciding ownership and maintaining narrow exports.
- **Use:** API and web capability organization; persistence exports can also be feature-oriented.
- **Overengineering boundary:** health/config files and small manual CRUD flows can stay flat.

### G.2 Selectively adopt

#### Vertical slices

- **Problem solved:** an import change currently crosses many horizontal folders.
- **Complexity:** duplicated-looking transport/use-case types and careful shared-domain decisions.
- **Use:** independently reviewable flows such as start import, read status, review, confirm, provider connection.
- **Do not use:** duplicating persistence adapters or semantic rules per endpoint. A slice is a change/review unit, not necessarily a folder tree.

#### Hexagonal / Ports and Adapters

- **Problem solved:** TypeORM, BullMQ, filesystem storage, document parsers, and Codex are volatile/side-effecting boundaries.
- **Complexity:** ports, injection tokens, adapter contract tests.
- **Use:** precisely those five boundaries and clocks/IDs where deterministic testing matters.
- **Do not use:** interfaces around pure mappers, React helpers, or ordinary internal Nest services.

#### Clean Architecture dependency rule

- **Problem solved:** application policy currently imports persistence/provider implementations.
- **Complexity:** mapping and composition wiring.
- **Use:** enforce inward dependency for import workflow policy; ports owned by callers.
- **Do not use:** reproduce three named layers in every feature or package. Adopt the dependency rule, not the folder ceremony.

#### Domain-driven design (lightweight)

- **Problem solved:** “import,” “draft,” “review,” “structured resume,” and “provider connection” have different ownership/lifecycles that are currently conflated.
- **Complexity:** ubiquitous language and aggregate transaction decisions.
- **Use:** glossary, lifecycle invariants, and capability boundaries for import session/draft and durable resume.
- **Do not use:** aggregates/repositories/value objects for every table/string, domain events for local function calls, or strategic DDD bureaucracy.

### G.3 Reject

#### Full CQRS/event sourcing

Nuvitae has different read/write DTOs and durable jobs, but that is not evidence for separate command/query buses, event stores, projections, or eventual-consistency machinery. It would complicate transactions, debugging, and human maintenance without solving a demonstrated scaling problem. Keep explicit use-case methods and purpose-built read models.

#### Microservices per capability

No evidence shows independent scaling/ownership/release needs that outweigh operational cost. API and worker separation already addresses the meaningful execution boundary.

#### Repository-wide onion layer folders

Mandating `domain/application/infrastructure` everywhere would create empty directories, one-function wrappers, and navigation overhead. Use a layer only inside resume import when a real dependency boundary demands it.

#### Generic repository, service, controller, or provider factories

The domain uses lifecycle-specific operations. Generic CRUD abstractions would hide transactions and invariants. Concrete, boring services are preferable.

#### Universal event bus

BullMQ is appropriate for durable async work. In-process domain events for ordinary local calls would make control flow less visible; add one only when multiple independent consumers actually exist.

## H. Proposed Nuvitae target architecture

### H.1 Major capabilities

| Capability               | Owns                                                                                                                       | Public boundary                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **resume-import**        | upload admission, import session lifecycle, extraction/semantic workflow, draft review, confirmation/discard, job outcomes | HTTP use cases/controllers; import job contract; feature repository/workflow ports        |
| **resume**               | durable structured resume, manual draft/editing, resume validation/presentation model                                      | create/read/update resume use cases; no dependency on import internals                    |
| **provider-connections** | provider-neutral connection lifecycle, capability state, encrypted session reference                                       | connect/status/disconnect use cases; semantic provider port is consumed by import         |
| **identity-access**      | verified principal establishment and runtime auth adapter                                                                  | principal guard/decorator/context; feature-specific ownership policies remain in features |
| **document-processing**  | safe PDF/DOCX parsing and deterministic source fragments                                                                   | parser interface and stable extraction result; no persistence/queue/provider knowledge    |
| **operations**           | health/readiness, host configuration, privacy-safe telemetry sink                                                          | host-local modules; stable import event input is owned by import                          |

### H.2 Dependency direction (**Proposed**)

```text
HTTP controllers ─┐
BullMQ processor ─┼─→ capability use cases/workflow ─→ domain policy
Next clients ─────┘             │                         │
                                └─→ owned ports/contracts ┘
                                      ↑ implemented by
                         TypeORM / BullMQ / storage / parser / provider adapters
```

- Domain policy imports no Nest, Next, BullMQ, TypeORM, filesystem, or provider SDK/protocol.
- Use cases may import domain and wire schemas at their ingress/egress, but not concrete adapters.
- Adapters depend inward on ports. Composition roots may depend on everything they assemble.
- Cross-capability calls use the target capability's exported use case/API, never its repository/entity.
- Queue jobs carry IDs and stable input metadata, not ORM entities or secrets.

### H.3 Illustrative tree (not a bulk-move instruction)

```text
apps/
├── api/src/
│   ├── app.module.ts
│   ├── identity-access/
│   │   ├── identity-access.module.ts
│   │   ├── verified-principal.guard.ts
│   │   └── adapters/{community,local-play}/...
│   ├── resume-import/
│   │   ├── resume-import.module.ts
│   │   ├── transport/http/              # controllers, DTO/error mapping, interceptor
│   │   ├── use-cases/                   # only when several cohesive use cases justify it
│   │   │   ├── start-import.ts
│   │   │   ├── read-status.ts
│   │   │   ├── review-import.ts
│   │   │   └── confirm-import.ts
│   │   └── adapters/
│   │       ├── bullmq-import-queue.ts
│   │       └── nest-import-telemetry.ts
│   ├── resume/                           # manual + confirmed durable resume HTTP use cases
│   ├── provider-connections/
│   ├── persistence/                      # Nest adapter modules only
│   └── operations/{health,config}/...
├── worker/src/
│   ├── worker.module.ts
│   ├── resume-import/
│   │   ├── resume-import-worker.module.ts
│   │   ├── bullmq-import.processor.ts    # decode/delegate/outcome only
│   │   └── import-worker.adapters.ts
│   └── operations/{readiness,config}/...
└── web/src/
    ├── app/                              # thin Next route/layout/error/loading entries
    ├── features/
    │   ├── resume-import/{api,components,hooks,state,tests}/...
    │   ├── resume/{api,components,editor,tests}/...
    │   ├── provider-connections/{api,components,tests}/...
    │   └── identity-access/{api,components,tests}/...
    └── ui/                               # proven cross-feature primitives only
packages/
├── contracts/src/
│   ├── resume-import/{http,jobs}.ts
│   ├── resume/http.ts
│   └── provider-connections/http.ts
├── domain/src/
│   ├── resume-import/...                 # lifecycle/review/confirmation policy
│   ├── resume/...                        # durable/manual resume rules
│   └── provider-connections/...
├── import-application/src/
│   ├── workflow/                         # provider-neutral import workflow
│   ├── semantic/                         # request/normalize/validate/map/fallback
│   └── ports/                            # repositories, storage, parser, provider, telemetry
├── extraction/src/...                    # remains technical parser capability
├── persistence/src/
│   ├── resume-import/{entities,mappers,repositories}.ts
│   ├── resume/{entities,mappers,repositories}.ts
│   ├── provider-connections/...
│   └── migrations/...
├── semantic-provider-codex/              # optional only if both hosts/tests need it
├── storage/src/...
└── test-fixtures/src/...
```

The potential `semantic-provider-codex` package is a maintainer decision, not a prerequisite. If only the worker uses it, an adapter inside the worker is simpler. A package is justified only if it is shared by multiple hosts or needs an independently enforced public API.

### H.4 Nest placement rules

- Controllers, guards, filters, interceptors, DI tokens, and Nest module metadata remain in the relevant app/feature.
- Application orchestration belongs in capability use cases/workflows callable without an HTTP request or BullMQ job.
- TypeORM entities, migrations, mappers, and implementation repositories remain in persistence.
- Provider HTTP/auth/session implementations live at a provider adapter edge; provider-neutral connection policy belongs in the capability.
- API and worker each remain composition roots. They share contracts/domain/workflow, never Nest modules.

### H.5 Shared package policy

Create/retain a workspace package only when at least one is true:

1. two deployable apps consume it;
2. it is a stable wire protocol;
3. it isolates a heavyweight/security-sensitive technical capability;
4. independent build/test/dependency constraints provide concrete value.

Every package must publish intentional exports, avoid app imports, and have an owner statement. Do not add `shared`, `common`, `core`, or `utils`. Pure helpers stay with the concept they serve. Contracts contain serialization/validation, not business workflows. Test-only exports use explicit subpaths and must not enter production graphs.

### H.6 Worker/API relationship

- API owns synchronous request admission, authorization, durable initialization, and publication.
- Worker owns queue delivery mechanics and invokes the shared provider-neutral workflow.
- The job contract is the only runtime coupling. Both processes may use the same persistence implementations but must not pass ORM entities in jobs.
- Status transitions and retry/terminal classification have one workflow owner; BullMQ maps those outcomes to acknowledgements/retries.
- Provider credentials remain referenced through protected session storage; never put credentials in job payloads.

## I. Dependency rules

These are proposed enforceable rules, introduced gradually after existing violations are inventoried:

1. `domain` imports only domain-local modules.
2. `contracts` imports only schema/serialization libraries and contract-local modules.
3. `import-application` may import contracts, domain, and extraction's public parser types/results; it must not import persistence, TypeORM, Nest, BullMQ, filesystem storage, or provider-specific code.
4. `persistence` may import domain and contracts to implement ports/map records; domain/application never import persistence implementations.
5. API controllers import feature use cases, not TypeORM entities/repositories.
6. Worker processors import job contracts and workflow façades, not semantic pipeline internals.
7. Web `app` routes may import features; feature-to-feature imports go through an explicit public file and require a real shared concept.
8. Production code cannot import test-fixtures or testing subpaths.
9. Provider names may appear only in provider adapters, their wiring/config, and provider-specific tests/disclosures; provider-neutral workflow and persisted public status remain neutral.
10. Root barrels expose supported APIs only. Internal entities, mappers, tokens, and migration details are not convenience exports.

Enforcement should start as a small static import test or ESLint restriction with an allowlist for known debt. Do not introduce an architecture framework.

## J. Current → target mapping

| Current                                                            | Target                                                             | Why / disposition                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `apps/api/src/import-resume` + `services/import-resume`            | One API `resume-import` owner                                      | High-value: removes ambiguous ownership. Incremental migration only.                                |
| `runtime/product-runtime.module.ts` owns all import adapter wiring | Root composes feature adapter modules                              | High-value: normal Nest encapsulation and smaller knowledge surface.                                |
| Dynamic `ImportResumeModule.register()`                            | Static module unless genuine runtime substitution remains          | Questionable: retain dynamic form if community/local-play truly supply different imports/providers. |
| `StartImportService`                                               | Start-import use case plus HTTP mapping and external ports         | High-value, but split only after failure-order tests.                                               |
| Confirmation service with `EntityManager`                          | Confirmation use case with persistence-owned transaction boundary  | High-value: removes TypeORM leakage.                                                                |
| Worker semantic processor                                          | Thin BullMQ adapter → shared import workflow                       | Highest-value and highest-risk. Characterize first.                                                 |
| `import-application` concrete persistence and Codex exports        | Provider-neutral workflow/ports; implementations at edges          | Highest-value dependency correction.                                                                |
| `persistence` one root barrel                                      | Feature-oriented supported exports; internal entities/mappers      | High-value boundary narrowing.                                                                      |
| `contracts` one root barrel                                        | Capability/channel subpath exports                                 | Medium-value; keep current imports compatible during transition.                                    |
| `domain/resume-import` owns all resume/provider concepts           | Import lifecycle, resume, provider-connection concept owners       | Maintainer decision; evolve when behavior changes, not a taxonomy-only move.                        |
| `extraction` package                                               | Remain a package                                                   | Preserve. It has security, heavyweight deps, and two-host relevance.                                |
| `storage` package                                                  | Remain technical adapters or move to sole host if no longer shared | Preserve now; package status can be revisited based on consumers.                                   |
| Thin Next `app` pages                                              | Thin Next routes                                                   | Preserve unchanged.                                                                                 |
| Web `features` + global `services`                                 | Feature-owned UI/state/client; proven shared UI primitives         | High-value for touched features, not bulk relocation.                                               |
| Structured resume editor monolith                                  | Resume-owned editor sections + cohesive state hook                 | Medium-value; user behavior/a11y must remain identical.                                             |
| Strong cross-layer tests                                           | Behavior/contract/security suites plus smaller harnesses           | Preserve; reduce implementation coupling, never coverage.                                           |
| `.gitkeep` placeholders                                            | Leave untouched unless human approves deletion                     | No architectural value in cleanup.                                                                  |

### Structures that should remain unchanged now

- three deployable app workspaces;
- pnpm `apps/*`/`packages/*` boundary and `workspace:*` links;
- App Router route layout;
- Zod validation of external contracts;
- TypeORM Data Mapper direction and migrations;
- isolated extraction and safety model;
- provider-neutral contract and architecture test intent;
- local-play/community adapter distinction;
- test taxonomy by risk (contract/integration/security/a11y/browser).

### Cosmetic moves explicitly avoided

- renaming every `services` file to `use-case` without changing ownership;
- adding the same three layer directories to every module;
- one file per interface/token/type;
- converting pure functions into injectable classes;
- alphabetizing/reformatting large barrels as a standalone refactor;
- renaming `import-resume` to `resume-import` everywhere solely for consistency;
- moving tests away from source merely to standardize placement.

## K. Incremental migration sequence

Every slice is intended to be independently reviewable. The order prioritizes risk containment before moves.

### Slice 0 — Ratify vocabulary and dependency rules

- **Scope/files:** this report; a short ADR; package manifests; a lightweight import-boundary test.
- **Objective:** agree capability names, intended graph, and explicit temporary violations.
- **Unchanged:** all runtime behavior and public imports.
- **Tests:** existing architecture test plus new dependency-rule fixtures proving allowed/forbidden edges.
- **Dependencies:** maintainer decisions M1–M4.

### Slice 1 — Stabilize import workflow characterization

- **Scope/files:** worker processor tests, API start/confirm tests, integration harnesses; no production restructuring.
- **Objective:** capture stage order, transaction boundaries, retries, cleanup, idempotency, status, and privacy events before extraction.
- **Unchanged:** exact public/job/database behavior.
- **Tests:** failure injection at storage, queue, parser, provider, validation, and persistence boundaries; retry/idempotency scenarios.
- **Dependencies:** Slice 0 vocabulary only.

### Slice 2 — Introduce application-owned persistence ports

- **Scope/files:** `import-application` port definitions, persistence implementations, API/worker composition; remove new imports of persistence from application.
- **Objective:** invert the application→persistence dependency without changing repository behavior.
- **Unchanged:** schema, queries, transactions, response/job shapes.
- **Tests:** repository contract tests run against TypeORM implementation; unit tests with in-memory fakes; persistence integration suite.
- **Dependencies:** Slice 1.

### Slice 3 — Hide TypeORM transaction context

- **Scope/files:** confirmation/review/start workflow transaction calls, persistence transaction runner/repositories.
- **Objective:** stop exposing `EntityManager` outside persistence while honoring TypeORM's transactional-manager rule.
- **Unchanged:** atomicity, locking, optimistic revisions, conflict/error behavior.
- **Tests:** lifecycle transaction integration tests, concurrency/rollback cases.
- **Dependencies:** Slice 2.

### Slice 4 — Extract the provider-neutral worker workflow

- **Scope/files:** semantic/import processors, `import-application` workflow, worker provider registration.
- **Objective:** processor decodes and delegates; workflow owns stages/outcomes.
- **Unchanged:** queue names/job IDs, retry counts/backoff, statuses, events, fallback and privacy behavior.
- **Tests:** processor adapter unit tests, workflow stage tests, semantic worker integration/security suites.
- **Dependencies:** Slices 1–3.

### Slice 5 — Move Codex behind the semantic provider boundary

- **Scope/files:** `import-application/providers/codex-*`, provider session/model policy, worker adapter wiring, exports.
- **Objective:** provider-neutral application package; concrete adapter at worker edge or justified package.
- **Unchanged:** authentication, request protocol, model selection, timeout/error categories, telemetry redaction.
- **Tests:** existing transport/adapter contract tests, credential isolation, prompt-injection and recovery integration tests.
- **Dependencies:** Slice 4 and maintainer decision M5.

### Slice 6 — Realign the API import feature one use case at a time

- **Scope/files:** `apps/api/src/import-resume`, `services/import-resume`, `runtime/product-runtime.module.ts`.
- **Objective:** one feature owner and conventional Nest encapsulation. Suggested order: read status → read review → mutate review → confirm/discard → start import → provider connection.
- **Unchanged:** routes, status codes, schemas, auth, rate limits, events.
- **Tests:** controller contract tests and use-case unit tests per moved slice; full API integration suite.
- **Dependencies:** Slices 2–3; can overlap with Slice 5 after ports settle.

### Slice 7 — Narrow persistence and contract exports

- **Scope/files:** package `exports`, barrels, call-site imports; entity files may be split without changing mappings.
- **Objective:** publish supported feature/channel APIs and prevent accidental entity/internal imports.
- **Unchanged:** generated JS/types, migration metadata, schema names, consumer behavior.
- **Tests:** package build/typecheck, export-surface tests, migrations and persistence integration.
- **Dependencies:** Slices 2–6 so the desired API is known.

### Slice 8 — Establish identity/access ownership

- **Scope/files:** API `auth`, `community-auth`, local-play principal middleware, verified guard, manual/import modules.
- **Objective:** one principal-establishment boundary; resource ownership remains feature-local.
- **Unchanged:** community/local modes, authentication failures, ownership isolation.
- **Tests:** middleware/guard unit tests, authorization isolation and local-play user regression.
- **Dependencies:** Slice 6 module boundaries.

### Slice 9 — Web feature colocation and component decomposition

- **Scope/files:** one flow at a time: import, review, resume editor, manual resume; associated `services` and tests.
- **Objective:** feature-owned clients/state/UI and smaller cohesive components/hooks.
- **Unchanged:** routes, content, focus order, announcements, network protocol, timing events, visual design.
- **Tests:** existing unit/a11y/browser suites; add user-event tests at extracted boundaries.
- **Dependencies:** none architecturally; schedule after backend churn to reduce simultaneous blast radius.

### Slice 10 — Semantic pipeline consolidation

- **Scope/files:** semantic v1/v2 schemas, canonicalizer, diagnostics, mapping, fallback, fixtures.
- **Objective:** document one canonical stage pipeline and retire duplication only when compatibility/data evidence permits.
- **Unchanged:** accepted source formats, evidence grounding, no-invention guarantees, stored data readability.
- **Tests:** full semantic corpus, long-form/fidelity/split-scalar tests, security and benchmark gates.
- **Dependencies:** Slice 5; maintainer decisions M6–M7. This is deliberately last because it has the largest semantic risk.

## L. Proposed focused follow-up GitHub issues

Do **not** close #47 when creating these.

1. **architecture: ratify Nuvitae capability map and enforce package dependency direction** (Slice 0)
2. **test(import): characterize workflow compensation, retry, and idempotency boundaries** (Slice 1)
3. **refactor(import): invert persistence dependencies with import-owned repository ports** (Slice 2)
4. **refactor(persistence): encapsulate TypeORM transactional entity managers** (Slice 3)
5. **refactor(worker): delegate BullMQ processing to a provider-neutral import workflow** (Slice 4)
6. **refactor(provider): isolate the Codex semantic adapter from import application policy** (Slice 5)
7. **refactor(api): co-locate resume-import use cases under one Nest feature module** (Slice 6, split into one issue per use case if diffs exceed reviewability)
8. **refactor(packages): narrow persistence and contract package exports** (Slice 7)
9. **refactor(auth): establish a shared principal boundary without sharing resource authorization** (Slice 8)
10. **refactor(web): colocate resume-import clients and split orchestration from presentation** (Slice 9a)
11. **refactor(web): decompose the structured resume editor by user-visible section** (Slice 9b)
12. **design(semantic): decide v1/v2 compatibility and canonical pipeline retirement policy** (prerequisite to Slice 10)

Each issue should link this audit, state “no behavior change,” list protected contracts, and cap its scope to one dependency edge or workflow.

## M. Architectural decisions and remaining maintainer input

1. **Capability language:** Is a confirmed/manual “structured resume” one `resume` capability, with import as a creation workflow, or should imported resume remain owned by import through confirmation?
2. **Application package:** Should `@nuvitae/import-application` remain a cross-host workspace package, or can the shared workflow live in a more explicitly named `resume-import` package? Recommendation: retain it initially; naming is lower value than dependency correction.
3. **Persistence ports:** Should ports live in the shared workflow package or in domain? Recommendation: workflow/application owns ports; domain should not know repositories unless a domain service genuinely requires them.
4. **Nest dynamic module:** Which provider differences must callers supply at runtime? If only config/auth modes differ, prefer adapter modules plus static import feature composition.
5. **Codex adapter location:** Worker-local or its own package? Recommendation: worker-local until a second production consumer proves package value.
6. **Semantic v1 data — decided:** ADR 0006 makes V2 the only new write contract and retains V1 as read-only compatibility. A data/migration inventory remains mandatory before retirement.
7. **Benchmark code:** Which issue-25 model-selection and fixture transcript code is production-supported versus research/test-only?
8. **Event catalog stability:** Are import event names consumed externally as an operational contract? If yes, version/narrow them before splitting files.
9. **Web reuse:** Should resume editor be shared by manual and imported resumes now, or do their workflows intentionally differ? Do not unify until UX/domain behavior is agreed.
10. **Package API compatibility — decided:** ADR 0007 retains compatibility barrels and historical bridges for one deprecation cycle while architecture tests prohibit new production use. Removal requires a focused, explicitly approved change.

## N. Things explicitly NOT worth refactoring

- Do not change code merely to match the illustrative tree.
- Do not move small health/readiness/config modules into three-layer folders.
- Do not replace Nest DI with a custom container or mediator.
- Do not add CQRS command/query buses to rename ordinary method calls.
- Do not create microservices for provider connections, extraction, or resumes.
- Do not wrap Zod, TypeORM, BullMQ, `fetch`, React state, or every environment read in home-grown frameworks.
- Do not create a generic base controller/service/repository.
- Do not turn every pure function into an injectable class or every dependency into an interface.
- Do not merge contracts and domain: wire compatibility and business meaning have different change pressures.
- Do not share ORM entities with the web or put them in queue payloads.
- Do not consolidate all test builders into one global fixture factory.
- Do not rename `import-resume`/`resume-import` across the repository as a standalone cleanup.
- Do not split files solely on line count. Split when a stable responsibility, change axis, or test seam exists.
- Do not remove `.gitkeep`, old semantic compatibility files, migrations, fixtures, or research artifacts as part of architecture work without an explicit, separately reviewed retention decision.
- Do not rewrite working local-play/community composition before the capability boundary is agreed.

## Audit method and evidence limitations

The audit inspected source trees, package manifests/exports, Nest composition modules, import relationships, line counts, TypeORM entities/repositories/mappers, queue processors/contracts, provider adapters/transports, web routes/features/clients, fixtures, and the contract/integration/security/browser/accessibility suites. Recommendations were checked against the primary documentation linked in section E and compared with the linked live source roots in section F.

The execution environment did not provide authenticated GitHub CLI access and its outbound proxy returned HTTP 403 for GitHub and documentation pages on the audit date. Consequently, issue #47's supplied body in the task brief was the complete issue text available to this run, and external references could not be archived or pinned to fresh commit SHAs locally. Before approving follow-up implementation, a maintainer should verify that the linked upstream trees have not materially changed; none of this report's repository findings depend on those comparisons.

## Conclusion

The project does not need an architecture reset. It needs explicit ownership, corrected dependency direction, thinner delivery adapters, and smaller change hotspots around its one genuinely complex capability. Preserve the strong contracts, parser isolation, domain rules, process boundaries, provider-neutral intent, and risk-focused tests. Migrate one behavior-preserving dependency edge at a time, and reject any abstraction that cannot name the concrete change it makes safer.

**ARCHITECTURE AUDIT READY FOR HUMAN REVIEW**
