# Codex Subscription Spike: Credential Isolation

Date: 2026-07-30

Scope: T143 only. This artifact evaluates credential/session isolation, disconnect, revocation, cross-user inaccessibility, and log exclusion.

## Decision

No-go for production credential handling. The only acceptable production path is an official integration that gives Nuvitae documented connection, refresh, disconnect, and revocation semantics without copying undocumented ChatGPT/Codex session material.

## Verified Official Behavior

- Codex CLI has login management commands and supports ChatGPT sign-in and API-key sign-in: <https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt>
- Local CLI help shows `codex login --with-api-key`, `codex login --with-access-token`, and `codex login --device-auth`.
- `codex exec --ignore-user-config` does not load user config, while auth still uses `CODEX_HOME` according to local CLI help.

## Experimentally Observed Behavior

An empty isolated `CODEX_HOME` that exists on disk reports:

```text
Not logged in
```

An absent `CODEX_HOME` path fails before login status:

```text
CODEX_HOME points to "...", but that path does not exist
```

This confirms the spike can force session isolation by setting `CODEX_HOME` to an empty per-run directory. It does not validate how a real ChatGPT session is stored, refreshed, disconnected, or revoked.

## Proposed Isolation Contract For Any Later Experiment

- One `CODEX_HOME` per authenticated Nuvitae user and provider connection.
- `CODEX_HOME` stored outside resume source/artifact storage.
- `CODEX_HOME` never mounted into API, web, database, queue, or normal worker.
- One-shot runner mounts only the selected user connection directory read-only or read-write as required by official docs.
- Disconnect deletes the connection directory through an explicit provider disconnect operation.
- Revocation requires official provider support or clear user instruction to revoke from OpenAI/ChatGPT account settings; local deletion alone must not be presented as remote revocation.
- Logs include only provider kind, connection state, attempt id, latency, failure category, and redacted CLI exit class.

## Inference

Local deletion of a `CODEX_HOME` directory can disconnect Nuvitae from a local session copy, but it cannot prove remote revocation of a ChatGPT subscription session. Without an official revocation API or documented device/session management behavior, product copy must not promise revocation beyond local disconnect.

## Unresolved Questions

- Which files in `CODEX_HOME` contain credentials or refresh/session material.
- Whether access-token login is documented for third-party subscription integrations or only direct CLI use.
- Whether account-level revocation events can be detected non-interactively.
- Whether session expiration produces a stable machine-readable CLI event.

## Blockers

- The spike did not read any real credential file by design.
- No official third-party storage/revocation contract was identified.
- No cross-user authenticated run was performed because that would require real user credentials and provider access.

## Security Concerns

- Raw access tokens, refresh tokens, cookies, or profile auth files must never be copied from a user's host profile into Nuvitae.
- Session directories must be excluded from backups, logs, diagnostics, fixture artifacts, and source retention jobs.
- A compromised self-hosted instance could expose user subscription credentials if Nuvitae stores undocumented session material.

## Product Implications

Connection UI and import flows must not be built until the credential contract is official. If a future implementation uses API keys instead, the product must describe it as API-key provider configuration, not reuse of an existing ChatGPT subscription.
