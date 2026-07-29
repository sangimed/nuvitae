export type ExtractionBootstrapStatus = {
  readonly packageName: "@nuvitae/extraction";
  readonly parsersImplemented: true;
};

export const extractionBootstrapStatus: ExtractionBootstrapStatus = {
  packageName: "@nuvitae/extraction",
  parsersImplemented: true,
};

export * from "./adapters.js";
export * from "./ai-classifier.js";
export * from "./docx/libreoffice-rendered-page-count.js";
export * from "./docx/ooxml-docx-adapter.js";
export * from "./isolated-parser-runner.js";
export * from "./language/deterministic-language-detector.js";
export * from "./pdf/pdfjs-pdf-adapter.js";
export * from "./resume/source-fragments.js";
export * from "./resume/deterministic-resume-field-extractor.js";
