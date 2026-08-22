export type FixtureBootstrapStatus = {
  readonly packageName: "@nuvitae/test-fixtures";
  readonly resumeFixturesImplemented: false;
};

export const fixtureBootstrapStatus: FixtureBootstrapStatus = {
  packageName: "@nuvitae/test-fixtures",
  resumeFixturesImplemented: false,
};

export * from "./resume-import/manifest.js";
export * from "./resume-import/semantic-parser-fixtures.js";
export * from "./resume-import/expected-semantic-json.js";
export * from "./resume-import/generator/fixture-spec.js";
