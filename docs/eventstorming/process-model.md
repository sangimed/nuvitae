# Product timeline and import process board

All event names below are **candidate vocabulary for observed outcomes**, unless
the row explicitly says future/unresolved. They do not name a new event API.
Evidence identifiers link to the [source register](decisions-and-evidence.md).

## Big Picture: from intent to usable resume

| Actor and command                                                                      | Past-tense fact                                                               | Policy, view, and boundary                                                                                                                 | Evidence |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Community owner: sign in                                                               | OwnerSessionEstablished / SignInRejected                                      | Verified identity precedes resource authorization; sign-in UI is not an owner-ID selector.                                                 | E1       |
| Owner: create blank resume                                                             | ManualDraftCreated                                                            | Creation key prevents duplicate creation; manual draft editor and My resumes expose saved work. No provider prerequisite.                  | E2       |
| Owner: edit and save                                                                   | ManualDraftSaved / ResumeChangesSaved                                         | Unsaved preview is not persistence; conflict requires reload. Manual draft and confirmed imported resume are currently distinct kinds.     | E2, E8   |
| Owner: connect provider; external OpenAI device flow completes                         | ProviderConnectionEstablished / ConnectionAttemptFailed                       | Connection availability is not ownership of resume content. Cancellation, reconnect, and disconnect are separate intents.                  | E3       |
| Owner: upload resume                                                                   | ImportAccepted / UploadRejected                                               | Bounded admission and private storage; original source remains temporary and immutable.                                                    | E4       |
| Processing policy: validate and read source                                            | DocumentValidated / DocumentRejected; SourceTextExtracted                     | PDF/DOCX safety and rendered-page limits precede semantic interpretation. Unsupported scans do not become OCR jobs.                        | E4, E5   |
| Import policy: interpret evidence                                                      | SemanticCandidatesProduced / InterpretationFailed                             | Provider output is advisory; bounded deterministic fallback is available only for eligible failures.                                       | E5       |
| Grounding policy: validate candidate evidence                                          | CandidateEvidenceValidated / CandidateEvidenceRejected                        | Source support does not mean the person's history is true or that they accepted the wording.                                               | E5       |
| Import policy: prepare review                                                          | ReviewDraftCreated                                                            | Review view presents fields, warnings, and safe provenance; a partial draft is not a failed resume or a final resume.                      | E5, E6   |
| Owner: confirm, correct, add, or leave out information                                 | FieldConfirmed / FieldCorrected / FieldAdded / FieldExcluded; WarningResolved | Choices affect the review interpretation, never the original file. Readiness is recomputed.                                                | E6       |
| Owner: explicitly create resume                                                        | ImportConfirmed + StructuredResumeCreated                                     | One owner/source draft produces at most one structured resume; confirmation is not an update of an arbitrary existing resume.              | E7       |
| Owner: request optional writing help                                                   | WritingProposalProduced / WritingProposalRejected                             | Advisory proposal must preserve facts; accepting it in the editor still requires saving.                                                   | E8       |
| Owner: preview, open export                                                            | PreviewRendered / PrintDialogInvoked                                          | Canonical renderer consumes resume content. Export reloads the saved confirmed resume; browser printing is not proof of a downloaded file. | E9       |
| Owner: discard unconfirmed import                                                      | ImportDiscarded + SourceDeletionScheduled                                     | No structured resume is created. Scheduling is not completed deletion.                                                                     | E7       |
| Retention policy reaches source deadline, or owner deletes a confirmed resume's source | SourceDeletionStarted / SourceDeletionCompleted / SourceDeletionFailed        | Remove source-reconstructing objects before reducing persisted provenance. Keep the structured resume and edits.                           | E10      |
| Future hosted user: request a billable operation                                       | U: allowance reserved/debited/released                                        | #42 has hypotheses, not implemented billing facts. Provider quota is not a Nuvitae credit balance.                                         | E11      |
| Future user: delete account/resume                                                     | U: account/resume deletion outcomes                                           | Not interchangeable with source deletion; full account/privacy lifecycle is outside the inspected product workflow.                        | E10, E11 |

Connection, manual editing, and source expiry are independent lanes. The board
does not imply that every owner connects a provider, that every preview is
saved, or that source deletion waits for a successful export.

## Import → review → confirmation: detailed process

### 1. Admission and temporary source

**O:** The owner submits a single file. Server-side authentication, owner scope,
attempt/capacity policy, and upload validation guard acceptance. Extension,
declared MIME type, and signature must agree; maximum upload is 10 MB. Private
storage keys are generated internally. The source retention deadline originates
at upload (seven days); confirmation does not start a fresh seven-day clock.

**C commands → facts:** SubmitResume → ImportAccepted and SourceStored;
invalid input → UploadRejected. ScheduleProcessing is an automatic command,
not a claim that semantic interpretation has already succeeded.

**Views:** upload feedback, recoverable in-progress status, draft-ready/partial
result or typed failure. Public status must not expose private storage paths,
source bytes, raw provider output, or database errors.

**Invariant group:** owner/source identity, admission reservation, private
object reference, deadline, and import lifecycle belong together. Database,
storage, and queue cannot be assumed to share one atomic commit. E4 contains
the compensating/error paths; a successful HTTP upload is not a completed draft.

### 2. Safe document reading and interpretation

**O:** The worker handles durable job delivery; application workflows own
processing policy. PDF/DOCX adapters enforce document safety, selectable text,
and at most five rendered pages. Extracted source fragments supply evidence;
they are not semantic assertions. The current user guide supports French,
English, or both, not a claim of universal language support.

**C commands → facts:** ValidateDocument → DocumentValidated or
DocumentRejected; ExtractSourceText → SourceTextExtracted; InterpretSource →
SemanticCandidatesProduced or InterpretationFailed.

The provider is an external actor, never the authority for ownership, evidence
validity, or final resume content. V2 is the new-write semantic contract;
V1 is historical read compatibility (ADR 0006), not a competing new feature.

**O fallback distinction:** `fallbackTriggerForProviderError` allows limited
deterministic partial extraction for no provider, unavailability, rate/quota,
timeout, and selected malformed-protocol output. Authentication/security,
grounding, no-invention, ambiguity, conflict, cancellation, and unknown failures
do **not** become attempts to bypass protection. A fallback still needs usable
source evidence; it is not a promise to produce a draft from every document.

### 3. Evidence validation and review creation

**O:** Evidence validation checks fragment identity/hash/line and bounds;
semantic validation also applies no-invention, conflict, and inference rules.
Validated candidates and review warnings form the review interpretation;
confirmation still checks whether reviewed content maps without data loss.
A review draft's existence does not prove confirmation eligibility. A provider's
confidence is not a substitute for source grounding.

**C commands → facts:** ValidateCandidateEvidence → CandidateEvidenceValidated
or CandidateEvidenceRejected; PrepareReview → ReviewDraftCreated.

Do not interpret “partially grounded” as permission to retain arbitrary invalid
fields. A partial reviewable result and a validation failure are distinct
outcomes. Which invalid/ambiguous outputs fail as a whole versus produce
reviewable omissions depends on the validator and warning policy (E5).

**U:** Product participants should agree how the UI distinguishes “missing from
source,” “not safely interpreted,” and “left out by you.” They imply different
recovery actions even when the resulting resume lacks the same field.

### 4. Review is a conversation, not a fixed sequence

**O:** `applyReviewCommand` supports confirm/edit/remove/add/complete/exclude
and warning-resolution choices. The API binds one operation ID to an owner and
draft, checks the expected review revision, and persists correction plus draft
change. Replays return current review state; they are not necessarily a replay
of the original response. Reviewable lifecycle is checked before replay.

**C commands → facts:** ConfirmField → FieldConfirmed;
EditField → FieldCorrected; RemoveField → FieldExcluded;
AddField → FieldAdded; ResolveWarning → WarningResolved.
Readiness changes are policy consequences, not an implicit ConfirmImport.

**Views:** grouped fields, warnings, preview, safe source labels, review
readiness, conflict/reload message. A source location is provenance for the
original text, not proof that a user's later correction appeared in that file.

**Invariant group:** draft fields, inferred status, review decisions, required
warnings, revision, and corrections must remain consistent. Splitting review
and provenance into independently committed services would weaken this group.

### 5. Explicit confirmation crosses into durable authoring

**O:** The request schema requires explicit confirmation, an operation UUID,
and expected review revision; the server maps its persisted draft, not a
browser-supplied replacement resume. The transaction locks the owner-scoped
draft. If a resume already exists for that source draft, it returns that resume
before checking a stale revision. Idempotency is fundamentally one resume per
owner/source draft, not “one resume per operation UUID.”

For a new resume, readiness, expiry/source availability, required warnings,
unconfirmed inference, at least one confirmed/edited active field, and safe
lossless mapping gate creation. Root and child rows are committed together with
the confirmation state. Repeated/racing confirmation must not duplicate them.

**Important O:** valid, unexcluded explicit fields can remain in the resume
without individual confirmation when the other gates pass. Tests explicitly
retain unreviewed work-experience and education fields. Thus “confirmed resume”
does **not** mean “every field individually verified by the user.” E7 is the
source of truth; tightening that rule would be a product behavior change.

**C facts:** ImportConfirmed and StructuredResumeCreated describe one
transactional outcome, not two eventually delivered messages.

**O:** Later structured-resume edits do not reopen import review. They use
`expectedUpdatedAt`, not `expectedReviewRevision`. Source retention remains
independent of the resume's useful lifetime.

## Scenario challenges and outcomes

| Scenario / perspective                                                     | Observed outcome or unresolved question                                                                                                 | Evidence / follow-up |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Malicious DOCX relationships or signature mismatch / privacy               | Reject unsafe input; do not trust filename or dereference arbitrary relationships.                                                      | E4, E5               |
| Scanned PDF or unsupported document / user                                 | Reject with supported recovery; manual entry or a different upload, not implicit OCR.                                                   | E4                   |
| No provider in Community / product                                         | Manual entry works; eligible import uses limited fallback and warns about omissions.                                                    | E2, E5               |
| Provider unavailable vs credentials revoked / provider                     | Availability may permit bounded fallback; authentication/security failure is not the same branch. Reconnect is distinct from re-upload. | E3, E5               |
| Provider returns some unsupported claims / privacy                         | Grounding/no-invention cannot be bypassed with fallback. Do not equate partial extraction with accepting ungrounded claims.             | E5; H2               |
| Owner corrects a date / user                                               | Correct interpretation with user-edited provenance; never rewrite original source.                                                      | E6                   |
| Owner rejects all fields / product                                         | No active confirmed/edited field means no confirmation; discard or add valid content instead.                                           | E7                   |
| Owner excludes one item but leaves a valid explicit item unreviewed / user | Excluded item is omitted; valid unreviewed explicit content may be retained.                                                            | E7; H1               |
| Two tabs review or save / engineering                                      | Revision/timestamp conflict, reload rather than overwrite; different tokens for the two lifecycles.                                     | E6, E8               |
| Repeated or concurrent confirmation / engineering                          | Return existing resume; no duplicate root/children.                                                                                     | E7                   |
| Source expires before new confirmation / privacy                           | Expiry gates creation; confirmation cannot extend the deadline. Already-created resume lookup has different replay semantics.           | E7                   |
| Source deleted after manual edits to confirmed resume / privacy            | Preserve content; reduce source-only provenance. Storage failure leaves retryable deletion state.                                       | E10                  |
| Source deletion overlaps save or crashes between stores / engineering      | O: separate storage and DB phases. U: exhaustive interleaving/restart proof is not established by the inspected tests.                  | H3                   |
| Owner cancels print / user                                                 | Browser print invocation does not prove file creation; resume remains unchanged.                                                        | E9; H4               |
| Hosted credits exhausted / commercial                                      | Future entitlement policy; do not map external provider quota to a current Nuvitae wallet.                                              | E11                  |
| Owner requests account deletion / privacy                                  | Source deletion is not account deletion or backup erasure. Scope and guarantees need separate design.                                   | H5                   |
