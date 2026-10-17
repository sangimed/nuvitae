# Persistence and consistency

PostgreSQL owns durable application state. Private file bytes belong to the
private-storage adapter; Valkey/BullMQ delivers work. A database transaction
does not atomically commit a file write or queue publication. Read this chapter
with the [import pipeline](import-pipeline.md) for those failure boundaries.

This chapter describes the implementation at `c2e44a4` (2026-10-17), not a new
schema or a proposed domain model.

## Find the persistence boundary

[`@nuvitae/persistence`](https://github.com/sangimed/nuvitae/tree/main/packages/persistence/src)
owns entity mappings, migrations, configuration, repositories and domain
mappers. Its `/ports` entry exports interfaces; `/typeorm` exposes concrete
infrastructure. Import workflow ports also live in
[`@nuvitae/import-application`](https://github.com/sangimed/nuvitae/blob/main/packages/import-application/src/import-workflow-repository.ts).
API and worker composition select the adapters. Domain policy must not import
TypeORM, Nest, SQL or an `EntityManager`.

The [API persistence module](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/persistence/api-persistence.module.ts)
binds capability tokens to adapters. Application services request a transaction
through a repository port; the adapter supplies another repository bound to
that transaction's manager. For example,
[`TypeOrmImportWorkflowRepository`](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/repositories/typeorm-import-workflow.repository.ts)
requires that manager for locked review reads and confirmation writes. Using a
global repository inside its transaction callback would escape the transaction.

## Stored state and constraints

The [import/resume entities](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/entities/import-resume.entities.ts)
and [canonical migrations](https://github.com/sangimed/nuvitae/tree/main/packages/persistence/src/migrations)
are the full schema reference. The important groups are:

| Group                                                                      | Stored responsibility                                                            | Integrity boundary                                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `imported_documents`, `derived_extraction_artifacts`                       | Import lifecycle, private object references, source-retention and deletion state | Positive size/page count, retention after creation, owner/document composite foreign key                          |
| `import_drafts`, `extracted_fields`, `import_warnings`, `user_corrections` | Reviewable content, warnings, source provenance and review actions               | One draft per owner/document, nonnegative review revision, ordered fields, corrections linked to the owning draft |
| `structured_resumes` and text/experience/role/item children                | Durable confirmed content and section order                                      | One resume per owner/source draft; constrained child order and parent relationships                               |
| `manual_structured_resume_drafts`                                          | Manual-entry content in JSONB and editing timestamps                             | One creation key per owner; manual source/status and timestamp checks                                             |
| `deletion_jobs`                                                            | Durable source-cleanup intent and verification state                             | One job per owner/document/reason; constrained reason/status                                                      |

Additional entity families store
[semantic attempts, evidence and validation](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/entities/semantic-parser.entities.ts),
[provider connection metadata](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/entities/ai-provider-runtime-connection.entity.ts),
[import-limit attempts](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/entities/import-limit-attempt.entity.ts)
and [Community owner/sessions](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/entities/community-auth.entities.ts).
These are sensitive records, not diagnostic payloads to dump into tickets.

Owner scoping is enforced by repository predicates and supported by composite
keys/foreign keys. It is not a claim of PostgreSQL row-level security. Some
nested content rows are reached through an already owner-checked parent rather
than carrying their own owner column. Do not load an arbitrary child by ID and
assume the parent check happened elsewhere.

## Review, confirmation and concurrent edits

Review mutations carry an operation UUID and `expectedReviewRevision`. The
[review service](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/use-cases/update-review.ts)
uses a transaction-scoped, owner-filtered draft read with a pessimistic write
lock. It checks replay/conflict rules and revision before persisting the
correction and revised draft. An existing operation on the same draft returns
the current draft without reapplying the submitted action; it does not compare
that action's content with the earlier request. Use a new operation ID for a
new action. An operation from another draft is rejected.

Confirmation accepts only the strict
[confirmation request](https://github.com/sangimed/nuvitae/blob/main/packages/contracts/src/import-resume/confirmation.ts):
`operationId`, `expectedReviewRevision`, and `explicitConfirmation: true`.
The [confirmation service](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/use-cases/confirm-structured-resume.ts)
locks the owner-scoped draft, checks lifecycle/review requirements, maps reviewed
content, and creates the resume and children while marking the draft confirmed
in the same transaction. Its replay identity is the owner/source draft, backed
by a uniqueness constraint; the request's operation UUID is not a generic
idempotency-key store. Repeated confirmation returns the existing resume.

```text
Tab A                         PostgreSQL                         Tab B
read review revision 7                                           read revision 7
PATCH expected=7  ----------> lock draft
                              apply action; revision=8
                              commit; release lock
                                                               PATCH expected=7
                              lock; observe revision=8 <---------
                              reject stale review (409)
                                                               reload and review
```

Confirmed-resume editing uses a different concurrency token:
`expectedUpdatedAt`. The
[workspace service](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/resume-workspace/resume-workspace.service.ts)
locks the owner-scoped root, compares the exact timestamp, advances it, and
replaces content in one transaction. The repository also includes the previous
timestamp in its root update predicate. A stale update returns 409; the client
must reload and reconcile instead of silently resubmitting stale content.

Manual drafts also accept `expectedUpdatedAt`, checked by their
[update service](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/manual-resume/update-manual-resume-draft.service.ts).
Their current repository read/update does not use the confirmed-resume lock or
timestamp predicate. The service check detects an already stale read, but does
not establish the same guarantee for simultaneous writes. Do not infer a shared
concurrency mechanism from the matching request property name.

## Source lifetime is separate from resume lifetime

```text
Temporary source:  document -> artifacts / evidence -> review draft
                                                       |
                                              explicit confirmation
                                                       v
Durable content:                              structured resume
                                                       |
Source deletion: private objects + source-reconstructing data cleared;
                 durable resume retained; source provenance reduced
```

Discard atomically records the discarded draft and cleanup job; recording a
job is not proof of executed deletion. Source cleanup spans private storage and
database state, using the
[source-deletion workflow](https://github.com/sangimed/nuvitae/blob/main/packages/import-application/src/source-deletion.ts)
and its persistence adapter. It preserves durable resume content and reduces
source-only provenance. Neither confirmation nor ordinary restart extends the
original retention deadline. See [security and privacy](security.md) before
adding any copy of extracted text, evidence or source references.

## Configure and evolve the schema

[Shared TypeORM options](https://github.com/sangimed/nuvitae/blob/main/packages/persistence/src/typeorm-options.ts)
validate environment values and register entities/migrations explicitly.
`synchronize` is always false. Shared `migrationsRun` defaults to false; the
Community API explicitly opts in when `NUVITAE_RUN_MIGRATIONS=true`. The worker
does not run migrations. Local Play's launcher performs an explicit migration
pass before starting applications.

With the [development environment](development.md) configured, inspect first:

```bash
docker compose run --rm workspace pnpm db:migration:show
```

This reads database migration state (and builds the persistence package); it
does not apply migrations. Applying them changes the configured database:

```bash
docker compose run --rm workspace pnpm db:migration:run
```

For a disposable fresh pre-production schema, keep entities, canonical migration
definitions, contracts, fixtures and tests consistent. For important existing
data, do not rewrite applied history and assume an upgrade occurred: arrange a
reviewed forward migration. A migration is also required when the issue asks
for migration/upgrade/release behavior. Follow the
[README schema policy](https://github.com/sangimed/nuvitae/blob/main/README.md#pre-production-schema-evolution).

`db:migration:generate` and `db:migration:create` write review candidates under
`.tmp/migrations`; generation consults the configured database. They do not
replace review or register the result in the canonical migration list.
`db:migration:revert` changes data and is not a troubleshooting reset command.
Never enable synchronization or delete a volume to hide a schema mismatch.

## Evidence for a persistence change

Run the repository's PostgreSQL suite through Docker:

```bash
docker compose run --rm workspace pnpm test:integration:persistence
```

The suite requires a database ending in `_test` and uses unique disposable
schemas. Relevant tests live under
[`tests/integration/persistence`](https://github.com/sangimed/nuvitae/tree/main/tests/integration/persistence):
constraints, lifecycle commit/rollback, manual creation, workspace conflicts,
source deletion, provider persistence and migration operations. A passing unit
test using a fake repository does not prove a real constraint or lock works.
Add the corresponding wrong-owner, duplicate/replay, stale-write and rollback
cases when changing these boundaries. Inspect safe categories and test results;
keep SQL errors, connection strings and resume rows out of shared logs.
