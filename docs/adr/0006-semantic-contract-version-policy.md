# ADR 0006: Semantic contract version policy

- **Status:** Accepted
- **Date:** 2026-08-21

## Context

The semantic import capability contains both `nuvitae.semantic-extraction.v1`
and `nuvitae.semantic-extraction.v2` artifacts. V1 also appears in historical
persistence constraints, migrations, fixtures, and regression tests. Removing
it without a production-data inventory could make stored attempts unreadable.
Conversely, allowing new provider code to choose either version indefinitely
would create two active write contracts and prevent convergence.

## Decision

1. **V2 is the sole contract for new semantic provider output.** New provider
   adapters, workflows, and fixtures intended to represent current writes must
   use `nuvitae.semantic-extraction.v2`.
2. **V1 is read-only compatibility.** Existing entities, migrations, fixtures,
   and readers may retain V1 support so historical records remain readable.
   No new production provider may emit V1.
3. **There is no implicit persistence upgrade.** A TypeORM check constraint or
   migration that names V1 is evidence of historical storage, not permission to
   silently rewrite it. V2 persistence changes require a dedicated, reversible
   data migration with mixed-version tests.
4. **Retirement is evidence-gated.** V1 can be removed only after an inventory
   proves that no persisted records or queued payloads require it, a migration
   has completed, rollback and backup windows have elapsed, and the compatibility
   test corpus has been replaced by explicit migration tests.

## Consequences

- Current provider code converges on one write format.
- Historical tests and schema artifacts remain intentionally present.
- Compatibility is asymmetric: read V1/V2 where required, write V2 only.
- Removing V1 is a separate data-lifecycle change, not architecture cleanup.
