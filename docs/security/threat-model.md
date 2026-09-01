# Threat model and asset inventory

**Model date:** 31 August 2026

**Review trigger:** authentication, public exposure, billing, a new upload or
provider, new external network access, a new sensitive store, or a material
deployment topology change.

## Assets

| Asset | Current location or status | Principal security properties |
| --- | --- | --- |
| Resume source PDF/DOCX | Private Docker volume via generated storage key | Owner isolation, confidentiality, integrity, bounded retention and deletion, never public/executable |
| Extracted fragments and provenance | PostgreSQL import/semantic tables | Owner isolation, grounding integrity, retention aligned to source |
| Structured and manual resume data | PostgreSQL | Owner isolation, concurrency integrity, durable availability, safe export |
| Personal/contact data | Source, PostgreSQL, browser rendering, provider request where needed | Minimization, no telemetry/log leakage, explicit provider disclosure and retention policy |
| Community owner/session | PostgreSQL; raw session only in an HttpOnly cookie | Unpredictability, server-side verification, expiry/revocation, no URL/log exposure |
| Hosted identity/account data | Not implemented | Future trusted identity, recovery, MFA/passkey decision, lifecycle and auditability |
| OAuth state and provider credentials | Pending state in API memory; encrypted session in private volume; opaque reference/status in PostgreSQL | PKCE/state integrity, owner binding, confidentiality, rotation/refresh/revocation/deletion |
| AI provider configuration/output | Worker configuration and bounded provider contracts | Least-privilege credential use; output is untrusted, schema-bound and grounded |
| PostgreSQL | Internal Compose volume | Authentication, least privilege, encryption for hosted transport/backups, migration integrity |
| Queue/job data | Authenticated internal Valkey volume | Confidentiality, schema integrity, owner context, replay/idempotency, bounded retention/backpressure |
| Private-storage identifiers/signatures | PostgreSQL/job payloads and process memory | Non-disclosure, audience/operation/TTL binding, path confinement |
| Application secrets | Environment/operator-generated Community configuration | High entropy, least distribution, no image/Git/log exposure, rotation and revocation |
| Logs/telemetry | Structured stdout today | No resume/secrets, bounded metadata, integrity/access/retention, security-event usefulness |
| Backups | No hosted backup implementation | Future encryption, access control, retention, restore testing, deletion semantics |
| Billing/payment/entitlement data | Not implemented | Future provider minimization, signed webhook verification, idempotency, anti-fraud authorization |
| Source, CI and deployment credentials | Private GitHub repository/operator environment | Least privilege, protected changes, secret scanning, dependency integrity, auditable releases |

Only anonymous synthetic resume fixtures belong in Git. Real resumes, provider
sessions, credentials, private exploit material, and production telemetry do
not.

## Trust boundaries

```text
browser
  │ untrusted HTTP/input and cookie
  ▼
Next.js web ── same-origin /api rewrite ──▶ NestJS API
                                               │
                ┌──────────────────────────────┼───────────────────────┐
                ▼                              ▼                       ▼
          PostgreSQL                    private storage          authenticated queue
                                                                         │
                                                                         ▼
                                                                       worker
                                                                         │
                                              ┌──────────────────────────┴────────────┐
                                              ▼                                       ▼
                                    deterministic parser                    provider adapter
                                    child process/tmpfs                              │
                                                                                    ▼
                                                                          external AI/provider

CI/GitHub ──▶ source, dependencies, build artifacts, repository/deployment secrets
containers ──▶ Compose network, Docker volumes, host kernel/runtime
operator ──▶ Community configuration, TLS/reverse proxy, backups and updates
```

### Boundary decisions

| Boundary | Trusted assertion | Untrusted material and required check |
| --- | --- | --- |
| Browser ↔ Next.js | None from browser state alone | Render with safe framework sinks; constrain URLs; add response headers/cache policy; never expose server secrets |
| Next.js ↔ API | Same-origin routing is deployment plumbing, not identity | API verifies the session/principal and validates every path/query/body independently |
| API ↔ PostgreSQL | Parameterized driver and migration set | Every user-owned query includes trusted owner identity; transactions/locks preserve state invariants |
| API ↔ private storage | Server-generated key grammar | Validate key, owner/import scope, operation/audience/TTL, root confinement and file type/size |
| API ↔ queue | API publisher is trusted to create the envelope | Queue can be replayed or tampered with after compromise; worker validates schema and re-authorizes resource owner |
| Queue ↔ worker | Authenticated network location only | Treat payload as untrusted; deterministic job IDs, idempotent transitions, bounded attempts and opaque failures |
| Worker ↔ private storage | Owner-qualified database aggregate | Never accept arbitrary host paths; verify key and keep parser environment free of storage/provider secrets |
| Worker ↔ parser | Fixed executable and argument arrays | Hostile file bytes/text; filtered environment, no shell, tmp confinement, memory/time/output limits; #40 owns stronger isolation decision |
| Worker ↔ provider adapter | Provider-neutral capability contract | Minimized source data; no raw storage path; explicit instruction/data separation; bounded request/response |
| Provider ↔ external service | TLS endpoint allowlist and scoped token | Service/output/metadata may be malicious or unavailable; no tools; strict schema, grounding, failure categories and review |
| Containers ↔ runtime | Pinned image tag and Compose topology | Host kernel/network/volume are privileged boundaries; non-root, least mounts/secrets, resource/egress controls and patching |
| CI ↔ GitHub/secrets | Reviewed source and locked dependencies | PR code/dependencies are untrusted; read-only permissions by default, no secret exposure to untrusted jobs, scans and artifact provenance |
| Community ↔ operator | Operator controls host and configuration | Fail invalid production config; document HTTPS, secret generation, backup/update responsibility and unsafe overrides |

## Attackers and misuse

- An unauthenticated Internet attacker against a future public deployment.
- An authenticated malicious user attempting BOLA/IDOR, mass assignment,
  state-machine bypass, data enumeration, cost abuse, or another user's provider
  connection.
- A malicious upload or extracted instruction attempting parser exploitation,
  resource exhaustion, prompt injection, SSRF, log/shell/HTML/SQL injection, or
  public storage exposure. Detailed controls remain in #40.
- A compromised direct/transitive dependency, base image, package registry,
  build action, or CI credential.
- A leaked session, OAuth token, provider refresh token, database/queue secret,
  storage key, signing key, backup, or deployment credential.
- A malicious/compromised provider returning hostile output/metadata, retaining
  personal data unexpectedly, or inducing retries/cost.
- An accidental developer or coding-agent regression that removes ownership,
  grounding, fail-closed behavior, safe logging, private storage, or tests.
- An operator exposing internal ports, retaining development credentials,
  disabling TLS, oversharing secrets, or failing to patch a Community install.
- Availability/cost abuse through large bodies, uploads, list enumeration,
  concurrent imports, queue/retry amplification, provider calls, export/render
  work, or future credit/billing bypass.

## STRIDE-oriented abuse cases and controls

| Threat | Representative abuse case | Current control | Remaining action |
| --- | --- | --- | --- |
| Spoofing | Forge an owner header or local-play identity | Identity is attached by trusted middleware; feature guards ignore client owner IDs; local play fails in production | Define hosted identity/session/MFA/recovery boundary before public hosting |
| Tampering | Change another user's resume/review or replay a queue job | Owner-qualified transactions, revisions, operation IDs, deterministic jobs, worker resource re-read | Preserve negative/replay tests for every new mutation/job |
| Repudiation | Dispute a security-sensitive action | Correlation IDs and bounded lifecycle events exist | #24 must define security event retention, access and alerting without PII |
| Information disclosure | Guess an ID, read source/provider token, leak through logs/cache | Opaque not-found, private storage, encrypted sessions, response schemas, privacy logger | Add browser no-store policy; define hosted backup/log/secret lifecycle |
| Denial of service | Flood login/import/provider/parser/queue | Community login throttling, import rolling/queue limits, worker concurrency, parser/provider/DB bounds | Add deployment-wide/global quotas, resource limits and stuck/poison-job operations |
| Elevation of privilege | Provider output or uploaded text becomes executable/authoritative | No provider tools, strict canonicalization/grounding/review; safe SQL/React/process sinks | Keep #40 isolation work and require untrusted-output tests for #56 and future AI features |

## Security invariants derived from the model

1. A verified principal is the only source of owner identity.
2. Every user-owned read/write and asynchronous continuation is owner-scoped at
   the trusted service/persistence boundary.
3. Source bytes, extracted text, queue payloads, and provider output remain
   untrusted at every later sink.
4. Provider output cannot authorize, execute, reveal secrets, invoke tools, or
   persist a state change without deterministic validation and the required
   user decision.
5. Restricted data does not enter logs, URLs, telemetry, public storage,
   fixtures, client bundles, or unnecessary services.
6. Expensive work is bounded per input, user, process, and deployment; retries
   cannot amplify cost without a documented cap.
7. Production configuration fails closed rather than falling back to local
   credentials, local identity, plaintext external transport, or debug mode.
