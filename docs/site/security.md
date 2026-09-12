# Security and privacy

The existing `docs/security/` directory is authoritative. This page is a reading
guide and contributor checkpoint, not a second threat model or a certification
claim. Read the [security overview](https://github.com/sangimed/nuvitae/blob/main/docs/security/overview.md),
[threat model](https://github.com/sangimed/nuvitae/blob/main/docs/security/threat-model.md)
and [secure-development invariants](https://github.com/sangimed/nuvitae/blob/main/docs/security/security-invariants.md)
before changing a trust boundary.

## Invariants every contribution must preserve

1. Verify identity server-side and authorize every resource through owner-scoped
   access. A request-supplied owner ID or knowledge of an import ID is not authority.
2. Treat uploads, extracted text, provider output, queue messages and unproven
   persisted content as untrusted. Validation for one stage does not make data
   safe for every later sink.
3. Keep AI advisory: bounded contracts, evidence grounding, fail-closed rejection,
   explicit review/acceptance and no silent replacement of saved content.
4. Keep documents, credentials, tokens, source references, prompts and responses
   out of logs, telemetry, URLs, browser storage and unrelated services.
5. Use safe sinks: bound SQL parameters, escaped React rendering, allowed URL
   schemes, fixed executables with argument arrays and no shell, bounded events.
6. Bound resource consumption and replay effects. Preserve transactional
   ownership, optimistic revisions and idempotency instead of forcing writes.
7. Keep secure configuration fail-closed; never turn on TypeORM synchronization
   or production Local Play to make a failing environment work.

## Read the guide that owns the boundary

| Change                                                      | Authoritative guide                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Upload type, parsing, temporary files, subprocess limits    | [Upload security](https://github.com/sangimed/nuvitae/blob/main/docs/security/upload-security.md)                   |
| Browser response, CSP, cache, OpenAPI exposure, logout      | [Response policy](https://github.com/sangimed/nuvitae/blob/main/docs/security/response-policy.md)                   |
| New asset, provider communication, storage or auth boundary | [Threat model](https://github.com/sangimed/nuvitae/blob/main/docs/security/threat-model.md)                         |
| Required negative tests and dependency review               | [Security invariants](https://github.com/sangimed/nuvitae/blob/main/docs/security/security-invariants.md)           |
| CI scanning, owner-managed GitHub controls                  | [Security automation](https://github.com/sangimed/nuvitae/blob/main/docs/security/automation.md)                    |
| Vulnerability intake and remediation                        | [Vulnerability management](https://github.com/sangimed/nuvitae/blob/main/docs/security/vulnerability-management.md) |
| ASVS applicability and evidence limitations                 | [Verification baseline](https://github.com/sangimed/nuvitae/blob/main/docs/security/verification-baseline.md)       |
| Optional safe funnel counters                               | [Community metrics](https://github.com/sangimed/nuvitae/blob/main/docs/community-funnel-metrics.md)                 |

**Current vs dated findings:** the security overview/audit records a dated
baseline. Later response-policy and automation guides describe implemented
controls, and source-deletion code now exists. Do not infer an open defect or
completed remediation solely from an old audit list. Check the owning code,
tests and issue status. Hosted identity and data-plane requirements remain
future release gates, not guarantees supplied by Community Compose.

## Documentation itself is a disclosure boundary

Use synthetic examples only. Do not include personal resume files, raw prompts,
provider responses, `.env` values, private URLs, unredacted logs or screenshots
of real user information. Link to safe schema/type definitions rather than
copying operational payloads. A local preview is not permission to publish it.
This foundation adds no automatic deployment, analytics or provider integration.
The documentation container mounts only site source/configuration read-only;
it receives no application environment or private volume.
