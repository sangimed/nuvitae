# EventStorming discovery for issue #39

**Status: evidence-backed solo modelling pass; not a completed collaborative workshop.**
Reviewed on 2026-09-11 against [baseline 956528b](https://github.com/sangimed/nuvitae/commit/956528bf6a66b4931967017bb816355638003a3e).
No application behavior or architectural decision changes in this exercise.

## Questions and bounded scope

Start with a person who wants an editable, exportable resume, rather than with
classes or tables. Where does uploaded evidence become a suggestion? What does
the person actually approve? What survives removal of the source? Which failures
can be retried without duplicating a resume or weakening evidence checks?

The [Big Picture and process board](process-model.md) covers Community identity,
manual creation, import, document processing, semantic interpretation,
grounding, review, confirmation, subsequent editing, provider connection,
preview/export, and source retention/deletion. Import → review → confirmation
gets the deeper pass. Hosted accounts, billing, account deletion, OCR, and new
product policies remain explicitly outside implemented scope.

Read next:

- [Candidate contexts, dependencies, and ubiquitous language](context-map.md).
- [Evidence register, hotspots, local follow-up briefs, and acceptance status](decisions-and-evidence.md).

## Method and limitations

This is a textual board with past-tense facts, preceding commands, actors,
policies, read views, and counterexamples. Event names are **modelling labels**,
not claims about persisted events, telemetry identifiers, message delivery, or
event sourcing. Independent activities need not happen in one total order.

Labels throughout:

- **Observed (O):** behavior supported by the linked baseline code/tests.
- **Candidate (C):** a proposed interpretation, name, boundary, or follow-up.
- **Unresolved (U):** a decision requiring stakeholder input or further proof.

One agent examined user-journey, engineering, privacy, provider, and future
commercial perspectives. These are analytical lenses, **not five participants**.
Failure scenarios challenged the happy path; there was no live user interview,
shared board session, stakeholder agreement, or recorded workshop consensus.
The artifacts prepare that conversation rather than replace it.

Primary references retrieved live on 2026-09-11:

- [EventStorming](https://www.eventstorming.com/) describes a “flexible workshop
  format for collaborative exploration of complex business domains.”
- [Resources](https://www.eventstorming.com/resources/) identifies Alberto
  Brandolini's _Introducing EventStorming_ and material on the different formats.
- [Patterns](https://www.eventstorming.com/patterns/) includes Chaotic Exploration,
  Conversational System, Deliverable Obsession, Extract Acceptance Tests, and
  Incremental notation. The site calls these guidelines, not strict rules.

Use Big Picture to discover disagreements, Process Modelling to explore the
critical import decisions, and Software Design only if a concrete invariant
needs more detail. Neither the website's software-design examples nor this
board imply that Nuvitae needs microservices, an event store, or a message bus.

## Proposed facilitated continuation

Invite the product owner, a person who has imported a resume, a maintainer,
and someone responsible for privacy/provider behavior; one person may cover
multiple roles, but record who actually attends. Invite hosted/commercial input
only for the future lane. Use anonymous scenarios, never real resume content or
credentials on the board.

1. **35 minutes, Big Picture:** each participant tells the journey; reorder
   facts together, mark disagreements, distinguish preview from saved content.
2. **45 minutes, import process:** walk one successful import and then partial
   grounding, stale review, repeated confirmation, revoked credentials, and
   deletion overlapping a save. Challenge the candidate names below.
3. **20 minutes, decisions:** accept or reject proposed boundaries and terms;
   assign an owner and an acceptance example to each remaining hotspot.

Stop when added notation no longer changes a decision. Record dissent and
agreed terms, not just a cleaned-up board. Link the accepted outputs from #28's
architecture documentation after coordination with its owner. No navigation,
generic architecture page, ADR index, or root glossary is edited here.

## Work record

- Issue #39 body and all comments read (no comments at inspection). Related
  #28, #47 (including its completion comment), #57, and #42 read with comments.
- Expected and actual `origin/main` matched the linked baseline. Initial
  `git status --porcelain=v1 --untracked-files=all` was empty: no staged,
  unstaged, or untracked changes needed separate capture.
- Safety launcher absent. Durable local ref
  `refs/snapshots/orb-e-39-before` preserves that clean baseline before edits.
- Work isolated on `docs/39-eventstorming-boundaries`; no runtime files,
  external issues, branch pushes, or pull requests created.
- Validation results and remaining acceptance criteria are recorded in the
  [evidence page](decisions-and-evidence.md).
