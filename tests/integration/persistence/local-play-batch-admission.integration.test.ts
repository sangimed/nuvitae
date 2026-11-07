import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ImportLimitService,
  RepositoryBackedImportLimitStore,
} from "@nuvitae/import-application";
import { TypeOrmImportLimitAttemptsRepository } from "@nuvitae/persistence/typeorm";
import { documentedImportProcessingDefaults } from "../../../apps/api/src/config/import-processing-limits.js";
import { mapLimitOutcomeToHttpResponse } from "../../../apps/api/src/import-resume/transport/http/limit-responses.js";
import {
  createIsolatedPersistenceTestDatabase,
  type IsolatedPersistenceTestDatabase,
} from "./test-database.js";

describe("persisted Local Play batch admission", () => {
  let database: IsolatedPersistenceTestDatabase;
  beforeAll(async () => {
    database = await createIsolatedPersistenceTestDatabase("batch_admission");
  });
  afterAll(async () => database?.cleanup());

  it("admits four plus two uploads across owners without clearing either owner's history", async () => {
    const ownerA = "00000000-0000-4000-8000-000000000101";
    const ownerB = "00000000-0000-4000-8000-000000000102";
    const now = new Date("2026-10-29T10:00:00Z");
    // Reconstruct exactly the API runtime's persistent admission composition.
    // A new service instance models API recreation, not a fresh database/store.
    const service = () =>
      new ImportLimitService(
        new RepositoryBackedImportLimitStore(
          new TypeOrmImportLimitAttemptsRepository(database.dataSource),
        ),
        documentedImportProcessingDefaults,
      );
    const firstApi = service();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await firstApi.reserveAttempt(ownerA, now)).allowed).toBe(true);
    }
    const fidelityApi = service();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await fidelityApi.reserveAttempt(ownerB, now)).allowed).toBe(
        true,
      );
    }
    expect((await fidelityApi.reserveAttempt(ownerA, now)).allowed).toBe(true);
    const deniedA = await fidelityApi.reserveAttempt(ownerA, now);
    expect(deniedA).toMatchObject({
      allowed: false,
      outcome: { code: "upload_attempt_limit", retryAfterSeconds: 600 },
    });
    if (deniedA.allowed)
      throw new Error("expected the original owner to remain limited");
    expect(mapLimitOutcomeToHttpResponse(deniedA.outcome)).toMatchObject({
      statusCode: 429,
      code: "rate_limited",
      retryAfterSeconds: 600,
    });
    for (let attempt = 2; attempt < 5; attempt += 1) {
      expect((await fidelityApi.reserveAttempt(ownerB, now)).allowed).toBe(
        true,
      );
    }
    expect(await service().reserveAttempt(ownerB, now)).toMatchObject({
      allowed: false,
      outcome: { code: "upload_attempt_limit", retryAfterSeconds: 600 },
    });
  });
});
