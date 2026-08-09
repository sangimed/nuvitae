# Grounded Multimodal Import (V2)

**Status**: PROPOSED / POST-V1 SPIKE / NOT IMPLEMENTED
**Recorded**: 2026-08-09
**Scope**: Architecture/research direction only; not an implementation decision

## Purpose and current-state boundary

This record preserves a future architecture hypothesis raised during manual
production validation. It does not authorize V2 implementation, production
multimodal calls, a change to the current V1 execution plan, or a change to the
T203/T246/T217 outcomes.

V1 remains the active implementation. Recent production transport defects were
corrected offline: whole-stream timeout scoping, stream inactivity handling,
unhandled stream-cancellation rejection, and bounded structural classification
when a response has no `Content-Type`. Real-provider semantic recall remains
**UNVERIFIED** for the current production import pipeline until a real semantic
response successfully traverses that pipeline and is evaluated against the
current simple smoke fixture.

The immutable current qualification state remains:

- **T203: NO-GO**.
- **T246: COMPLETE — qualification FAILED**. Its evidence is immutable and
  must not be reopened, rerun, weakened, or reinterpreted.
- **T217: COMPLETE**. Its current provider/fallback budgets and behavior remain
  unchanged.

V2 is not a workaround for current V1 transport defects. It is a separate,
post-V1 research direction to evaluate only after V1 is stable and qualified at
the gate defined below.

## Problem statement

Text extraction can preserve the words in a document while weakening semantic
relationships carried by layout. Examples include multi-column resumes,
sidebars, visually grouped skill lists, employer/title/date relationships,
timelines, language/proficiency layouts, compact education entries, icon-based
professional links, and modern templates where spatial position carries
meaning.

For example, a two-column resume may visually represent:

```text
EXPERIENCE                      SKILLS

ACME                            TypeScript
Backend Engineer                NestJS
2023 – Present                  PostgreSQL
```

A flattened transcript may preserve every word while weakening the
relationship between those values. V2 investigates whether additional visual
or document context helps a semantic model reconstruct those relationships,
while keeping Nuvitae-owned deterministic evidence authoritative.

## V1 — Grounded Text Import (active architecture)

```text
PDF/DOCX
→ deterministic local extraction
→ normalized transcript
→ canonical source fragments/evidence
→ Codex semantic extraction
→ Nuvitae validation/grounding
→ review
```

V1 sends the canonical locally extracted text representation through the
provider-independent semantic boundary. Nuvitae validates the provider result
against canonical local fragments/evidence before presenting candidates for
user review. V1 is a legitimate product path and remains the current
implementation and stabilization target.

## V2 — Grounded Multimodal Import (proposed)

The semantic model would receive both:

1. the canonical locally extracted transcript, fragments, and evidence; and
2. an additional visual/document representation, such as the original
   supported document or locally rendered page images.

The proposed flow is:

```text
document
├─ deterministic extraction
│  └─ transcript + canonical fragments/evidence
│
└─ visual/document representation
                  ↓
            semantic model
                  ↓
        structured candidates
                  ↓
        Nuvitae deterministic grounding
                  ↓
                review
```

The visual input is additional semantic context, not a replacement for the
canonical local source representation. The model may interpret layout,
grouping, and relationships, but every accepted factual value must remain
grounded against Nuvitae-owned canonical evidence.

The intended architecture is explicitly not:

```text
document → LLM → blindly trusted structured resume
```

## Core architectural principle

> **LLM for understanding. Nuvitae for proof.**

The model may interpret structure, grouping, and relationships. Nuvitae
decides whether a factual value is supported by the source and whether it can
be accepted into the reviewable import result.

## Expected benefits

V2 may improve semantic understanding for documents where spatial context is
material, including:

- field relationships in multi-column and sidebar-heavy layouts;
- employer, title, and date association;
- visually grouped skills and language/proficiency pairs;
- education grouping and compact entries;
- timelines and section boundaries;
- professional links represented with icons or compact visual affordances.

These are hypotheses to test, not promised product outcomes or new pass
thresholds.

## Design invariants for any future V2 implementation

Any future V2 implementation must preserve all of the following:

- deterministic local document extraction;
- a normalized canonical transcript;
- canonical source fragments/evidence owned by Nuvitae;
- grounding/no-invention validation;
- evidence required for every accepted factual value;
- user review before confirmation;
- bounded provider execution;
- deterministic fallback behavior;
- a provider abstraction;
- ownership and security boundaries;
- no provider becoming the sole source of truth;
- no automatic trust of provider-produced facts;
- no raw provider response persistence unless explicitly permitted;
- the current credential/session privacy guarantees.

The visual/document input is additional semantic context only. It must never
replace canonical local evidence, relax semantic validation, or make a
provider-native output the Nuvitae source of truth.

## Candidate input strategies (alternatives, not selected)

These strategies are recorded for a future spike. Neither B nor C is selected.

### A. V1 baseline

```text
transcript
+ canonical fragments/evidence
→ semantic model
```

This is the control path and must remain in the comparison.

### B. Original-document multimodal

```text
original PDF/document
+ transcript
+ canonical fragments/evidence
→ semantic model
```

This may preserve native document context, but exact support, request limits,
privacy handling, and provider behavior must be qualified against the exact
production transport.

### C. Rendered-page multimodal

```text
render document pages locally
→ page image(s)
+ transcript
+ canonical fragments/evidence
→ semantic model
```

This may make the architecture more format-neutral:

```text
PDF
├─ local text extraction
└─ local page rendering

DOCX
├─ local structured/text extraction
└─ local visual rendering

Both converge into a common multimodal semantic stage.
```

Rendering introduces its own fidelity, resource, retention, and isolation
questions. It is an alternative to evaluate, not an approved direction.

## Provider capability constraint

The current Codex OAuth production backend uses the qualified direct Codex
transport and currently sends text input. This record makes no assumption that
that backend supports PDF input, file input, image input, multimodal request
bodies, or multiple mixed input types.

Multimodal capabilities must be independently qualified against the exact
production transport and provider before any V2 implementation. Support must
not be inferred from another OpenAI API, SDK, product surface, or unrelated
provider integration.

## Provider neutrality and possible future routing

V2 must not make resume import fundamentally Codex-specific. A future provider
capability model could conceptually distinguish:

- semantic text capability;
- multimodal document capability;
- multimodal image capability.

A future routing hypothesis is:

```text
provider supports qualified multimodal path
→ Grounded Multimodal Import

otherwise
→ Grounded Text Import
```

This capability model and routing are recorded for research only. They are not
implemented, selected, or added to the current provider boundary in V1.

## V1 remains a legitimate path

V2 does not delete or replace V1. Grounded Text Import may remain preferable
for:

- providers without qualified multimodal support;
- cheaper or lower-latency operation;
- documents where visual structure adds little value;
- deterministic fallback behavior;
- provider portability;
- local or self-hosted deployments with different provider capabilities.

The possible future shape is therefore a hypothesis:

```text
document
→ deterministic extraction
        ├─ qualified multimodal provider → V2
        └─ otherwise                    → V1
```

## Security, privacy, and ownership implications

The original document, rendered pages, transcript, fragments, evidence, and
provider request are sensitive resume data. A future spike must evaluate:

- least-necessary input transfer and explicit user/provider disclosure;
- ownership checks and isolation of original and rendered artifacts;
- bounded rendering and provider request sizes;
- cleanup and retention of rendered pages and other source-reconstructing
  artifacts;
- prompt-injection and hostile-document handling across both text and visual
  inputs;
- absence of credentials, session material, unnecessary personal data, and
  raw provider output from logs and diagnostics;
- no raw provider response persistence unless explicitly permitted by the
  approved design;
- preservation of the current broker/session privacy boundary.

Visual context can expose information that deterministic text extraction does
not retain, so the privacy review must cover both the content and the layout
representation. Local rendering does not by itself make a representation
safe to send to a provider.

## Provider portability implications

Original-document and rendered-page inputs may have different support across
providers, models, transports, deployment modes, request-size limits, and
pricing schemes. The future spike must record capability evidence per exact
provider/transport and fail closed when a requested representation is not
qualified.

The Nuvitae-owned canonical transcript/fragments/evidence contract should
remain stable across V1 and V2. Provider adapters may translate a qualified
input representation, but provider-native request and response formats must
not leak into the import domain.

## Trade-offs and risks

Potential benefits include better layout-aware relationships and fewer
association errors. Potential costs and risks include larger requests,
latency, token/cost impact, multimodal transport instability, provider lock-in,
format-specific rendering differences, additional sensitive-artifact
retention, image accessibility/quality issues, and more complex fallback and
qualification behavior.

V2 may also produce a more plausible but unsupported relationship. Additional
visual context therefore increases the importance of deterministic grounding;
it does not justify relaxing it. A multimodal provider failure must preserve a
safe V1 or deterministic fallback outcome rather than create an ungrounded
draft.

## Non-goals

This record does not authorize:

- replacing local extraction with LLM extraction;
- trusting model-generated facts without local evidence;
- removing the current text-only path;
- weakening grounding requirements;
- relaxing semantic validation;
- changing T246;
- retry-until-pass qualification;
- provider-specific architectural lock-in;
- implementation of PDF/image upload to Codex;
- production multimodal calls.

It also does not create active V2 implementation tasks or make V2 an approved
architecture.

## Future experimental comparison

After the V1 production path is stabilized, run a dedicated V2 spike using the
same documents for every strategy:

1. **Grounded Text Import — V1** (control);
2. **visual/document-only experimental path**, if technically possible; and
3. **Grounded Multimodal Import — V2**.

The corpus should include at least:

- a simple single-column resume;
- a two-column resume;
- a sidebar-heavy resume;
- a visually dense resume;
- a bilingual resume;
- PDF and DOCX forms;
- a resume where layout changes field relationships.

The current anonymous selectable smoke fixture remains one baseline case. The
same pinned documents, canonical extraction, evaluation contracts, and bounded
request budgets should be used for comparable runs. The experiment must record
when a strategy is technically unavailable instead of silently substituting a
different input path.

## Evaluation dimensions

Measure where technically possible, reusing canonical requirements and
thresholds where they already exist; do not invent new product pass thresholds
for this record:

- explicit supported-fact recall;
- priority-fact recall;
- grounding/evidence accuracy;
- unsupported or invented facts;
- field relationship accuracy;
- section classification accuracy;
- employer/title/date association;
- language/proficiency association;
- education grouping;
- professional-link extraction;
- latency;
- request size;
- token/cost impact where measurable;
- transport reliability;
- provider compatibility;
- fallback behavior.

The comparison must separate semantic quality from transport reliability,
provider availability, rendering quality, grounding validity, and fallback
behavior. It must preserve sanitized evidence and the existing privacy and
immutability rules.

## Qualification requirements before V2 implementation

Before implementation, the V2 spike must independently qualify the exact
provider/transport representation, local rendering or original-document
handling, request limits, response framing, cancellation, timeout behavior,
privacy/retention handling, grounding/evidence preservation, provider failure
mapping, and deterministic V1 fallback. It must use the same documents across
strategies and document unavailable capabilities as failures or limitations,
not as implicit support.

## V2 decision gate

V2 implementation work **MUST NOT** begin before V1 demonstrates all of the
following:

- stable production transport behavior;
- provider timeout does not crash the worker;
- response framing is handled reliably;
- one real Codex semantic response is accepted end-to-end through the
  production import pipeline; and
- real-provider recall is evaluated against the current simple smoke fixture.

This gate exists specifically to prevent unresolved V1 transport defects from
being carried into a new architecture. If any condition is unsatisfied, V2
remains documentation/research only.

## Current-state preservation and decision record

The current V1 execution plan remains unchanged. No V2 task is scheduled, and
no V2 task belongs in `tasks.md`. T203 remains **NO-GO**. T246 remains
**COMPLETE — qualification FAILED**; its evidence remains immutable and is not
reopened, rerun, weakened, or reinterpreted. T217 remains **COMPLETE**, with
its current provider/fallback budgets unchanged. Real-provider semantic recall
for the current production import pipeline remains **UNVERIFIED** until the
decision-gate smoke result is demonstrated.

The future decision after the V1 gate is not predetermined. The V2 spike may
recommend V1 only, original-document input, rendered-page input, a conditional
provider-specific capability, or no multimodal path. Any recommendation would
require a separate reviewed decision record and implementation plan.
