import type { NuvitaeExtractionResponse } from "@nuvitae/domain";
import { NuvitaeExtractionResponseEntity } from "../entities/nuvitae-extraction-response.entity.js";

function optional<T>(key: string, value: T | null | undefined) {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function nuvitaeExtractionResponseEntity(
  value: NuvitaeExtractionResponse,
): NuvitaeExtractionResponseEntity {
  return Object.assign(new NuvitaeExtractionResponseEntity(), {
    id: value.id,
    semanticParseAttemptId: value.semanticParseAttemptId,
    ownerUserId: value.ownerUserId,
    schemaVersion: value.schemaVersion,
    validationStatus: value.validationStatus,
    createdAt: value.createdAt,
    retentionExpiresAt: value.retentionExpiresAt,
    deletedAt: value.deletedAt ?? null,
  });
}

export function mapNuvitaeExtractionResponse(
  entity: NuvitaeExtractionResponseEntity,
): NuvitaeExtractionResponse {
  return {
    id: entity.id,
    semanticParseAttemptId: entity.semanticParseAttemptId,
    ownerUserId: entity.ownerUserId,
    schemaVersion: entity.schemaVersion,
    validationStatus:
      entity.validationStatus as NuvitaeExtractionResponse["validationStatus"],
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}
