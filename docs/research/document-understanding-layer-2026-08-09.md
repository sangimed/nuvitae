# Document Understanding Layer Evaluation

**Status**: PROPOSED / SPIKE REQUIRED / NOT IMPLEMENTED  
**Recorded**: 2026-08-09  
**Scope**: Architecture/research reconciliation only  
**Decision**: No production engine selected

## Purpose

Nuvitae's active V1 implementation uses Nuvitae-owned deterministic PDF/DOCX
physical extraction. That path remains required, supported, and test-covered.
This record does not replace it, install another engine, change runtime
behavior, or authorize provider/OAuth/network activity.

The longer-term architectural question is broader than character extraction.
Born-digital PDF and DOCX documents carry meaning through reading order,
sections/headings, lists, tables, spatial grouping, styles, figures/assets,
bounding boxes, and provenance. Nuvitae therefore proposes a provider-neutral
Document Understanding Layer rather than treating the current PDF.js/OOXML
parser shape as the permanent architecture.

## Proposed boundary

```text
validated born-digital PDF/DOCX
        ↓
DocumentUnderstandingProvider (proposed; interface not implemented)
        ↓
canonical NuvitaeDocument
        ↓
semantic-provider boundary
        ↓
nuvitae.semantic-extraction.v2
        ↓
Nuvitae canonicalization / grounding / identity / review
```

The conceptual provider accepts a validated PDF or DOCX and returns a
Nuvitae-owned `NuvitaeDocument`. The import and semantic domains must not
depend on `DoclingDocument`, PyMuPDF dictionaries, Azure `analyzeResult`,
Unstructured elements, Apryse JSON, Google DocumentLayout output, Adobe PDF
Extract JSON, or any other parser-native schema.

`NuvitaeDocument` is a canonical runtime/document representation, not a
persistence design. Its minimum future scope is:

- import-scoped document identity, source format, MIME type, language, and
  bounded engine/version/configuration metadata;
- page identity/number and dimensions where available;
- stable Nuvitae-owned block or fragment ids, text, block type, reading order,
  page reference, optional bounding box, and provenance;
- section hierarchy and grouping;
- tables with rows, columns, cells, and spans where supported;
- optional deterministic style signals;
- retained figures/images/assets when allowed and useful;
- mappings from canonical content to source document locations; and
- bounded extraction quality indicators.

The runtime representation is distinct from source-reconstructing temporary
artifacts such as uploads, raw extraction output, rendered pages, and cached
parser results. It is also distinct from structured resume domain state, which
is created only after review and confirmation and must survive source deletion
without retaining raw source reconstruction.

## Current V1 implementation truth

The current implementation remains:

```text
PDF → PDF.js/pdfjs-dist → page/text-item provenance → normalized transcript
DOCX → yauzl + fast-xml-parser → OOXML provenance
DOCX → isolated LibreOffice → rendered PDF page-count validation
```

`packages/extraction` owns this deterministic physical extraction layer. It
is active for V1, required until a replacement decision, and must not be called
deprecated. Its native PDF/DOCX provenance remains authoritative for the
current V1 grounding and review path. It is a candidate implementation behind
the future Document Understanding boundary, but it is not declared the
long-term document-understanding architecture.

## Initial benchmark hypothesis

The first controlled comparison is intentionally only:

```text
Current Nuvitae extractor  vs  Docling
```

Docling is the first candidate worth benchmarking because it appears to offer
PDF and DOCX support, structured document output, layout and reading-order
reconstruction, bounding boxes/provenance, local or self-hosted execution, and
provider-independent structured output. These are reasons to test it, not
selection evidence. Docling has not been benchmarked against the Nuvitae
corpus and is **not selected as the production parser or engine**.

The first question is:

> Can Docling replace or substantially simplify Nuvitae's custom physical
> document extraction and layout reconstruction while preserving the canonical
> grounding contract?

Do not benchmark five engines initially. A later candidate benchmark is allowed
only if the first comparison shows that both options are inadequate.

## Initial corpus

Use a deliberately small corpus of approximately 10–20 representative resumes,
with pinned input bytes and deterministic capture of outputs. The corpus should
include:

### PDF cases

- the existing anonymous simple selectable-text smoke fixture;
- simple single-column layout;
- two-column layout with difficult reading order;
- sidebar-heavy layout;
- visually grouped skills;
- links or icons;
- simple table/layout structures; and
- French and bilingual French-English fixtures where useful.

### DOCX cases

- headings and styles;
- lists;
- tables;
- columns where supported;
- links;
- nested or compact structures; and
- existing French/bilingual or anonymous fixtures where useful.

The corpus should include the existing anonymous simple smoke fixture and the
existing French/bilingual fixtures where they exercise meaningful behavior. It
must not expand into a 1,000-document corpus during this spike.

## Comparison dimensions

Compare the current extractor and Docling on the same documents and record
unavailable capabilities explicitly:

- exact textual recall;
- reading order;
- section and block reconstruction;
- list reconstruction;
- table representation where relevant;
- stable source references;
- bounding boxes and provenance;
- PDF/DOCX consistency;
- latency;
- CPU/RAM requirements;
- Docker integration complexity;
- license implications;
- privacy and egress;
- compatibility with `NuvitaeDocument`; and
- compatibility with `nuvitae.semantic-extraction.v2`.

The most important product-level question is whether the richer document
representation improves downstream semantic extraction and grounding without
introducing unacceptable complexity. Engine-level output quality must therefore
be assessed together with a bounded semantic-provider projection and the
existing Nuvitae grounding contract; a visually plausible structure is not
accepted as proof by itself.

## Grounding compatibility requirements

Any candidate output must be normalizable into Nuvitae-owned blocks/fragments
with stable import-scoped ids. The semantic provider must receive Nuvitae-owned
source references, not engine-native ids. Conceptually:

```text
NuvitaeDocument block
  id = fragment-17
  text = "Backend Engineer"
  provenance = ...

provider response
  value = "Backend Engineer"
  sourceRefs = [{ fragmentId: "fragment-17", quote: "Backend Engineer" }]
```

Nuvitae resolves `fragment-17`, verifies the quote/value, reconstructs exact
canonical evidence, derives application identity, and applies fail-closed
acceptance. This preserves **“LLM for understanding. Nuvitae for proof.”**

The benchmark must prove that the engine candidate can support this contract
without leaking native schemas or requiring the semantic provider to predict
physical page/item/run coordinates. Native provenance may be retained and
enriched deterministically after semantic acceptance where available.

## Allowed outcomes

The spike must remain decision-neutral and may conclude any of:

1. keep the existing Nuvitae extractor;
2. replace most physical extraction with Docling;
3. use Docling only for complex layouts;
4. use the current extractor as a fast path and Docling as a richer path; or
5. run another candidate benchmark if both are inadequate.

No routing or multi-engine architecture is preselected. Any outcome that
changes the runtime path requires a separate reviewed architecture decision,
implementation plan, dependency review, security/privacy review, and migration
work. The benchmark itself does not become a T203 blocker.

## Status and non-goals

This is a future spike, not scheduled production work and not a V2
implementation task. It does not authorize:

- installing Docling or adding production dependencies;
- replacing PDF.js or the OOXML extraction stack;
- changing the current runtime extraction path;
- implementing `DocumentUnderstandingProvider`;
- implementing or persisting `NuvitaeDocument`;
- rendering new page-image representations;
- making multimodal provider calls;
- implementing `nuvitae.semantic-extraction.v2`;
- implementing parser routing or integrating Apryse, Azure, PyMuPDF, Google,
  Adobe, Unstructured, or other engines in production;
- reopening, rerunning, weakening, or reinterpreting T246;
- changing T203 from NO-GO or T217 from COMPLETE; or
- performing live provider, OAuth, credential, or network activity.

Grounded Multimodal Import (V2) remains **PROPOSED / POST-V1 SPIKE / NOT
IMPLEMENTED**. Multimodality is an optional capability layered on top of
document understanding, not a requirement for the future architecture.

## Preserved qualification state

- V1 Grounded Text Import is active.
- T203 remains **NO-GO**.
- T246 remains **COMPLETE — qualification FAILED**, immutable and not subject
  to rerun or reinterpretation.
- T217 remains **COMPLETE** with its existing fallback budgets and behavior.
- T201 remains unchanged.
- Real-provider semantic recall remains **UNVERIFIED**.
- The latest semantic live failure `sections.headline -> invalid_type` remains
  a provider-contract/validation record, not a document-extraction failure.
- This record performs no provider/OAuth/network activity and makes no
  commit/push.
