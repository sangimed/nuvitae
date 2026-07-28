import { describe, expect, it } from "vitest";
import {
  createTypeOrmOptions,
  PersistenceConfigError,
  readPersistenceConfigFromEnv,
} from "./typeorm-options";

describe("createTypeOrmOptions", () => {
  it("keeps schema synchronization disabled", () => {
    expect(
      createTypeOrmOptions({
        host: "postgres",
        port: 5432,
        username: "nuvitae",
        password: "example",
        database: "nuvitae",
        ssl: false,
        logging: false,
        poolMax: 10,
        connectionTimeoutMs: 5_000,
        statementTimeoutMs: 30_000,
      }).synchronize,
    ).toBe(false);
  });

  it("does not enable automatic migration execution", () => {
    expect(
      createTypeOrmOptions({
        host: "postgres",
        port: 5432,
        username: "nuvitae",
        password: "example",
        database: "nuvitae",
        ssl: false,
        logging: false,
        poolMax: 10,
        connectionTimeoutMs: 5_000,
        statementTimeoutMs: 30_000,
      }).migrationsRun,
    ).toBe(false);
  });

  it("requires explicit production connection values without exposing secrets", () => {
    expect(() =>
      readPersistenceConfigFromEnv({
        NODE_ENV: "production",
        POSTGRES_PASSWORD: "do-not-print-this",
      }),
    ).toThrow(PersistenceConfigError);
    try {
      readPersistenceConfigFromEnv({
        NODE_ENV: "production",
        POSTGRES_PASSWORD: "do-not-print-this",
      });
    } catch (error) {
      expect(String(error)).not.toContain("do-not-print-this");
      expect(String(error)).toContain("POSTGRES_HOST");
    }
  });

  it("validates booleans and bounded numeric settings deterministically", () => {
    expect(() =>
      readPersistenceConfigFromEnv({
        POSTGRES_SSL: "yes",
        POSTGRES_POOL_MAX: "0",
      }),
    ).toThrow(PersistenceConfigError);
  });
});
