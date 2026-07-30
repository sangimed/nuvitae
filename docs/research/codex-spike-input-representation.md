# Codex Subscription Spike: Input Representation

Date: 2026-07-30

Scope: T141 only. This artifact evaluates PDF and DOCX input strategies for a possible Codex-based semantic parser.

## Decision

Selected spike representation for any later authenticated experiment: controlled combination of deterministic extracted text with stable source locations plus a compact layout summary. Original files and rendered page images are rejected for the first production adapter unless an official Codex interface documents file/image handling, evidence anchoring, and privacy behavior suitable for this use.

Because no official subscription-authenticated third-party integration was found, this selection is a design conclusion from supported Nuvitae extraction foundations and CLI capability evidence, not a successful provider quality measurement.

## Verified Official Behavior

- `codex exec` accepts image attachments through `--image <FILE>`: <https://developers.openai.com/codex/cli/reference/>
- The CLI reference does not document direct PDF or DOCX file attachment flags for `codex exec`.
- The CLI supports prompt/stdin input and structured final-output capture: <https://developers.openai.com/codex/cli/reference/>

## Experimentally Observed Behavior

Repository foundations already implement deterministic physical extraction:

- PDF.js text extraction with page and text-item provenance.
- Office Open XML DOCX text extraction with package-part, paragraph/table/cell, run, and character-offset provenance.
- LibreOffice-based DOCX rendered page count only inside parser/worker images.
- Parser tmpfs isolation and no-partial-output commit semantics.

Existing fixture manifest categories cover the required spike matrix: French, English, bilingual French-English, PDF, DOCX, and partial/failure categories.

The manifest is not yet sufficient for measured semantic-parser precision because several realistic anonymous fixture binaries and expected semantic JSON outputs belong to later tasks T169-T170.

## Strategy Evaluation

| Strategy | PDF | DOCX | Evidence | Latency | Privacy | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Original file | Unverified | Unverified | Unverified | Unverified | Highest source exposure | Rejected for now |
| Rendered page images | Possible through `--image` for PDFs rendered to images | Possible after DOCX render | Weak text anchors unless OCR/evidence mapping is added | Higher | High exposure | Rejected for now |
| Extracted text with source locations | Supported by Nuvitae foundations | Supported by Nuvitae foundations | Strongest deterministic anchors | Lowest expected | Lowest necessary exposure | Selected |
| Controlled combination | Text/source locations plus layout hints | Text/source locations plus table/section hints | Strong anchors with grouping cues | Moderate | Controlled | Selected for later experiment |

## Selected Representation

For each fixture, prepare a provider input object containing document metadata, ordered source fragments with stable identifiers, PDF locations, DOCX locations, layout hints, and no raw binary source, user identifiers, storage keys, credentials, or logged source snippets.

## Inference

Text-plus-source-location input is the only candidate that supports strict evidence validation without giving the model more document data than necessary. Rendered images may help with multi-column grouping, but they add image handling, latency, and source exposure without solving evidence validation.

## Unresolved Questions

- Whether Codex can reliably preserve supplied source fragment IDs in final structured output.
- Whether multi-column grouping quality drops below acceptable thresholds without rendered images.
- Whether DOCX table/run provenance is understandable enough for the model.

## Blockers

- No authenticated provider run was possible under the constraints.
- Expected semantic outputs for the full fixture suite are planned later and were not created in this bounded task slice.

## Security Concerns

- Original files and rendered images increase exposure of personal data and make evidence validation harder unless official provider file semantics are documented.
- DOCX should not be handed to a provider before deterministic macro/object and rendered-page validation.

## Product Implications

Initial provider design should invest in deterministic source preparation and evidence anchors. Product copy must not claim original PDF/DOCX interpretation or visual layout fidelity until those modes are measured and accepted.
