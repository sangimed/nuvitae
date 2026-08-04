import type { SemanticParserValidationStatus } from "@nuvitae/domain";
import { SemanticParserValidationStatusEntity } from "../entities/semantic-parser-validation-status.entity.js";

function optional<T>(key: string, value: T | null | undefined) {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function semanticParserValidationStatusEntity(
  value: SemanticParserValidationStatus,
): SemanticParserValidationStatusEntity {
  return Object.assign(new SemanticParserValidationStatusEntity(), {
    id: value.id,
    semanticParseAttemptId: value.semanticParseAttemptId,
    ownerUserId: value.ownerUserId,
    schemaStatus: value.schemaStatus,
    groundingStatus: value.groundingStatus,
    absenceStatus: value.absenceStatus,
    noInventionStatus: value.noInventionStatus,
    conflictStatus: value.conflictStatus,
    acceptanceStatus: value.acceptanceStatus,
    createdAt: value.createdAt,
    retentionExpiresAt: value.retentionExpiresAt,
    deletedAt: value.deletedAt ?? null,
  });
}

export function mapSemanticParserValidationStatus(
  entity: SemanticParserValidationStatusEntity,
): SemanticParserValidationStatus {
  return {
    id: entity.id,
    semanticParseAttemptId: entity.semanticParseAttemptId,
    ownerUserId: entity.ownerUserId,
    schemaStatus:
      entity.schemaStatus as SemanticParserValidationStatus["schemaStatus"],
    groundingStatus:
      entity.groundingStatus as SemanticParserValidationStatus["groundingStatus"],
    absenceStatus:
      entity.absenceStatus as SemanticParserValidationStatus["absenceStatus"],
    noInventionStatus:
      entity.noInventionStatus as SemanticParserValidationStatus["noInventionStatus"],
    conflictStatus:
      entity.conflictStatus as SemanticParserValidationStatus["conflictStatus"],
    acceptanceStatus:
      entity.acceptanceStatus as SemanticParserValidationStatus["acceptanceStatus"],
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}
