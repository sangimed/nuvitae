# Issue #24 application observability evaluation

Date: 2026-09-12

Scope: audit the current privacy-safe operational-event path and recommend a
bounded Nightwatch-style developer/operator experience. This is an evaluation,
not adoption of an APM vendor, a telemetry collector, a dashboard service, or
a change to application behavior.

## Recommendation

Adopt a **hybrid, OpenTelemetry-compatible boundary**, in two deliberately
small stages:

1. Keep the existing closed `ImportEventEmitter` vocabulary as the canonical
   application-outcome vocabulary. In Community it continues to write only
   local structured events, with no external telemetry required or enabled.
2. Prove one end-to-end import correlation path with opt-in OpenTelemetry
   traces and derived metrics, then send it to a chosen backend. The initial
   backend must be replaceable: Community can use a small self-hosted collector
   plus a compatible UI, while hosted may use a managed compatible backend.

Do not build a Nuvitae APM product. A thin Nuvitae view is justified only as a
query/dashboard layer over the existing safe events and traces: an import
timeline, grouped terminal outcomes, queue health, provider latency/outcomes,
and process health. It must not store documents, become a second lifecycle
store, or expose an end-user product feature.

OpenTelemetry is the preferred portability boundary, not a decision to add its
SDK today. It provides interoperable traces, metrics, logs, resource metadata,
and backend choice. The application event schema remains authoritative for
Nuvitae-specific outcomes; OpenTelemetry semantic conventions are a transport
mapping, not a second taxonomy.

## Current implementation audit

### Existing safe event boundary

[`packages/import-application/src/observability/import-events.ts`](../../packages/import-application/src/observability/import-events.ts)
is the current import observability contract. It has a closed event vocabulary,
per-event bounded schemas, scalar-only metadata, strict identifier/token/path
validation, hostile-object handling, and a sink that cannot break an import.
It explicitly excludes documents, transcripts, fragments, arbitrary errors,
requests/responses, credentials, and provider payloads. The API re-exports this
surface from
[`apps/api/src/observability/import-events.ts`](../../apps/api/src/observability/import-events.ts).

The separate Nest-compatible
[`PrivacyLogger`](../../apps/api/src/observability/privacy-logger.ts) is also
allowlist-based and redacts unknown and sensitive metadata. It is not a
replacement for the import event schema. It has no production telemetry export
adapter today.

The current test suite demonstrates the boundary's important negative cases:

- [`import-events.test.ts`](../../apps/api/src/observability/import-events.test.ts)
  rejects unknown metadata, raw errors, unsafe identifiers, hostile getters,
  resume text, provider output, tokens, filenames, and request bodies.
- [`privacy-logger.test.ts`](../../apps/api/src/observability/privacy-logger.test.ts)
  redacts credentials, cookies, contact data, source snippets, prompts,
  uploads, stack traces, and driver diagnostics.
- [`import-timing.test.ts`](../../packages/import-application/src/observability/import-timing.test.ts)
  verifies bounded, reconstructable timing records and rejects content-shaped
  identifiers.

### Present request-to-review topology

```text
POST /import-resume
  API: import.created + upload/queue timing
  importId (currently also correlationId) in validated BullMQ payload
       │
       ▼
validation job
  worker_started → validation.completed → extraction job
       │
       ▼
extraction job
  extraction.* → normalization timing → provider timing/outcome
       │
       ▼
semantic validation / bounded fallback
  semantic.* → review.draft_created → review availability/client timing
       │
       ▼
owner-scoped review and confirmation
  review.corrected / confirm.completed or confirm.failed
```

The API constructs validation, timeout, retention, and later extraction jobs in
[`start-import.ts`](../../apps/api/src/import-resume/use-cases/start-import.ts).
The job contracts carry the import ID, generated idempotency key, owner scope,
and correlation ID. The worker's
[`ImportProcessingProcessor`](../../apps/worker/src/import-resume/import-processing.processor.ts)
schema-checks the payload and delegates to
[`ImportProcessingWorkflow`](../../packages/import-application/src/import-processing-workflow.ts),
which records worker-start queue delay and preserves correlation while it
publishes the extraction job.

`SemanticImportWorkflow` emits extraction, provider, semantic-outcome,
source-fidelity, draft, and timing outcomes. The worker composition maps
Codex transport timing and safe protocol diagnostics into that same event
vocabulary. The provider adapter emits timing categories, protocol shapes,
response-limit categories, and V2 validation categories without emitting input
or output content. API review/confirmation use cases emit the terminal review
and confirmation events.

This is already sufficient to reconstruct a safe import timeline from local
JSON logs when all records are retained. It does **not** yet provide a trace
context, cross-process parent/child spans, a query UI, aggregated metrics,
alerts, deployment/version dimensions, generic API request spans, database
operation timing, or defined log retention. `importId` is an internal opaque
identifier, but its export and retention are still privacy decisions; it must
not be assumed safe for a third-party backend merely because it is not resume
content.

### Highest-value questions still difficult today

1. Which import stage is currently failing or slow, without manually joining
   API and worker logs by `importId`?
2. Is queue wait, document validation/extraction, provider first output,
   provider completion, canonicalization, or draft persistence the dominant
   delay?
3. Are provider timeouts, rate limits, invalid envelopes, and bounded fallback
   increasing after a deployment?
4. Is the worker alive but not consuming, retrying a job, or blocked by a
   dependency?
5. Which failures are user-recoverable versus infrastructure/operator action?

## Candidate approaches

| Approach | Community/self-hosted fit | Hosted fit | Portability/privacy assessment | Decision |
| --- | --- | --- | --- | --- |
| Keep local JSON events only | Zero new services; Docker logs remain the diagnosis surface | Insufficient for operations at scale | Strongest data locality, but no grouped timeline or alerting | Keep as the safe baseline, not the destination |
| OpenTelemetry SDK plus compatible collector/backend | Optional Compose profile can keep telemetry local | Same instrumentation can export to managed OTLP-compatible service | Best portability; exporter must apply the same allowlist and endpoint/credential controls | Preferred instrumentation boundary after POC |
| Full self-hosted observability suite | Possible but high RAM/storage/update burden for one-owner Community | Operationally viable only with explicit hosted ownership | Data stays under operator control, but bundles more attack surface and retention work | Reject as the default first iteration |
| Managed APM only | Violates no-SaaS Community baseline | Can reduce hosted operating burden | Requires processor, retention, regional processing, DPA, access controls, and identifier review | Optional hosted backend only, behind OTLP |
| Custom Nuvitae dashboard/event store | Easy to make initially, expensive to operate and duplicate | Same duplication plus tenant/retention work | Risks a new unbounded store and divergent taxonomy | Reject; only thin saved queries/widgets over a backend are allowed |
| Hybrid: local self-hosted-compatible Community, managed hosted, common OTLP mapping | Optional and Docker-first | Good hosted flexibility | Keeps app portable; two deployments require contract tests | Recommended |

Specific products are intentionally not selected. A later product selection must
measure a minimal Compose profile's memory/disk footprint and inspect its
authentication, TLS, network egress, retention/deletion, upgrade, RBAC,
encryption, licence, vulnerability history, OTLP support, and data residency.

## Minimal operational model

### One event, several derived signals

Each existing safe application event remains one canonical fact. A telemetry
adapter may derive, rather than rename or duplicate, the following:

| Existing fact | Derived trace/log/metric use |
| --- | --- |
| `import.timing` | timeline annotation and stage latency histogram |
| `validation.completed`, `extraction.*` | stage outcome counters and failure groups |
| `semantic.provider_transport_timing`, `semantic.outcome` | provider latency and error-category counters |
| `semantic.provider_*diagnostics` | bounded diagnostic facets for operator drill-down |
| `review.draft_created`, `confirm.*`, `review.corrected` | workflow outcome and recovery view |
| `import.worker_failed`, queue publication/limit events | worker/queue operational error counters |
| existing health/readiness endpoints | API/worker/dependency availability checks |

The first dashboard needs only: API and worker readiness; queue wait/retry
counts; import terminal outcome rate; stage latency percentiles; provider
failure/latency categories; and an operator-only import timeline. Deployment
version is a resource attribute from trusted build configuration, never a
browser/header value.

### Proposed correlation contract for the POC

The POC adds no durable state and no telemetry dependency until selected.
Its contract should be:

1. API starts a fresh server-generated trace for an accepted import. Do not
   adopt arbitrary inbound `traceparent` from the public browser boundary.
2. The API propagates only W3C trace context plus a generated span link through
   the existing validated BullMQ payload. `importId` remains the local join key;
   an exporter uses a separate telemetry correlation value where external
   export is approved.
3. The worker restores context before validation/extraction and creates spans
   for queue wait, validation, extraction, provider invocation,
   canonicalization/fallback, draft persistence, and source deletion as
   applicable.
4. Existing event names and bounded metadata become span events/attributes only
   after an explicit field-by-field allowlist. Do not attach arbitrary logger
   metadata, HTTP headers, job data, SQL text/parameters, errors, or bodies.
5. Review API and client timing create linked continuation spans only after the
   owner-scoped import lookup succeeds. They do not make the import ID a public
   trace-search capability.

This produces a single operator timeline without changing the authoritative
import lifecycle or treating BullMQ, telemetry, or tracing as a source of
truth.

## Privacy, security, and retention rules

The following are non-negotiable for any POC, collector, backend, or dashboard:

- Never capture by default: resume values/content, source fragments/quotes,
  filenames, contact data, arbitrary request/response bodies, raw provider
  prompts/responses, OAuth material, credentials/tokens, storage keys, SQL
  text/parameters, parser stdout/stderr, or stack traces.
- Export only an allowlisted mapping from the closed event schemas: event/stage,
  service, bounded duration/count/size buckets, HTTP status category,
  retryability, provider-neutral failure category, safe validation path, and
  trusted deployment/version metadata.
- Treat `importId`, correlation IDs, trace IDs, connection IDs, and job IDs as
  operational identifiers with a retention purpose. Community may keep them in
  local logs; external hosted export must use a short-retained keyed
  pseudonymous correlation value or omit it, based on a documented threat and
  support-use review. Never export owner IDs.
- Disable Community external telemetry by default. It must be removable by
  Compose configuration without changing import behavior; collector failure
  must be fail-open for telemetry and fail-closed nowhere in the import path.
- Define bounded retention before enabling a backend: short raw event/trace
  retention, longer aggregate-only metrics, documented operator deletion,
  encrypted transport, least-privilege collector credentials, and no public
  ports for internal telemetry services.
- Add negative tests that attempt to inject source text, tokens, provider
  payloads, queue payload objects, headers, SQL/stack data, and malicious
  trace headers into exporter input. Assert none reaches the sink.

Adding an external collector/backend changes a data destination and runtime
trust boundary. Before that work, update the applicable security documentation
and threat model under the repository security rules.

## Bounded POC plan and acceptance gate

No POC code is included in this evaluation because the existing safe timing and
correlation events already prove the event vocabulary and because choosing an
exporter before its backend/retention review would introduce a premature
dependency. The next implementation slice is limited to one anonymous or
synthetic import path and should take place in a separate branch:

1. Add an opt-in, no-export default telemetry adapter behind a feature-owned
   operations composition boundary; do not change domain/application contracts
   except the validated queue trace-context fields.
2. Use a Docker Compose profile to run one local OTLP-compatible collector and
   a deliberately small, selected UI/backend. Do not alter the default
   Community topology or expose a new public port.
3. Exercise one synthetic PDF and one synthetic provider-failure/fallback path.
   Show a timeline with API acceptance, enqueue, worker start, validation,
   extraction, provider or fallback, draft, and terminal review outcome.
4. Query the derived counters for queue wait, stage duration, semantic outcome,
   provider failure category, and worker health. Confirm an unavailable
   collector does not delay or fail an import.
5. Prove negative telemetry capture with automated sink inspection, run the
   focused event/privacy/worker tests plus Docker integration checks, and
   measure the profile's idle/active CPU, memory, disk, and image cost.
6. Record a GO/NO-GO decision with the selected backend, exporter mapping,
   default retention, operations owner, and Community/hosted configuration.

Success is an operator answering the five questions above from one timeline and
small health view without manual multi-container log correlation. It is not
success merely to emit spans or install a dashboard.

## Deferred work and merge risk

This evaluation changes only documentation and introduces no dependency,
runtime service, Compose change, schema change, event rename, or data export.
It therefore has low merge risk and does not collide with import, security, or
domain implementation work. The main future integration risks are propagation
changes to durable job contracts, telemetry privacy review, Compose resource
cost, and choosing a backend before hosted operations and retention ownership
are defined.

Related current boundaries: [ADR 0002](../adr/0002-container-only-development.md),
[ADR 0005](../adr/0005-modular-capability-boundaries.md),
[runtime architecture](../site/architecture.md),
[process model](../eventstorming/process-model.md), and
[security invariants](../security/security-invariants.md).
