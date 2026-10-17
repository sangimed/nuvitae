# Queue and worker operations

This page describes the BullMQ path implemented in the source snapshot linked
below. It is operational guidance for the current Compose runtime, not a
delivery, recovery, or retention guarantee. The worker has no public HTTP API;
use service readiness, privacy-safe events, persisted import status, and the
source linked here to diagnose queue-backed work.

## Queue and job catalog

The API and worker register one queue, `resume-import-processing`, over the
internal authenticated Valkey service (`queue`). The API publishes initial
import jobs; after accepted validation, the worker publishes the extraction
job. The worker processor handles these names:

| Job name                   | Purpose                                                         | ID suffix       | Initial queue options                                                      |
| -------------------------- | --------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `document_validation`      | Validate an uploaded source; on acceptance, enqueue extraction  | `validation-v1` | 3 attempts; exponential backoff starting at 500 ms                         |
| `deterministic_extraction` | Parse the validated source and prepare a reviewable draft       | `extraction-v1` | 1 attempt; no explicit backoff                                             |
| `foreground_timeout`       | Mark eligible unfinished work `timeout_partial` at its deadline | `timeout-v1`    | 3 attempts; exponential backoff starting at 500 ms; delayed until deadline |
| `source_artifact_deletion` | Run source/derived-artifact deletion for the retention deadline | `retention-v1`  | 3 attempts; exponential backoff starting at 500 ms; delayed until deadline |

The initial validation, timeout and retention jobs are added together. The
validation job creates the extraction job only after acceptance; it uses one
attempt. Completed jobs are eligible for removal after 300 seconds (with a
count cap of 100), and failed jobs after 900 seconds (also capped at 100).
These are BullMQ record-retention settings, not application document retention
or a promise that a failed job remains inspectable for a minimum duration.

Job names, payload schemas and IDs are defined in
[`packages/contracts/src/import-resume/jobs.ts`](https://github.com/sangimed/nuvitae/blob/main/packages/contracts/src/import-resume/jobs.ts).
IDs are deterministic: `import-{import UUID}-{validation|extraction|timeout|retention}-v1`.
Payloads carry the schema version, import and owner IDs, correlation ID,
idempotency key, request time and stage-specific fields. Strict Zod schemas
reject unrecognized/malformed payload fields; the worker re-reads owner-scoped
persisted state before acting. Queue data is still sensitive operational data:
do not print or export it to troubleshoot.

The contract package also declares cancellation and retry payload schemas, but
they are not registered processor job names in this queue. Do not infer that
user cancellation, replacement-upload cancellation, or a user retry endpoint
exists from those schemas.

## Retries, deadlines, and progress

Only the API's initial bulk jobs receive the shared three-attempt exponential
policy (`delay: 500` ms). Validation may enqueue extraction with one attempt.
The worker runs one job at a time (`concurrency: 1`). Invalid payloads and
unknown job names raise BullMQ `UnrecoverableError`; extraction itself is also
configured for one attempt. The `retryable` field in `import.worker_failed` is
a safe diagnostic classification, not a promise that the corresponding job
will be retried or that an operator should replay it.

The default foreground deadline is 180 seconds from upload receipt, bounded
by the runtime configuration. Validation and extraction receive an abort
signal for the remaining deadline (capped at 180 seconds). A separate delayed
timeout job records `timeout_partial` only if the import is still eligible;
it leaves a ready draft or terminal state intact. Parser process limits and
provider transport timeouts are separate limits. None of these values
documents BullMQ lock duration, stalled-job detection, or a hard kill of every
possible dependency. A timeout is not evidence that no partial durable state
was written; check the owner-scoped API status and review state.

The API reads supplemental queue progress only for validation/extraction and
only after validating its shape. PostgreSQL import lifecycle state remains
authoritative; queue progress cannot revive a terminal import. See the
[import-pipeline sequence and failure boundaries](import-pipeline.md).

## Safe diagnosis

Use the same Compose project and environment that started the services. These
commands inspect service state and bounded logs; they do not expose queue
ports:

```bash
docker compose ps
docker compose logs --since=10m --tail=200 api worker queue
```

For Local Play, include the documented overlays on each command:

```bash
docker compose -f compose.yml -f compose.local.yml ps
docker compose -f compose.yml -f compose.local.yml logs --since=10m --tail=200 api worker queue
```

Check the following in order:

1. Confirm `postgres`, `queue`, `api`, and `worker` are healthy/running. Worker
   readiness is written only after Nest/queue bootstrap, TypeORM initialization,
   and a PostgreSQL probe; the worker has no product HTTP health route.
2. Check API readiness and generic startup errors. Queue and database ports are
   internal Compose services; do not publish them to troubleshoot browser access.
3. Correlate safe `import.worker_failed` records using `importId`,
   `correlationId`, `jobType`, `errorCategory`, and `retryable`. These fields are
   deliberately bounded; raw exception messages, document text, storage keys,
   provider prompts/responses, and queue payloads are not diagnostics to collect.
4. Read the import's owner-scoped API status. It reports durable lifecycle
   state; queue progress is supplemental and may be absent or expire.
5. For a deadline failure, distinguish the application foreground deadline
   from parser/provider-specific timeouts. A recoverable timeout may expose a
   partial draft and supported UI recovery choices; use those supported product
   flows instead of editing queue data.

If the worker is not ready, inspect logs and restore its dependencies before
considering any job-level action. If an import remains queued/processing beyond
its deadline, compare API/worker/queue health, safe failure categories and the
persisted state. There is no documented operator command for inspecting,
replaying, deleting or moving individual BullMQ jobs, and no blanket exactly-
once or automatic-recovery guarantee.

## Recovery and retention safety

Do not delete jobs, flush Valkey, remove volumes, restart with `down -v`, or
manually re-add a job as a diagnostic shortcut. Deterministic IDs help avoid
duplicate enqueue while a matching job record exists, but completed/failed
records are aged out and database transitions are the durable authority. A
manual replay can repeat work, contend with a live worker, or act on stale
owner-scoped state. There is no supported per-job replay procedure in this
snapshot. Prefer restarting an unhealthy service through the documented
Compose workflow, then use the product's supported recovery actions or
escalate with redacted event categories and service health.

The API schedules `source_artifact_deletion` at the retention deadline and the
worker dispatches it to a deletion service. The README and security audit still
list source-deletion execution and retention workers as unsupported/incomplete:
the registered path is not evidence of a supported end-to-end deletion
guarantee. Do not promise deletion because a delayed job was enqueued or mark a
retention request complete based on queue state. The complete deletion lifecycle
and verified backup/restore operations remain follow-up work. Normal
`docker compose down` preserves named volumes; never add `-v` to recover a
queue problem or erase important PostgreSQL/private-storage data.

Before escalating, include the Compose service status, a narrow time window,
safe event identifiers/categories, and the import's public lifecycle status.
Exclude resume content, filenames, storage references, credentials,
`QUEUE_PASSWORD`, full environment output, raw queue payloads, and provider
transcripts. See [security and privacy](security.md) for the logging boundary.

## Source map

- [API enqueue, IDs and retry options](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/adapters/bullmq/start-import.queue.ts)
- [API job creation and deadline scheduling](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/use-cases/start-import.ts)
- [Worker registration and dispatch](https://github.com/sangimed/nuvitae/blob/main/apps/worker/src/import-resume/import-processing.processor.ts)
- [Worker concurrency and queue connection](https://github.com/sangimed/nuvitae/blob/main/apps/worker/src/worker.module.ts)
- [Application timeout and extraction handoff](https://github.com/sangimed/nuvitae/blob/main/packages/import-application/src/import-processing-workflow.ts)
- [Status and progress projection](https://github.com/sangimed/nuvitae/blob/main/apps/api/src/import-resume/adapters/bullmq/import-status.queue.ts)
- [Privacy-safe failure event schema](https://github.com/sangimed/nuvitae/blob/main/packages/import-application/src/observability/import-events.ts)
- [Runtime Compose topology](https://github.com/sangimed/nuvitae/blob/main/compose.yml)
