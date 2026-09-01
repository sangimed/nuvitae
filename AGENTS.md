## Destructive filesystem operations

Agents must not execute destructive filesystem commands in this repository.

Forbidden operations include, directly or indirectly:

- `rm`
- `rm -r`
- `rm -rf`
- `unlink`
- `rmdir`
- `find ... -delete`
- `git clean`
- `git reset --hard`
- `git checkout -- .`
- `git restore .`
- shell, Python, Node.js, Perl, Ruby, Docker  or other scripts whose purpose is to delete files or directories

These restrictions also apply when commands are wrapped through:

- `sh -c`
- `bash -c`
- `zsh -c`
- `xargs`
- `sudo`
- absolute executable paths such as `/bin/rm` or `/usr/bin/rm`

Agents must never:

- delete untracked files;
- drop, pop, clear, or delete Git stashes;
- remove files merely because they appear obsolete;
- clean the working tree automatically;
- resolve conflicts by discarding one side wholesale.

When a file appears obsolete or should be removed:

1. leave it unchanged;
2. report the exact path;
3. explain why deletion appears necessary;
4. wait for explicit human approval.

Before any autonomous coding session, create a recoverable snapshot that includes tracked, staged, unstaged, and untracked files.

Use the repository safety launcher when available:

`scripts/run-agent-safe.sh <agent command>`

Only the human operator may approve intentional deletion.

## Project stage and scope

Nuvitae is pre-production and under active product and schema iteration. Avoid
production rollout or backward-compatibility ceremony that the issue does not
require. Reduced ceremony never weakens correctness, security, privacy, owner
isolation, provenance, data integrity, contracts, tests, or supported workflows.

Inspect the implemented code and existing capability boundaries before adding
an abstraction. Treat GitHub issue acceptance criteria as scope boundaries, not
an invitation to unrelated refactors. Clearly distinguish behavior implemented
in the repository from roadmap or planned behavior.

Development, checks, tests, builds, and runtime services use the
repository-supported Docker Compose workflow in `README.md`; do not invent a
parallel host workflow.

## Pre-production schema evolution

Do not create a new SQL/TypeORM migration for every iterative schema change by
default. A reviewed migration is required when the issue or user requests one,
or when migration, upgrade, release, or compatibility behavior is the task.
Otherwise keep entities, the canonical pre-production schema history, fixtures,
and tests consistent using the workflow in `README.md`.

Never enable TypeORM `synchronize`. Treat only the isolated test schemas and
local state explicitly confirmed as disposable as disposable; never reset or
silently mutate a database containing important user or developer data.

Before the first production or hosted release persists real user data, the
project must deliberately establish a production baseline and decide whether to
squash, rebase, or retain pre-production migration history. From that baseline
onward, durable schema changes require reviewed forward-compatible migrations.

## Security engineering invariants

Detailed rationale and the current threat model live in `docs/security/`.
Every change must preserve these rules:

- Treat browser input, uploads and extracted text, provider/AI output, queue
  payloads, webhooks, external APIs, and unproven persisted data as untrusted.
- Enforce authorization server-side with a verified principal and owner-scoped
  access. A client-supplied identity or knowledge of an object ID is never
  authorization.
- Do not weaken fail-closed validation, ownership, grounding, private storage,
  safe logging, or credential isolation to make a feature or test pass. Fix a
  protection narrowly with evidence and a regression test instead.
- Keep secrets, tokens, personal resume data, raw prompts/responses, private
  storage references, and credentials out of logs, fixtures, issues, tests,
  prompts, client bundles, and layers that do not require them.
- Use safe sinks: parameterized persistence, framework-escaped rendering,
  no-shell argument-array process execution, bounded structured logs, and
  explicit URL/network allowlists. Do not substitute malicious-string
  detection for sink safety.
- Apply least privilege and secure defaults to service credentials, filesystem
  access, volumes, network access, and runtime permissions. An insecure fallback
  requires an explicit documented reason.
- Add negative tests for security-relevant changes: unauthenticated/wrong-owner,
  malformed/adversarial input, credential leakage/revocation, untrusted AI
  output, and background-job replay/idempotency as applicable.
- Justify new external dependencies by maintenance health, security history,
  dependency weight, privileges/network access, licence, and whether the
  repository already has a simpler capability.
- Never broadly suppress a security-tool finding. A false positive may be
  suppressed only narrowly, with a documented reason and review trigger.
- Update `docs/security/` when a change alters assets, trust boundaries,
  external communications, sensitive-data handling, or a security invariant.
