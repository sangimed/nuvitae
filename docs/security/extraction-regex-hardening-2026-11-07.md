# Extraction text-processing hardening — 2026-11-07

Base reviewed: `2ce0f169cef6d187645069a40b32e96d38437f95`.

This change addresses historical CodeQL findings without claiming that the
Community runtime invokes every exported extraction helper. No finding is
suppressed or administratively dismissed. Verify the final default-branch
Code Scanning state after review and merge.

| Alert | Baseline location                             | Analysis and effective priority                                                                                                                    | Change                                                                                                     |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| #5    | `safety.ts:164`                               | Repeated attachment openers can retry an unbounded remainder; quadratic worst case. Exported helper has only test callers in this tree; latent P2. | Inspect the first eligible opener per line and extension suffix once; retain whitespace and newline rules. |
| #6    | `safety.ts:213`                               | Repeated relationship prefixes can rescan the same tag; quadratic worst case. Same test-only reachability; latent P2.                              | Scan tag segments once, retaining both the general attribute rule and malformed relationship handling.     |
| #7    | `safety.ts:238`                               | Repeated slash starts can rescan a token; quadratic worst case. Same test-only reachability; latent P2.                                            | Token scan and delimiter searches, retaining slash/backslash classifications.                              |
| #8    | `deterministic-resume-field-extractor.ts:137` | Unanchored trailing punctuation search can retry suffixes; quadratic worst case. Extractor instantiated only in tests; latent P2.                  | Single backwards suffix walk.                                                                              |
| #9    | `deterministic-resume-field-extractor.ts:147` | Anchored email validator has overlapping domain classes around the dot; quadratic failure path. Same inactive extractor; latent P2.                | Delimiter and whitespace validation with linear scans.                                                     |
| #10   | `deterministic-resume-field-extractor.ts:148` | Expensive nonmatch is guarded by the preceding successful full email validation; runtime exploitability not established.                           | Reuse the already validated whole value; remove redundant regex work.                                      |
| #11   | `safety.ts:569`                               | Email masking retries an unbounded local-part prefix; quadratic nonmatch. Only test callers; latent P2.                                            | Tokenize once, then scan email boundaries while preserving surrounding text.                               |
| #12   | `deterministic-resume-field-extractor.ts:218` | Same email validator as #9, labelled value path. Same inactive extractor; latent P2.                                                               | Shared linear validator within the existing module.                                                        |

`rg` call-site review finds `scanTextForHostileContent` and
`maskSensitiveOutput` used only in tests. `DeterministicResumeFieldExtractor`
is constructed only in its unit tests; `ProcessExtractionService` describes
its port but is itself wired only in tests. Exports alone are not a Community
entrypoint. Reassess immediately if production wiring is added.

PDF/DOCX text reaching the supported extraction boundary is untrusted. Current
adapters cap extracted text at 120,000 characters and item/run counts at 20,000;
these finite ceilings do not make polynomial matching safe. Synchronous text
work can occupy its executing event loop, and a timer alone cannot preempt it.
The separately corrected reachable semantic fallback finding #13 is P1 and is
not part of this branch.

The changes add no dependency, authorization exception, trust-boundary change,
or logging sink. They preserve classification and masking behavior, including
historically permissive email recognition. These helpers remain supplemental
heuristics, not substitutes for structural parsing, ownership or safe sinks.

Synthetic resource regressions are bounded at 60,000 characters (or 48,000 for
attachment prefixes), one invocation per scenario. Baseline tests exceeded a
generous one-second ceiling; corrected targeted tests complete in milliseconds.
This is a regression guard, not a production throughput guarantee. No real CV,
credentials, provider calls, database operations or workspace destruction are
needed by the selected tests. Existing hostile-content and masking cases are
selected explicitly; tests that destroy parser workspaces are not executed.
