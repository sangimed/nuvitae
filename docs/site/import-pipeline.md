# Import pipeline

**Current:** an import is asynchronous and owner-scoped. Deterministic document
parsing produces evidence; semantic interpretation proposes fields; human review
decides what becomes durable resume content. These are separate trust stages.

```text
Browser              API                  Queue/worker              PostgreSQL
   │                   │                        │                        │
   ├─ submit file ────▶ │                        │                        │
   │                   ├─ authenticate, reserve, store source ───────────▶│
   │                   ├─ publish validation ─▶ │                        │
   │◀─ import identity─┤                        ├─ owner-scoped reread ─▶│
   │                   │                        ├─ validate and extract   │
   │                   │                        ├─ semantic + grounding  │
   │                   │                        ├─ persist review draft ▶│
   ├─ poll status ────▶ │────────────────────────────────────────────────▶│
   │◀─ safe status ────┤                        │                        │
   ├─ review mutation ▶│─ revision/idempotency + transaction ────────────▶│
   ├─ explicit confirm▶│─ create/reuse durable resume atomically ────────▶│
   │◀─ resume ─────────┤                        │                        │
```

Private storage and the provider call are omitted from the sequence columns
for readability, not executed inside a PostgreSQL transaction. See the
[runtime diagram](architecture.md).

## Stage boundaries and failures

| Stage                    | Current responsibility                                                                               | Failure/recovery boundary                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Admission                | API verifies principal, enforces bounded multipart upload and reserves import capacity               | Browser owner IDs are not authority; malformed or over-limit uploads do not bypass validation                                    |
| Private source           | Generated owner/import-scoped keys and durable import initialization                                 | Original filenames are not storage keys; storage/database/queue are separate failure boundaries, not one distributed transaction |
| Queue delivery           | Validated job schemas, owner-qualified reread, deterministic lifecycle transitions                   | Duplicate delivery must not duplicate final state; malformed jobs are rejected                                                   |
| Validation               | PDF/DOCX safety, size/page/text/language constraints                                                 | Unsupported, unsafe, scanned or malformed input remains rejected; a provider is not a safety bypass                              |
| Deterministic extraction | PDF.js/OOXML evidence with source locations; bounded LibreOffice page counting for DOCX              | No OCR; parser failures use typed safe outcomes, not raw stderr or file content                                                  |
| Semantic interpretation  | Worker-configured provider port, bounded text request, current V2 output validation/canonicalization | Credentials stay at the adapter edge; provider text is untrusted                                                                 |
| Grounding and draft      | Candidate values must match source evidence and supported structure before persistence               | Reject unsupported/invented values; accepted partial evidence remains visibly partial                                            |
| Review                   | Owner-scoped read and explicit operations with operation UUID and expected revision                  | Stale revision conflicts require reloading latest state; replay is not a new edit                                                |
| Confirmation             | Explicit confirmation of an eligible reviewed draft, transaction and idempotency                     | No automatic confirmation on extraction; racing confirmation must not create duplicate resumes                                   |
| Source deletion          | Dedicated source/artifact cleanup path, separate from durable resume content                         | Failure/retry and source-only provenance reduction do not authorize deletion of the resume                                       |

For exact limits and hostile-input behavior, use the maintained
[upload-security inventory](https://github.com/sangimed/nuvitae/blob/main/docs/security/upload-security.md).
It supersedes numeric limits scattered in dated research notes.

## Semantic output is not trusted data

The current write contract is semantic V2. V1 readers and historical fixtures
remain compatibility surfaces under
[ADR 0006](https://github.com/sangimed/nuvitae/blob/main/docs/adr/0006-semantic-contract-version-policy.md),
not alternative formats for new providers. Canonicalization and source grounding
are required even when an upstream response is valid JSON.

The workflow can use a limited deterministic partial fallback for selected
provider failures. It does not keep retrying unsafe or ungrounded output until
it happens to pass. Authentication/security failures, unsupported capability,
grounding failures and other excluded categories do not enter that fallback.
The exact classification and budget are owned by
[`SemanticImportWorkflow`](https://github.com/sangimed/nuvitae/blob/main/packages/import-application/src/semantic-import-workflow.ts),
not by this prose or by the BullMQ adapter.

Import sends extracted text to the connected provider, not original document
bytes or general access to the installation. Provider output remains advisory
until reviewed. Field edits retain safe provenance; confirmation produces a
durable structured resume independent of temporary source storage.

## How to investigate without leaking content

Start with the UI's safe public status and the relevant stage. Check service
readiness and the safe event category before examining code. Never copy queue
payloads, source fragments, provider requests/responses, storage references or
credentials into an issue. An import ID is sensitive operational data, not a
public identifier to publish by default.

- A rejected upload: compare supported limits and typed parser failure; use a
  synthetic fixture to reproduce it.
- A timeout: distinguish API connectivity, worker readiness and provider
  timeout. Do not replay jobs manually as a diagnostic shortcut.
- A review conflict: reload the latest revision; do not bypass optimistic
  concurrency or replace the operation ID merely to force a write.
- An invalid semantic envelope: reproduce the schema/grounding category with
  synthetic data. Do not log the real response or weaken validation.
- A source deletion concern: distinguish deadline, scheduled work and completed
  deletion; inspect tests and approved operational evidence rather than assuming
  that an expiry timestamp proves removal.

## Source and test entry points

- [API import use cases](https://github.com/sangimed/nuvitae/tree/main/apps/api/src/import-resume/use-cases)
  and [transport](https://github.com/sangimed/nuvitae/tree/main/apps/api/src/import-resume/transport/http).
- [Queue adapter](https://github.com/sangimed/nuvitae/blob/main/apps/worker/src/import-resume/import-processing.processor.ts)
  delegates to [application workflows](https://github.com/sangimed/nuvitae/tree/main/packages/import-application/src).
- [Domain review and confirmation](https://github.com/sangimed/nuvitae/tree/main/packages/domain/src/resume-import).
- [Worker characterization](https://github.com/sangimed/nuvitae/blob/main/apps/worker/src/import-resume/import-processing.processor.test.ts),
  [integration tests](https://github.com/sangimed/nuvitae/tree/main/tests/integration),
  and [security tests](https://github.com/sangimed/nuvitae/tree/main/tests/security).

This overview is not a complete job/retry catalog or deletion runbook; those
remain explicit [follow-up sections](coverage.md).
