# Persistence Runtime Validation Results

Validated through Docker on 2026-07-29.

## Static checks and builds

- `docker compose config`: passed.
- `docker compose build workspace`: passed.
- frozen workspace install: passed.
- format check: passed.
- lint: passed.
- typecheck: passed.
- unit tests: 82 passed across 17 files.
- persistence integration tests: 21 passed across 5 files.
- workspace build: passed.
- production API and worker image builds: passed.
- API and worker image runtime dependency and migration artifact checks:
  passed.

## Migration lifecycle

- initial migration show reported the committed migration as pending;
- migration run applied it successfully;
- migration show reported it as applied;
- migration revert removed it successfully;
- migration run restored the final schema;
- final migration show reported it as applied;
- isolated integration validation exercised disposable migration create and
  non-destructive migration generate;
- disposable output was removed and the committed migration remained unchanged.

## Integrated runtime

- `docker compose up --wait` reported web, API, worker, PostgreSQL, and queue as
  healthy after the explicit migration step;
- API liveness returned HTTP 200;
- API database readiness returned HTTP 200;
- with PostgreSQL stopped, API readiness returned a generic HTTP 503
  `database_unavailable` response while API liveness remained HTTP 200;
- after PostgreSQL restarted, all services returned to healthy;
- worker readiness was written after bootstrap and PostgreSQL connectivity;
- `docker compose down` completed without `--volumes`.

No persistent development volume was removed. Isolated test schemas,
disposable migration output, application contexts, and readiness test files
were cleaned after validation.
