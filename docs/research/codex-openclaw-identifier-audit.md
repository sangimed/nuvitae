# Codex OpenClaw Identifier Audit

Date: 2026-08-23  
Issue: #32

## Decision

Nuvitae's production Codex integration uses `nuvitae` as the OAuth and direct
transport `originator`. The field is preserved in both requests because the
audited official Codex source sends it and every audited compatible transport
sends an originator. The exact value is not fixed by the observed protocol:
OpenClaw uses `openclaw`, while Hermes and the official client use
`codex_cli_rs`. A Nuvitae-owned value avoids both historical coupling to
OpenClaw and impersonation of the first-party Codex client.

Third-party use of the Codex OAuth client and direct ChatGPT backend remains
undocumented. Consequently, `originator=nuvitae` is a compatibility-sensitive
choice rather than a claim of an officially supported integration contract.

## Inventory and classification

| Area                                               | Previous occurrence                                                     | Classification                                                      | Resolution                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Production OAuth authorization URL                 | `originator=openclaw`                                                   | Free-form, compatibility-sensitive protocol field                   | Changed to `originator=nuvitae`; PKCE, state, callback, scopes, and other authorization parameters are unchanged.        |
| Production direct transport                        | `originator: openclaw`                                                  | Required by every audited transport, with a free-form value         | Changed to `originator: nuvitae`; authentication, account, SSE, request metadata, limits, and diagnostics are unchanged. |
| Direct transport user agent                        | Already `nuvitae-codex-direct-provider/1`                               | Nuvitae-owned runtime identifier                                    | Retained.                                                                                                                |
| Spike scripts and evidence                         | OpenClaw values and pinned revision metadata                            | Historical compatibility evidence                                   | Retained unchanged under ADR 0007; these files are not production runtime wiring.                                        |
| Research and specification documents               | OpenClaw source comparisons                                             | Historical source attribution and protocol evidence                 | Retained unchanged so the audited facts remain accurate.                                                                 |
| `openclaw_or_hermes_behavior` supportability value | Semantic evidence classification in domain, persistence, and migrations | Durable compatibility classification, not provider request metadata | Retained to preserve stored-data and Semantic V2 compatibility.                                                          |

## Upstream constraints retained

The official-source and live compatibility evidence still requires or supports
the existing OAuth client identifier, authorization and token endpoints,
loopback callback path, PKCE S256 challenge, state validation, scopes,
`id_token_add_organizations`, `codex_cli_simplified_flow`, direct backend path,
account header, and streaming request shape. None of those fields identifies
OpenClaw, and this change does not alter callback validation, token exchange,
encrypted session persistence, restart recovery, privacy-safe diagnostics, or
fail-closed transport behavior.
