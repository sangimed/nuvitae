# Architecture decision records

Keep decisions under `docs/adr/NNNN-short-title.md`. Reuse the
[template](template.md); choose the next unused number when a decision is ready.
A short context/decision/why paragraph is enough. Record alternatives and
consequences only when they explain a real tradeoff.

Do not mark a reconstructed decision accepted without maintainer confirmation.
Do not replace historical rationale with a new explanation. To change an
accepted decision, add a superseding record and link both records after review.

| Record                                                                             | Recorded status                   | Scope                                                       |
| ---------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| [0001 Application foundation](0001-application-foundation.md)                      | Accepted                          | Nuvitae ownership and reference-project boundaries          |
| [0002 Container-only development](0002-container-only-development.md)              | Accepted                          | Docker-owned tooling and runtime                            |
| [0003 Technology stack](0003-application-technology-stack.md)                      | Accepted                          | Next.js, NestJS, worker, contracts and TypeORM choice       |
| [0004 Local Play](0004-local-play-runtime.md)                                      | Accepted                          | Explicit development-only composition                       |
| [0005 Modular boundaries](0005-modular-capability-boundaries.md)                   | Accepted; implementation recorded | Capability ownership, ports and dependency rules            |
| [0006 Semantic version policy](0006-semantic-contract-version-policy.md)           | Accepted                          | V2 writes, historical V1 read compatibility                 |
| [0007 Compatibility surfaces](0007-compatibility-surfaces-and-historical-files.md) | Accepted                          | Explicit exports, deprecation and historical-file retention |

Statuses above reflect the records, not fresh approval by this index. Consult
each record's dates and implemented-result notes before applying historical
instructions to current code.

## Decisions requiring maintainer confirmation or more evidence

The implementation has concrete choices for BullMQ delivery/retry, private
storage and retention, semantic grounding/fallback and confirmation
transactions. Existing code and security documentation describe behavior, but
this foundation does not invent standalone historical ADR rationale for those
choices. Backfill only when evidence or maintainer confirmation supplies the
actual alternatives and tradeoffs.

Hosted identity/session, deployment/backup/restore and billing/credit policy are
future decisions, not existing accepted architecture. Domain boundary questions
from EventStorming belong to issue #39. The
[developer reference map](../site/reference.md) links those sources.
