# Codex App-Server Runtime Isolation

Task: T190  
Date: 2026-07-30  
Scope: bounded Docker runtime spike only. No ChatGPT authentication was performed. No production Codex adapter, worker integration, resume-import pipeline integration, product authentication, or UI was added. No real credentials or resumes were used.

## 1. Pinned Runtime And Container Environment

- Package: `@openai/codex`
- Version: `0.146.0`
- Installation command in image: `npm install --global "@openai/codex@0.146.0"`
- Container-reported Codex version: `codex-cli 0.146.0`
- Base image: `node:24.15.0-bookworm-slim`
- Image OS and architecture: `linux arm64`
- Runtime user: `10001:10001`
- Node.js version in container: `v24.15.0`
- App-server stdio startup command: `codex app-server --stdio --strict-config`
- App-server sidecar startup command tested: `codex app-server --listen unix:///socket/codex-app-server.sock --strict-config`
- App-server help in the pinned Linux runtime advertises `stdio://`, `unix://`, `unix://PATH`, `ws://IP:PORT`, and `off`. WebSocket remains rejected for this spike.
- Platform difference from T189 macOS: initialize returned `platformOs: "linux"` and `userAgent` included `Debian 12.0.0; aarch64`; T189 macOS returned `platformOs: "macos"`.
- Framing difference from the initial harness assumption: the pinned Linux app-server parsed newline-delimited JSON-RPC. LSP-style `Content-Length` framing was rejected by the runtime with a JSON deserialization error.
- Runtime warning: Codex reported `bubblewrap` was not found on `PATH` and that it would use the bundled bubblewrap.

## 2. Created Spike Assets

All assets are isolated under `spikes/codex-app-server-runtime/`:

- `Dockerfile`
- `compose.yml`
- `probe-client.mjs`
- `run-stdio-checks.sh`
- `run-sidecar-checks.sh`
- `entrypoint.sh`
- `README.md`
- sanitized evidence files under `spikes/codex-app-server-runtime/evidence/`

The production Compose topology was not modified.

## 3. Topology A Results: Managed Child Process Over Stdio

Selected command: the Nuvitae spike client runs in the same isolated container and launches `codex app-server --stdio --strict-config` as a child process.

Experimentally verified:

- Startup succeeded in Docker.
- `initialize` succeeded with client metadata `{ name: "nuvitae", title: "Nuvitae", version: "0.1.0-t190-runtime-spike" }`.
- Response correlation worked for request ids `1`, `2`, and `3`.
- Notifications were collected: `configWarning` and `remoteControl/status/changed`.
- `account/read` with empty private state returned `account: null` and `requiresOpenaiAuth: true`.
- `model/list` returned a catalog-shaped response without authentication; actual invocation remains T191-T193.
- Closing stdin after requests exited the app-server with code `0`.
- A second complete stdio run succeeded after shutdown, proving bounded restart at the client/process level.
- Failed startup using an invalid app-server option returned non-zero.
- Malformed JSON-RPC input was detected by app-server stderr and then force-killed by the harness after a bounded timeout.
- Process inspection after the run showed only the shell wrapper process and no remaining Codex child or zombie process.

Limitations:

- Authenticated turn start, turn cancellation, shell/file edits triggered by the model, and crash behavior during an authenticated turn are deferred to T191-T193.
- The malformed-input app-server did not self-exit within the short timeout; the spike client had to force termination.

## 4. Topology B Results: Separate Sidecar Over Unix Socket

Availability evidence:

- Pinned runtime help lists `--listen <URL>` with supported values including `unix://` and `unix://PATH`.
- The sidecar server created `/socket/codex-app-server.sock` with mode `srw-------` and owner `codexruntime:codexruntime`.

Observed result:

- Direct JSON-RPC over the shared Unix socket connected but timed out waiting for `initialize`.
- The official `codex app-server proxy --sock /socket/codex-app-server.sock` path also timed out waiting for `initialize`.
- A clean `docker compose --profile sidecar down -v` followed by a fresh sidecar run produced the same result.

Decision for this candidate: experimentally rejected for T191-T195. Unix-socket transport is advertised and a socket is created, but it was not usable for initialization with the pinned `0.146.0` Linux runtime in this bounded Docker topology.

Not verified because the candidate failed at initialization: client reconnect after restart, request/notification correlation, stale socket cleanup beyond compose volume cleanup, and sidecar request lifecycle behavior.

## 5. Isolation Matrix

| Requirement | Topology A | Topology B |
|---|---|---|
| Non-root runtime user | Passed: `uid=10001`, image user `10001:10001` | Passed for both containers |
| Read-only root filesystem | Passed for candidate A; writes to `/root` and `/usr/local` failed | Configured, but candidate rejected before initialization |
| Private Codex state volume | Passed: `/codex-state` private volume | Server used private `codex-sidecar-state`; client had separate tmpfs state |
| Empty ephemeral workspace | Passed: `/workspace` tmpfs, no repo mount | Configured for both containers |
| Bounded temp dirs | Passed: `/runtime-tmp` tmpfs size `32m` | Configured |
| No repository mount | Passed: host repo path not visible | Configured |
| No private resume-storage mount | Passed: synthetic `/private-storage` path absent | Configured |
| No PostgreSQL connectivity | Passed: localhost port 5432 refused/unreachable with `network_mode: none` | Configured; candidate rejected before full network probe |
| No Valkey connectivity | Passed: localhost port 6379 refused/unreachable with `network_mode: none` | Configured; candidate rejected before full network probe |
| No Docker socket | Passed: `/var/run/docker.sock` absent | Configured |
| No host home/Codex config/credentials | Passed by sentinel path checks | Configured |
| No host MCP/plugin inheritance | Passed by sentinel path checks | Configured |
| Environment allowlist | Passed for host-leakage goal; visible env limited to configured values plus base image `NODE_VERSION`, `YARN_VERSION`, `HOSTNAME`, and `PATH` | Configured |
| Dropped Linux capabilities | Configured `cap_drop: [ALL]` | Configured |
| `no-new-privileges` | Configured | Configured |
| CPU/memory/process bounds | Configured `cpus: 0.50`, `mem_limit: 512m`, `pids_limit: 64` | Configured |
| Temp storage bound | Configured tmpfs sizes | Configured |
| Explicit timeout | Probe waits and force-kills stuck children | Probe waits and records timeout |
| Controlled stdout/stderr | Probe captures sanitized JSON evidence and bounded stderr snippets | Same |
| Deterministic cleanup | Compose `down -v` verified for spike volumes | Required after sidecar experiments |

No failed isolation check was found for topology A. Topology B failed usability, not a host-isolation check.

## 6. Host-Leakage Results

Automated checks in topology A verified absence of:

- host `~/.codex` via `/host-home/.codex`
- host Codex auth sentinel path `/codex-state/host-auth.json`
- host repository path `/Users/sangimed/Repositories/nuvitae`
- Nuvitae private storage sentinel `/private-storage`
- host MCP sentinel `/codex-state/mcp-config.json`
- host plugin sentinel `/codex-state/plugins`
- Docker socket `/var/run/docker.sock`

Only synthetic sentinel paths and values were used.

## 7. Capability Matrix

| Capability | Classification | Evidence |
|---|---|---|
| Command execution by container process | Available but contained | Spike client could run `touch` only in writable tmpfs/state paths; rootfs writes failed |
| Model-triggered shell execution | Unverified until authenticated invocation | Generated protocol includes command/thread operations, but no authenticated turn was run |
| Filesystem reads in workspace | Available but contained | Empty tmpfs workspace only |
| Filesystem writes in workspace/temp/state | Available but contained | Writes succeeded only in `/workspace`, `/runtime-tmp`, and `/codex-state` |
| Access outside empty workspace | Neutralized by isolation | No repo/private-storage/host-home mounts; rootfs read-only for writes |
| Plugin discovery | Unverified until authenticated invocation; host inheritance neutralized | Host plugin sentinel absent; generated protocol surface includes plugin-related methods |
| MCP discovery | Unverified until authenticated invocation; host inheritance neutralized | Host MCP sentinel absent; generated protocol surface includes MCP-related methods |
| Web/network access | Disabled for this profile | `network_mode: none`; host lookup failed; DB/queue ports unreachable |
| Account inspection | Restricted unauthenticated | `account/read` returned no account and `requiresOpenaiAuth: true` |
| Model listing | Available unauthenticated, invocation unverified | `model/list` returned response shape without authentication |
| App-server process operations | Available and owned by client | Startup, stdin closure, failed startup, force kill, and restart measured |

Do not claim shell, file-editing, plugin, MCP, or web behavior is disabled inside authenticated Codex turns based on T190. T191-T193 must verify or classify those model-triggered capabilities.

## 8. Process And Failure Results

- Normal startup: passed for stdio.
- Failed startup: invalid option returned non-zero.
- Malformed JSON-RPC input: app-server logged a parse error; harness force-killed after timeout.
- Client disconnect/stdin closure: passed; app-server exited code `0`.
- App-server crash: not directly induced; malformed input stuck until forced termination.
- Forced termination: passed; harness killed stuck malformed-input child.
- Bounded restart: passed; second stdio initialize run succeeded after prior graceful shutdown.
- Stale state cleanup: private state volume was removable with `docker compose down -v`.
- Stale socket cleanup: compose socket volume cleanup worked, but sidecar remained rejected after fresh startup.
- Temporary directory cleanup: only expected probe marker files remained in tmpfs during container lifetime; tmpfs is destroyed after container exit.
- Log redaction behavior: probe redacts configured sentinel values and truncates stderr in evidence.

## 9. Resource-Limit Results

Configured and exercised enough for T190:

- CPU: `cpus: 0.50`
- Memory: `512m` for stdio/server, `256m` for sidecar client
- Process count: `pids_limit: 64`
- Workspace tmpfs: `32m`
- Runtime temp tmpfs: `32m`
- Socket tmpfs/volume: `8m` tmpfs for stdio profile; named shared socket volume for sidecar profile
- Explicit probe timeouts: 5 seconds for request waits, 5 seconds for graceful shutdown, 3 seconds for malformed-input force kill

Memory exhaustion and authenticated turn latency are deferred to T193.

## 10. Privacy-Safe Logging Results

The spike used synthetic metadata only. Evidence files contain runtime version, process state, command outcomes, request ids, response shapes, and bounded stderr. No real credentials, auth files, raw resumes, source snippets, prompts, provider payloads, or private storage were used or logged.

The runtime warning about missing `bubblewrap` includes an official documentation URL but no sensitive data.

## 11. Selected Topology For T191-T195

Selected topology: managed child process over stdio.

Rationale:

- Security: best measured isolation result; no sidecar socket ambiguity.
- Token-blindness: private Codex state volume remains owned by Codex runtime; T191 must verify authenticated persistence without Nuvitae reading files.
- Process isolation: client owns startup, stdin closure, force kill, and bounded restart.
- Filesystem isolation: no repo/private-storage/host-home mounts; empty workspace; read-only rootfs.
- Lifecycle ownership: stdio gives direct child-process exit and crash/timeout control.
- Docker operability: single container profile completed; sidecar did not initialize.
- Worker integration complexity: one managed child process per isolated runtime instance is simpler than supervising a separate sidecar and socket readiness.
- Operational complexity: lower than sidecar; no shared socket volume or stale socket lifecycle.
- Compatibility risk: newline JSON-RPC framing and stdio worked on pinned Linux; Unix-socket behavior did not.

This is only the T190 topology decision. It is not the T195 provider GO/NO-GO.

## 12. Rejected Mechanisms And Reasons

- Experimental WebSocket transport: rejected by task scope and T189.
- Docker socket mounting, Docker Engine APIs, `docker exec`, `docker attach`: not used.
- Custom TCP bridge around stdio: not used.
- Production Codex adapter tasks T164-T165: not implemented.
- Normal worker/resume-import integration: not implemented.
- Sidecar over Unix socket: experimentally rejected because initialization timed out directly and through the official proxy.

## 13. Unresolved Questions For T191

- Does official ChatGPT login work from this isolated Docker runtime?
- Which login path is usable for self-hosted deployments: browser URL or device code?
- Does Codex persist authentication in `/codex-state` across container restart without Nuvitae reading auth files?
- Can app-server report connected, expired, revoked, quota, and rate-limit states without exposing tokens?
- Does authenticated non-interactive invocation require network access beyond OpenAI/ChatGPT endpoints?
- Which Codex app-server capabilities can be disabled by config versus only neutralized by isolation?
- Is installing system `bubblewrap` preferable to relying on the bundled bubblewrap for production hardening?

## 14. Evidence Classification

Experimentally verified:

- Linux Docker startup and `codex-cli 0.146.0` version.
- Stdio initialization, request/response correlation, notification collection, account read, model list response shape, stdin closure, failed startup, forced termination, bounded restart, and no zombie process after stdio run.
- Host leakage checks and network-disabled profile behavior.
- Unix socket advertised, socket file creation, direct/proxy initialization timeouts, and sidecar rejection.

Verified from pinned runtime behavior:

- App-server help options and transport list.
- Linux initialize response platform fields.
- Newline-delimited JSON-RPC framing acceptance.

Official documentation or source:

- T189 recorded official app-server README/source references and generated artifacts for version `0.146.0`.
- Runtime warning references official sandbox prerequisites for `bubblewrap`.

Inference:

- Managed stdio is less operationally complex than sidecar for T191-T195.
- Private Codex state volume can preserve future auth material without Nuvitae reading it, subject to T191 verification.

Unverified:

- ChatGPT authentication.
- Auth persistence and token refresh.
- Authenticated turn invocation.
- Model-triggered shell/file-edit/network/plugin/MCP behavior.
- Turn cancellation latency.
- Authenticated crash/restart recovery.
- Quota/rate/subscription behavior.
