import { AIProviderRuntimeConnectionEntity } from "./ai-provider-runtime-connection.entity.js";
import { EvidenceRecordEntity } from "./evidence-record.entity.js";
import { NuvitaeExtractionResponseEntity } from "./nuvitae-extraction-response.entity.js";
import { ProviderCapabilitySnapshotEntity } from "./provider-capability-snapshot.entity.js";
import { SemanticParseAttemptEntity } from "./semantic-parse-attempt.entity.js";
import { SemanticParserValidationStatusEntity } from "./semantic-parser-validation-status.entity.js";

export const semanticParserPersistenceEntities = [
  AIProviderRuntimeConnectionEntity,
  SemanticParseAttemptEntity,
  NuvitaeExtractionResponseEntity,
  EvidenceRecordEntity,
  ProviderCapabilitySnapshotEntity,
  SemanticParserValidationStatusEntity,
] as const;

export {
  AIProviderRuntimeConnectionEntity,
  EvidenceRecordEntity,
  NuvitaeExtractionResponseEntity,
  ProviderCapabilitySnapshotEntity,
  SemanticParseAttemptEntity,
  SemanticParserValidationStatusEntity,
};
