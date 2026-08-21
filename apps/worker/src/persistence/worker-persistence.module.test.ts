import { describe, expect, it } from "vitest";
import { WORKER_IMPORT_WORKFLOW_REPOSITORY } from "./worker-persistence.module";
import { workerPersistenceRepositoryProviders } from "./worker-persistence.module";

describe("worker persistence composition", () => {
  it("publishes only the application-owned workflow repository", () => {
    expect(workerPersistenceRepositoryProviders).toHaveLength(1);
    expect(workerPersistenceRepositoryProviders[0]).toMatchObject({
      provide: WORKER_IMPORT_WORKFLOW_REPOSITORY,
    });
  });
});
