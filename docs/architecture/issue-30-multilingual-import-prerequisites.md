# Issue #30: multilingual import prerequisites

Status: **prerequisite slice only; issue #30 remains open**. Audited against
`origin/main` at `956528bf6a66b4931967017bb816355638003a3e` on 11 September 2026.
Issue #30 had no comments. Related boundaries: #31 (UI locale), #37 (fictional
binary corpus), #23 (partial dates), and ADRs 0006/0007 (V2 writes and package
ownership). Historical multimodal research is not the implemented V2 contract.

## Strategy and shipped boundary

Prefer language-agnostic semantic extraction, with language as metadata rather
than a permanent allowlist. This is the target strategy, **not yet a claim that
arbitrary-language imports are supported**. Opening admission now would expose
date loss and incomplete section detection. This change leaves both upload
admission and the domain draft threshold closed for unknown/unsupported languages.

The provider-neutral prompt now explicitly forbids translation, transliteration,
diacritic removal, visual reversal of RTL strings, and UI-locale-driven rewriting.
Request construction no longer asserts an unobserved LTR direction: it emits the
existing nullable contract value `null`. It does not infer Arabic, change the
request schema, or add a direction detector. The V2 atom schema, canonicalizer,
source registry, quality gate, fallback rules, budgets, and production eligibility
are unchanged. There are no new dependencies or migrations.

## Audit of implemented assumptions

Paths below are relative to the repository root.

| Boundary                        | Evidence and limitation                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF extraction                  | `packages/extraction/src/pdf/pdfjs-pdf-adapter.ts` preserves PDF.js item order; normalizes NBSP and CR. It does not infer language or repair RTL reading order. Real Arabic/CJK PDF font, shaping, and extraction fidelity remain unqualified.                                                                                                                                               |
| DOCX extraction                 | `packages/extraction/src/docx/ooxml-docx-adapter.ts` extracts Unicode XML text and records paragraph/run UTF-16 offsets. Our generated DOCX tests exercise real OOXML extraction, not LibreOffice page rendering.                                                                                                                                                                            |
| Language detection              | `packages/extraction/src/language/deterministic-language-detector.ts` scores FR/EN vocabulary and a small Spanish/German unsupported vocabulary. Short/vocabulary-poor text becomes unknown. It is not a general language detector.                                                                                                                                                          |
| Upload eligibility              | `packages/import-application/src/validate-document.ts`, `finishLanguageValidation`, rejects unknown/unsupported. All three new fixtures explicitly remain rejected.                                                                                                                                                                                                                          |
| Domain eligibility              | `packages/domain/src/resume-import/validation.ts`, `summarizeExtractionThreshold`, also requires a supported language. `extraction-draft.ts` produces no draft for these unknown-language inputs even with grounded fields.                                                                                                                                                                  |
| Legacy deterministic extraction | `packages/extraction/src/resume/deterministic-resume-field-extractor.ts` requires a supported language and FR/EN headings/labels. Do not pretend this is universal by appending a few translations.                                                                                                                                                                                          |
| Request/normalization           | `packages/import-application/src/build-semantic-parse-request.ts` uses NFKC and whitespace collapsing, hashes normalized fragments, and establishes normalized bounds. Direction was always LTR; now unknown. DOCX continuation requires contiguous runs; PDF continuation geometry assumes left-to-right horizontal progression. RTL split-fragment values need separate qualification.     |
| V2 source grounding             | `packages/import-application/src/semantic-parser/source-registry.ts` normalizes fragments/quotes, resolves by fragment ID first, rejects ambiguous repeats, and returns normalized UTF-16 offsets. Canonicalization verifies exact values and source-proven continuations, independent of script. No global quote search, transliteration, or translated-value exception is added.           |
| Dates and links                 | `semantic-extraction-v2-canonicalizer.ts` recognizes ASCII numeric partial dates, FR/EN month names and current markers. Spanish months/current, Arabic-Indic digits/current, Chinese year/month notation, and ambiguous full dates remain rejected with required review warnings. HTTP(S) URL normalization encodes Unicode paths; evidence still quotes the source URL. No URL is fetched. |
| Completeness                    | `semantic-v2-source-section-inventory.ts` uses FR/EN headings and accent-folding. All three fixtures' localized headings currently produce false inventories. The benchmark must use independent fixture truth, not let missing recognition turn fidelity checks into N/A. English project-heading filtering and prompt Education examples are further language assumptions.                 |
| V1 compatibility                | `validation/evidence-grounding.ts` and `validation/no-invention.ts` use NFKC and case-insensitive comparison for selected legacy checks. V1 remains compatibility-only under ADR 0006; new fixtures use V2.                                                                                                                                                                                  |
| Limited fallback                | `semantic-parser/limited-deterministic-partial-fallback.ts` uses FR/EN labels, Latin-oriented name rules, ASCII phone patterns, and delimited lists. Explicit URLs/contact patterns may still work. Output remains explicitly partial, requires review, offers manual entry, and never counts as a benchmark pass.                                                                           |
| Draft mapping/storage           | `semantic-v2-candidates-to-draft.ts` retains source-language text and date `originalText`; normalized text used for comparison is not the displayed value. Persistence uses existing string/JSON mappings, but multilingual database round-trip/confirmation was not validated in this slice.                                                                                                |
| Review/editor/rendering         | React text/input sinks and `ProfessionalResume.tsx` (`dir="auto"`) are existing capabilities, not evidence of complete RTL support. Review/editor mixed-direction isolation, editing round-trip, fonts and PDF export need browser validation. No web files or UI locale behavior change here.                                                                                               |
| Fixture/benchmark coverage      | Existing semantic fixture language types/corpus focus on FR/EN/bilingual and legacy V1. New V2 content lives in `@nuvitae/test-fixtures` and reuses the existing in-memory DOCX builder in integration tests. No separate binary generator or external corpus is introduced.                                                                                                                 |

## Normalization is not raw-document offset mapping

The unchanged contract uses UTF-16 indices into the **normalized fragment**, not
byte offsets, grapheme indices, Unicode code point indices, or raw DOCX offsets.
NFKC composes decomposed accents, expands ligatures, and folds fullwidth letters,
digits, and Chinese punctuation. It therefore preserves script/language but not
every original glyph. Raw DOCX text remains available in extraction; semantic
quotes refer to the normalized transcript. This slice does not change that policy
or claim byte-exact preservation after normalization.

The asymmetric mixed-script regression contains an astral symbol, decomposed
accent, ligature, fullwidth Latin, NBSP, Arabic and CJK. Its raw DOCX run ends at
19; its normalized fragment ends at 20; the Arabic substring occupies normalized
indices 11–15. The test checks those fixed expectations independently and rejects
a romanized quote. Never apply normalized evidence directly to raw source text.

## Regression evidence and its limits

`tests/integration/import-resume/multilingual-v2-prerequisites.integration.test.ts`
exercises Spanish municipal-data work, Arabic healthcare services, and Mandarin
supply-chain analysis. Each fictional fixture has contact, headline, summary,
employer/role/year dates, two bullets, education, skills, language/proficiency,
project, certification and a Unicode-path professional link. Localized date
variants and source-language translation instructions are negative cases.

The controlled V2 proposals contain 20 atoms each, map to 19 draft field inputs
(two role dates combine), and retain every expected value and evidence substring.
Canonicalization is deterministic; unsupported dates do not discard unrelated
facts. Translated values, invented skills and wrong-fragment quotes are rejected.
The existing fallback's accepted values remain source-grounded and explicitly
partial. Upload validation and the domain threshold reject all three fixtures;
the normal benchmark correctly reports `canonical_draft_not_produced`, not PASS.
Provider completion is a controlled input, not an observed live-provider event.

These tests do **not** measure live recall, grouping accuracy, provider protocol
reliability, persistence, browser editing or PDF rendering. Exact grounding does
not prove that a grounded string was assigned to the correct semantic field, or
that an injected instruction was ignored by a live model. No such claim is made.

## Deferred acceptance criteria and ordered follow-up

1. Resolve localized date representation without trusting ungrounded provider
   normalization. Preserve original text/precision; explicitly handle ambiguous
   numeric dates, localized current markers, non-Gregorian calendars and digits.
2. Establish language-agnostic completeness expectations and multilingual
   insufficient-fidelity behavior. Keep material invention/truncation, no-fallback,
   envelope and draft predicates unchanged; never classify unrecognized headings
   as proof that a section is absent.
3. Change upload and domain eligibility together after those fidelity contracts
   are settled. Separate metadata detection from admission; make failure/manual
   recovery explicit. Do not silently label non-English text English.
4. Extend #37's existing generator with pinned Arabic/CJK fonts and PDF/RTL
   split-fragment fixtures. Qualify normalization/raw evidence mapping and
   source-language wording with native-language review.
5. Run owner-scoped persistence/confirmation and browser review/edit/reload/export
   cases, including mixed LTR/RTL content. Coordinate content direction with #31
   without coupling document language to application locale.
6. Run opt-in live-provider campaigns for Spanish, Arabic and Mandarin against
   independent full-field truth. Record all nine normal gate predicates, missing
   groups/fields, rejections, warnings, fallback, invention, truncation and
   protocol failures. All three language acceptance criteria remain unfulfilled
   until that evidence exists.

Security/privacy boundaries are unchanged: fictional inputs only, no credentials,
new logging, network destinations, provider calls, parser privileges or owner
access changes. The raw/normalized evidence distinction and negative tests
reinforce existing grounding rules. Shared-file conflict risk is limited to the
provider prompt, request builder and fixture export barrel; all other additions
are issue-specific. No #31 UI, #76 browser policy, #28 MkDocs configuration,
#39 EventStorming or #24 observability files are changed. Historical README claims
and other pre-existing documentation inconsistencies were left untouched.
