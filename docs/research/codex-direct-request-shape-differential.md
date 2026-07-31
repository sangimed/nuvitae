# Codex Direct Request Shape Differential

Task: T200 pre-retry audit  
Date: 2026-07-31  
Status: Source audit complete; corrected request manifest passed the local
golden differential and the single bounded live invocation succeeded. No live
invocation was replayed during finalization.

## Pinned Sources

| Source | Revision | Files inspected for this differential |
| --- | --- | --- |
| OpenClaw | `4c331166c40cccb6e4d2da1136c921faed1cc8c1` | `packages/ai/src/providers/openai-chatgpt-responses.ts`, `packages/ai/src/transports/openai-transport-params.ts` |
| Hermes Agent | `5d6aae02bffa7714c4a94f3a0900b37774442dea` | `agent/transports/codex.py`, `agent/auxiliary_client.py`, `tests/agent/test_codex_cloudflare_headers.py` |
| Official Codex | `3016671bb077c43448b8fa88f3edfa9772e17058` | `codex-rs/core/src/client.rs`, `codex-rs/core/src/client_common.rs`, `codex-rs/core/tests/suite/responses_lite.rs`, `codex-rs/core/tests/common/responses.rs`, `codex-rs/codex-api/src/common.rs`, `codex-rs/codex-api/src/endpoint/responses.rs`, `codex-rs/codex-api/src/requests/headers.rs`, `codex-rs/model-provider/src/bearer_auth_provider.rs`, `codex-rs/model-provider-info/src/lib.rs`, `codex-rs/login/src/auth/default_client.rs` |

## Field And Header Classification

| Element | Classification | Evidence |
| --- | --- | --- |
| URL host/path `/backend-api/codex/responses` | mandatory and verified | OpenClaw default backend plus `/codex/responses`; official `CHATGPT_CODEX_BASE_URL` and `ResponsesClient::path()` |
| HTTP method `POST` | mandatory and verified | OpenClaw fetch path and official `ResponsesClient::stream_encoded()` |
| `Authorization` | mandatory and verified | Official `BearerAuthProvider`; OpenClaw/Hermes direct transport |
| `ChatGPT-Account-ID` | conditional and verified | Official bearer provider supports it; OpenClaw sends account id; Hermes may omit on malformed token |
| `originator` | mandatory and verified for audited implementations | OpenClaw uses `openclaw`; official default client supplies `codex_cli_rs`; Hermes uses `codex_cli_rs` for Cloudflare avoidance |
| `OpenAI-Beta: responses=experimental` | conditional and verified in OpenClaw | OpenClaw SSE path; official beta values differ by feature path |
| Responses Lite header | conditional and verified | Official sends only when `model_info.use_responses_lite`; OpenClaw standard path does not require it |
| `Accept: text/event-stream` | mandatory and verified for streaming | OpenClaw SSE path and official `ResponsesClient` |
| `Content-Type: application/json` | mandatory and verified | OpenClaw and official encoded JSON body |
| `content-encoding` | optional | Official compression only when enabled; OpenClaw opportunistic zstd is not required for uncompressed JSON |
| `session-id` / `thread-id` / `x-client-request-id` | conditional and verified | Official `build_session_headers`; OpenClaw session/client request metadata |
| `x-codex-installation-id` | conditional and verified | Official metadata/header tests |
| Browser/Cloudflare-only headers | absent | Hermes documents Cloudflare posture through originator/User-Agent/account id; no audited source requires browser headers |
| Body `model` | mandatory and verified | OpenClaw, Hermes, official request struct |
| Body `store:false` | mandatory and verified for non-Azure/Codex backend | OpenClaw and Hermes use false; official sets false except Azure responses endpoint |
| Body `stream:true` | mandatory and verified | OpenClaw and official stream request |
| Body `instructions` | mandatory for standard audited no-tools shape | OpenClaw and Hermes standard builders put system/developer instruction text in top-level `instructions`; official standard shape does the same |
| Body `input` structured items | mandatory and verified | OpenClaw conversion, Hermes `_chat_messages_to_responses_input`, official `ResponseItem` request |
| Plain string `input` | absent | No inspected source uses a plain string for this path |
| `additional_tools` input item | conditional | Official Responses Lite only; not used for the selected standard no-tools diagnostic |
| Body `tools`, `tool_choice`, `parallel_tool_calls` | optional/conditional | OpenClaw and Hermes add only when tools exist; official standard request carries tool fields through its internal request struct |
| Body `include:["reasoning.encrypted_content"]` | conditional and verified | OpenClaw, Hermes when reasoning enabled, official request builder |
| Body `reasoning` | conditional and verified | OpenClaw option; Hermes default when reasoning enabled; official request builder |
| Body `prompt_cache_key` | optional and verified | OpenClaw, Hermes, official request builder |
| Body `text.verbosity` | conditional and verified | OpenClaw and official model verbosity support |
| Body `client_metadata` | conditional and verified | Official request builder and tests; OpenClaw allows passthrough/client metadata |

## Concrete Mismatches Found

The previous Nuvitae T200 live request mixed a Responses Lite input layout with
the standard audited direct transport shape:

1. Previous body omitted top-level `instructions`. OpenClaw and Hermes standard
   no-tools builders use top-level `instructions`; official Codex uses top-level
   `instructions` unless Responses Lite is active.
2. Previous body encoded the instruction as a developer `message` after an empty
   `additional_tools` item. Official Codex uses that layout only for Responses
   Lite, and it also treats Lite as a distinct mode. OpenClaw/Hermes standard
   no-tools requests use structured message input for replayable user content.
3. Previous request sent the Responses Lite header while not reproducing the
   complete official Lite context. The corrected diagnostic uses the simpler
   source-supported standard Responses request and omits the Lite header.
4. Previous body sent no-tools `tool_choice` and `parallel_tool_calls` fields.
   OpenClaw and Hermes omit tool controls when no tools are exposed.

## Corrected Diagnostic Shape

The corrected spike request is uncompressed JSON with no `content-encoding`.
It sends:

- `model`;
- `instructions`;
- `input` as one user `message` item with one `input_text` part containing only
  `NUVITAE_T200_OK`;
- `store:false`;
- `stream:true`;
- `include:["reasoning.encrypted_content"]`;
- `reasoning:{ effort:"low", summary:"auto" }`;
- `prompt_cache_key`;
- `text:{ verbosity:"low" }`;
- bounded client metadata.

It omits `tools`, `tool_choice`, `parallel_tool_calls`, `additional_tools`, and
Responses Lite for the no-tools diagnostic.

## Machine-Readable Differential

The machine-readable manifests and mismatch list are recorded in
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`
under:

- `expected_request_manifest`;
- `previous_nuvitae_request_manifest`;
- `corrected_request_manifest`;
- `previous_request_mismatches`;
- `corrected_request_mismatches`.

Current corrected mismatch list: `[]`.

Previous mismatch list:

```json
[
  {
    "path": "body_value_types.instructions",
    "expected": "string"
  },
  {
    "path": "input_item_categories",
    "expected": [
      {
        "type": "message",
        "role": "user",
        "content_part_types": ["input_text"]
      }
    ],
    "actual": [
      {
        "type": "additional_tools",
        "role": "developer",
        "content_part_types": [],
        "tools_length": 0
      },
      {
        "type": "message",
        "role": "developer",
        "content_part_types": ["input_text"]
      },
      {
        "type": "message",
        "role": "user",
        "content_part_types": ["input_text"]
      }
    ]
  }
]
```

## Remaining Uncertainty

The corrected live result established transport success for this tested account
and topology. It does not establish a stable or officially supported
third-party public API; future upstream protocol changes may break
compatibility. A 401, 403, 404, 422, or 429 in a future run must still not be
collapsed into request-shape failure.

## Historical Live Retry Gate

The single corrected live retry command was:

```bash
spikes/codex-direct-oauth/run-t200-live.sh
```

It reused the existing T199 volumes, performed no OAuth login, performed no
refresh because the recovered credential was valid, and transmitted only
`NUVITAE_T200_OK`. It must not be replayed merely to finalize T200.
