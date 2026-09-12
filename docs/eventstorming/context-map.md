# Candidate boundaries and ubiquitous language

## Boundaries derived from the journey

**C:** Keep import, review, and confirmation one capability now. Its difficult
invariant is the transition from uncertain source interpretation to an explicitly
created, durable resume. Review/provenance is a useful internal responsibility,
not yet a justified separate bounded context. Provider connection and document
processing change for different reasons and already have meaningful seams.

| Candidate context or supporting capability                       | Owned concepts and invariants                                                                                                   | Dependencies / exchanged information                                                                                                      | Module decision now                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Resume Authoring                                                 | Manual draft, structured resume, saved content, edit conflict token; owner-scoped writes and fact-preserving optional proposals | Receives confirmed content from Import; provides saved content to Rendering; asks provider capability for optional assistance             | Existing manual-resume/resume-workspace owners; no new package                             |
| Resume Import, including Review/Provenance                       | Temporary source lifecycle, review draft, corrections, warnings, review revision, one confirmation per source draft             | Consumes validated document fragments and bounded semantic response; creates Authoring content; coordinates source lifecycle              | Preserve ADR 0005 owner; review remains inside this invariant boundary                     |
| Document Processing (supporting)                                 | Safe reading, supported format/page/text limits, source positions; no invention of resume meaning                               | Untrusted source in, bounded deterministic fragments or typed failure out                                                                 | Existing extraction package is justified by isolation and reuse; no business service split |
| Semantic Interpretation (internal application responsibility)    | Candidate normalization, evidence/no-invention/inference checks, fallback eligibility                                           | Document fragments + provider-neutral request → validated interpretation or rejection                                                     | Keep in import application; no new autonomous context/store                                |
| Provider Connections (supporting)                                | Owner-scoped connection, protected session, availability and revocation; no credential exposure                                 | Identity establishes owner; external provider completes device flow; consumers receive capability/result, not browser-visible credentials | Existing feature/adapter boundary; do not make Codex a business domain                     |
| Rendering / Export (supporting)                                  | Presentation model, section ordering, print layout; no mutation of authoritative content                                        | Reads saved content for export, local editable state for preview; browser print is an external action                                     | Existing web renderer/export features; no backend export service inferred                  |
| Identity / Access (supporting)                                   | Verified Community principal and session                                                                                        | Supplies principal to every owner-scoped capability; does not authorize by client owner ID                                                | Existing Community auth and principal boundary; hosted identity deferred                   |
| Source lifecycle (cross-cutting obligation, not new context now) | Deadline, deletion claim/completion, artifact cleanup, provenance reduction; preserve resume                                    | Import identifies private artifacts; deletion coordinates storage and persistence; Authoring retains content                              | Existing application-owned deletion service; improve evidence before separating ownership  |
| Hosted Entitlements / Billing (future)                           | U: allowance, billable success, reservation and refund semantics                                                                | Potentially gates expensive operations, never changes grounding or owner isolation                                                        | No implementation or package until #42 resolves model                                      |

## Context map

Arrows indicate supplied information or capability calls, **not deployed
services, queues, or event subscriptions**. This is a candidate ownership map.

```text
                    Identity / Access
                verified owner to all calls
                            |
 Owner --source--> Resume Import <---fragments--- Document Processing
                       |   |
                       |   +---interpret request---> Semantic Interpretation
                       |                                 |
                 review/confirm                    bounded provider call
                       |                                 |
                       v                                 v
                Resume Authoring <---optional--- Provider Connections
                       |                                 |
                 saved content                     external provider
                       v
                Rendering / Export ---> browser print

 Import source lifecycle ---> private-object deletion + provenance reduction
                              (Authoring content survives)

 Future hosted entitlements - - > admission of expensive operations (undecided)
```

**O contracts:** HTTP/job schemas live in `packages/contracts`; the application
owns workflow repository ports; TypeORM adapters implement transactions;
BullMQ processors deliver work. The confirmation handoff currently uses a
transaction and mapper, not an event subscriber. Identity and evidence are
revalidated at their respective boundaries; transport validation alone cannot
establish either.

## Comparison with current architecture

- **Aligned (O):** ADR 0005 already chooses a modular monolith and capability
  owners. `SemanticImportWorkflow` owns orchestration; the worker delegates.
  The dependency-direction test has an empty import-application persistence
  debt allowlist. Do not repeat #47's historical audit as a current defect.
- **Aligned (O):** pure review/mapping rules, application-owned repository
  contracts, extraction safety, and explicit provider adapters protect actual
  invariants. API/worker deployment separation is not a domain split.
- **Vocabulary mismatch (O):** manual drafts and editable-resume domain rules
  physically live under `domain/src/resume-import`; `StructuredResume` and
  `ManualStructuredResumeDraft` differ despite the UI calling both resumes.
  **C:** clarify names here before proposing any moves.
- **Concrete coupling (O):** `ResumeWorkspaceService` imports
  `toConfirmedContent` from the import confirmation use case. A downstream
  editing capability depends on an upstream creation implementation to serialize
  content. **C:** a focused authoring-owned response boundary is worth evaluating;
  do not relocate all confirmation logic or introduce a generic mapper framework.
- **Concrete concentration (O):** `ConfirmStructuredResumeService` confirms,
  discards, and reads confirmed resumes, including source availability.
  **C:** logical commands have different owners after confirmation; separate
  only when characterization demonstrates a useful smaller boundary.
- **Lifecycle coupling (O):** persistence deletion reduces both extracted-field
  and structured-resume provenance, while private bytes are deleted outside
  that transaction. **C:** keep this coordination explicit; splitting by table
  would hide its failure contract rather than solve it.
- **Cross-feature reuse (O):** export reads confirmed content through the
  import-resume client facade. Renderer reuse is already real; a new Rendering
  package is not justified merely because the board gives it a name.
- **Intentional history (O):** ADRs 0006–0007 retain compatibility surfaces.
  Their physical presence is not permission for a cleanup/removal pass.

See E5–E10 in the [evidence register](decisions-and-evidence.md) for exact files.
No architecture moves, new abstraction, or dependency changes are proposed for
immediate implementation in this issue.

## Ubiquitous language: existing terms and proposed clarification

This local glossary preserves the three terms already defined in
[CONTEXT.md](../../CONTEXT.md). Additional language below is **candidate** until
participants agree it; it does not silently replace the root glossary.

| Term                | Meaning / distinction                                                                                                                | Status                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Imported file       | Original temporary PDF/DOCX; review does not alter it. Never call it the edited resume or source of truth for later user changes.    | Existing glossary                  |
| Review draft        | Reviewable interpretation with user choices and outstanding items; not the original upload or final resume.                          | Existing glossary                  |
| Structured resume   | Editable resume created from confirmed review, independent of the temporary file. Not every field was individually confirmed.        | Existing glossary; clarification C |
| Manual draft        | Resume authored without an imported source; currently a separate saved kind with different export/AI eligibility.                    | C                                  |
| Source fragment     | Bounded text with a source position available to interpretation; not yet a semantic fact.                                            | C                                  |
| Semantic candidate  | Suggested structured information awaiting validation; provider production is not acceptance.                                         | C                                  |
| Grounding           | Evidence support in this source, not real-world truth and not user agreement.                                                        | C                                  |
| Provenance          | Origin and transformation history safe to retain/display; source support, user edits, and minimal post-deletion origin are distinct. | C                                  |
| Inference           | Interpretation/grouping needing review; confidence does not turn it into explicit evidence.                                          | C                                  |
| Field confirmation  | Specific user acceptance of a field/suggestion. Distinct from creating a structured resume.                                          | C                                  |
| Import confirmation | Explicit creation from persisted review after blockers clear; at most one structured resume per owner/source draft.                  | C                                  |
| Review revision     | Concurrency token for the review conversation; not a durable resume version history.                                                 | C                                  |
| Saved resume        | Persisted authoring content, distinct from the unsaved preview; current confirmed updates compare an update timestamp.               | C                                  |
| Provider connection | Owner-scoped access to an external AI runtime; not a Nuvitae user account or billing entitlement.                                    | C                                  |
| Retention deadline  | Original temporary-source deadline; not the expiry date of the user's structured resume.                                             | C                                  |
| Source deletion     | Removal of source-reconstructing objects and reduction of provenance; not resume/account deletion or universal backup erasure.       | C                                  |
| Export              | Current browser-print preparation of saved confirmed content; do not claim delivery of a PDF based on print return alone.            | C                                  |
| Credit              | Future hosted product allowance; not provider quota or existing Community capacity limits.                                           | U                                  |
