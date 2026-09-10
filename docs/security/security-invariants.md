# Secure-development invariants

These rules are the detailed counterpart to the concise `AGENTS.md` section.
They apply to human and automated changes.

## Boundary rules

1. **Treat external data as untrusted throughout its lifecycle.** Validation at
   ingress does not make upload content, queue data, provider output, webhook
   data, or persisted attacker-controlled text safe for a different sink.
2. **Authorize with a verified server-side principal and owner-scoped
   repository operation.** Do not accept owner identity from a body, path,
   query, header, job payload alone, or provider response. Return the same
   unavailable result for absent and wrong-owner resources.
3. **Keep AI advisory.** Separate instructions from source data; expose no
   general tools; validate bounded output; prove grounding; preserve current
   state on failure; require explicit user acceptance for proposed changes.
4. **Keep restricted data on a need-to-know path.** Do not pass secrets or
   resume content to logging, analytics, errors, URLs, browser storage, client
   bundles, build arguments, unrelated containers, or third-party services.
5. **Select safe sinks instead of detecting bad strings.** Use TypeORM or bound
   query parameters, React text rendering, explicit `http`/`https` URL policy,
   fixed executables with argument arrays and `shell: false`, and closed
   structured-event schemas.
6. **Bound work before doing expensive work.** Limit bytes, collection counts,
   decompression, text/output, time, memory, concurrency, retries, queue depth,
   provider calls, pagination, and database execution as applicable.
7. **Fail production configuration closed.** No local identity, development
   password, insecure cookie, schema synchronization, arbitrary callback/return
   URL, missing secret, or debug documentation endpoint may silently become a
   production fallback.

## Required negative evidence

| Change                          | Minimum negative/security tests                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated endpoint/resource | unauthenticated, malformed ID, wrong owner, absent resource with equivalent public response; field allowlist/mass-assignment case                           |
| Mutation/state machine          | stale/replayed operation, invalid transition, concurrent update, partial-failure rollback/idempotency                                                       |
| Input/parser/upload             | empty, malformed, boundary size/count, one over boundary, adversarial structure, timeout/resource limit; #40 supplies upload-specific corpus                |
| Rendering/URL/export            | markup rendered inertly, unsafe scheme not executable, external-resource behavior explicit, sensitive response not cached                                   |
| Credential/session/OAuth        | invalid/expired/revoked state, wrong owner, no raw material in persistence/log/error/client, deletion and rotation behavior                                 |
| AI/provider feature             | instruction-like source remains data, schema/evidence violation rejected, unsupported fact/action rejected, timeout/provider failure leaves state unchanged |
| Background job                  | malformed payload, mismatched owner/resource, duplicate/replay, poison/final failure, bounded retry and privacy-safe failure payload                        |
| Runtime/configuration           | missing/weak secret, production insecure fallback, least mounts/credentials, health failure, expected headers/network policy                                |

## Security review checklist

For a security-impacting pull request, reviewers should be able to answer:

- Which asset and trust boundary changed?
- Where is canonical validation performed, and is it independent of the UI?
- Where is the verified principal introduced and ownership rechecked?
- What new sink, external destination, secret, permission, mount, or dependency
  exists?
- What limits and failure behavior apply? Can retries/replays amplify impact?
- Which restricted fields can reach logs, metrics, errors, provider requests,
  browser caches, or backups?
- Which negative tests demonstrate the invariant rather than only the happy
  path?
- Does the threat model, ASVS evidence, deployment guidance, or vulnerability
  inventory need updating?

## Dependency and tool rules

- Pin direct dependencies and actions; install the lockfile with
  `--frozen-lockfile`; review lockfile and lifecycle-script changes.
- Prefer one high-signal tool per data source. Dependency review, CodeQL,
  secret scanning, and Trivy have distinct purposes; adding overlapping tools
  requires evidence of additional signal.
- Security jobs receive `contents: read` and only the minimum additional GitHub
  permissions. Untrusted pull-request code must not receive deployment or
  provider secrets.
- High-confidence critical/high findings block the relevant release or merge
  according to the documented policy. Low-confidence results are triaged rather
  than globally ignored.
- A suppression identifies the finding, scope, reason, owner, expiry/review
  trigger, and compensating control.

## Architecture change triggers

Update the threat model and verification evidence when adding production auth,
a public endpoint, a user/tenant role, a provider or tool, external URL fetching,
an upload type, a payment/webhook flow, sensitive telemetry, a store/backup, a
container/service, a runtime privilege, or a new distribution/release channel.
