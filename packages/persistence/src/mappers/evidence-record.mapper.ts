import type { EvidenceRecord } from "@nuvitae/domain";
import { EvidenceRecordEntity } from "../entities/evidence-record.entity.js";

function optional<T>(key: string, value: T | null | undefined) {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function evidenceRecordEntity(
  value: EvidenceRecord,
): EvidenceRecordEntity {
  return Object.assign(new EvidenceRecordEntity(), {
    id: value.id,
    responseId: value.responseId,
    ownerUserId: value.ownerUserId,
    candidateId: value.candidateId,
    line: value.line,
    start: value.start,
    end: value.end,
    fragmentHash: value.fragmentHash,
    fragmentId: value.fragmentId ?? null,
    classification: value.classification,
    confidenceStatus: value.confidenceStatus,
    validationStatus: value.validationStatus,
    createdAt: value.createdAt,
    retentionExpiresAt: value.retentionExpiresAt,
    deletedAt: value.deletedAt ?? null,
  });
}

export function mapEvidenceRecord(
  entity: EvidenceRecordEntity,
): EvidenceRecord {
  return {
    id: entity.id,
    responseId: entity.responseId,
    ownerUserId: entity.ownerUserId,
    candidateId: entity.candidateId,
    line: entity.line,
    start: entity.start,
    end: entity.end,
    fragmentHash: entity.fragmentHash,
    ...optional("fragmentId", entity.fragmentId),
    classification: entity.classification as EvidenceRecord["classification"],
    confidenceStatus:
      entity.confidenceStatus as EvidenceRecord["confidenceStatus"],
    validationStatus:
      entity.validationStatus as EvidenceRecord["validationStatus"],
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}
