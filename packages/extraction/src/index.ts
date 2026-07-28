export type ExtractionBootstrapStatus = {
  readonly packageName: "@nuvitae/extraction";
  readonly parsersImplemented: false;
};

export const extractionBootstrapStatus: ExtractionBootstrapStatus = {
  packageName: "@nuvitae/extraction",
  parsersImplemented: false,
};

export * from "./adapters.js";
export * from "./ai-classifier.js";
