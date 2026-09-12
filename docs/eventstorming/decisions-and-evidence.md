# Evidence, decisions to resolve, and completion status

## Evidence register

Paths below refer to the baseline linked in the [work record](README.md).
Named functions and test cases are stable search targets if line numbers move.
Test inspection supports the model; it is not a claim that all referenced
integration/browser suites were executed in this documentation-only session.

| ID  | Behavior and concrete source                                                                                                                                                                                                                                                                                                                                                                                                  | Relevant test or existing documentation                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | [CommunityAuthService.authenticate/resolve](../../apps/api/src/community-auth/community-auth.service.ts), [verified principal guard](../../apps/api/src/auth/verified-principal.guard.ts)                                                                                                                                                                                                                                     | [Auth tests](../../apps/api/src/community-auth/community-auth.service.test.ts), [owner-isolation tests](../../tests/security/import-resume/authorization-isolation.security.test.ts)                                                                                                                                                              |
| E2  | [Manual draft creation](../../apps/api/src/manual-resume/create-manual-resume-draft.service.ts), [manual update](../../apps/api/src/manual-resume/update-manual-resume-draft.service.ts), [manual domain](../../packages/domain/src/resume-import/manual-draft.ts)                                                                                                                                                            | [Manual domain tests](../../packages/domain/src/resume-import/manual-draft.test.ts), [Community guide](../community-user-guide.md) distinguishes manual draft eligibility                                                                                                                                                                         |
| E3  | [Codex initiation](../../apps/api/src/provider-connections/use-cases/codex-connection-initiation.ts), [provider-neutral connection lifecycle](../../packages/import-application/src/semantic-parser/provider-connections.ts)                                                                                                                                                                                                  | [Initiation tests](../../apps/api/src/provider-connections/use-cases/codex-connection-initiation.test.ts), [connection tests](../../packages/import-application/src/semantic-parser/provider-connections.test.ts)                                                                                                                                 |
| E4  | [StartImportService](../../apps/api/src/import-resume/use-cases/start-import.ts): retentionDays, admission, persistence, processing and retention jobs; [document validation](../../packages/import-application/src/validate-document.ts)                                                                                                                                                                                     | [Start-import tests](../../apps/api/src/import-resume/use-cases/start-import.test.ts), [hostile-document tests](../../tests/security/import-resume/hostile-documents.security.test.ts), [upload threat boundary](../security/upload-security.md)                                                                                                  |
| E5  | [SemanticImportWorkflow](../../packages/import-application/src/semantic-import-workflow.ts), especially process, runFallbackOrLeaveTerminal and fallbackTriggerForProviderError; [evidence validation](../../packages/import-application/src/validation/evidence-grounding.ts); [semantic validation](../../packages/import-application/src/validation/semantic-validation.ts)                                                | [Semantic validation tests](../../packages/import-application/src/validation/semantic-validation.test.ts): grounded response, foreign evidence, invented values; [provider-neutral architecture](../../tests/architecture/import-resume/provider-independence.architecture.test.ts); [ADR 0006](../adr/0006-semantic-contract-version-policy.md)  |
| E6  | [Review commands](../../packages/domain/src/resume-import/review.ts), [UpdateImportReviewService.updateInTransaction](../../apps/api/src/import-resume/use-cases/update-review.ts), [review read projection](../../apps/api/src/import-resume/use-cases/read-draft.ts)                                                                                                                                                        | [Review rules tests](../../packages/domain/src/resume-import/review.test.ts), [review correction integration tests](../../tests/integration/import-resume/review-correction.integration.test.ts)                                                                                                                                                  |
| E7  | [confirmInTransaction/discardInTransaction](../../apps/api/src/import-resume/use-cases/confirm-structured-resume.ts), [confirmation validation](../../packages/domain/src/resume-import/validation.ts), [structured mapper](../../packages/domain/src/resume-import/structured-resume-mapper.ts)                                                                                                                              | [Confirmation tests](../../packages/domain/src/resume-import/confirmation.test.ts): retains valid unreviewed fields, excludes exactly selected field, blocks unresolved inference; [transaction tests](../../tests/integration/import-resume/confirm-structured-resume.integration.test.ts): duplicate/racing confirmation, wrong owner, rollback |
| E8  | [ResumeWorkspaceService.update](../../apps/api/src/resume-workspace/resume-workspace.service.ts), [editable domain](../../packages/domain/src/resume-import/editable-resume.ts), [contextual edit service](../../apps/api/src/resume-workspace/contextual-resume-editing.service.ts)                                                                                                                                          | [Workspace tests](../../apps/api/src/resume-workspace/resume-workspace.service.test.ts), [contextual edit tests](../../apps/api/src/resume-workspace/contextual-resume-editing.service.test.ts), [fact-preservation tests](../../packages/import-application/src/contextual-editing/fact-preservation.test.ts)                                    |
| E9  | [ResumeExportView](../../apps/web/src/features/resume-export/ResumeExportView.tsx): saved-content read and openPrintDialog; [canonical model](../../apps/web/src/features/resume-renderer/model.ts)                                                                                                                                                                                                                           | [Export view tests](../../apps/web/src/features/resume-export/ResumeExportView.test.tsx), [preview/PDF fidelity browser test](../../tests/browser/resume-export/import-to-pdf-fidelity.spec.ts), [renderer tests](../../apps/web/src/features/resume-renderer/ProfessionalResume.test.tsx)                                                        |
| E10 | [SourceDeletionService](../../packages/import-application/src/source-deletion.ts), [owner-scoped delete endpoint use case](../../apps/api/src/import-resume/use-cases/delete-source.ts), [claimSourceDeletion/completeSourceDeletion](../../packages/persistence/src/repositories/typeorm-import-resume.repository.ts), [worker source-deletion delivery](../../apps/worker/src/import-resume/import-processing.processor.ts) | [Deletion service tests](../../packages/import-application/src/source-deletion.test.ts), [persistence deletion test](../../tests/integration/persistence/source-deletion.integration.test.ts), [worker test](../../apps/worker/src/import-resume/import-processing.processor.test.ts): automatic retention deletion with owner scope              |
| E11 | [#42 commercial discovery](https://github.com/sangimed/nuvitae/issues/42), [#57 source-deletion scope](https://github.com/sangimed/nuvitae/issues/57), [security invariants](../security/security-invariants.md)                                                                                                                                                                                                              | #42's pricing/credit examples are hypotheses; #57 explicitly excludes account deletion and resume version-history design                                                                                                                                                                                                                          |
| E12 | [ADR 0005](../adr/0005-modular-capability-boundaries.md), [#47 implementation summary](../architecture/issue-47-architecture-audit.md), [ADR 0007](../adr/0007-compatibility-surfaces-and-historical-files.md)                                                                                                                                                                                                                | [Dependency-direction tests](../../tests/architecture/dependency-direction.test.ts) protect application-owned ports, feature ownership and compatibility boundaries                                                                                                                                                                               |

## Hotspots and local follow-up briefs

These are **proposed issue briefs, not GitHub issues and not approved work**.
Suggested owners are roles, not assignments accepted by named people. Existing
issues are dependencies, not permission to broaden this branch.

### H1 — Agree what “confirmed” promises

- **Observed:** confirmation retains valid unreviewed explicit content once
  gates pass (E7). Manual drafts are a separate kind (E2).
- **Unresolved:** does “Create my resume” adequately explain that distinction?
  Should manual draft and confirmed resume eligibility eventually converge?
- **Proposed owner:** product owner with a resume user and maintainer.
- **Acceptance:** walk one explicit unreviewed field, one excluded field, one
  unresolved inferred field, and one user-added field; record each expected
  outcome and agreed wording. Confirm current behavior or open a separate
  behavior-change proposal. Do not silently require per-field confirmation.
- **Decision candidate:** an ADR only if changing the durable lifecycle or
  confirmation contract; a glossary agreement alone does not need an ADR.

### H2 — Distinguish omitted, unsupported, and rejected interpretation

- **Observed:** partial fallback is deliberately narrow; security/grounding
  rejection does not enter it (E5).
- **Unresolved:** which source-section omissions can a user reasonably repair,
  and which require a new import? “Partial” is insufficient as the whole model.
- **Proposed owner:** product + semantic-provider maintainer + privacy reviewer.
- **Acceptance:** compare a missing source section, malformed provider envelope,
  valid partial result, foreign evidence, and conflicting values. Link expected
  failure/warning/recovery outcomes to existing tests; add a focused test only
  where a specific gap exists. Preserve fail-closed evidence semantics.
- **Dependency:** workshop agreement before any UI or fallback policy change.

### H3 — Prove deletion/save/crash interleavings

- **Observed:** storage deletion occurs between repository transactions;
  completion reduces provenance and updates the structured resume. Existing
  unit coverage includes storage failure and idempotent completed deletion;
  the inspected persistence test is not an exhaustive concurrency proof (E10).
- **Unresolved:** restart after bytes disappear but before DB completion,
  overlapping deletion attempts, and a user save interleaving with reduction.
  This is a verification question, **not a proven data-loss defect**.
- **Proposed owner:** persistence/worker maintainer with privacy review.
- **Acceptance:** use isolated disposable Docker test schemas and fake storage
  failure points; pause before/after claim, object removal, and DB completion;
  race an asymmetric content edit. Prove no edit loss, no stale source evidence
  reintroduction, equivalent wrong-owner/missing behavior, and eventual safe
  retry. Record the actual guarantee and unresolved backup scope.
- **Decision candidate:** source-lifecycle ownership/consistency ADR only if the
  experiments require choosing a new cross-store coordination contract.

### H4 — Name export facts according to what is observable

- **Observed:** `window.print()` returning triggers `pdf_export.succeeded` in
  the export view (E9). The user can cancel the browser dialog.
- **Unresolved:** is the product metric intended to mean print-dialog handoff
  or saved PDF? The implementation alone cannot establish the latter.
- **Proposed owner:** product/observability owner; no telemetry edits here.
- **Acceptance:** choose and document an honest observable definition; exercise
  print cancellation and failure without claiming file delivery. Coordinate
  any event rename/consumer migration separately with observability work.
- **ADR:** not warranted unless a consequential delivery guarantee is adopted.

### H5 — Bound source privacy promises; defer hosted/account lifecycle

- **Observed:** source deletion is implemented and preserves the resume;
  seven-day scheduling and worker execution exist (E4, E10). Scheduling at a
  deadline is not evidence of a hard wall-clock erasure SLA during outages.
- **Unresolved:** outage recovery expectations, retained structured data,
  semantic records, backups, account deletion, and future hosted obligations.
- **Proposed owner:** privacy/product, later hosted operations.
- **Acceptance:** inventory data categories and intended retention promises;
  distinguish deleting a source from deleting all personal data. Agree the
  source guarantee before publishing it; route account/hosted decisions to
  separate work, coordinated with #42, #77, and #78 where relevant.
- **Decision candidate:** retention/erasure guarantee ADR when stakeholders
  choose among materially different obligations. No billing implementation now.

### H6 — Evaluate an authoring-owned response boundary

- **Observed:** workspace saves import `toConfirmedContent` from confirmation;
  the same class also handles discard and reads (E7, E8).
- **Proposed owner:** maintainer, coordinated with #47/#28.
- **Acceptance:** inventory existing response consumers, compare the current
  helper with the existing structured-response mapper, characterize provenance
  before/after source deletion, then choose the smallest owner-correct reuse.
  Preserve public schemas, owner checks, and confirmation atomicity; no
  framework layer, new package, deletion, or broad move without justification.
- **Timing:** later, if characterization proves maintenance benefit. Existing
  ADR 0005 supplies direction; no duplicate architecture ADR is needed.

## Now, later, and not at all

**Now:** preserve the evidence and scenarios; use the continuation workshop to
resolve H1/H2 vocabulary and triage H3–H6. This branch makes no new architecture
decision, so it creates no accepted ADR claiming stakeholder rationale.

**Later:** focused proof or changes from the briefs, with separately approved
scope. Link accepted language into #28's documentation; do not mechanically
promote every candidate noun into a context or every hotspot into a code task.

**Not justified:** event sourcing, microservices, a message bus migration,
independently committed review/provenance services, a generic AI context for all
future features, table-driven context boundaries, or speculative billing code.
ADRs 0005–0007 already explain the existing modular direction and compatibility.

## Issue #39 acceptance accounting

| Criterion                                        | Status in this delivery                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Bounded Big Picture has been run                 | Solo textual exploration delivered; collaborative session remains open                                         |
| Import → review → confirmation Process Modelling | Detailed solo pass delivered; stakeholder validation remains open                                              |
| Events, commands, policies, actors, hotspots     | Captured in process board and H1–H6                                                                            |
| Happy path and meaningful failure/recovery       | Captured with source/test evidence and explicit unresolved races                                               |
| Candidate contexts and responsibilities          | Delivered in context map                                                                                       |
| Dependency view                                  | Delivered; conceptual calls distinguished from deployment/events                                               |
| Comparison to monorepo/NestJS boundaries         | Delivered against implemented #47, not its obsolete audit findings                                             |
| Glossary updated with agreed terminology         | Existing three terms preserved; local proposed glossary delivered; new agreement/root integration remains open |
| Decisions as ADRs and/or focused follow-ups      | Local briefs and conditional ADR candidates delivered; no external issues or fictional accepted decisions      |
| No event-driven migration solely from notation   | Satisfied; docs only                                                                                           |
| Outputs linked from #28 architecture docs        | Deferred to Orb D/documentation owner; no navigation/index conflict                                            |

**Do not close #39 from this branch alone.** It supplies substantial discovery
material but not the missing collaboration, agreed language, or inbound #28
documentation link.

## Validation and unrelated observations

Documentation-only scope: no application test, schema, runtime, security asset,
network boundary, or UI change. Relevant source and tests were inspected as
listed above; no private data was copied into the board.

Checks run through the existing Compose workspace (using `sudo -n docker`
because the unprivileged Docker socket was inaccessible):

```sh
docker compose run --no-deps workspace pnpm exec prettier --check 'docs/eventstorming/*.md'
docker compose run --no-deps workspace pnpm exec vitest run \
  packages/domain/src/resume-import/confirmation.test.ts \
  packages/domain/src/resume-import/review.test.ts \
  packages/import-application/src/source-deletion.test.ts \
  packages/import-application/src/validation/semantic-validation.test.ts
git diff --check
```

- Prettier: all four matched Markdown files pass. Formatting writes were scoped
  to this subtree only.
- Vitest: **4 files, 31 tests passed**. No DB, provider session, or application
  server was started; persistence/browser suites were inspected, not executed.
- A read-only Node check inside the Compose workspace resolved all Markdown
  relative-link targets against each document's directory: **65 checked,
  zero broken**. This proves repository target existence, not future MkDocs
  publication routing or rendered anchors. There are no local anchor links.
- `git diff --check`: no whitespace errors. No dedicated Markdown lint or
  MkDocs/link-check workflow exists at this baseline; #28 integration/build
  verification remains with its documentation owner. External primary-reference
  pages were fetched live; all remote issue/commit links were not crawled.
- One-shot containers were retained rather than invoking destructive cleanup;
  Compose's orphan-container warning is unrelated to documentation validity.

Unrelated documentation drift: historical sections of `README.md` describe
editing/export/deletion as absent, whereas the Community guide and current
implementation expose those capabilities. The old #47 audit body is historical;
its implementation summary is current. These files are deliberately unchanged
and should not be used to reopen completed architecture work.

Merge risk is limited to the four new files under `docs/eventstorming/`.
Orb D may add an inbound link to this subtree separately. No generic
architecture overview, root glossary, MkDocs configuration, docs index, ADR
index/template, runtime, security, or observability files are changed.
