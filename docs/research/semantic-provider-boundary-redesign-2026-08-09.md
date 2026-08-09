# Semantic-provider boundary redesign

**Recorded**: 2026-08-09
**Status**: Architecture decision; implementation not started
**Scope**: V1 Grounded Text Import and the transversal provider boundary
**Out of scope**: live provider/OAuth calls, T246, and Grounded Multimodal Import V2 implementation

## Decision summary

Nuvitae will introduce an explicit `nuvitae.semantic-extraction.v2`
provider-response boundary. The provider will return semantic values, logical
section/grouping, semantic relationships only when they cannot be derived from
that grouping, and source-reference hints. It will not return Nuvitae
application IDs, canonical evidence coordinates, hashes, normalized domain
values, classification, confidence, persistence metadata, review prose, or
provider diagnostics that duplicate Nuvitae policy.

The canonical rule is:

> **LLM for understanding. Nuvitae for proof.**

The provider's `sourceRefs` are untrusted locating hints. Nuvitae resolves them
against the source-fragment registry, reconstructs exact evidence, derives
deterministic values and policy metadata, and accepts only independently
grounded fields. A malformed or ungrounded field is rejected without making
the rest of a valid response unusable; malformed transport or an unusable
top-level envelope remains a whole-response failure.

V1 remains **Grounded Text Import = active**. V2 remains
**Grounded Multimodal Import = PROPOSED / POST-V1 SPIKE / NOT IMPLEMENTED**.

## Current provider-boundary diagnosis

The current path is:

```text
PDF/DOCX
  -> deterministic extraction and normalized transcript
  -> ResumeSemanticParseRequest with source fragments
  -> provider instructions and Codex adapter
  -> nuvitae.semantic-extraction.v1 response validation
  -> evidence / no-invention / conflict validation
  -> semantic candidate mapper
  -> review draft and warnings
  -> reviewed draft confirmation
  -> structured resume and evidence persistence
```

The request construction is Nuvitae-owned and currently produces the canonical
normalized transcript, fragment text, fragment hashes, line numbers, and
bounds. The provider is then required to reproduce enough of that internal
representation to satisfy `semanticValueSchema` and `semanticEvidenceSchema`.
The mapper subsequently regenerates application candidate IDs, while the
review and persistence layers use those IDs and the canonical evidence again.
That is duplicated ownership across three boundaries.

The latest live state supplied for this review is:

- transport, owner-bound provider resolution, HTTP, headerless SSE, completion,
  worker timeout/crash handling, JSON parsing, and semantic validation reach
  have succeeded;
- `candidateId` is no longer the architectural blocker after the offline
  ownership correction;
- the latest semantic rejection was `sections.headline -> invalid_type`;
- this is further evidence that the provider contract is coupled to the
  internal canonical representation rather than evidence that the provider
  successfully recalled the headline;
- no further live retry should occur until this boundary is redesigned or a
  separately justified exception is recorded.

The raw latest response is not treated as recoverable evidence. No claim is
made about its exact shape beyond the reported validation path.

## Field-by-field ownership matrix

The matrix uses these ownership classes:

| Class | Meaning                                                                           |
| ----- | --------------------------------------------------------------------------------- |
| A     | Provider-owned semantic information: interpretation or logical grouping           |
| B     | Source reference / grounding hint supplied to help Nuvitae locate source material |
| C     | Nuvitae-owned application identity                                                |
| D     | Nuvitae-owned canonical proof/evidence                                            |
| E     | Nuvitae-owned policy or deterministically derived metadata                        |
| F     | Unnecessary or duplicated responsibility at this boundary                         |

### Envelope, sections, and semantic values

| Current output field                                                                                                     | Current class                | Boundary decision                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                                                                                                          | F                            | Retain only as protocol negotiation. It is not semantic data and must never be used as a model-owned domain field. V2 uses `nuvitae.semantic-extraction.v2`.                                          |
| `documentLanguage.value`                                                                                                 | A/E                          | Nuvitae's deterministic language detector is authoritative for V1. Remove the duplicated provider classification from the V2 response; a future provider signal can be advisory only.                 |
| `documentLanguage.confidence`                                                                                            | E                            | Remove. Confidence is a Nuvitae policy result, not a provider assertion.                                                                                                                              |
| `documentLanguage.evidence`                                                                                              | D/B                          | Remove canonical coordinates and use no provider evidence for this duplicated V1 classification. Any future advisory signal uses source-reference hints only.                                         |
| `sections`                                                                                                               | A                            | Retain as logical semantic grouping, but define it as a provider-neutral vocabulary rather than a persistence or review object.                                                                       |
| `sections.contact`                                                                                                       | A                            | Retain as the logical contact group.                                                                                                                                                                  |
| `sections.contact.fullName`, `.email`, `.phone`, `.location`, `.website`                                                 | A                            | Retain as semantic values with source-reference hints. Nuvitae validates and canonicalizes them.                                                                                                      |
| `sections.headline`, `sections.summary`                                                                                  | A                            | Retain as nullable semantic values. The provider supplies the interpretation; Nuvitae owns acceptance and display representation.                                                                     |
| `sections.workExperience`                                                                                                | A                            | Retain as semantic work grouping. The array order is a response-local ordering hint, not an application identity.                                                                                     |
| `employerName`, `employerLocation`, role `title`, `location`, `startDate`, `endDate`, `responsibilities`, `achievements` | A                            | Retain as semantic values where the current product maps them. Each value carries only source-reference hints.                                                                                        |
| role `isOngoing` boolean                                                                                                 | A/E                          | Remove from provider output. It is an internal convenience representation. Nuvitae derives it only from an explicitly grounded end-date/current-status mention using deterministic rules.             |
| `sections.education` with `institution`, `degree`, `fieldOfStudy`, `startDate`, `endDate`, `location`                    | A                            | Retain as semantic values. Missing optional values remain `null`; an absent start date does not invalidate an explicit end date.                                                                      |
| education `details`                                                                                                      | F for current V1             | The current mapper rejects it and the structured destination has no corresponding supported field. Do not ask the provider to emit it until a product field and mapper exist.                         |
| `sections.skills[].name`                                                                                                 | A                            | Retain as one semantic value per listed skill. Do not require a provider candidate ID or grouped canonical list.                                                                                      |
| `sections.skills[].category`                                                                                             | A in theory; F in current V1 | The current mapper does not consume category. Remove from the minimal contract until category has a supported structured destination and review policy.                                               |
| `sections.languages[].name`, `.proficiency`                                                                              | A                            | Retain as independent semantic values. A missing proficiency is valid and must not suppress the language name.                                                                                        |
| `sections.projects[].name`, `.description`                                                                               | A                            | Retain only the fields currently supported by the V1 mapper.                                                                                                                                          |
| project `technologies`, `links`                                                                                          | F for current V1             | The current mapper rejects these values or does not persist them through this path. They require a separate product/mapping decision before re-entering the provider contract.                        |
| `sections.certifications[].name`, `.issuer`                                                                              | A                            | Retain as semantic values where supported.                                                                                                                                                            |
| certification `.date`                                                                                                    | F for current V1             | The current mapper rejects it. It must be added to the destination and canonicalizer before being requested from a provider.                                                                          |
| `sections.professionalLinks[]`                                                                                           | A                            | Retain as semantic link values with source-reference hints. URL parsing and canonical link representation are Nuvitae-owned.                                                                          |
| semantic value `.value`                                                                                                  | A                            | Retain as the provider's semantic interpretation, subject to exact source verification. It is not authoritative until canonicalization succeeds.                                                      |
| semantic value `.normalizedValue`                                                                                        | E                            | Remove. Nuvitae deterministically normalizes text, URLs, dates, and typed values after grounding.                                                                                                     |
| semantic value `.classification`                                                                                         | E                            | Remove. Accepted scalar values are explicit only when Nuvitae verifies them against source. Inferred scalar values are rejected or quarantined for review; the provider cannot promote them to facts. |
| semantic value `.confidence`                                                                                             | E                            | Remove. Nuvitae derives confidence/review policy from match quality, ambiguity, conflicts, and deterministic parsing.                                                                                 |
| nullable semantic-value wrappers                                                                                         | F                            | Keep `null`/`[]` as minimal absence/cardinality markers where the logical contract needs them, but remove the current wrapper's internal evidence/classification/metadata bundle.                     |

### Identity and evidence

| Current output field                              | Current class | Boundary decision                                                                                                                               |
| ------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| candidate `.candidateId`                          | C             | Remove. The provider cannot know Nuvitae's application identity. Nuvitae generates a structural candidate identity after canonicalization.      |
| relationship `.candidateId`                       | C             | Remove. Nuvitae generates a persistence/review relationship identity if one is needed.                                                          |
| relationship `.fromCandidateId`, `.toCandidateId` | C             | Remove. Replace with semantic endpoint mentions and source references; Nuvitae resolves those mentions to accepted candidates.                  |
| evidence `.fragmentId`                            | B             | Replace with `sourceRefs[].fragmentId`. The provider may name only a Nuvitae-supplied source fragment; the reference is a hint, not proof.      |
| evidence `.line`, `.start`, `.end`                | D             | Remove from provider output. Nuvitae reconstructs exact line and half-open character offsets from its own fragment registry.                    |
| evidence `.fragmentHash`                          | D             | Remove from provider output. Nuvitae calculates and checks the hash from the source fragment it owns.                                           |
| evidence arrays attached to semantic values       | D/B           | Replace with bounded `sourceRefs` containing fragment IDs and exact quoted source hints. Nuvitae emits the canonical evidence array.            |
| object-level/shared evidence                      | D             | Never accept it. Evidence is reconstructed per accepted semantic value and per accepted relationship.                                           |
| page, item, physical coordinates, bounding boxes  | D/F           | Never belong in the V1 semantic response. Physical enrichment remains a deterministic post-model concern and is not required for this redesign. |

### Relationships and diagnostics

| Current output field                                      | Current class             | Boundary decision                                                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| relationship `.relationshipType`                          | A                         | Retain only for relationships that cannot be derived from the logical grouping. The allowed vocabulary remains Nuvitae-controlled.                                                                                |
| relationship `.evidence`                                  | D/B                       | Replace with endpoint/source reference hints. Nuvitae reconstructs proof and decides whether the relation is reviewable.                                                                                          |
| relationship `.confidence`                                | E                         | Remove. An inferred relation is a review-policy decision, not a provider confidence assertion.                                                                                                                    |
| ambiguity/conflict `.code`                                | A for the semantic signal | Retain only as a bounded semantic kind where it changes interpretation or review. Nuvitae owns the allowed vocabulary.                                                                                            |
| ambiguity/conflict `.message`, `.severity`, `.safeDetail` | E                         | Remove. Nuvitae owns safe wording, severity, recovery actions, and review presentation.                                                                                                                           |
| ambiguity/conflict `.evidence`                            | D/B                       | Replace with `sourceRefs`; Nuvitae verifies and reconstructs evidence.                                                                                                                                            |
| `privacyWarnings[].code` for prompt-like source content   | A/E                       | A provider may optionally signal that it ignored instruction-like content, but this is not a factual field. Prefer a Nuvitae safety signal plus deterministic policy rather than provider-authored warning prose. |
| `source_contains_sensitive_personal_data`                 | E                         | Remove from provider output. Privacy classification and logging policy are Nuvitae-owned.                                                                                                                         |
| `provider_output_redacted`                                | F                         | Transport/provider telemetry, not semantic output. Keep it in bounded adapter metadata if required, never in the semantic contract.                                                                               |
| `source_fragment_reference_only`                          | F                         | Duplicates the source-reference contract and adds no semantic value. Remove.                                                                                                                                      |
| diagnostics arrays as a whole                             | F/A                       | Replace with optional bounded ambiguity/conflict signals only when they add semantic information not derivable by Nuvitae. Nuvitae generates diagnostics for all validation and policy failures.                  |

## Fields that leave the provider contract

The following current responsibilities are explicitly removed in V2:

- `candidateId`, relationship IDs, endpoint candidate IDs, and any persistence
  or review identity;
- `normalizedValue`, `classification`, and `confidence`;
- `line`, `start`, `end`, `fragmentHash`, physical coordinates, and canonical
  flattened evidence records;
- diagnostic messages, severities, safe-detail text, and Nuvitae recovery
  policy;
- document-language confidence/evidence (Nuvitae's deterministic language
  detector remains authoritative for V1);
- unsupported or currently unmapped fields such as education `details`, skill
  `category`, project `technologies`/`links`, and certification `date`;
- boolean `isOngoing` as an internal date-range representation;
- provider-output/privacy/transport diagnostics that do not carry semantic
  information.

This is not a relaxation. It removes provider serialization obligations while
adding a stronger deterministic verification step at the Nuvitae boundary.

## Minimal provider-owned semantic contract: V2

The response version is explicitly `nuvitae.semantic-extraction.v2`.

The reusable atom is:

```json
{
  "value": "Backend Engineer",
  "sourceRefs": [
    {
      "fragmentId": "fragment-7",
      "quote": "Backend Engineer"
    }
  ]
}
```

`value` is the provider's semantic interpretation. `quote` is an exact source
substring hint, not canonical evidence. The provider must not return a hash,
line, offset, classification, confidence, or application ID.

The logical shape is:

```json
{
  "schemaVersion": "nuvitae.semantic-extraction.v2",
  "sections": {
    "contact": {
      "fullName": {
        "value": "Ada Lovelace",
        "sourceRefs": [{ "fragmentId": "fragment-1", "quote": "Ada Lovelace" }]
      },
      "email": null,
      "phone": null,
      "location": null,
      "website": null
    },
    "headline": {
      "value": "Backend Engineer",
      "sourceRefs": [
        { "fragmentId": "fragment-7", "quote": "Backend Engineer" }
      ]
    },
    "summary": null,
    "workExperience": [],
    "education": [],
    "skills": [
      {
        "value": "TypeScript",
        "sourceRefs": [{ "fragmentId": "fragment-12", "quote": "TypeScript" }]
      }
    ],
    "languages": [],
    "projects": [],
    "certifications": [],
    "professionalLinks": []
  },
  "relationships": [],
  "ambiguities": [],
  "conflicts": []
}
```

The example is illustrative. The exact V2 schema must preserve the current
product's supported logical fields, with these rules:

- nullable logical scalar fields are `null`; absent collections are `[]`;
- every returned scalar is an atom with at least one bounded source reference;
- source references contain only a Nuvitae-owned `fragmentId` and bounded exact
  `quote`;
- work, education, projects, and similar nested arrays represent semantic
  grouping, not persistence identity;
- nested grouping supplies relationships that Nuvitae can derive, so those
  relationships are not returned a second time;
- a relationship is returned only when semantic inference is genuinely needed,
  and uses endpoint atoms/source references rather than candidate IDs;
- ambiguity/conflict signals contain only a bounded kind and source references;
  Nuvitae supplies messages, severity, review state, and recovery actions;
- document language is not repeated in the response for V1 because it is
  already deterministically classified by Nuvitae; a future provider signal is
  advisory only and cannot override the local classification;
- unsupported destination fields are not present merely because a provider can
  understand them.

For a relationship that cannot be derived from nesting, the conceptual shape
is:

```json
{
  "type": "skill_belongs_to_category",
  "from": {
    "value": "TypeScript",
    "sourceRefs": [{ "fragmentId": "fragment-12", "quote": "TypeScript" }]
  },
  "to": {
    "value": "Programming Languages",
    "sourceRefs": [
      { "fragmentId": "fragment-13", "quote": "Programming Languages" }
    ]
  },
  "sourceRefs": [
    { "fragmentId": "fragment-12", "quote": "TypeScript" },
    { "fragmentId": "fragment-13", "quote": "Programming Languages" }
  ]
}
```

The endpoint atoms are semantic mentions, not references to Nuvitae's internal
candidate graph. Nuvitae may discard the relationship if it cannot resolve
both endpoints to accepted canonical values.

## Recommended source-reference mechanism

| Option                            | Grounding strength                                                                          | Prompt burden | Formatting robustness                                            | V2/Docling compatibility                              | Decision                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Fragment ID only                  | Low to medium: Nuvitae still has to locate the value and can face repeated matches          | Low           | High                                                             | High                                                  | Insufficient alone because first-match selection would be unsafe |
| Fragment ID + exact quoted value  | High: Nuvitae can verify the fragment, quote, value, and occurrence before deriving offsets | Medium        | High; no provider coordinate arithmetic                          | High; any extractor can expose canonical fragments    | **Recommended**                                                  |
| Fragment ID + local-relative span | High in theory                                                                              | High          | Low; offsets are sensitive to whitespace and provider formatting | Medium; couples the contract to one extraction layout | Reject as canonical mechanism; Nuvitae derives spans             |
| Semantic value only               | Low: the value may repeat or not be present verbatim                                        | Lowest        | High                                                             | High                                                  | Reject for accepted facts; it cannot safely establish provenance |

V2 therefore uses **fragment ID plus exact quoted value**. The provider's quote
is a locating hint. Nuvitae verifies it against the canonical fragment and
derives the authoritative half-open range, line, fragment hash, and canonical
fragment ID. When a quote is larger than the semantic value, Nuvitae must still
find the value within that quote deterministically; it may not select the first
occurrence without proving uniqueness.

This mechanism is future-compatible with a provider-neutral
`NuvitaeDocument`: Docling or another extractor can expose equivalent stable
canonical fragments and quoted text without forcing the provider to know PDF
pages, DOCX runs, layout coordinates, or homemade extraction internals.

## Nuvitae-owned canonicalization pipeline

```text
provider V2 JSON
  -> bounded JSON and V2 structural validation
  -> sourceRef resolution against request-local fragment registry
  -> quote/value occurrence verification
  -> deterministic exact range reconstruction
  -> typed canonical value normalization
  -> application candidate/field/relationship identity generation
  -> grounding, no-invention, conflict, and review policy
  -> canonical fields + canonical evidence + warnings
  -> review draft
```

For each accepted provider atom, Nuvitae performs the following:

1. Resolve every `fragmentId` against the request's source-fragment registry.
   The registry is retained by Nuvitae and includes text, order, line, bounds,
   and hash; none of those proof fields are accepted from the provider.
2. Verify the quote is a non-empty exact substring after the existing bounded
   NFKC/whitespace normalization. Verify the semantic `value` is present in
   the quoted range, or is produced by an explicitly allowlisted deterministic
   conversion for the target type. Reject unsupported transformations.
3. Require one unambiguous occurrence for the target field. Repeated matches,
   unknown fragments, mismatched quotes, and cross-fragment ambiguity are
   rejected rather than resolved by ordering.
4. Reconstruct `line`, `start`, `end`, `fragmentHash`, and `fragmentId` from
   the matched Nuvitae fragment. The canonical value uses the verified source
   text (with Nuvitae's deterministic display normalization), not an
   unverified provider rewrite.
5. Derive typed values where deterministic: years/dates, date ranges, ongoing
   status from an explicit current-status token, URLs, language values, and
   duplicate keys. `normalizedValue` is calculated here if the domain still
   needs it; it is never provider-authored.
6. Mark a scalar `explicit_source` only after the source match succeeds.
   Scalar semantic inference that cannot be tied to a source substring is not
   accepted. An inferred relationship may be retained as a review-required
   relation only when its endpoints and source references independently pass.
7. Derive confidence and review status from deterministic match quality and
   policy. An exact unique match can be `high`; a deterministic normalized
   match can be `medium`; ambiguous or unsupported matches are rejected or
   quarantined with a Nuvitae warning. Provider confidence is never used.
8. Generate `candidate-{importId}-{structuralPath}` only after accepted
   semantic grouping is canonicalized. Generate `ExtractedField` IDs,
   relationship IDs, review operation IDs, and confirmation child IDs in their
   existing Nuvitae-owned layers.
9. Emit canonical `MappedEvidenceReference` records using the reconstructed
   coordinates and generated application candidate ID. Persist only the
   canonical result graph and bounded validation metadata; do not persist raw
   provider output.
10. Pass only canonical candidates into the existing mapper, draft/review
    workflow, and confirmation mapper. Confirmation continues to operate on
    reviewed `ExtractedField` values and does not depend on provider identity.

The current `line/start/end/fragmentHash/fragmentId` evidence model remains a
valid Nuvitae persistence representation. It moves after the provider
boundary; it does not disappear from the application.

## Fail-closed grounding behavior

| Failure                                                                                                               | Deterministic result                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `sourceRefs` missing or empty for a returned value                                                                    | Reject that value; never accept a value-only fact.                                                       |
| Unknown `fragmentId`                                                                                                  | Reject that value or relationship endpoint; emit a privacy-safe validation diagnostic.                   |
| Quote missing from its referenced fragment                                                                            | Reject the value. Do not search unrelated fragments.                                                     |
| Semantic value absent from the quoted source or not produced by an allowlisted deterministic conversion               | Reject as unsupported/invented.                                                                          |
| Multiple valid occurrences                                                                                            | Reject the value as ambiguous; do not choose the first or nearest match.                                 |
| Provider-invented value with otherwise valid JSON                                                                     | Reject only that value, preserve independently accepted values, and create a Nuvitae warning/diagnostic. |
| Section/group assignment is structurally impossible or targets an unsupported destination field                       | Reject the affected field/section item; do not silently reclassify it into another section.              |
| Relationship endpoint cannot resolve to an accepted canonical value, or its type is impossible for the endpoint kinds | Reject the relationship only. Never create a ghost candidate or ID.                                      |
| Malformed provider JSON, unsupported V2 version, oversized response, or invalid top-level envelope                    | Reject the whole provider result and follow existing bounded fallback/terminal recovery.                 |
| Provider diagnostic is malformed or has unsupported policy text                                                       | Ignore the diagnostic as non-authoritative; facts still require independent canonical validation.        |

Accepted fields must pass grounding and no-invention independently. Partial
acceptance is never an exception to those checks.

## Whole-response rejection strategy

| Model                                 | Safety                                                                                        | Product cost                                                                                                  | Decision                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A. All-or-nothing                     | Simple and conservative, but discards valid facts because of one malformed field              | High loss of recall and repeats schema-whack-a-mole pressure                                                  | Keep for malformed transport/top-level envelopes only                         |
| B. Field-level fail-closed acceptance | Each atom independently proves its source; malformed/invented atoms are excluded              | Best preservation of valid grounded facts; requires a canonicalization result with rejected-field diagnostics | **Recommended for V2 scalar values and relationships**                        |
| C. Section-level acceptance           | Easier than field-level but loses valid contact/skills/etc. when one item in a section is bad | Medium loss; a malformed collection can still hide safe values                                                | Use only when an entire section cannot be structurally parsed as a collection |

The V2 validator should therefore have two stages:

- A valid JSON/top-level V2 envelope is required. A malformed envelope, unknown
  version, response-size violation, or impossible top-level type remains a
  whole-response failure.
- Within a structurally valid envelope, each section item, semantic atom,
  source reference, and relationship is validated independently. A bad atom is
  rejected with a privacy-safe path/code; other atoms continue. A malformed
  section collection is rejected at section scope only when its items cannot be
  safely isolated.

The response is usable only if at least one accepted candidate remains and the
existing draft threshold is met. A response with zero accepted candidates is a
normal semantic failure and follows the existing bounded recovery path. This
model does not accept an unsupported fact merely because another field passed.

## V1 compatibility

The immediate V1 path is:

```text
normalized transcript
  + Nuvitae canonical source fragments
  -> V2 semantic provider response
  -> V2 validation
  -> deterministic Nuvitae canonicalization
  -> grounding/no-invention/policy validation
  -> existing candidate mapper
  -> review draft
```

No multimodal input is required. The current extraction adapters, normalized
transcript, bounded worker, owner-bound provider resolution, T217 fallback,
review, confirmation, and source-retention behavior remain in place.

The response boundary is the change. The provider adapter may build a smaller
provider-facing fragment envelope from the existing request while keeping the
full Nuvitae source registry private to canonicalization. V1 can therefore
adopt V2 without changing the deterministic PDF/DOCX extraction architecture.

## V2 / Docling compatibility

The decision is intentionally independent of PDF text items, DOCX runs, page
coordinates, and the current `fragment-{order + 1}` construction. Those are
Nuvitae-owned source-registry details. A future Docling-backed or other
provider-neutral `NuvitaeDocument` layer can expose equivalent logical source
fragments and stable IDs, while a deterministic enrichment layer can retain
physical provenance after semantic acceptance.

V2 may add visual/document context as an additional provider input in a future
spike. It must still return the same class of semantic atoms and source hints;
visual input cannot replace canonical text evidence, relax grounding, or make a
provider-native output the source of truth. No V2 implementation work is
authorized by this record.

## Migration and versioning plan

The response shape changes materially, so the old contract must not be mutated
invisibly.

### Old boundary

`nuvitae.semantic-extraction.v1` remains readable for historical fixtures,
qualification artifacts, and compatibility tests. Its current all-or-nothing
validator and flattened evidence shape are preserved as a versioned legacy
path. Historical evidence is not rewritten.

### New boundary

`nuvitae.semantic-extraction.v2` owns only semantic atoms, grouping, optional
semantic relationships, and source-reference hints. The production Codex
adapter switches to the V2 instruction/schema pair only after offline tests
pass.

### Adapter and mapper migration

1. Add V2 contract types and a strict bounded structural validator. Keep V1
   exports and tests intact.
2. Add a narrow V1-to-canonical adapter for deterministic fixtures and any
   historical reader that must feed the new mapper. It validates V1 evidence
   first, converts valid ranges to `sourceRefs`/verified occurrences, strips
   legacy IDs and metadata, and rejects ambiguous conversions. It must not
   turn invalid V1 evidence into accepted V2 facts.
3. Add the V2 canonicalization module. Make the candidate mapper consume its
   canonical result rather than provider-shaped response objects. Remove the
   legacy provider-ID alias path once all V1 compatibility reads are behind the
   adapter.
4. Generate application candidate IDs, field IDs, evidence records,
   relationship IDs, warnings, and confirmation child IDs only in the existing
   Nuvitae layers.
5. Update semantic response persistence to accept both historical `v1` and
   new `v2` schema versions without rewriting rows. New responses persist as
   `v2`; evidence rows remain canonical Nuvitae rows.
6. Update the provider instruction fingerprint and deterministic fixture
   providers to produce V2 at the provider boundary. Preserve separate V1
   historical/evaluator fixtures so qualification evidence remains interpretable.

### Tests and compatibility handling

The migration requires focused offline coverage for:

- V2 shape acceptance and rejection of candidate IDs, normalized values,
  confidence/classification, canonical coordinates, physical coordinates, and
  diagnostics prose;
- quote/reference resolution, exact and normalized matching, unknown fragments,
  missing references, repeated matches, unsupported conversions, and
  provider-invented values;
- field-level acceptance with one malformed/invented field beside valid fields;
- section-level rejection when a collection cannot be safely isolated;
- relationship endpoint resolution, derived nested relationships, impossible
  relationship types, and no ghost IDs;
- deterministic candidate IDs, evidence records, review warnings, and
  confirmation preservation;
- V1 adapter compatibility and historical byte identity;
- deterministic provider fixture updates and provider-neutral architecture
  tests.

T200 remains a transport/connection smoke whose semantic response shape is not
its purpose; it remains valid independently of the V2 response version. T201
is not merely a transport test: its semantic matrix and historical evidence are
contract-specific and must remain frozen/readable as historical evidence, with
new V2 tests added separately. Neither statement changes T246.

## Exact implementation tasks recommended next

These are recommendations only; they do not activate V2 implementation or
authorize a live smoke.

1. **Contract versioning** — add V2 response types/schema constants and a
   provider-facing instruction contract; preserve V1 schemas and readers.
2. **Source reference registry** — expose a provider-safe view containing
   canonical fragment IDs, text, and bounded quote limits while retaining line,
   offset, hash, and physical metadata inside Nuvitae.
3. **V2 canonicalizer** — implement deterministic quote/value resolution,
   typed normalization, exact evidence reconstruction, and privacy-safe
   rejection diagnostics.
4. **Granular validation** — add envelope, section, atom, and relationship
   validation with field-level fail-closed acceptance; keep malformed JSON and
   unusable envelopes whole-response failures.
5. **Mapper seam** — make candidate mapping consume canonical values and remove
   provider identity aliases from the new path.
6. **Persistence seam** — accept V1/V2 response metadata, persist only
   canonical evidence, and keep owner/response/candidate scoping unchanged.
7. **Review/confirmation regression** — prove candidate IDs, evidence,
   warnings, education years, languages without proficiency, and untouched
   reviewed fields survive through confirmation.
8. **Fixture and qualification separation** — update deterministic V2 fixture
   providers and add V2 tests without rewriting T201/T246 artifacts.
9. **Offline gates** — run Spec Kit consistency analysis, affected contract /
   mapper / persistence tests, typecheck, Prettier, `git diff --check`, and the
   repository-supported secret scan. No provider, OAuth, or network command is
   part of this sequence.
10. **Only after redesign** — separately decide whether a new live semantic
    smoke is justified. It must not be an automatic continuation of this
    review and must not touch T246.

## Status and final review record

- **T203**: remains **NO-GO**. This redesign does not provide qualified live
  production evidence or change the decision gate.
- **T246**: untouched. Its finalized FAILED qualification, consumed cases,
  terminal C01/C04 failures, and no-rerun rule are not changed or reinterpreted.
- **Real-provider recall**: **UNVERIFIED**. Transport success and semantic
  validation reach are not provider recall success. No recall claim is made.
- **Another live smoke now**: **No**. Wait for the V2 boundary, canonicalizer,
  granular validation, and offline regressions to be implemented and reviewed.
- **Live activity in this review**: **zero**. No provider, OAuth, HTTP,
  network, or live transport activity was performed.
- **Commit/push**: none.

## Files changed by this decision record

- `docs/research/semantic-provider-boundary-redesign-2026-08-09.md`
- `specs/001-import-resume/research.md` (cross-reference only)
