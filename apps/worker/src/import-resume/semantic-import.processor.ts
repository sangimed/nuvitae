/**
 * @deprecated Semantic orchestration now belongs to the provider-neutral
 * application workflow. Retained as a source-compatible bridge for one ADR
 * 0007 deprecation cycle.
 */
export {
  SemanticImportWorkflow as SemanticImportProcessor,
  T217_SEMANTIC_FALLBACK_BUDGET,
  fallbackTriggerForProviderError,
  type SemanticImportWorkflowPorts as SemanticImportProcessorPorts,
  type SemanticImportLogger,
} from "@nuvitae/import-application";
