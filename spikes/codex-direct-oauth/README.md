# Codex Direct OAuth Compatibility Spike

This directory is a disposable local compatibility spike only. It is not
production application code and is not wired into the API, web app, worker,
domain, queue payloads, or persistence model.

Supported mode:

- macOS with local Docker Desktop or equivalent;
- browser and Docker host on the same physical machine;
- host callback bound only as `127.0.0.1:1455`, plus `[::1]:1455`
  when Docker Desktop accepts explicit IPv6 loopback publication;
- container relay on `2455`;
- broker callback listener on container `127.0.0.1:1455`;
- disposable broker memory only.

Run deterministic synthetic checks:

```sh
node --test spikes/codex-direct-oauth/test/*.test.mjs
node spikes/codex-direct-oauth/secret-scan.mjs
```

Consolidate sanitized T201 live evidence into the checked-in aggregate matrix
(fully offline; no OAuth, Codex, Docker, or live Campaign-B attempt). The
authoritative evidence for each case is the single passing attempt recorded in
`campaign-b-authorizations.json`; C01's legacy canonical evidence is preserved
unchanged. The command fails closed on ambiguous successful attempts:

```sh
node spikes/codex-direct-oauth/consolidate-t201-matrix.mjs
```

Re-measure T202 offline from the accepted sanitized evidence (fully offline; no
OAuth, Codex, Docker, or live Campaign-B attempt). The evaluator selects the
same authoritative attempts as the T201 consolidator, fails closed on missing,
malformed, conflicting, or ambiguous evidence, and writes the sanitized
aggregate `evidence/codex-direct-oauth-t202-metrics.json`:

```sh
node spikes/codex-direct-oauth/re-evaluate-t202.mjs
```

Regression tests for the T202 evaluator:

```sh
node --test spikes/codex-direct-oauth/test/t202-evaluator.test.mjs
```

Evaluate T245 offline from the accepted sanitized T199/T200 evidence (fully
offline; no OAuth, Codex, Docker, credential access, or live lifecycle
attempt). The evaluator fails closed on missing, malformed, or contradictory
evidence, distinguishes `not_exercised`, `deterministic_only`, and
`live_observed` observations, and writes the sanitized aggregate
`evidence/codex-direct-oauth-t245-lifecycle.json`:

```sh
node spikes/codex-direct-oauth/re-evaluate-t245.mjs
```

The accepted T245 aggregate `evidence/codex-direct-oauth-t245-lifecycle.json`
exists (accepted live run 2026-08-07), and `re-evaluate-t245.mjs` now passes
against the accepted evidence. The aggregate is generated fail-closed and
offline: it is written only when every canonical criterion is satisfied by the
accepted sanitized evidence, and the command exits non-zero without writing
when evidence is missing, malformed, or contradictory. The evidence records
`observation_timestamp`, `connection_status_after_callback`, and the
expired/invalid-credential recovery category. Provider-side remote revocation
remains not exercised and is not claimed; canonical T245 does not require it.

Regression tests for the T245 evaluator and the sanitized T199 lifecycle
evidence builder:

```sh
node --test spikes/codex-direct-oauth/test/t245-evaluator.test.mjs
node --test spikes/codex-direct-oauth/test/t199-lifecycle-evidence.test.mjs
```

Re-evaluate the consumed T246-C01-A01 live attempt offline (fully offline; no
OAuth, Codex/OpenAI/provider request, network, credential access, or live
runner). The verifier reads only the immutable historical sanitized evidence,
the checked-in artifact pins, and the authorization registry; it never rewrites
the historical evidence. It recomputes the canonical T246 complete gate from
the retained `evaluation_metrics` projection and writes a derived acceptance
artifact reporting `semantic_result=PASS`, `runner_finalization=FAIL`, while
T246 stays INCOMPLETE and T203 stays NO-GO:

```sh
node spikes/codex-direct-oauth/re-evaluate-t246-a01.mjs
```

Regression tests for the T246 path handling, finalization gate, consumed
attempt semantics, and the offline re-evaluation:

```sh
node --test spikes/codex-direct-oauth/test/t246-path-resolution.test.mjs
node --test spikes/codex-direct-oauth/test/t246-live-runner-evidence.test.mjs
node --test spikes/codex-direct-oauth/test/t246-authorization.test.mjs
node --test spikes/codex-direct-oauth/test/t246-live-bridge.test.mjs
node --test spikes/codex-direct-oauth/test/t246-re-evaluate-a01.test.mjs
```

Run the non-OAuth loopback preflight:

```sh
cd spikes/codex-direct-oauth
node host-preflight.mjs
```

Validate Compose:

```sh
docker compose -f spikes/codex-direct-oauth/compose.yml config
```

Run the live browser proof:

```sh
sh spikes/codex-direct-oauth/run-live.sh
```

Run the T199 live credential lifecycle proof (two browser authentications):

```sh
sh spikes/codex-direct-oauth/run-t199-live.sh
```

The T199 runner creates and preserves two dedicated Docker named volumes by
default: `nuvitae-codex-direct-oauth-t199-key-live` and
`nuvitae-codex-direct-oauth-t199-credentials-live`. The key is never a macOS
bind mount. The broker runs as UID 1000 with a read-only root filesystem,
read-only key volume, read/write credential volume, dropped capabilities, and
no-new-privileges. Only safe result JSON is consumed by the host; the full
authorization URL is printed live and is not persisted.

The T199 runner now records `observation_timestamp` at evidence assembly,
`connection_status_after_callback` from the broker's verified post-callback
state, `callback_completion`/`callback_state_validated`/`token_exchange_succeeded`,
the expired/invalid-credential recovery category, and the live explicit
reconnect result (`reconnect` broker command). No token, account identifier,
authorization code, or raw provider response is included.

The broker prints the full authorization URL only to the live terminal. The
parent lifecycle runner receives only booleans, sanitized redirect metadata, and
safe categories. The first live-attempt JSON is archived before the second live
attempt writes current evidence.

The completed T200 live direct invocation proof used the preserved T199 volumes:

```sh
sh spikes/codex-direct-oauth/run-t200-live.sh
```

T200 did not publish callback ports and did not perform browser OAuth. It
builds a disposable image, runs the broker as UID 1000 with the T199 key volume
mounted read-only and the T199 credential volume mounted read/write, performs at
most one refresh only when the encrypted access credential is near expiry, then
executes one fixed synthetic Codex Responses request for `NUVITAE_T200_OK`.
Evidence is sanitized and written to
`spikes/codex-direct-oauth/evidence/codex-direct-oauth-t200-invocation.json`.

The single bounded invocation succeeded with HTTP 200 and valid SSE framing
detected from body bytes despite a missing `Content-Type`; 15 events were
processed and `NUVITAE_T200_OK` was verified. This is compatibility evidence
for the tested local topology only, not proof of a stable or officially
supported third-party public API. OpenClaw and Hermes are corroborating audited
references; official Codex source remains the primary behavioral reference.
