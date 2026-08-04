import { EvidenceRecordEntity } from "./evidence-record.entity.js";
import { NuvitaeExtractionResponseEntity } from "./nuvitae-extraction-response.entity.js";
import { ProviderCapabilitySnapshotEntity } from "./provider-capability-snapshot.entity.js";
import { SemanticParseAttemptEntity } from "./semantic-parse-attempt.entity.js";
import { SemanticParserValidationStatusEntity } from "./semantic-parser-validation-status.entity.js";

export const semanticParserPersistenceEntities = [
  SemanticParseAttemptEntity,
  NuvitaeExtractionResponseEntity,
  EvidenceRecordEntity,
  ProviderCapabilitySnapshotEntity,
  SemanticParserValidationStatusEntity,
] as const;

export {
  EvidenceRecordEntity,
  NuvitaeExtractionResponseEntity,
  ProviderCapabilitySnapshotEntity,
  SemanticParseAttemptEntity,
  SemanticParserValidationStatusEntity,
};
