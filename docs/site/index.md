# Nuvitae developer documentation

Nuvitae turns an uploaded resume into a reviewable draft, then a durable resume
that its owner can edit, preview, and export. Manual creation is a separate
entry path. AI interpretation and rewriting are proposals, never authority to
invent facts or silently overwrite saved work.

This is the first developer-documentation foundation for
[issue #28](https://github.com/sangimed/nuvitae/issues/28), not completion of the
documentation epic. The foundation was established in
[`docs: establish MkDocs foundation` (#104)](https://github.com/sangimed/nuvitae/pull/104).
Current-behavior claims link to their owning source and must be rechecked when
that source changes.

## Find your starting point

1. [Run and test the project](development.md).
2. [Understand the runtime](architecture.md) and [find the owning module](repository.md).
3. [Trace an import](import-pipeline.md).
4. [Preserve security and privacy](security.md).
5. [Read decisions and authoritative references](reference.md).
6. [Change and preview these docs](documentation.md).

For product instructions rather than engineering details, use the existing
[Community installation guide](https://github.com/sangimed/nuvitae/blob/main/docs/community-installation.md)
and [Community user guide](https://github.com/sangimed/nuvitae/blob/main/docs/community-user-guide.md).

## How to read status claims

- **Current:** linked code and runtime configuration implement the behavior.
  This is not a claim that every integration has been exercised in your installation.
- **Intended/future:** a planned capability or release requirement, not something
  contributors can rely on today.
- **Unresolved:** a decision needs maintainer confirmation or further evidence.

Source references lead to GitHub `main` so they remain useful after merge; they
can evolve beyond this snapshot. In a checkout, inspect the same path locally.
Historical research, audit findings, and older README slice notes are evidence
of their date, not a current support matrix. Accepted ADRs explain decisions;
code and tests establish implementation. Report disagreements as documentation
defects rather than silently treating a proposal as shipped.

The [coverage ledger](coverage.md) names exactly what remains to be written.
