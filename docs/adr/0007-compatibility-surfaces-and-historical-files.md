# ADR 0007: Compatibility surfaces and historical files

- **Status:** Accepted
- **Date:** 2026-08-21

## Context

The boundary migration introduced explicit package subpaths and feature-owned
facades, while older barrels and physically historical source paths still have
downstream consumers. Deleting or renaming those files in the architecture
change would combine dependency correction with source-compatibility breakage.

## Decision

1. Explicit production surfaces (`@nuvitae/persistence/ports`,
   `@nuvitae/persistence/typeorm`, `@nuvitae/import-application/codex`, and
   feature-local facades) are canonical for new code.
2. Published root barrels remain for **one documented deprecation cycle**.
   Unpublished compatibility bridges with no remaining consumers are removed
   immediately. Production architecture tests prevent new imports from depending
   on deprecated catch-all or TypeORM-named surfaces.
3. Physical relocation is not required to establish ownership. Nest and web
   consumers import through feature-owned facades now; historical implementation
   paths can remain behind them until deletion is explicitly approved.
4. Removal requires a focused change that lists every deleted path, verifies
   repository and published-package consumers, supplies migration notes, and
   receives explicit human approval. Migrations, fixtures, and research evidence
   are never deleted as incidental cleanup.

## Consequences

- The architecture boundary is enforceable immediately without a breaking
  repository-wide move.
- Remaining compatibility files have verified consumers and are not invitations
  for new use; unused internal bridges are removed.
- A later removal PR can be small, measurable, and reversible.
