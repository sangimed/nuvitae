# Security overview

This directory is Nuvitae's durable security architecture baseline. It records
what the repository implements today, what remains a release gate, and the
invariants that contributors must preserve. It does not claim certification,
penetration testing, or blanket OWASP ASVS compliance.

## Security objective

Nuvitae follows **secure by design + secure by default + continuous
verification across the lifecycle**. Early design and CI controls complement,
rather than replace, credential rotation, vulnerability monitoring, runtime
detection, incident response, patching, and post-deployment verification.

The default verification target is [OWASP ASVS 5.0.0 Level
2](https://owasp.org/www-project-application-security-verification-standard/)
because resume and provider data are sensitive. Applicability and evidence are
recorded in [the verification baseline](verification-baseline.md); Nuvitae does
not currently satisfy the complete target.

## Current product boundary

As audited on 31 August 2026:

- Community is a loopback-only, single-installation-owner deployment. Its
  high-entropy access secret creates a server-side, hashed-reference session.
- Local Play is development-only, uses one server-configured identity, and
  refuses `NODE_ENV=production`.
- Hosted multi-user production authentication, account recovery, billing, and
  public deployment infrastructure do not exist. Their controls are future
  requirements, not implemented posture.
- The browser uses a same-origin `/api` rewrite. The implemented architecture
  neither enables nor needs cross-origin credentialed CORS.
- PostgreSQL and Valkey are internal Compose services. Uploaded sources and
  encrypted provider sessions use a private Docker volume mounted only into API
  and worker.
- Import validation and semantic output canonicalization fail closed. Provider
  output remains a proposal behind schemas, source grounding, deterministic
  validation, review, and explicit confirmation.

## Data classifications

| Class | Examples | Minimum handling |
| --- | --- | --- |
| Restricted secrets | session tokens, provider access/refresh tokens, storage/encryption keys, database/queue credentials, CI/deployment credentials | Never log or expose to clients; least-privilege access; authenticated encryption where persisted; rotation and revocation plan |
| Restricted personal data | source documents, contact details, structured resume content, source fragments/evidence | Owner-scoped; private transport/storage; minimized provider transmission; bounded retention/deletion; excluded from telemetry and test fixtures |
| Sensitive operational data | import/correlation IDs, provider status, security events, vulnerability reports, backup metadata | Bounded and access-controlled; retention documented; avoid creating an ownership oracle |
| Public/non-sensitive | health status, public UI assets, anonymous synthetic fixtures | Integrity and availability controls still apply |

## Implemented strengths

- A verified-principal guard derives owner identity from trusted middleware;
  controllers do not accept owner IDs.
- Owner-qualified repository reads, composite ownership constraints, opaque
  not-found behavior, transactions, locks, and negative isolation tests cover
  imports, drafts, resumes, review, semantic artifacts, and provider sessions.
- Queue payloads are schema-validated and owner-bearing; workers re-read the
  resource by both import ID and owner rather than trusting the ID alone.
- Strict Zod contracts, bounded request fields, Multer upload limits,
  parameterized TypeORM/SQL, React escaping, safe URL schemes, and no-shell
  process execution protect common injection sinks.
- Private source keys are generated, owner/import scoped, path-confined, and
  stored with restrictive permissions. Provider sessions use AES-256-GCM with
  owner/connection/reference associated data.
- Import rate, queue depth, worker concurrency, parser memory/time/output, DOCX
  expansion, provider request/response, and database statement limits are
  bounded.
- Production containers run as non-root; the parser temporary mount is
  `noexec,nosuid,nodev`; worker uses `no-new-privileges`; database and queue have
  no default host publication.
- Privacy-safe event schemas and logging tests exclude resume content,
  filenames, prompts, credentials, tokens, stack traces, and arbitrary fields.

## Known release gates

There were no verified P0 findings in the audited implementation. Before a
public hosted release, the P1 findings in
[the dated audit](audit-2026-08.md#prioritized-findings) must be closed. The most
important are production authentication/session architecture, browser security
headers and cache policy, security verification in CI, hosted least-privilege
data-plane/runtime configuration, upload-parser hardening tracked by issue #40,
and source-deletion execution tracked by issue #57.

## Documentation map

- [Threat model](threat-model.md) — assets, trust boundaries, attackers, and
  abuse cases.
- [Security invariants](security-invariants.md) — non-negotiable engineering
  properties and security-sensitive change review.
- [Verification baseline](verification-baseline.md) — ASVS, SAMM, SSDF,
  supply-chain, CI, and testing decisions.
- [Vulnerability management](vulnerability-management.md) — triage,
  remediation, disclosure, and release response.
- [31 August 2026 audit](audit-2026-08.md) — implementation evidence,
  findings, priorities, and follow-up ownership.

## Related scope

- GitHub issue #40 owns detailed hostile-upload, parser-isolation, malware/CDR,
  and upload prompt-injection hardening. This audit consumes, but does not
  duplicate, that scope.
- Issue #28 owns the broader MkDocs developer/architecture site. These security
  pages should become its security section rather than be copied.
- Issues #24 and #59 own observability architecture and privacy-safe metrics.
  Security event requirements here constrain those implementations.
- Issue #57 owns user-triggered and retention-driven source deletion.
