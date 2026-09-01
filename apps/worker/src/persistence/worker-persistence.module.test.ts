import { describe, expect, it } from "vitest";
import {
  WORKER_IMPORT_WORKFLOW_REPOSITORY,
  WORKER_SOURCE_DELETION_REPOSITORY,
  workerPersistenceRepositoryProviders,
} from "./worker-persistence.module";

describe("worker persistence composition", () => {
  it("publishes the application-owned workflow repositories", () => {
    expect(workerPersistenceRepositoryProviders).toHaveLength(2);
    expect(workerPersistenceRepositoryProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: WORKER_IMPORT_WORKFLOW_REPOSITORY,
        }),
        expect.objectContaining({
          provide: WORKER_SOURCE_DELETION_REPOSITORY,
        }),
      ]),
    );
  });
});
