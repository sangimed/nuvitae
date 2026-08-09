import type { SemanticParseAttempt } from "@nuvitae/domain";
import { SemanticParseAttemptEntity } from "../entities/semantic-parse-attempt.entity.js";

function optional<T>(key: string, value: T | null | undefined) {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function semanticParseAttemptEntity(
  value: SemanticParseAttempt,
): SemanticParseAttemptEntity {
  return Object.assign(new SemanticParseAttemptEntity(), {
    id: value.id,
    importedDocumentId: value.importedDocumentId,
    ownerUserId: value.ownerUserId,
    providerRuntimeConnectionId: value.providerRuntimeConnectionId ?? null,
    providerKind: value.providerKind,
    inputRepresentation: value.inputRepresentation,
    status: value.status,
    startedAt: value.startedAt,
    endedAt: value.endedAt ?? null,
    timeoutSeconds: value.timeoutSeconds,
    failureReason: value.failureReason ?? null,
    supportabilityClassification: value.supportabilityClassification ?? null,
    responseSchemaVersion: value.responseSchemaVersion ?? null,
    groundingValidationStatus: value.groundingValidationStatus ?? null,
    noInventionValidationStatus: value.noInventionValidationStatus ?? null,
    latencyMs: value.latencyMs ?? null,
    createdAt: value.createdAt,
    retentionExpiresAt: value.retentionExpiresAt,
    deletedAt: value.deletedAt ?? null,
  });
}

export function mapSemanticParseAttempt(
  entity: SemanticParseAttemptEntity,
): SemanticParseAttempt {
  return {
    id: entity.id,
    importedDocumentId: entity.importedDocumentId,
    ownerUserId: entity.ownerUserId,
    ...optional(
      "providerRuntimeConnectionId",
      entity.providerRuntimeConnectionId,
    ),
    providerKind: entity.providerKind,
    inputRepresentation:
      entity.inputRepresentation as SemanticParseAttempt["inputRepresentation"],
    status: entity.status as SemanticParseAttempt["status"],
    startedAt: entity.startedAt,
    ...optional("endedAt", entity.endedAt),
    timeoutSeconds: entity.timeoutSeconds,
    ...optional("failureReason", entity.failureReason),
    ...optional(
      "supportabilityClassification",
      entity.supportabilityClassification as SemanticParseAttempt["supportabilityClassification"],
    ),
    ...optional("responseSchemaVersion", entity.responseSchemaVersion),
    ...optional(
      "groundingValidationStatus",
      entity.groundingValidationStatus as SemanticParseAttempt["groundingValidationStatus"],
    ),
    ...optional(
      "noInventionValidationStatus",
      entity.noInventionValidationStatus as SemanticParseAttempt["noInventionValidationStatus"],
    ),
    ...optional("latencyMs", entity.latencyMs),
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}
