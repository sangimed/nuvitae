# T203 Non-Technical Onboarding Feasibility Measurement

**Measured**: 2026-08-08 (T215 delta)
**Deployment evidence**: deterministic API/service/security tests, local mocked
provider Playwright tests, and existing local import tests; no live
Codex/OAuth activity
**Classification**: `PASS_AUTOMATED_FEASIBILITY` for the local/mocked journey;
final live production OAuth/import proof and moderated human validation remain
pending.

## Canonical requirement

The current Community contract requires a self-hosted, non-technical user to
be able to connect Codex through the browser OAuth flow, see whether the
connection is ready, import a PDF or DOCX resume, understand processing and
review states, resolve or intentionally leave warnings, and confirm the
reviewed draft. The normal UI must use plain actions such as **Connect Codex**,
**Reconnect Codex**, **Codex is ready**, **Codex connection expired**, and
**Disconnect**. It must not expose OAuth implementation details, tokens, API
keys, provider-runtime vocabulary, or model internals. Manual entry must remain
available from import failure states.

This is the contract in `spec.md` FR-030–FR-032, SC-001, SC-003, SC-004,
SC-009, SC-023–SC-025, and SC-032, the Community direction, and the current
T203 decision document. SC-001, SC-003, SC-004, and SC-009 explicitly require
moderated usability testing; the specification does not set a participant
count. The T203 decision also requires the real import flow in the supported
local same-host shape. The deterministic tests below therefore measure UX
feasibility but do not replace live connection/import evidence or human
validation.

### User and actions

- **Target user**: a non-technical self-hosted resume author with an existing
  PDF or DOCX resume.
- **Required actions**: enter import, connect Codex, upload a supported file,
  wait for preparation, review fields and warnings, correct or confirm them,
  and create the structured resume. Manual entry must be available as a safe
  alternative.
- **Success**: each state explains what happened and exposes the next action;
  review-required and partial results are never presented as complete; the
  confirmed structured resume is visibly complete.
- **Allowed terminology**: resume, Codex, connect, reconnect, ready, review,
  partial, missing information, try again, upload a different file, and enter
  manually.
- **Not allowed in the normal journey**: OAuth, token, API key, provider,
  semantic, schema, grounding, broker, credential, model, worker, or other
  implementation vocabulary.
- **Live requirement**: yes for the final T203 gate. A live provider/OAuth
  connection and the supported real import flow are not replaced by these
  deterministic tests.

## Actual journey audit

| State                              | What the user sees                                                                                                              | Result                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Entry                              | “Create your resume”, with “Import an existing resume” as the primary action and manual entry as an alternative                 | Pass                                                                              |
| Start import                       | “Start from your existing resume” and “Import my resume”                                                                        | Pass                                                                              |
| Connection explanation             | Upload guidance now says “Connect Codex before uploading” and explains why the connection is needed                             | Pass after fix                                                                    |
| Connection required                | Plain “Connect Codex” explanation and action; manual entry remains available                                                    | Pass; T213 entrypoint/handoff and T214 callback/status completion are implemented |
| Connecting state                   | Clear connection-in-progress state with no duplicate initiation                                                                 | Pass; pending state disables duplicate initiation                                 |
| Connected state                    | Server-proven “Codex is ready” state exists                                                                                     | Pass; UI consumes the authenticated status projection only                        |
| Expired/unusable state             | Understandable attention-required state without implementation details                                                          | Pass; expired/revoked/unusable states use plain copy                              |
| Connected lifecycle                | “Codex is ready” with a clear “Disconnect” action and confirmation that resume data stays                                       | Pass; local credential deletion is fail-closed and idempotent                     |
| Reconnect lifecycle                | “Reconnect Codex” after disconnected, expired, or revoked state; one pending handoff at a time                                  | Pass; reuses the T213 handoff and waits for T214 callback readiness               |
| Temporarily unavailable            | Codex is temporarily unavailable; connection and resume data are not silently deleted                                           | Pass; unavailable remains separate from authentication failure                    |
| Upload                             | Labelled file control, PDF/DOCX guidance, size/page/text limits, and “Upload and start import”                                  | Pass                                                                              |
| Processing                         | “Preparing your resume for review” with a current step and only known progress percentages                                      | Pass                                                                              |
| Review-ready                       | “Your resume draft is ready” and “Review imported resume”                                                                       | Pass                                                                              |
| Partial fallback                   | Partial result is labelled as partial and unconfirmed; review remains required                                                  | Pass in recovery/component coverage                                               |
| Recoverable Codex failure          | Codex-unavailable wording, limited/retry/manual actions where permitted                                                         | Pass in bounded recovery coverage                                                 |
| Terminal or malformed file failure | Plain error, replacement upload where permitted, and manual entry                                                               | Pass                                                                              |
| Confirmation                       | Review warnings and fields must be resolved before “Create structured resume”; confirmation dialog has an explicit final action | Pass                                                                              |

## Jargon audit

The visible upload, processing, recovery, and live-region copy was audited for
OAuth, token, API key, provider, semantic, fallback, schema, grounding, retry,
quota, rate limit, worker, broker, credential, and model vocabulary.

- The old visible “AI provider” and “full semantic parsing” wording was
  simplified to Codex and plain review language.
- The internal state names and component identifiers retain provider-neutral
  vocabulary where they are implementation-only and do not render to users.
- Backend failure messages for connection/unavailable states are normalized at
  the UI boundary so internal provider wording is not rendered.
- “Try again” is retained because it is a clear user action, not an internal
  retry mechanism description.

## Deterministic scenarios exercised

The new Playwright coverage in
`tests/browser/import-resume/onboarding-feasibility.spec.ts` uses mocked API
responses and synthetic file bytes only:

1. Connection required: the user sees why Codex is needed, receives the
   actionable **Connect Codex** button, reaches the mocked safe browser handoff,
   retains manual recovery, and sees no technical vocabulary leak. The test
   does not claim readiness from the handoff alone.
2. Callback/status completion: a fully local mocked exchange returns through
   the callback boundary, persists an encrypted session, and the returned
   import page shows **Codex is ready**; pending-only status cannot produce the
   ready label.
3. Codex unavailable: the user sees a plain failure, no review button is
   offered, and manual entry is available.
4. Connected recovery: the user sees **Disconnect**, confirms it, sees that
   resume data remains, and receives **Reconnect Codex**; the mocked handoff is
   bounded to one initiation.
5. Expired/revoked recovery: both states offer the same plain **Reconnect
   Codex** action and never claim readiness before callback completion.
6. Temporary provider unavailability: the user is told that the connection and
   resume data remain; no reconnect or credential-deletion action is implied.

Existing canonical UI/accessibility and component coverage exercises the happy
path, upload validation, processing, timeout, draft review, partial fallback,
warning resolution, confirmation, malformed-file failure, keyboard use, and
privacy-safe recovery copy. No test calls a real provider or OAuth endpoint.

## Result and remaining gap

The T213-T216 portion now passes automated feasibility for the supported
local/mocked journey: the production import flow exposes Connect Codex,
completes a fully local/mocked callback, persists the qualified encrypted
session boundary, renders connected/ready, expired/revoked, connecting,
temporarily unavailable, and disconnected states, and covers disconnect,
reconnect, session deletion, data-preserving recovery, and production worker
provider registration/session resolution. The complete T203
onboarding gate is not accepted as live product evidence: the supported real
OAuth/import flow and moderated human validation remain pending. This
measurement does not claim live OAuth success.

### Import state across the callback

The callback returns to the allowlisted `/import-resume` destination. No raw
resume file, CV content, or authorization material is stored in browser
storage. A page reload may therefore require the user to select the file again;
the provider connection itself remains persisted behind the server boundary, so
the ready state survives the reload. This is the privacy-preserving behavior
chosen for T214 until a later task defines a separate server-side import
correlation contract.

No human participants were used. This is not user testing. Because the
canonical contract explicitly requires moderated usability testing and the
T203 gate requires live connection/import evidence, human validation is still
required after T213–T215 are implemented and a real provider session is
available.

## Lightweight human protocol for the next valid run

The canonical contract specifies no participant count. Use five adults who can
edit a resume but are not developers or OAuth specialists; use a synthetic
fixture PDF/DOCX and test accounts, never personal resumes or credentials.

Start from a fresh supported local same-host installation. Ask each participant
to: (1) connect Codex, (2) verify that it is ready, (3) import the fixture, (4)
describe what processing means, (5) review a partial/warning result, (6)
recover from an unavailable connection, (7) recover from a malformed file, and
(8) confirm the reviewed resume. The observer may explain only how to return
to the starting screen or stop the test; they must not explain OAuth, hidden
states, buttons, or what an answer means.

Record task completion, first-action correctness, unsolicited jargon questions,
time to each recovery action, whether any participant believed a partial draft
was complete, and whether confirmation was reached without observer help. A
participant passes only if every required task is completed without technical
explanation, no unsafe or unreviewed data is treated as final, and each failure
state has a clear next action. Record failures by task and state, not by
personal data.

## T203 disposition

The onboarding result is **PASS_AUTOMATED_FEASIBILITY** for the deterministic/local
T213-T216 journey: connection, callback, ready state, disconnect, reconnect,
expired/revoked recovery, temporary-unavailable guidance, import/review data
preservation, and the production per-owner provider preflight are covered. This
is not live production OAuth/import proof
and does not replace moderated human validation. T203 remains **NO-GO** for the
independent, already-finalized reason that T246 is failed. T217 remains complete.
T246 was not rerun, reinterpreted, or modified.
