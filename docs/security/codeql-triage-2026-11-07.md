# Community alpha CodeQL triage — 7 November 2026

Candidate: `2ce0f169cef6d187645069a40b32e96d38437f95` (`origin/main`).
Community alpha remains **NOT READY**. This is a triage record, not a scanner
suppression or a release approval. See #118, #61 and #126.

## Scanner evidence

GitHub REST code-scanning inventory returned 13 open high-severity alerts on
`refs/heads/main`. The default-branch analysis created at 12:26:10 UTC reports
13 results and no analysis error. The post-merge Security analysis run
[42372333887](https://github.com/sangimed/nuvitae/actions/runs/42372333887)
completed successfully, including Secret scan and CodeQL. Successful execution
and a zero-result differential PR analysis do not clear these findings.

All alerts first appeared in scanning on 28 October, except #13 on 4 November.
The instances endpoint currently exposes the candidate as the observed commit;
that is not proof of the first vulnerable commit. Blame attribution below is
source history, not an asserted first affected release.

## Inventory and disposition

Lines refer to the candidate, before any remediation. All states were `open`.
P0 is the mission workstream priority; effective vulnerability priority follows
the vulnerability-management policy and demonstrated reachability.

| Alert | Rule                                     | Candidate path and line                                                                        | Assessment                                                                                                     | Effective action                                                    |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1     | js/incomplete-sanitization               | spikes/codex-direct-oauth/test/t201-matrix.test.mjs:449                                        | Contextual false positive for Community exploitation; incomplete general regex escaping in a fixture assertion | P3 test maintenance; no suppression applied                         |
| 2     | js/incomplete-sanitization               | spikes/codex-direct-oauth/test/t201-matrix.test.mjs:460                                        | Same bounded fixture assertion context                                                                         | P3 test maintenance; no suppression applied                         |
| 3     | js/incomplete-sanitization               | spikes/codex-direct-oauth/test/t201-matrix.test.mjs:469                                        | Same bounded fixture assertion context                                                                         | P3 test maintenance; no suppression applied                         |
| 4     | js/incomplete-url-substring-sanitization | spikes/codex-direct-oauth/test/t246-live-runner-evidence.test.mjs:525                          | False positive: negative assertion of synthetic marker absence, not URL authorization or sanitization          | No runtime patch required; maintainer disposition pending           |
| 5     | js/polynomial-redos                      | packages/extraction/src/safety.ts:164                                                          | Algorithmic hardening concern; no current runtime caller found                                                 | P2 latent code; remediation or explicit disposition required        |
| 6     | js/polynomial-redos                      | packages/extraction/src/safety.ts:213                                                          | Same runtime reachability limitation                                                                           | P2 latent code                                                      |
| 7     | js/polynomial-redos                      | packages/extraction/src/safety.ts:238                                                          | Same runtime reachability limitation                                                                           | P2 latent code                                                      |
| 8     | js/polynomial-redos                      | packages/extraction/src/resume/deterministic-resume-field-extractor.ts:137                     | Algorithmic hardening concern; no production instantiation found                                               | P2 latent code                                                      |
| 9     | js/polynomial-redos                      | packages/extraction/src/resume/deterministic-resume-field-extractor.ts:147                     | Same runtime reachability limitation                                                                           | P2 latent code                                                      |
| 10    | js/polynomial-redos                      | packages/extraction/src/resume/deterministic-resume-field-extractor.ts:148                     | Match follows a successful anchored email validation; expensive failure path not established                   | Indeterminate algorithmic reachability; no production instantiation |
| 11    | js/polynomial-redos                      | packages/extraction/src/safety.ts:569                                                          | Algorithmic hardening concern; no current runtime caller found                                                 | P2 latent code                                                      |
| 12    | js/polynomial-redos                      | packages/extraction/src/resume/deterministic-resume-field-extractor.ts:218                     | Algorithmic hardening concern; no production instantiation found                                               | P2 latent code                                                      |
| 13    | js/polynomial-redos                      | packages/import-application/src/semantic-parser/limited-deterministic-partial-fallback.ts:1032 | Reachable availability risk in the current import fallback                                                     | P1; targeted patch and bounded regression verification required     |

The detailed parser reasoning and patch verification belong with the targeted
remediation PR. Untrusted uploaded/extracted text remains untrusted even with
upload, extraction-size and worker limits. Existing bounds do not by themselves
prove a regular expression has safe complexity. No public exploit payload or
shared-environment stress test is needed for this disposition.

## OAuth test findings: traced evidence

Alerts 1–3 are inside the test “T201 manifest-driven completeness checklist”.
`loadT201MatrixCase` checks the case ID against a fixed list and reads committed
fixture/manifests from `CASE_ROOT`; this test selects only C02 and C03. Paths
are interpolated into regular expressions used by `assert.match`. The escaping
is incomplete for arbitrary strings, but no browser input, extracted resume or
provider output supplies those manifest paths. The consequence is potentially
incorrect test matching if fixture vocabulary changes, not production code
injection or a Community sanitizer bypass. Source lines are attributed to
`8bb3c32c` by blame. Reassess if test inputs become external or code is reused
as a general escaping helper; literal matching or complete escaping is then
appropriate. This record does not claim the helper is a correct general escaper.

Alert 4 is `assert.equal(serialized.includes(syntheticAuthorizationUrl), false)`
in the test “T246 evidence sanitization strips raw model/transcript/credential
fields”. The literal is a synthetic `.invalid` sentinel injected into a locally
constructed result. The assertion checks that the result projection omitted it;
it does not accept a hostname, validate a URL, redirect a browser, or grant
network access. The production projection explicitly excludes `authorization_url`
and the other tested sensitive keys. Blame attributes the assertion to
`30c3fa05`. Reassess if the assertion becomes URL validation or the projection
contract changes. This finding does not establish that every other projection
or OAuth control is secure.

The spike tests are outside the Community API/worker/web runtime image COPY
inputs. Their fixtures and assertions are test evidence, not a live OAuth
qualification. They were inspected statically; **OAuth tests NOT RUN** in this
triage because their suites include filesystem cleanup and this mission does
not authorize deletion. No real provider, authorization, token or user data was
used. No tests were removed and no CodeQL dismissal or suppression was applied.

## Closure and release conditions

Maintainer `sangimed` owns follow-up triage; a release security owner must confirm
any accepted-risk disposition. Keep #118 open until the reachable finding is
patched, relevant regression/quality checks pass, and a fresh default-branch
CodeQL analysis verifies actual alert state after reviewed integration. Each
remaining alert needs a documented disposition, owner and review trigger;
scanner dismissal is a separate maintainer action governed by the policy.

#126 remains open: GitHub private vulnerability reporting is disabled and
notification recipients plus a private synthetic dry-run are unverified.
No root SECURITY.md or invented private reporting URL is introduced. Historical
configuration work and current vulnerability work must remain distinguishable.
