# Codex Subscription Spike: Runtime Isolation

Date: 2026-07-30

Scope: T140 only. This artifact validates non-interactive Codex invocation and the isolation requirements for a possible self-hosted Docker spike runner.

## Decision

No-go for production runtime integration until authentication is solved and a dedicated isolated Codex runner image is created. `codex exec` itself is compatible with non-interactive invocation, but the current Nuvitae workspace and worker images are not designed to run Codex and must not be used as a production provider adapter.

## Verified Official Behavior

- `codex exec` is the documented non-interactive CLI command: <https://developers.openai.com/codex/cli/reference/>
- The CLI supports `--sandbox read-only`, `--sandbox workspace-write`, and `--sandbox danger-full-access`: <https://developers.openai.com/codex/cli/reference/>
- The CLI supports `--json`, `--output-last-message`, `--output-schema`, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, `--cd`, and `--skip-git-repo-check`: <https://developers.openai.com/codex/cli/reference/>

## Experimentally Observed Behavior

Local CLI help confirms support for:

```text
codex exec --sandbox read-only --json --output-schema <FILE> --output-last-message <FILE>
codex exec --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check
```

The local CLI version observed was:

```text
codex-cli 0.146.0
```

The normal Nuvitae Docker workspace and worker images are Node/PNPM runtime images and do not install Codex. The worker image mounts private resume storage and connects to PostgreSQL/queue services; it is too privileged for the model runtime. Existing parser-test isolation is closer to the desired shape: network-disabled, non-root, tmpfs workspace, no repository write access, and no production service credentials.

## Required Bounded Spike Runner

A later runnable spike, if authentication becomes officially supported, must use a dedicated one-shot service or runner with these properties:

- `CODEX_HOME` points to a per-user or per-run isolated directory supplied only by the official integration mechanism.
- Working directory is a temporary empty directory, not the repository.
- Input fixtures are mounted read-only.
- Output directory is a controlled writable directory.
- Repository source is not mounted, except generated spike artifacts after the run if explicitly copied by the runner parent.
- Use `codex exec --sandbox read-only --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check --json --output-schema <schema> --output-last-message <output>`.
- Use an external timeout lower than the product foreground timeout, initially 150 seconds for provider invocation inside the 180-second import budget.
- Do not expose shell, file-editing, repository, arbitrary MCP, browser, GitHub, calendar, or filesystem-write tools to the model.
- Redact prompts, source text, provider payloads, credentials, tokens, session material, and source snippets from logs.

## Inference

`--sandbox read-only` constrains tool execution through Codex, but it is not by itself a full application security boundary. Docker filesystem mounts, network policy, user IDs, tmpfs, output allow-listing, and log redaction are still required outside Codex.

## Unresolved Questions

- Whether Codex has an official hard no-tools mode suitable for semantic extraction.
- Whether `--output-schema` guarantees final-message conformance strongly enough for application use or only biases the final response.
- Whether Codex CLI supports a documented non-interactive ChatGPT subscription refresh path.

## Blockers

- Subscription authentication blocker from T139.
- No dedicated Codex runner image exists in this repository, by design for this bounded spike.
- Network access was blocked in this agent environment, so no authenticated Docker invocation was measured.

## Security Concerns

- Running Codex inside the normal worker would give the model proximity to private storage and service credentials.
- Running Codex from the repository root could expose source and allow file enumeration even under read-only sandboxing.

## Product Implications

The production adapter must be isolated from both the import worker and parser workspace. If Codex remains a candidate after authentication support changes, implement a separate runner first and test it before connecting it to import processing.
