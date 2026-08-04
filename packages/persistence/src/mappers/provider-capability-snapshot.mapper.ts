import type { ProviderCapabilitySnapshot } from "@nuvitae/domain";
import { ProviderCapabilitySnapshotEntity } from "../entities/provider-capability-snapshot.entity.js";

function optional<T>(key: string, value: T | null | undefined) {
  return value === null || value === undefined ? {} : { [key]: value };
}

export function providerCapabilitySnapshotEntity(
  value: ProviderCapabilitySnapshot,
): ProviderCapabilitySnapshotEntity {
  return Object.assign(new ProviderCapabilitySnapshotEntity(), {
    id: value.id,
    semanticParseAttemptId: value.semanticParseAttemptId,
    ownerUserId: value.ownerUserId,
    providerKind: value.providerKind,
    supportedDocumentFormats: [...value.supportedDocumentFormats],
    supportedDocumentLanguages: [...value.supportedDocumentLanguages],
    supportsNonInteractiveParsing: value.supportsNonInteractiveParsing,
    supportsStructuredJson: value.supportsStructuredJson,
    supportsCanonicalFlattenedEvidence:
      value.supportsCanonicalFlattenedEvidence,
    acceptsNormalizedTranscript: value.acceptsNormalizedTranscript,
    acceptsRawStoragePaths: value.acceptsRawStoragePaths,
    exposesCredentialsToDomain: value.exposesCredentialsToDomain,
    predictsPhysicalCoordinates: value.predictsPhysicalCoordinates,
    maxRequestJsonBytes: value.maxRequestJsonBytes,
    maxResponseJsonBytes: value.maxResponseJsonBytes,
    maxTimeoutMs: value.maxTimeoutMs,
    snapshotAt: value.snapshotAt,
    createdAt: value.createdAt,
    retentionExpiresAt: value.retentionExpiresAt,
    deletedAt: value.deletedAt ?? null,
  });
}

export function mapProviderCapabilitySnapshot(
  entity: ProviderCapabilitySnapshotEntity,
): ProviderCapabilitySnapshot {
  return {
    id: entity.id,
    semanticParseAttemptId: entity.semanticParseAttemptId,
    ownerUserId: entity.ownerUserId,
    providerKind: entity.providerKind,
    supportedDocumentFormats:
      entity.supportedDocumentFormats as ProviderCapabilitySnapshot["supportedDocumentFormats"],
    supportedDocumentLanguages:
      entity.supportedDocumentLanguages as ProviderCapabilitySnapshot["supportedDocumentLanguages"],
    supportsNonInteractiveParsing: entity.supportsNonInteractiveParsing,
    supportsStructuredJson: entity.supportsStructuredJson,
    supportsCanonicalFlattenedEvidence:
      entity.supportsCanonicalFlattenedEvidence,
    acceptsNormalizedTranscript: entity.acceptsNormalizedTranscript,
    acceptsRawStoragePaths: entity.acceptsRawStoragePaths,
    exposesCredentialsToDomain: entity.exposesCredentialsToDomain,
    predictsPhysicalCoordinates: entity.predictsPhysicalCoordinates,
    maxRequestJsonBytes: entity.maxRequestJsonBytes,
    maxResponseJsonBytes: entity.maxResponseJsonBytes,
    maxTimeoutMs: entity.maxTimeoutMs,
    snapshotAt: entity.snapshotAt,
    createdAt: entity.createdAt,
    retentionExpiresAt: entity.retentionExpiresAt,
    ...optional("deletedAt", entity.deletedAt),
  };
}
