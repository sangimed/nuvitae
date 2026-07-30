# Codex Subscription Spike: Authentication

Date: 2026-07-30

Scope: T139 only. This artifact records whether Nuvitae can officially use an existing user-authenticated Codex/ChatGPT subscription session for a self-hosted third-party resume parser.

## Decision

No-go for production Codex subscription authentication in Nuvitae at this time.

The Codex CLI officially supports ChatGPT sign-in for local Codex use and also supports API-key authentication, but the spike did not find an official, documented third-party application integration that lets Nuvitae broker, persist, refresh, revoke, or impersonate a user's ChatGPT subscription session inside a self-hosted Docker worker.

## Verified Official Behavior

- OpenAI documents Codex CLI authentication with ChatGPT sign-in and API key authentication: <https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt>
- OpenAI documents `codex exec` as non-interactive Codex CLI execution: <https://developers.openai.com/codex/cli/reference/>
- The CLI reference documents sandbox selection, JSONL events, `--output-last-message`, and `--output-schema`: <https://developers.openai.com/codex/cli/reference/>
- ChatGPT sign-in is a user-level Codex CLI authentication path. The official docs do not describe a supported OAuth authorization-code, refresh-token, or service-token contract for a self-hosted third-party app to collect and use a user's ChatGPT subscription session.

## Experimentally Observed Behavior

Host CLI:

```text
codex-cli 0.146.0
```

Authentication probe with an empty isolated `CODEX_HOME`:

```text
env CODEX_HOME=/tmp/nuvitae-codex-spike-empty-home codex login status
Not logged in
```

Non-interactive invocation with an empty isolated `CODEX_HOME`, read-only sandbox, JSONL events, and an output schema reached the OpenAI Responses transport and failed because this agent environment blocks DNS/network access:

```text
failed to connect to websocket ... wss://api.openai.com/v1/responses
Falling back from WebSockets to HTTPS transport
stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)
```

This validates local CLI argument compatibility and the provider-unavailable error shape, not successful provider parsing.

## Inference

- A user can authenticate Codex for their own CLI environment, but Nuvitae cannot safely treat the user's ChatGPT subscription session as an application credential unless OpenAI publishes an explicit third-party integration model for that use.
- Reading, copying, transforming, or storing Codex session material from a user profile would be outside the supported behavior found during this spike and would violate the feature constraints.

## Unresolved Questions

- Whether OpenAI will expose an official Codex provider connection API for third-party self-hosted applications.
- Whether ChatGPT subscription quotas, rate limits, and entitlement states can be queried in a provider-neutral way by an application.
- Whether Codex CLI ChatGPT sign-in is intended only for direct user-operated developer workflows rather than embedded application workloads.

## Blockers

- No official third-party subscription-authenticated provider connection contract was identified.
- No official refresh, revocation, cross-user isolation, or entitlement API was identified for application-managed ChatGPT subscription sessions.
- The available CLI authentication paths require either interactive user login or credential material supplied to `CODEX_HOME`; the spike constraints forbid handling undocumented raw session material.

## Security Concerns

- Copying a user's local Codex/ChatGPT auth files into Nuvitae would risk credential exposure, cross-user leakage, revocation ambiguity, and unsupported session handling.
- API-key authentication is official but is not equivalent to using an existing ChatGPT subscription session and would shift billing/account responsibility.

## Product Implications

- Nuvitae should not ship a Codex subscription adapter based on user profile scraping or undocumented OAuth/session behavior.
- If provider-backed semantic parsing is required before OpenAI publishes a supported subscription integration, use a provider-independent boundary with an officially supported API-key or hosted provider integration instead.
