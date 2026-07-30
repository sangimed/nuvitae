# Codex Subscription Adapter Spike: Go/No-Go

Date: 2026-07-30

Scope: T145 only.

## Final Decision

No-go for implementing a production Codex subscription adapter now.

A no-go result is the correct spike outcome: the official and experimental evidence does not support silently turning this into production provider code.

## Decision Summary

| Question | Result |
| --- | --- |
| Official supported subscription-authenticated integration exists | No |
| Works non-interactively in Docker | Unverified; CLI supports non-interactive mode, current images do not include a dedicated runner |
| Model capabilities can be constrained adequately | Unverified; read-only sandbox exists, hard no-tools behavior remains unresolved |
| Credentials remain acceptably isolated | No for production; empty `CODEX_HOME` isolation is possible, real session handling is unsupported |
| PDF input viable | Original PDF unverified; extracted text with PDF source locations selected for later experiment |
| DOCX input viable | Original DOCX unverified; deterministic DOCX text with source locations selected for later experiment |
| Strict structured output reliable enough | Unverified; CLI supports `--output-schema`, no authenticated responses measured |
| Quality and latency acceptable | Unverified |
| Quota and failure modes understood | Provider unavailable and missing auth observed; quota unverified |
| Legal/terms uncertainty acceptable | No; third-party subscription session use is unresolved |

## Verified Facts

- Codex CLI supports ChatGPT sign-in and API-key authentication for Codex CLI use: <https://help.openai.com/en/articles/11381614-api-codex-cli-and-sign-in-with-chatgpt>
- `codex exec` is the official non-interactive command and supports JSONL event output, final-message output, output schema, and sandbox selection: <https://developers.openai.com/codex/cli/reference/>
- Local CLI version observed: `codex-cli 0.146.0`.
- Empty isolated `CODEX_HOME` reports `Not logged in`.
- Network/provider unavailability produces JSONL error events and `turn.failed`.
- The Nuvitae worker/parser foundations already support deterministic PDF/DOCX source preparation and isolated parser workspaces.

## Experimentally Observed Results

| Observation | Result |
| --- | --- |
| `codex --version` | `codex-cli 0.146.0` |
| Empty isolated auth status | `Not logged in` |
| Non-interactive run with schema and JSONL | Reached provider transport, failed due network/DNS |
| Authenticated extraction | Not run |
| Docker runner extraction | Not run |
| Quota exhaustion | Not run |
| Malformed output | Not run |

## Assumptions And Inference

- An official third-party ChatGPT subscription integration does not exist for this use because the reviewed official docs describe CLI sign-in, not an application-managed subscription provider connection.
- A dedicated one-shot runner can likely use `codex exec` safely only after authentication is solved, because CLI flags support non-interactive execution and read-only sandboxing.
- Extracted text with stable source locations is the lowest-risk input representation because it preserves evidence anchors and minimizes source exposure.

## Selected Input Representation

Selected for any later authenticated experiment: deterministic extracted text with stable source locations plus compact layout hints.

Rejected for now:

- Original PDF: no documented `codex exec` PDF file input contract was found.
- Original DOCX: no documented `codex exec` DOCX file input contract was found.
- Rendered page images: possible via image attachment, but evidence anchoring, latency, and privacy exposure are weaker and unmeasured.

## Measured Quality And Latency

All extraction-quality metrics are unverified because no authenticated provider response was produced:

- Field precision: unverified.
- Field recall: unverified.
- Work-experience grouping accuracy: unverified.
- Valid-evidence rate: unverified.
- Invented-field rate: unverified.
- Schema-valid response rate: unverified.
- Successful latency: unverified.

Observed failure latency was not recorded as a quality metric because the failure was caused by this agent environment's network restrictions, not the provider under normal operation.

## Unacceptable Failure Modes

- Copying or persisting raw ChatGPT/Codex session material from a user profile.
- Using undocumented OAuth, cookie, browser-profile, or token flows.
- Running Codex in the normal worker with private storage and service credentials mounted.
- Mounting the repository writable for resume parsing.
- Logging prompts, source text, source snippets, provider payloads, credentials, tokens, or session material.
- Creating review drafts from schema-invalid, evidence-free, inferred-only, or invented provider output.

## Acceptance Thresholds For Later Production Implementation

A later production implementation may proceed only if all thresholds below are met with official interfaces and anonymous fixtures:

- Official subscription-authenticated integration documented by OpenAI, or explicit product switch to a supported API-key/provider model.
- 100% credential/session isolation tests pass across two users and disconnect.
- 0 credential/session/source leaks in logs and generated artifacts.
- 100% schema-valid response rate for the accepted fixture suite or safe provider-failure recovery for every invalid output.
- 100% extracted candidates include valid source evidence or are rejected.
- 0 accepted invented fields in the evaluation suite.
- At least 0.90 field precision on supported explicit fields.
- At least 0.80 field recall on supported explicit fields.
- At least 0.85 work-experience grouping accuracy.
- P95 provider invocation latency at or below 150 seconds for supported 5-page-or-less inputs.
- 100% timeout, malformed-output, missing-auth, provider-unavailable, quota/rate-limit, and disconnect scenarios map to provider-neutral recovery states.

## Fallback Recommendation

Do not build T164-T165 Codex subscription adapter production code from this spike. Continue with provider-independent contracts and validation, then choose one of these supported paths:

- Official OpenAI API-key based provider integration for deployments that configure an API key.
- Another provider with a documented application authentication contract.
- Manual entry plus limited deterministic partial fallback, with no claim of reliable full semantic parsing when no provider is available.
