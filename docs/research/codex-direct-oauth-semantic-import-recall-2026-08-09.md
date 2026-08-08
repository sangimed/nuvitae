# Semantic-import recall follow-up: anonymous selectable resume

**Status**: Offline correction complete; one separately authorized live smoke
revalidation remains required.

## Fixture and observed product defect

The manual production smoke used
`tests/fixtures/resumes/anonymous-selectable-resume.pdf`. The user-reported
production path reached a persisted Codex connection, PDF upload, extraction,
worker processing, semantic invocation, and review-draft persistence. The
review result preserved contact fields and the professional link, but did not
normally map the explicit title, education, four skills, or two language names.
The UI showed approximately five draft fields and nine items needing attention.

This fixture is outside the historical T246 corpus. T246 was not reopened or
rerun, and no raw provider response was persisted or recovered for this
follow-up.

The repository was clean at the start of the follow-up on
`9b397b79ea32d08afb2ef85ea8a4a2797dc23c33` (`align production Codex OAuth
callback flow`). The committed production-proof artifact
`codex-direct-oauth-t213-t216-real-production-proof-2026-08-08-attempt-2.json`
is pinned to `87eddef`; that artifact records an earlier OAuth-initiation
failure before upload and is not semantic-smoke evidence. The successful
semantic smoke result is therefore retained as operator-reported evidence,
not overwritten or relabelled as a committed proof artifact.

## Offline stage attribution

The exact production extraction and normalization path produced one PDF page,
English classification, a 15-line normalized transcript, and source fragments
containing the title, education block/year, comma-separated skills, language
names, contact fields, and link. No disputed fact was lost in extraction or
normalization. The request schema accepted the resulting request.

The existing response schema already permits nullable education start/end
dates, nullable education location/details, nullable language proficiency, and
individual skill entries. A deterministic, fully grounded response containing
the fixture's explicit facts passed schema, evidence, grounding, no-invention,
and conflict validation.

Primary attribution for the live omission/low-confidence behavior:

| Fact/category                     | Primary stage              | Evidence                                                                                                                                                                                                                |
| --------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Backend Engineer` title/headline | semantic-provider response | The normalized request contains both the title line and its labelled form; the provider request did not explicitly state the complete-recall/title rule, while a grounded response maps it successfully.                |
| education degree and institution  | semantic-provider response | The complete labelled education line is present in the request and valid response contract; the live review did not produce normal education fields.                                                                    |
| `2022` education year             | canonical mapping          | The response contract permits an education end date, but the existing mapper discarded `education.*.end_date` as `unsupported_field`; confirmation also had no education-date mapping.                                  |
| four explicit skills              | semantic-provider response | The comma-separated skills fragment is present in the request and each individual skill maps when returned as grounded candidates; the provider instructions did not explicitly require individual listed-skill recall. |
| French and English language names | semantic-provider response | The language fragment is present in the request and nullable proficiency is schema-valid; the provider instructions did not explicitly require retaining names without proficiency.                                     |

No fact was primarily lost in response schema validation, evidence/grounding
validation, confidence policy, deduplication, persistence, or review
projection in the deterministic reproduction. The deterministic complete
response produced zero diagnostics and zero review warnings. The live raw
response is intentionally unavailable, so its individual provider omissions
are not reconstructed beyond the sanitized product observation above.

## Sanitized offline structure

The exact PDF extraction path produced 15 normalized lines. Relevant structure
only (no raw provider payload) was:

| Stage                           | Sanitized result                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction/normalization        | `headline` at lines 2 and 7; `education` at lines 8-9; `skills` at lines 10-11; `languages` at lines 12-13; contact at lines 3-6; link at line 15                             |
| Semantic request                | English document; normalized transcript and source fragments for all 15 lines; flattened evidence bounds and hashes present                                                   |
| Deterministic semantic response | contact 4 values; headline 1; education 1 candidate with degree, institution, end year, null start/location; skills 4; languages 2 with null proficiency; professional link 1 |
| Response validation             | accepted; zero diagnostics; grounding valid; no-invention valid                                                                                                               |
| Candidate mapping               | 15 structured fields; zero rejected candidates; zero review-required candidates                                                                                               |
| Review projection               | complete draft category; zero draft warnings; no unsupported/partial/low-confidence diagnostic                                                                                |

The deterministic response used only evidence pointing to the extracted source
fragments. It is a test fixture response, not the raw real-provider response.

## Correction

The provider-neutral semantic instructions now require complete explicit-value
recall, preserve explicit titles, preserve each listed skill, preserve language
names without proficiency, and preserve education degree/institution/year with
missing optional details left null. The Codex adapter uses those fixed
instructions while retaining the existing untrusted-document, grounding,
no-invention, and strict-output requirements.

Canonical semantic mapping now accepts parseable explicit education start/end
years as canonical date values and education location, while still rejecting
unsupported education details. Confirmation groups fields for one education
candidate and carries institution, credential, location, and date fields into
one canonical education item. A year-only education item has no invented start
date. Language proficiency remains absent when the source does not provide it.

## Deterministic regression

The dedicated integration regression runs the exact fixture through:

`PDF extraction → language detection → normalized request construction →
grounded deterministic semantic response → schema/evidence/grounding/
no-invention validation → semantic candidate mapping → draft/review
projection`.

It asserts the title, degree, institution, year, four skills, two language
names, contact fields, and link; zero validation diagnostics; zero rejected
candidates; zero review warnings; actual source-fragment evidence; and no
invented proficiency or date. Additional mapper cases cover a language without
proficiency, education with only a graduation year, an explicit professional
title, and comma-separated skills using values different from this fixture.

## Revalidation boundary

No live OAuth or provider activity was performed for this correction. One new,
separately authorized production smoke revalidation is warranted after the
offline fix. It must use the approved production path and record only sanitized
structure and review outcome; it must not alter T246 evidence, reopen T246, or
be treated as T246 qualification evidence. T203 remains NO-GO and moderated
usability validation remains incomplete.
