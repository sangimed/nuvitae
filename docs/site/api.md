# API architecture and contracts

The NestJS API is the public business boundary. Next.js forwards browser
requests through same-origin `/api`; controller routes below are paths at Nest,
without that prefix. The worker has no public product HTTP API. This chapter
describes the implementation at `c2e44a4` (2026-10-17).

## Request path and module ownership

```text
Browser /api/... -> Next rewrite -> Nest bootstrap response policy
                                   -> Community or Local Play principal issuer
                                   -> VerifiedPrincipalGuard
                                   -> feature controller + contract validation
                                   -> application service / domain policy
                                   -> repository, storage, queue or provider port
                                   -> adapter
```

The [root module](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/app.module.ts)
selects Community or Local Play composition. Shared
[product composition](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/runtime/product-runtime.module.ts)
wires feature-owned import and provider-connection runtime modules independently
from the authentication adapter. Controllers translate HTTP; use-case services
coordinate authorization, policy and side effects. Persistence composition binds
repository tokens. Keep concrete database, queue and provider details out of
domain policy; use the [module map](repository.md) and enforced architecture
tests when choosing where a change belongs.

This is a description of existing seams, not a requirement to add another layer
to every simple endpoint. Review/confirmation services currently live in the
API's import use-case directory; shared processing and provider policy live in
`@nuvitae/import-application`.

## Verified identity before owner-scoped access

Community middleware resolves a server session before attaching a verified
principal. Local Play's separate development adapter attaches its configured
identity. Neither a body owner ID nor an identity-like header authorizes access.
The shared
[`VerifiedPrincipalGuard`](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/auth/verified-principal.guard.ts)
captures the verified context; feature controllers consume it through
`getGuardedAuthenticatedContext` and pass its user ID to the use case.

The use case and repository must still scope the resource to that owner. An
authenticated user knowing an import, field, draft or resume ID is insufficient.
Missing and wrong-owner resources share a public not-found outcome. Authentication
does not remove the need to validate lifecycle, revision or explicit consent.
Community authentication's own public session/login routes and health endpoints
have different access needs; do not indiscriminately place them behind the
feature guard.

## Wire schemas are the contract

[`packages/contracts/src`](https://github.com/sangimed/nuvitae/tree/main/packages/contracts/src)
owns shared Zod request/response schemas. Treat request bodies as `unknown`,
validate at the owning boundary, and explicitly map safe public responses.
Strict request objects reject unknown keys; a TypeScript annotation alone does
not validate input. Domain validation remains responsible for business meaning
after shape validation.

For example, the
[review controller](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/transport/http/review.controller.ts)
delegates body validation to its service and parses successful responses against
the shared schema. The
[workspace controller](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/resume-workspace/resume-workspace.controller.ts)
validates its update schema before invoking the service. These are both current
patterns; there is no claim of one global Zod request pipe or universal response
envelope.

| Boundary                                                                 | Where to inspect the contract                                                                                                           | Behavior to preserve                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /import-resume`                                                    | [Upload transport](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/transport/http/start-import.controller.ts)  | Exactly one `file` multipart part, bounded upload, verified owner, safe metadata     |
| `GET/PATCH /import-resume/:importId/review`                              | [Review schemas](https://github.com/sangimed/nuvitae/blob/main/packages/contracts/src/import-resume/review.ts)                          | Safe grouped draft read; one validated action with operation UUID/review revision    |
| `POST /import-resume/:importId/confirm`                                  | [Confirmation schemas](https://github.com/sangimed/nuvitae/blob/main/packages/contracts/src/import-resume/confirmation.ts)              | Explicit confirmation of current reviewed state; no arbitrary client-supplied resume |
| `POST /import-resume/:importId/discard`                                  | Same confirmation schema file                                                                                                           | Explicit discard, current revision, cleanup scheduling                               |
| `GET/PATCH /structured-resumes/:resumeId`                                | Confirmation schemas and [workspace contract](https://github.com/sangimed/nuvitae/blob/main/packages/contracts/src/resume-workspace.ts) | Safe owner-scoped content; save requires `expectedUpdatedAt`                         |
| `POST /manual-resume-drafts`; `GET/PATCH /manual-resume-drafts/:draftId` | [Manual schemas](https://github.com/sangimed/nuvitae/blob/main/packages/contracts/src/manual-resume.ts)                                 | Creation key, validated content and update timestamp; owner from principal           |
| `DELETE /structured-resumes/:resumeId/source`                            | Confirmation schemas                                                                                                                    | Source deletion preserves the durable resume; use the dedicated service              |

This map is a starting point, not a complete endpoint inventory. Status/timing,
provider connections, contextual editing and Community auth have their own
feature controllers. Inspect them before reusing a response or adding a route.

## Failures, conflicts and retry decisions

HTTP status and stable machine code guide recovery. Public wording must remain
safe and useful; raw exceptions, driver diagnostics, provider bodies, source
snippets and credentials are never response content or debugging instructions.

| Outcome   | Examples in current features                       | Caller action                                                             |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| 400       | `validation_failed`; unsafe multipart metadata     | Correct input; do not retry unchanged                                     |
| 401       | `authentication_required`                          | Establish a valid session                                                 |
| 404       | `not_found` for missing/wrong-owner resources      | Return to an available owner resource; do not reveal another owner's data |
| 409       | `stale_review`, `stale_update`, lifecycle conflict | Reload current state and reconcile; do not blindly overwrite              |
| 410 / 422 | Expired import / confirmation blockers             | Follow the feature's recovery or finish required review                   |
| 413 / 429 | Upload size / admission limits                     | Choose a permitted file or respect the returned delay                     |
| 5xx       | Safe internal failure or temporary unavailability  | Inspect safe operational evidence before a bounded retry                  |

Exact codes/status mappings are feature-specific. The
[upload exception filter](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/transport/http/start-import-exception.filter.ts)
returns `statusCode`, `code`, `message` and sets `Retry-After` when supplied;
review/confirmation contracts use versioned `status`, `requestId`, `code`,
`userMessage` envelopes. The shared guard and framework validation can produce
other shapes. Clients must validate the contract they actually consume, not
assume every error has `userMessage` or a correlation identifier.

An operation UUID is not a universal retry guarantee. Review replay rules,
owner/source-draft confirmation uniqueness, creation keys and timestamp-based
editing each have different semantics. See [persistence and consistency](persistence.md)
before adding automatic retries. A client timeout does not prove that a
mutation failed to commit.

## OpenAPI and response policy

[Nest bootstrap](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/main.ts)
mounts Swagger UI at `/openapi` only outside `NODE_ENV=production`. Its JSON
schema is available at `/openapi-json` in that mode. Local Play's API uses
development mode; Community uses production and exposes neither the UI nor
schema. Do not enable production Swagger to work around missing developer docs.
The web rewrite forwards `/api/openapi-json` to the development schema endpoint;
in an Orb use the current web portal. A complete Swagger UI journey through the
rewrite, including its generated asset/schema URLs, is not verified here.

Swagger decorators provide route metadata, but not all Zod schemas are expanded
into generated OpenAPI models. Use the shared contracts for exact field bounds,
unions and unknown-key behavior. There is currently no generated API-reference
snapshot embedded in MkDocs. Generating complete schemas is follow-up work.

Nest owns API no-store and browser-security headers, including error responses;
Next owns page policy. Preserve the
[response policy](https://github.com/sangimed/nuvitae/blob/main/docs/security/response-policy.md)
instead of duplicating it in a controller or dropping it on the rewrite path.

## Add or change an endpoint

1. Find the owning capability and existing controller/service/port. Choose the
   verified principal, owner-scoped resource and allowed lifecycle transition.
2. Define or extend the strict shared contract and safe error/recovery behavior.
   Include revision, explicit consent or idempotency semantics where the action
   needs them; never accept ownership or trusted provenance from the browser.
3. Keep HTTP parsing in transport and workflow policy in the use case. Use domain
   helpers for invariants and existing ports for side effects. Bind adapters in
   feature runtime/persistence composition.
4. Map the result to a public response. Reduce provenance through the existing
   response mapper; do not serialize entities or raw provider output.
5. Add meaningful unauthenticated/wrong-owner, malformed/unknown-key,
   stale/replay and lifecycle tests as applicable. Exercise real persistence
   when the change relies on transactions or constraints. Keep fixtures synthetic.
6. Run the [quality gates](development.md#run-checks-through-the-workspace),
   update route metadata and the owning documentation. Update `docs/security/`
   if trust boundaries or sensitive-data handling change.

Examples to read are the
[contract suites](https://github.com/sangimed/nuvitae/tree/main/tests/contract),
[authentication integration test](https://github.com/sangimed/nuvitae/blob/main/tests/integration/import-resume/authentication-gate.integration.test.ts)
and [owner-isolation security test](https://github.com/sangimed/nuvitae/blob/main/tests/security/import-resume/authorization-isolation.security.test.ts).
They complement the real PostgreSQL suite; passing a mocked controller test
alone does not demonstrate owner isolation across persistence.
