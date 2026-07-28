import type { DataSourceOptions } from "typeorm";

export type PersistenceConfig = {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly ssl: boolean;
  readonly synchronize?: false;
};

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
    entities: [],
    migrations: [],
    synchronize: false,
  };
}

export function readPersistenceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PersistenceConfig {
  return {
    host: env.POSTGRES_HOST ?? "postgres",
    port: Number(env.POSTGRES_PORT ?? "5432"),
    username: env.POSTGRES_USER ?? "nuvitae",
    password: env.POSTGRES_PASSWORD ?? "nuvitae_dev_password",
    database: env.POSTGRES_DB ?? "nuvitae",
    ssl: env.POSTGRES_SSL === "true",
    synchronize: false,
  };
}
