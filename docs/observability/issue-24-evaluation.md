# Application monitoring evaluation (#24)

Status: evaluation and offline contract probe, not deployed monitoring.
Audited 2026-09-11 at [baseline 956528b](https://github.com/sangimed/nuvitae/commit/956528bf6a66b4931967017bb816355638003a3e).
[Issue #24](https://github.com/sangimed/nuvitae/issues/24) has no comments at audit time.

## Recommendation: reuse events, trial an existing backend, keep export optional

Keep the canonical import event vocabulary. Add an optional OpenTelemetry (OTel)
adapter at the API/worker composition edges only after the correlation gap below
is fixed. Trial an existing backend with a Nuvitae-specific saved dashboard before
building an application dashboard. Use the same telemetry contract for Community
and hosted deployments, with different export/retention policies. This is a hybrid
deployment recommendation, not a vendor commitment.

The first useful screen should show health, grouped failures, slow stages, and an
import timeline ending in **review-ready**, **failed**, or **incomplete evidence**.
Successful provider transport alone must never mean a successful import. Partial
semantic acceptance and deterministic fallback must remain distinct from full
semantic success. No telemetry endpoint belongs in the end-user resume UI.

This change adds no runtime service, endpoint, database table, dependency, or
external telemetry destination. Its executable probe checks existing serialization
and privacy boundaries; it does not implement tracing or fix propagation.

## Audit: what exists and what cannot yet be inferred

Paths below are relative to the repository root. Source code, rather than roadmap
text, determines implemented behavior.

| Boundary / source                                                                                                                        | Implemented evidence                                                                                                                                                                    | Missing or misleading inference                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP / `apps/api/src/main.ts`, `auth/user-context.ts`                                                                                    | Nest API, verified principal context supports optional operational correlation; default Nest bootstrap logger                                                                           | No application-wide request trace established here. The separate `PrivacyLogger` class is not installed globally by bootstrap. Do not export all stdout as if every record passed the import sanitizer.                   |
| Upload / `apps/api/src/import-resume/use-cases/start-import.ts`                                                                          | Server-generated import ID also becomes correlation ID; upload persistence and enqueue timings; bounded rejection events                                                                | Rejection before ID creation cannot be joined to an import. Upload timing is a use-case timestamp, not proof of full HTTP/network latency.                                                                                |
| Durable queue / `packages/contracts/src/import-resume/jobs.ts`                                                                           | Strict UUID correlation, owner context, deterministic stage job IDs; validation/extraction/deadline payloads                                                                            | Owner and private storage key are necessary job data, never telemetry. No W3C trace carrier. Stable job ID is not a unique delivery attempt ID.                                                                           |
| Worker / `apps/worker/src/import-resume/import-processing.processor.ts`, `packages/import-application/src/import-processing-workflow.ts` | Schema validation, owner-scoped lookup, worker-start/queue-wait timing on validation, bounded failure categories; extraction enqueue retains correlation                                | `extract()` passes owner/import/abort signal but **omits correlationId** to extraction. `ImportExtractionUseCase` does not declare it. Validation delivery and extraction delivery do not have equivalent attempt timing. |
| PDF/DOCX / `packages/import-application/src/validate-document.ts`, `semantic-import-workflow.ts`                                         | Validation outcomes, parser limits, extraction/normalization timing; document safety reason vocabulary                                                                                  | No general parser subprocess resource dashboard; a missing end event is not evidence of an indefinitely running parser.                                                                                                   |
| Provider / `apps/worker/src/import-resume/worker-import-runtime.providers.ts`                                                            | Shared emitter receives transport timing, protocol/SSE shape, response-limit, V2 envelope/field diagnostics; provider headers/first output/completion mapped to canonical timing phases | Diagnostics are richer than a single timeout counter. Do not turn protocol success into semantic success or sum overlapping transport timings.                                                                            |
| Semantic / `packages/import-application/src/semantic-import-workflow.ts`, `build-semantic-parse-request.ts`                              | Provider-neutral result handling; `semantic.outcome`, validation diagnostics, source-fidelity buckets; fallback and review creation; parse request defaults correlation to document ID  | Defaulting masks the delivery gap when correlation equals import ID. Some outcome records join only by import ID. No demonstrated independent request-to-review trace.                                                    |
| Persistence / `packages/persistence/src/typeorm-options.ts`, semantic workflow                                                           | SQL logging defaults off; application `draft_persisted` timing follows repository work                                                                                                  | Draft timing does not attribute individual queries, lock waits, pool saturation, or transaction rollback causes. Do not enable raw SQL logging to fill this gap.                                                          |
| Review / `apps/api/src/import-resume/use-cases/read-draft.ts`, `transport/http/import-timing.controller.ts`                              | Review API availability and owner-checked client timing; draft-created, corrected, confirm events in canonical schema                                                                   | Browser-reported timing is untrusted observation, not authoritative success. Polling repeats do not count as new imports. Review-ready is not user confirmation.                                                          |
| Provider connections / `packages/import-application/src/semantic-parser/provider-connections.ts`                                         | `provider_connection.lookup_failed` carries bounded operation/failure categories and opaque connection IDs; optional Community funnel records initiation/ready/failure                  | Not a complete OAuth lifecycle trace. Connection-level incidents are not necessarily attributable to one import. Never export session state or enrich connection IDs with account identity.                               |
| Health / `apps/api/src/health/health.controller.ts`, `apps/worker/src/runtime/worker-runtime.ts`, `compose.yml`                          | API live endpoint and DB readiness probe; worker readiness file after bootstrap DB check, removed on controlled shutdown; Compose Postgres/Valkey checks                                | Worker readiness file is not a continuously refreshed processing heartbeat. API readiness does not prove queue progress. No deployment comparison or alert policy in these surfaces.                                      |
| Privacy / `packages/import-application/src/observability/import-events.ts`                                                               | Closed names, per-event bounded metadata, data-property inspection, no accessor execution, sink exceptions swallowed                                                                    | Safe-to-log locally does not mean approved for export. Opaque-ID syntax cannot establish ID provenance. Most non-timing events have no canonical timestamp/service/version envelope.                                      |

The canonical event schema is the reuse point for logs, metrics and span events;
do not create a second list of semantic outcomes. Metrics should map schema enums,
not arbitrary error messages. Existing `import.timing` is a milestone stream,
not a complete span model with guaranteed starts/ends.

Related work: [#25](https://github.com/sangimed/nuvitae/issues/25) already addressed
latency measurement; its closing comment rejects selecting speed from
fidelity-invalid samples. Do not repeat live model benchmarks for monitoring.
[#59](https://github.com/sangimed/nuvitae/issues/59) and
[Community funnel metrics](../community-funnel-metrics.md) separate optional
product counters from operational logs. Its disable switch does **not** disable
operational logging. [ADR 0005](../adr/0005-modular-capability-boundaries.md)
places sinks in operations/composition edges, not domain policy.

## Highest-value questions and query semantics

1. **Where did this import stop?** Filter by local import ID; show canonical
   milestones, provider/semantic outcomes and final review creation together.
   Missing terminal evidence is “unknown/incomplete”, not failure or success.
2. **Is this a provider incident or a document problem?** Group existing failure
   enums by stage: validation/unsafe document → user replacement; connection
   unavailable/expired → user reconnect; timeout/rate limit → bounded retry or
   infrastructure investigation; persistence/unexpected worker failure → operator.
   Retryability alone does not authorize automatic retries.
3. **Queue wait or provider latency?** Separate local durations and queue wait
   from provider first-output/total duration and time-to-review. Never add nested
   durations. Cross-host timestamp differences are estimates; flag clock skew.
4. **Is work actually progressing?** Show last successful completion, queue depth,
   oldest queued age, in-flight work, heartbeat and dependency readiness separately.
   No traffic is neither success nor worker failure.
5. **Did a deployment change failure rate?** Compare counts and denominators by
   server-configured version and time window. Suppress percentile/rate claims for
   tiny samples; label counts. Deduplicate terminal imports separately from job
   delivery attempts. Do not sum repeated polling, replay, or fallback events.

First dashboard: health row; failure counts by stage/category; duration histogram
by fixed phase; import-ID drilldown into a timeline with missing stages marked.
This supplies Nightwatch-like navigation without building storage, query, alert,
RBAC and trace visualization systems inside Nuvitae.

## Options compared

| Option                         | Benefit                                                                                                                      | Cost / privacy / portability tradeoff                                                                                                                                                                                                 | Decision                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OTel instrumentation + backend | Standard context, traces, logs, metrics and OTLP export; independent of semantic provider                                    | OTel is not a dashboard. Auto-instrumentation can capture URLs, DB statements and exceptions. SDK initialization, async propagation, buffering and backend schema mapping still need tests.                                           | Adopt as proposed boundary, with explicit allowlisted instrumentation, not “enable all”.                                                   |
| Self-hosted Grafana LGTM trial | Existing linked log/trace/metric views; official Docker development image includes Collector, Grafana, Loki, Mimir and Tempo | One image still runs multiple components. Resource use and retention require measurement. Official image is for development/demo/testing, **not a production deployment recipe**. UI defaults must not be publicly exposed.           | Short disposable synthetic-data trial; optional Community profile only after measured cost/security review.                                |
| Managed Grafana Cloud via OTLP | Existing hosted backend, no local storage operation; same transport can support another OTLP backend                         | External processing, egress, account/credentials, region, retention, deletion and cost need explicit approval. Query/dashboard portability is weaker than OTLP transport portability. No pricing or free-tier guarantee assumed here. | Viable hosted candidate, not mandatory Community dependency or selected vendor.                                                            |
| Thin Nuvitae operational view  | Domain-specific timeline and recovery grouping could be excellent                                                            | Custom authenticated ingestion, retention, query, access control and UI quickly become a mini-APM; additional sensitive metadata store                                                                                                | Start with saved backend queries/dashboard. Build a thin view only if the trial cannot answer the five questions without manual log joins. |
| Hybrid Community / hosted      | One event contract and optional OTLP boundary; local-only Community, separately governed hosted backend                      | Two configurations and retention policies to test; shared schema does not eliminate vendor lock-in of dashboards                                                                                                                      | Recommended direction. Off/local-only remains a supported mode.                                                                            |

Primary sources read 2026-09-11 (via HTTPS; no provider accounts used):

- [OTel sensitive data guidance](https://opentelemetry.io/docs/security/handling-sensitive-data/):
  prefer non-collection; audit instrumentation; Collector attribute/filter/redaction
  processors are defense in depth, not permission to collect private payloads.
- [Grafana Docker OTel LGTM](https://grafana.com/docs/opentelemetry/docker-lgtm/):
  packaged components and explicit development/demo/test scope.
- [Grafana Cloud OTLP ingestion](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/):
  managed OTLP ingestion and Collector-based production architecture. Verify actual
  account plan, region and retention before any hosted pilot.

No new dependency is justified for this evaluation: existing contracts, emitter,
Vitest and Compose suffice. Before a trial adds packages/images, pin versions or
digests; check maintenance, security advisories, licence obligations (including
the individual backend components), supply chain, resource weight and privileges.
Do not infer a whole image's licence/security from its OTel interface.

## Proposed correlation contract (not implemented)

1. API creates a random request ID before admission, independent of client input.
   Start an HTTP span with route **template**, status class and bounded duration;
   never raw URL/query, headers, principal, body, IP or exception text. Treat any
   public `traceparent` as untrusted; default to a fresh root, no arbitrary baggage.
2. Continue the existing server-issued import ID as the local workflow join key.
   Keep request ID, import ID, correlation ID and trace ID distinct concepts.
   A correlation ID is not an authorization credential.
3. At enqueue, carry a strictly validated trace context in an explicitly reviewed
   job contract extension. Do not spread job data into attributes. Keep stable job
   ID for idempotency and create a separate delivery span/attempt for each run.
4. Worker rechecks ownership as today, preserves explicit correlation through
   validation and extraction, and links each consumer attempt to its producer.
   Delayed/retried work uses links as needed rather than one indefinitely open
   HTTP span. No trace context is sent to the external AI provider by default.
5. Provider call spans contain only fixed provider-neutral operation/category,
   timing and retryability. Attach existing sanitized envelope/semantic events;
   do not record SDK exceptions, model input/output or SSE frames.
6. Review persistence records the committed result, not an early “completed” span.
   Later review reads and confirmation are separate requests linked by import ID.
   Owner-checked browser timing remains a separately labelled observation.

The first runtime fix should forward correlation at `ImportExtractionUseCase` /
`ImportProcessingWorkflow.extract()` and verify a **different** import/correlation
pair through real workflow, provider adapter and draft persistence. Coordinate
with import-internals work; do not solve it by replacing correlation with import
ID. Current `review.draft_created` emissions may still require joining by import
ID rather than expecting every event to have correlation.

## Privacy, retention and failure policy for the trial

These are proposed requirements, not current retention guarantees. They preserve
the [security invariants](../security/security-invariants.md); no current asset or
trust boundary changes in this documentation/test-only slice.

- Never capture resume text, semantic values, source quotes/fragments, filenames,
  prompts/responses, provider credentials/tokens, OAuth material, storage keys,
  contact data, arbitrary bodies, SQL/parameters or raw exception stacks/messages.
  Explicit positive projection happens before any sink/exporter; repeat it in the
  Collector. Never attach a generic `Error`, request or job object.
- Record only fixed event/operation/source/outcome enums, bounded timings/count
  buckets, retryability/status class and operator-configured deployment version.
  Approved local IDs are searchable fields, never metric labels. Do not index
  arbitrary validation paths or identifiers as unbounded label dimensions.
- IDs and exact timings permit linkage even without content. Hosted defaults
  should export aggregate metrics **without IDs**. Identifier-bearing traces/logs
  require a separate retention/access decision; keyed short-lived pseudonyms can
  reduce direct linkage but are not anonymization or authorization.
- Proposed Community trial: no external egress, 24-hour telemetry TTL, 256 MiB
  input budget/day and 2 GiB total storage ceiling. Stop ingestion at the ceiling
  rather than silently grow. Proposed hosted pilot: 7 days of approved traces/logs,
  30 days of identifier-free aggregates, subject to region/contract approval.
  Cover replicas, backups and exports; source deletion alone does not delete logs.
- Telemetry disabled means no new SDK/exporter, listener, backend or outbound
  traffic. Existing operational logs remain; document that distinction. A strict
  “all operational logging off” mode is not implemented and needs its own policy.
- No Docker socket, private-storage/provider-session mount or DB credentials for
  the backend. Private Compose network; UI loopback/Amp authenticated portal only;
  replace default admin credentials. Hosted backend is operator-only with least
  privilege, TLS, audited access and separate ingestion credentials.
- Bounded asynchronous export: never block imports on the backend, cap memory,
  retries and flush timeout, drop on overload, expose aggregate dropped-record
  counts. Collector outage must leave user outcomes and retries unchanged.
  Telemetry loss means incomplete evidence; it must not fabricate terminal states.

## Bounded first iteration and POC gates

**This slice (implemented):** audit, comparison, recommendation and offline
`tests/contract/observability-boundary.test.ts`. It exercises JSON job
serialization with distinct IDs, stage-event projection, exact fixed timestamps,
malformed inputs, sensitive-field omission and sink failure. It manually emits
stages and therefore **does not prove runtime propagation** through HTTP, BullMQ,
live providers, PostgreSQL or an exporter. Existing worker/provider/persistence
integration checks supply separate evidence, not an end-to-end trace claim.

**Next POC, before rollout:**

1. Fix/test the extraction correlation gap with import owners. Add request/attempt
   context and only missing milestone metadata. Do not introduce a generic shared
   framework or alter semantic contracts, response policy or review UI.
2. Trial local OTel + development LGTM through a separate opt-in Compose profile,
   using synthetic PDF/DOCX input and a deterministic provider. Cap added resources
   at 2 CPUs, 2 GiB RAM, 2 GiB telemetry storage and the above intake budget. These
   are **acceptance budgets, not measured requirements**. If LGTM cannot fit, stop
   and compare a reduced logs-first backend; do not increase Community defaults.
3. Exercise success, partial/fallback, unsafe document, provider timeout/rate limit,
   invalid envelope, DB failure, poison job, duplicate delivery, wrong owner,
   worker termination, collector outage and malformed trace carrier. Assert no
   leaked sentinel in exporter payloads/backend storage, no false completion, and
   equivalent application outcomes with telemetry disabled or unavailable.
4. Measure a fixed 100-import synthetic run, recording idle/peak CPU/RAM/disk,
   queue wait and end-to-review distributions against telemetry-off. Proposed
   acceptance: <5% local processing overhead; provider network time excluded from
   that comparison. Record sample counts and stop conditions, not a claimed p95
   from a handful of samples. Verify TTL and storage ceiling with test data only.
5. Have an operator answer the five questions from saved views without shell log
   joins. Record time-to-answer and missing evidence. Keep the existing backend if
   sufficient; authorize a thin Nuvitae view only for demonstrated workflow gaps.

Only after those gates: choose/pin backend and SDK, implement durable Compose
configuration, update security threat model for new stores/egress, and obtain
hosted privacy/access/cost approval. Alerts, SQL timing, fleet-wide deployment
comparison and production backend operations remain deferred. No paid service,
live provider run or hosted rollout is authorized by this evaluation.

## Acceptance coverage

The design criteria in #24 are addressed by the audit, questions, five-option
comparison, OTel boundary, recommendation, bounded iteration, Community/hosted
split, privacy/retention policy, correlation design and POC plan above. No resume
content or secrets are collected by this change. **Operational monitoring is not
implemented and production acceptance is not claimed.** The POC enables a choice
between an existing backend with saved views and a justified thin domain view;
it does not choose a commercial vendor or prove infrastructure cost yet.

## Verification commands

Run from the repository root using the existing Compose workspace. In this orb,
Docker requires `sudo -n`; no host Node workflow or new dependencies were used.

```sh
sudo -n docker compose run --no-deps workspace pnpm exec prettier --check docs/observability/issue-24-evaluation.md tests/contract/observability-boundary.test.ts
sudo -n docker compose run --no-deps workspace pnpm exec eslint tests/contract/observability-boundary.test.ts
sudo -n docker compose run --no-deps workspace pnpm typecheck
sudo -n docker compose run --no-deps workspace pnpm exec vitest run \
  tests/contract/observability-boundary.test.ts \
  apps/api/src/observability/import-events.test.ts \
  apps/api/src/observability/privacy-logger.test.ts \
  packages/import-application/src/observability/import-timing.test.ts \
  packages/contracts/src/import-resume/jobs.test.ts \
  apps/worker/src/import-resume/import-processing.processor.test.ts \
  tests/integration/import-resume/semantic-parser-worker.integration.test.ts
```

The integration suite uses the repository's isolated test database/schema
fixture, not application data. It exercises deterministic providers and real
persistence, including failure/recovery cases; it makes no live AI calls.
Compose run containers are retained under repository no-cleanup rules.
