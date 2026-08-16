# Semantic V2 envelope failure audit

Date: 2026-08-12; offline follow-up: 2026-08-13

Scope: issue #25 follow-up on branch `perf/import-resume-latency`. This audit
does not call a live provider and does not persist provider output, resume
values, source quotes, prompts, URLs, credentials, or personal data.

## Trace

The production path is:

```text
Codex transport bounded output
→ normalizedOutput string
→ JSON.parse
→ response-size/depth/atom/node inspection
→ compact absence expansion (allowlisted only)
→ V2 envelope validation (schemaVersion, sections, root arrays, cardinality)
→ field-level canonicalization and SourceRegistry grounding
→ canonical draft mapping
```

`JSON.parse` rejects malformed JSON and markdown-wrapped output. Parsed values
that are not objects are rejected as wrong-root-shape. The canonicalizer then
fails closed for response size, object depth, total atoms, and total nodes. It
expands only omitted deterministic absence markers (`null` scalar fields and
empty collections) before envelope validation. Required semantic anchors are
never synthesized.

The envelope boundary rejects missing required root fields, prohibited
unexpected root fields, wrong schema version, invalid `sections`/`contact` or
collection wrapper shapes, and collection cardinality over the configured
limit. Candidate atoms, source references, and typed values are deliberately
not whole-response failures: they become bounded field-level rejections so
valid siblings survive. A canonicalizer exception remains a whole-envelope
failure and is reported as `other_schema_violation`.

## Whole-envelope categories

The privacy-safe whole-response categories are:

`invalid_json`, `wrong_root_shape`, `missing_required_root_field`,
`unexpected_root_field`, `invalid_section_shape`, `object_depth_exceeded`,
`atom_limit_exceeded`, `node_limit_exceeded`, `response_size_exceeded`,
`cardinality_limit_exceeded`, and `other_schema_violation`.

`invalid_candidate_shape`, `invalid_source_ref_shape`, and
`unsupported_typed_value_shape` are also part of the bounded taxonomy, but are
field-level categories unless the response is otherwise unusable. This keeps
the fail-closed envelope boundary separate from partial acceptance.

## Existing run audit

The workspace contains no persisted privacy-safe event record for
`c9c2c017-1f6b-4902-b05f-a266d5a94187` or
`a694c77e-13ca-4423-b247-3e4ca17df239`. Existing checked-in material contains
the aggregate A/B timing observations and the implementation’s privacy-safe
event vocabulary, but no per-run envelope category, normalized-output digest,
Zod path, or structural bucket for either run. Therefore the only supported
conclusion is that both runs were observed by the operator as invalid V2
envelopes, entered deterministic fallback, and produced sparse review. The
current evidence cannot establish whether either failure was JSON syntax,
root shape, missing/extra fields, section/cardinality shape, or a resource
limit. A faster fallback result is not a valid model-quality sample.

## Prompt/contract alignment

The prior compact prompt had a contract ambiguity: it named `contact` as a
section but did not enumerate the wrapper's keys or route adjacent concepts.
That omission could reasonably produce `name`, `full_name`, `address`,
`contactLinks`, `urls`, `headline`, or `title` under `sections.contact`. The
live report identifies only an unrecognized key at that wrapper path; it does
not prove which key was emitted.

The contract decision is unchanged and the prompt now states these rules:

- `schemaVersion`, `sections`, and the `contact` wrapper remain required.
- `sections.contact` accepts exactly `fullName`, `email`, `phone`, `location`,
  and `website`; no extra key or alias is accepted.
- `headline` belongs in `sections.headline`, role/job `title` belongs in
  `workExperience[].roles[].title`, employer location belongs in
  `workExperience[].employerLocation`, and professional/social/profile links
  belong in `sections.professionalLinks`.
- `address` has no separate V2 destination and is not silently converted to a
  new contact field; unsupported concepts are omitted.
- Empty root arrays and empty section collections may be omitted and are
  restored to `[]`.
- Absent optional scalar fields may be omitted and are restored to `null` only
  on the allowlisted paths.
- Work/education/group wrappers and required semantic anchors remain required;
  project and certification names are required atoms, matching canonicalizer
  acceptance.
- Atoms contain only `value` and non-empty bounded `sourceRefs`.
- Typed dates and links remain grounded and are normalized only after
  field-level validation.
- Resource and cardinality limits are hard fail-closed limits; output is never
  silently truncated.

Anonymous deterministic contact fixtures cover: a valid five-key wrapper, an
unknown `address` key, a misplaced `headline` key, and the unsupported
`full_name` alias. The latter three fail at the envelope boundary with no
field-level candidates; valid headline and professional-link siblings pass
when placed in their own sections. Compact omission remains accepted.

Structural diagnostics now retain the raw key only in local classification and
emit a bounded category (`known_alias_wrong_location`,
`misplaced_existing_semantic_field`, `unknown_contact_key`, or
`unknown_structural_key`) without recording the key itself.

## Benchmark gate

A latency arm is valid only when all of the following are true:

1. `response.completed` was received.
2. The Semantic V2 envelope was accepted.
3. Deterministic fallback was not used.
4. A canonical draft was produced.
5. Summary fidelity is intact.
6. Expected work/education structure is substantially present.

Any invalid-envelope, fallback, sparse, non-canonical, or fidelity-failing arm
is recorded as a quality failure and excluded from normal latency comparison.

No Luna, Terra, Sol, or other model/profile benchmark was performed. One
bounded successful-baseline live run is justified only after this gate can be
observed and recorded with the new structural diagnostics; that run remains a
separate authorization and is not executed by this task.
