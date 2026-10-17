# Foundation scope and follow-up

Issue #28 remains an epic. This first foundation establishes a navigable,
searchable, strict-build site and source-backed overviews; it does not meet every
acceptance criterion of comprehensive developer documentation.

## Delivered in this foundation

- Root MkDocs configuration, bundled theme/search/highlighting and text diagrams.
- Hash-locked Docker documentation image, standalone Compose preview/build and
  a read-only CI build gate without application secrets or deployment.
- README entry point, contributor recipes and documentation maintenance rules.
- Runtime architecture, process/store ownership and current/future distinctions.
- Repository/package map and links to enforced dependency rules.
- Import sequence, trust stages, review/confirmation and failure boundaries.
- Dedicated security/privacy reading guide linking existing authoritative docs.
- Existing ADR inventory, lightweight template and unknown-rationale policy.
- Dedicated persistence and API chapters: constraint/transaction map,
  review/confirmation replay, edit concurrency mechanisms, request/response
  validation, error recovery and endpoint-authoring conventions (`c2e44a4` baseline).
- Corrected explicit Local Play dependency installation and shell environment setup.

## Deferred acceptance criteria and concrete next slices

| Area                                  | Remaining work                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complete onboarding                   | Consolidate historical README material into a tested zero-to-productive guide; reconcile old versions and absent-feature claims rather than copying them                                                                                                                                               |
| Core domain and glossary              | Incorporate reviewed issue #39 outputs; document complete import/artifact/draft/resume/provider/retention lifecycles and terminal states without preempting domain decisions                                                                                                                           |
| Detailed import/semantic architecture | Document exact stage contracts, canonicalization and partial-acceptance rules, fallback eligibility/budgets and provider request minimization with targeted examples                                                                                                                                   |
| Persistence                           | Core map and write mechanisms now documented; verify operational migration scenarios against important existing data and document recovery evidence                                                                                                                                                    |
| Queue and operations                  | Current job catalog/IDs, retry and deadline policy, privacy-safe triage, and explicit limits on replay/retention claims are documented in [Queue and worker operations](queue-operations.md); supported operator replay tooling and verified deletion/backup recovery procedures remain follow-up work |
| API                                   | Core conventions and authoring recipe now documented; complete endpoint inventory and generated-reference integration remain, including Zod/OpenAPI schema completeness                                                                                                                                |
| Web                                   | Route/client/state ownership, editor/review behavior, responsive/a11y conventions and canonical preview-to-export architecture in depth                                                                                                                                                                |
| Testing                               | Full unit/domain/contract/parser/persistence/queue/security/browser/a11y matrix, real-vs-mocked boundaries and bounded live-provider validation policy                                                                                                                                                 |
| Troubleshooting                       | Queue/worker triage is documented; tested runbooks for database/parser/provider/envelope/review/migration/browser failures remain follow-up work                                                                                                                                                       |
| Deployment                            | Document verified Community upgrade/backup/restore/retention operations; label hosted identity/data-plane/billing as future, not implemented                                                                                                                                                           |
| ADR backfill                          | Confirm rationale for async processing, private storage, grounding/fallback and transaction choices; do not fabricate accepted history                                                                                                                                                                 |
| Single searchable corpus              | Integrate reviewed specialist docs/ADRs into site navigation/search without duplication; preserve dated research/audit status and validate legacy links                                                                                                                                                |
| Link validation                       | Repository-target links from the README and site are checked offline; add external URL checking with a considered network/failure policy                                                                                                                                                               |
| README consolidation                  | Reduce to a concise entry point after the remaining operational material has an authoritative maintained home                                                                                                                                                                                          |

No automatic hosting/deployment, custom theme, diagram plugin, domain-model
rewrite, runtime code change, migration or provider call is part of this slice.
Existing specialist files remain authoritative and unchanged. Publication and
offline asset vendoring require separate choices, not implicit GitHub Pages setup.
