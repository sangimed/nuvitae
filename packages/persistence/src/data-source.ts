import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  createTypeOrmOptions,
  type PersistenceConfig,
} from "./typeorm-options.js";

export function createPersistenceDataSource(
  config: PersistenceConfig,
): DataSource {
  return new DataSource(createTypeOrmOptions(config));
}
