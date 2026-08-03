# T211 Local-Play Baseline: Pre-Existing Regression Failures

**Date**: 2026-08-04
**Parent commit (before T211 implementation)**: `3d05a8c9cfe15872df308785576323790a5726a3` (`test(import-resume): add deterministic semantic provider`, pushed T210)
**Current commit**: T211 work remains uncommitted on top of `3d05a8c`; this record describes the worktree state validated for T211 completion.

## Purpose

Record reproducible evidence that the two failing scenarios in
`scripts/local-play-e2e.sh` are pre-existing baseline failures that predate the
T211 implementation, belong to the incomplete T177 browser-acceptance task, and
are **not** regressions introduced by T211. T211 itself may remain complete with
this documented, unrelated, red baseline because no all-green acceptance-gate
policy exists in the repository (see Evidence: acceptance policy).

## Failing and skipped scenarios

| Scenario                                                                            | File:line                                                                         | Outcome at parent `3d05a8c`                | Outcome with T211 worktree                | Status                  |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- | ----------------------- |
| `manual, PDF, DOCX, same-origin, and local security flows use the real local stack` | `tests/e2e/local-play/local-play-flow.e2e.test.ts:47` (fails at :161)             | FAIL (same assertion)                      | FAIL (same assertion)                     | Pre-existing, unchanged |
| `anonymous PDF import reaches review, confirmation, and persisted resume`           | `tests/e2e/local-play/local-play-user-regression.e2e.test.ts:114` (fails at :142) | FAIL (same assertion)                      | FAIL (same assertion)                     | Pre-existing, unchanged |
| `unsupported upload keeps specific public recovery message`                         | `tests/e2e/local-play/local-play-user-regression.e2e.test.ts:180`                 | NOT RUN (serial abort after prior failure) | NOT RUN in suite; **PASSES in isolation** | Not T211 coverage       |

## Fixtures and worker provider composition per scenario

- `local-play-flow` PDF flow: runtime-generated pdfkit PDF and yazl DOCX with
  synthetic, non-T210 content (`Name: Synthetic …`, etc.). Worker composition:
  production (no semantic provider).
- `user-regression` anonymous PDF: committed
  `tests/fixtures/resumes/anonymous-selectable-resume.pdf` ("Alex Martin"
  content, does not match any T210 profile). Worker composition: production
  (no semantic provider).
- `unsupported upload`: `tests/fixtures/resumes/not-a-resume.txt`; the test
  asserts client-side rejection and never POSTs to `/api/import-resume`, so it
  does not involve the worker at all.

## Parent-commit reproduction

Run against a clean `git worktree` checked out at `3d05a8c`, with parent API and
worker images built from that exact tree:

```text
2 failed, 2 passed, 1 did not run
  FAIL local-play-flow ... (TimeoutError: locator.click: Timeout 90000ms exceeded;
       waiting for getByRole('button', { name: 'Review imported resume' });
       completePdfFlow at local-play-flow.e2e.test.ts:161)
  FAIL user-regression ... anonymous PDF import ... (TimeoutError: locator.click:
       Timeout 120000ms exceeded; waiting for getByRole('button', ...);
       at local-play-user-regression.e2e.test.ts:142)
```

Persisted lifecycle for the parent-run imports (owner-scoped PostgreSQL reads):
`processing_status = provider_unavailable`, `validation_status = accepted`,
`import_drafts = 0`, `structured_resumes = 0`.

## Current-commit reproduction (identical)

Same two files against the T211 worktree with the production worker:

```text
2 failed, 2 passed, 1 did not run
  FAIL local-play-flow ... (same locator/timeout/line as parent)
  FAIL user-regression ... anonymous PDF import ... (same locator/timeout/line as parent)
```

Persisted lifecycle for the current-run imports is identical:
`provider_unavailable`, accepted, 0 drafts, 0 structured resumes. The skipped
test passes in isolation (`-g "unsupported upload"`): 1 passed.

## Why the failures belong to T177

Both failures wait for the `Review imported resume` button that appears only when
a review draft exists. Since T209 (already present on the parent commit) replaced
the deterministic field extractor with the provider-neutral
`ResumeSemanticParserProvider` workflow, the production worker never creates a
draft without a configured provider, and the deterministic test provider (T210)
matches only the exact T210 transcripts — neither legacy fixture qualifies.
Updating these browser expectations to the provider-neutral journey is precisely
the incomplete task T177: "Update browser E2E acceptance … in
`tests/browser/import-resume/import-flow.spec.ts`; depends on T171-T176".

The only observable difference between parent and T211 worktree is the public
no-provider status mapping added for T211: at parent the UI stays on
"Preparing your resume for review" forever, while on the T211 worktree the API
reports the existing `terminal_processing_failure` state with plain-language
recovery actions. Both states leave the same `Review imported resume` button
absent, so the failing assertion is byte-for-byte identical; the T211 change made
the failure more visible, not newly reachable.

## T211 validation (green)

The three T211 scenarios pass on the current worktree:

```text
no production semantic provider is configured fails closed ...        PASS
real selectable-text PDF vertical slice ...                            PASS
real DOCX vertical slice proves OOXML extraction ...                   PASS
```

No T211 scenario failed in any run.

## Evidence: acceptance policy

- `README.md` documents `local-play-up.sh`/`local-play-down.sh` and the browser
  suite as "the real non-mocked local-play browser suite" — a suite, not a
  mandatory all-green release gate.
- `quickstart.md` and `plan.md` describe containerized Playwright tests without
  an all-green gate requirement for individual tasks.
- Constitution XIII requires acceptance criteria, tests, security,
  accessibility, documentation, and failure states to be addressed, and
  regression checks must detect changes; the parent reproduction proves the two
  legacy scenarios fail identically before T211, so they do not detect any T211
  change.
- T211's own completion criteria require the three scenarios and the listed
  invariants (production provider-less, exact transcript matching, review and
  confirmation through the real UI, etc.) — all satisfied. Its validation list
  requires running existing regressions and reporting results, which this record
  and the T211 report do truthfully.
- `scripts/local-play-e2e.sh` labels the T211 semantic-vertical-slice phases and
  the legacy regression phase separately and returns a truthful non-zero status
  when any required phase fails.

## Decision

T211 remains complete. The two failing scenarios are proven unrelated baseline
failures owned by T177; the skipped scenario is not T211 coverage and passes in
isolation. T177 stays incomplete. No failing test was modified to hide a
failure, and no assertion was weakened.
