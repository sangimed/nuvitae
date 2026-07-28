import { createPersistenceDataSource } from "./data-source.js";
import { readPersistenceConfigFromEnv } from "./typeorm-options.js";

const cliDataSource = createPersistenceDataSource(
  readPersistenceConfigFromEnv(process.env),
);

export default cliDataSource;
