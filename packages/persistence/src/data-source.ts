import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  createTypeOrmOptions,
  readPersistenceConfigFromEnv,
} from "./typeorm-options.js";

export const AppDataSource = new DataSource(
  createTypeOrmOptions(readPersistenceConfigFromEnv()),
);
