# Integrated Persistence Validation

Run the complete isolated PostgreSQL validation through Docker:

```bash
docker compose run --rm workspace pnpm test:integration:persistence
```

The test database name must end in `_test`. Each suite creates and removes a
unique schema, and disposable migration create/generate output is removed after
success or failure. The suite does not use or destroy the normal development
database volume.

Coverage includes:

- shared API/worker TypeORM configuration with `synchronize: false` and
  `migrationsRun: false`;
- migration show, run, revert, rerun, create, and non-destructive generate;
- unchanged committed migrations and cleaned disposable output;
- real Nest API liveness and PostgreSQL readiness with generic HTTP 503 failure;
- real standalone worker readiness, shared repository providers, transaction
  commit and rollback, and readiness removal;
- API/worker/persistence package boundaries and production Dockerfile contents.

Application startup remains separate from the explicit migration deployment
operation. This validation adds no product controller, queue processor, or
resume-import use case.
