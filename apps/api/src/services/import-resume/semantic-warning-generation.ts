/**
 * T173 - provider-neutral semantic warning generation.
 *
 * Canonical implementation lives in `@nuvitae/import-application` so the
 * worker processor (T209) and API service layer (T174) share one warning
 * generator without importing API implementation modules from the worker.
 */
export {
  generateSemanticWarnings,
  semanticWarningCategories,
  type SemanticWarning,
  type SemanticWarningCategory,
  type SemanticWarningGenerationInput,
  type SemanticWarningGenerationResult,
  type SemanticWarningSeverity,
} from "@nuvitae/import-application";
