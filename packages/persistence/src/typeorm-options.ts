import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";
import { importLimitAttemptPersistenceEntities } from "./entities/import-limit-attempt.entity.js";
import { persistenceEntities } from "./entities/import-resume.entities.js";
import { semanticParserPersistenceEntities } from "./entities/semantic-parser.entities.js";
import { InitialImportResumePersistence1722168000000 } from "./migrations/1722168000000-InitialImportResumePersistence.js";
import { ManualStructuredResumeDrafts1722254400000 } from "./migrations/1722254400000-ManualStructuredResumeDrafts.js";
import { ImportDraftReviewRevision1722340800000 } from "./migrations/1722340800000-ImportDraftReviewRevision.js";
import { SemanticImportProcessingStates1722427200000 } from "./migrations/1722427200000-SemanticImportProcessingStates.js";
import { SemanticParserPersistence1722513600000 } from "./migrations/1722513600000-SemanticParserPersistence.js";
import { ProviderRuntimeConnections1722600000000 } from "./migrations/1722600000000-ProviderRuntimeConnections.js";
import { ImportLimitAttempts1785801600000 } from "./migrations/1785801600000-ImportLimitAttempts.js";
import { communityAuthPersistenceEntities } from "./entities/community-auth.entities.js";
import { CommunityInstanceAuth1785888000000 } from "./migrations/1785888000000-CommunityInstanceAuth.js";
import { StructuredResumeSectionOrder1785974400000 } from "./migrations/1785974400000-StructuredResumeSectionOrder.js";

export interface PersistenceConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly ssl: boolean;
  readonly logging: boolean;
  readonly poolMax: number;
  readonly connectionTimeoutMs: number;
  readonly statementTimeoutMs: number;
  readonly schema?: string;
}

export class PersistenceConfigError extends Error {
  readonly code = "invalid_persistence_configuration";

  constructor(readonly fields: readonly string[]) {
    super(`Invalid persistence configuration: ${fields.join(", ")}.`);
    this.name = "PersistenceConfigError";
  }
}

function required(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string | undefined,
  invalid: string[],
): string {
  const value = env[key] ?? fallback;
  if (value === undefined || value.trim() === "") {
    invalid.push(key);
    return "";
  }
  return value;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  invalid: string[],
  maximum: number,
): number {
  const raw = env[key] ?? String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    invalid.push(key);
    return fallback;
  }
  return value;
}

function booleanValue(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean,
  invalid: string[],
): boolean {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  invalid.push(key);
  return fallback;
}

export function readPersistenceConfigFromEnv(
  env: NodeJS.ProcessEnv,
): PersistenceConfig {
  const production = env.NODE_ENV === "production";
  const invalid: string[] = [];
  const local = (value: string): string | undefined =>
    production ? undefined : value;
  const host = required(env, "POSTGRES_HOST", local("postgres"), invalid);
  const username = required(env, "POSTGRES_USER", local("nuvitae"), invalid);
  const password = required(
    env,
    "POSTGRES_PASSWORD",
    local("nuvitae_dev_password"),
    invalid,
  );
  const database = required(env, "POSTGRES_DB", local("nuvitae"), invalid);
  const schema = env.POSTGRES_SCHEMA?.trim();
  if (schema !== undefined && !/^[a-z_][a-z0-9_]*$/.test(schema)) {
    invalid.push("POSTGRES_SCHEMA");
  }
  const config: PersistenceConfig = {
    host,
    port: positiveInteger(env, "POSTGRES_PORT", 5432, invalid, 65_535),
    username,
    password,
    database,
    ssl: booleanValue(env, "POSTGRES_SSL", false, invalid),
    logging: booleanValue(env, "POSTGRES_LOGGING", false, invalid),
    poolMax: positiveInteger(env, "POSTGRES_POOL_MAX", 10, invalid, 100),
    connectionTimeoutMs: positiveInteger(
      env,
      "POSTGRES_CONNECTION_TIMEOUT_MS",
      5_000,
      invalid,
      120_000,
    ),
    statementTimeoutMs: positiveInteger(
      env,
      "POSTGRES_STATEMENT_TIMEOUT_MS",
      30_000,
      invalid,
      600_000,
    ),
    ...(schema === undefined || schema === "" ? {} : { schema }),
  };
  if (invalid.length > 0) {
    throw new PersistenceConfigError([...new Set(invalid)].sort());
  }
  return config;
}

export function createTypeOrmOptions(
  config: PersistenceConfig,
): DataSourceOptions {
  return {
    type: "postgres",
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    logging: config.logging,
    entities: [
      ...persistenceEntities,
      ...semanticParserPersistenceEntities,
      ...importLimitAttemptPersistenceEntities,
      ...communityAuthPersistenceEntities,
    ],
    migrations: [
      InitialImportResumePersistence1722168000000,
      ManualStructuredResumeDrafts1722254400000,
      ImportDraftReviewRevision1722340800000,
      SemanticImportProcessingStates1722427200000,
      SemanticParserPersistence1722513600000,
      ProviderRuntimeConnections1722600000000,
      ImportLimitAttempts1785801600000,
      CommunityInstanceAuth1785888000000,
      StructuredResumeSectionOrder1785974400000,
    ],
    migrationsTableName: "typeorm_migrations",
    migrationsRun: false,
    synchronize: false,
    extra: {
      max: config.poolMax,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      statement_timeout: config.statementTimeoutMs,
      ...(config.schema === undefined
        ? {}
        : { options: `-c search_path=${config.schema},public` }),
    },
    ...(config.schema === undefined ? {} : { schema: config.schema }),
  };
}

export function createTypeOrmModuleOptions(
  config: PersistenceConfig,
): TypeOrmModuleOptions {
  return createTypeOrmOptions(config) as TypeOrmModuleOptions;
}
