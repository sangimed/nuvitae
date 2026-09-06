# Resume-builder information architecture

## Purpose

This is the target information architecture for the Community resume-building
journey. It records the product decisions already expressed by the web routes
and components, so future work can improve a focused area without returning to
isolated, implementation-oriented screens.

It applies the Editorial Studio direction in `.stitch/DESIGN.md`: warm,
document-first product surfaces, with the resume—not an AI provider or product
configuration—the central object.

## Primary journey

```text
Home
  ├─ Import an existing resume (recommended)
  │    ├─ Choose file
  │    ├─ Processing status and recovery
  │    ├─ Review imported information
  │    └─ Confirm → resume workspace → preview/export
  └─ Create from scratch
       └─ Focused section editing ↔ responsive preview → resume workspace
```

The two entry choices remain equally available. Import is recommended only
because it can reduce data entry; it is not required to use Nuvitae.

## Route and responsibility map

| Product surface          | Route                                              | User goal                                      | Primary UI responsibility                                                                            |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Entry and onboarding     | `/`                                                | Choose an understandable starting path         | Explain import versus manual creation and set privacy/control expectations.                          |
| Import choice and upload | `/import-resume`                                   | Start from an existing file                    | Provide safe file guidance, provider disclosure, connection recovery, and manual-entry alternative.  |
| Processing               | `/import-resume/[importId]`                        | Understand truthful progress or recover        | Present the actual backend stage; never simulate completion.                                         |
| Import review            | `/import-resume/[importId]/review`                 | Confirm, correct, or discard extracted content | Prioritize items needing attention while retaining source detail on demand.                          |
| Manual editing           | `/resumes/new/manual`, `/resumes/drafts/[draftId]` | Edit one meaningful section at a time          | Keep save state, section navigation, and preview available without exposing implementation concepts. |
| Saved resumes            | `/resumes`, `/resumes/[resumeId]`                  | Return to a resume                             | Provide a clear continuation point and export route.                                                 |
| Export                   | `/resumes/[resumeId]/export`                       | Inspect and export the document                | Keep the ATS-conscious rendered document central.                                                    |

## Navigation model

The persistent application shell provides:

- a home link and product identity;
- direct routes to saved resumes, import, and manual creation;
- owner access only when Community authentication is applicable; and
- a keyboard-visible skip link to the single page main landmark.

On narrow screens, primary navigation becomes a two-column grid with controls
that keep the shared minimum 44px target size. The editor does not compress its
desktop split view: it switches explicitly between Edit and Preview modes.

## State principles

- **Import:** processing copy derives from the server-reported stage. Success,
  warning, and failure states include text and recovery actions rather than
  relying on color or animation.
- **Review:** attention items determine initial focus; provenance is available
  as supporting detail rather than developer terminology.
- **Editing:** saved, unsaved, saving, failed, and stale states are explicit.
  AI may propose a contextual edit, but cannot replace ordinary editing or
  apply changes without review.
- **Preview/export:** the renderer owns document appearance separately from the
  product UI, preserving deterministic, ATS-conscious output.

## Boundaries and non-goals

The web experience consumes existing contracts; it must not change import
semantics, provider/OAuth architecture, source provenance, ownership checks,
or resume rendering contracts merely to fit a UI treatment. Product UI uses
the shared Community primitives and canonical tokens. Resume templates remain
a separate visual system.

Remaining work should be raised as focused delivery issues, not folded back
into this umbrella: additional vetted templates/customization controls,
generated-PDF lifecycle work, and any later AI proposal workflow should each
own their own contract and acceptance criteria.
