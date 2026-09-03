# Privacy-safe Community funnel metrics

## Purpose and boundaries

Nuvitae has two deliberately separate observability purposes:

- **Operational telemetry** explains whether an import, provider call, or
  persistence operation worked. It uses the existing bounded event vocabulary
  and operational import/correlation IDs so an operator can diagnose one local
  workflow. It is part of normal service logging.
- **Optional product metrics** count coarse Community journey events. They are
  disabled by default, written only to the local API JSON log when enabled, and
  contain no owner ID, resume/import ID, content, source snippet, filename,
  prompt, provider response, credential, cookie, or session material.

There is no analytics SDK, network collector, session replay, browser profile,
or persistent metrics database. A browser event is accepted only through the
authenticated owner boundary. The server discards unknown event names,
unrecognized metadata, nested values, and invalid failure categories before a
local log sink can see them. Delivery is best-effort and cannot change the
resume workflow.

## Funnel mapping

The minimal funnel reuses operational events where they already represent the
product outcome instead of emitting a duplicate product event.

| Funnel outcome                               | Local event semantics                                                                                                                                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First run reached                            | `community.funnel` / `first_run.reached`                                                                                                                                                                                                                             |
| Provider connection initiated, ready, failed | `community.funnel` / `provider_connection.*`; failure is only `initiation_failed` or `status_failed`                                                                                                                                                                 |
| Import started                               | existing `import.created`                                                                                                                                                                                                                                            |
| Import review-ready                          | existing `review.draft_created`                                                                                                                                                                                                                                      |
| Import failed category                       | existing bounded `import.upload_rejected`, `validation.completed`, `extraction.failed`, `semantic.outcome`, and `import.worker_failed` outcomes; group by their closed category fields and de-duplicate by the existing import correlation when calculating attempts |
| Resume confirmed                             | existing `confirm.completed`                                                                                                                                                                                                                                         |
| Editor opened                                | `community.funnel` / `editor.opened`                                                                                                                                                                                                                                 |
| Preview used                                 | `community.funnel` / `preview.used`                                                                                                                                                                                                                                  |
| PDF export succeeded or failed               | `community.funnel` / `pdf_export.*`; success means the native print dialog completed, while bounded failures distinguish preparation timeout, load failure, and inability to open the dialog                                                                         |
| Resume reopened                              | `community.funnel` / `resume.reopened`                                                                                                                                                                                                                               |

Operational events may contain opaque local workflow IDs, but never resume
content or provider secrets. Optional `community.funnel` records contain only
`funnelEvent` and, for failures, `failureCategory`.

## Enable, inspect, and disable

Edit the private `.community.env` file:

```text
NUVITAE_COMMUNITY_FUNNEL_TELEMETRY_ENABLED=true
```

Then restart the API and inspect only bounded product records:

```sh
docker compose --env-file .community.env up -d api
docker compose --env-file .community.env logs api | grep '"event":"community.funnel"'
```

Each matching line is one counter increment. Aggregate `metadata.funnelEvent`
and optional `metadata.failureCategory` with the operator's existing local log
tooling. Do not export logs to another service without making a separate,
explicit privacy and retention decision.

To disable optional product metrics, restore the value to `false` and restart
the API. Disabling does not remove or weaken operational service logs.
