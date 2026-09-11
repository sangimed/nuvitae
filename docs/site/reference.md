# Decisions and authoritative references

These links keep specialist material in its existing location. Linked pages are
not yet part of the MkDocs search index. Read their status/date before relying on
a historical observation.

## Decisions and vocabulary

- [ADR index and convention](https://github.com/sangimed/nuvitae/blob/main/docs/adr/index.md)
  and [new-record template](https://github.com/sangimed/nuvitae/blob/main/docs/adr/template.md).
- [Existing glossary](https://github.com/sangimed/nuvitae/blob/main/CONTEXT.md):
  imported file, review draft, structured resume.
- [EventStorming issue #39](https://github.com/sangimed/nuvitae/issues/39): domain
  discovery owned separately; do not infer event sourcing from workshop events.
- [Architecture audit](https://github.com/sangimed/nuvitae/blob/main/docs/architecture/issue-47-architecture-audit.md):
  dated findings/proposals with a later implementation-status note. Prefer ADR
  0005 and current architecture tests for the implemented boundary.
- [Temporal-semantics audit](https://github.com/sangimed/nuvitae/blob/main/docs/architecture/issue-23-temporal-semantics-audit.md):
  timestamp/date conventions and regression evidence.

## Engineering and product reference

- [Quality gates](https://github.com/sangimed/nuvitae/blob/main/docs/development/quality-gates.md)
  and [Knip evaluation](https://github.com/sangimed/nuvitae/blob/main/docs/development/knip-evaluation.md).
- [Security reading guide](security.md), including upload safety and response policy.
- [Community installation](https://github.com/sangimed/nuvitae/blob/main/docs/community-installation.md),
  [user guide](https://github.com/sangimed/nuvitae/blob/main/docs/community-user-guide.md),
  and [privacy-safe metrics](https://github.com/sangimed/nuvitae/blob/main/docs/community-funnel-metrics.md).
- [Resume-builder information architecture](https://github.com/sangimed/nuvitae/blob/main/docs/design/resume-builder-information-architecture.md)
  and [canonical design system](https://github.com/sangimed/nuvitae/blob/main/.stitch/DESIGN.md).
- [Fixture corpus](https://github.com/sangimed/nuvitae/blob/main/packages/test-fixtures/resume-import/README.md).
- [Community alpha readiness](https://github.com/sangimed/nuvitae/blob/main/docs/release/community-alpha-readiness.md):
  a dated validation record, not a guarantee that an arbitrary checkout is ready.

## Research and specifications are not runtime promises

- [Import specifications and contracts](https://github.com/sangimed/nuvitae/tree/main/specs/001-import-resume)
  capture requirements and planned work alongside completed tasks. Trace a claim
  to code/tests before treating it as shipped.
- [Research archive](https://github.com/sangimed/nuvitae/tree/main/docs/research)
  contains foundation evaluation, Codex authentication/runtime/transport spikes,
  semantic evidence/canonicalization investigations and latency campaigns. These
  are dated evidence, not supported adapter APIs or current configuration recipes.

For the actual wire schemas, use
[packages/contracts](https://github.com/sangimed/nuvitae/tree/main/packages/contracts/src).
For API documentation exposure rules, use the response-policy guide rather than
assuming a publicly exposed Swagger endpoint exists.
