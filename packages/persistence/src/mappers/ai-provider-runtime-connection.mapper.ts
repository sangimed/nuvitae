import type {
  AIProviderRuntimeConnection,
  ProviderRuntimeCapabilities,
} from "@nuvitae/domain";
import { AIProviderRuntimeConnectionEntity } from "../entities/ai-provider-runtime-connection.entity.js";

export function aiProviderRuntimeConnectionEntity(
  value: AIProviderRuntimeConnection,
): AIProviderRuntimeConnectionEntity {
  const capabilities = value.capabilities;
  return Object.assign(new AIProviderRuntimeConnectionEntity(), {
    id: value.id,
    ownerUserId: value.ownerUserId,
    providerKind: value.providerKind,
    displayName: value.displayName ?? null,
    connectionStatus: value.connectionStatus,
    authenticationStatus: value.authenticationStatus,
    availabilityStatus: value.availabilityStatus,
    sessionReference: value.sessionReference ?? null,
    capabilitySnapshotAt: value.capabilitySnapshotAt ?? null,
    supportedDocumentFormats: capabilities
      ? [...capabilities.supportedDocumentFormats]
      : null,
    supportedDocumentLanguages: capabilities
      ? [...capabilities.supportedDocumentLanguages]
      : null,
    supportsNonInteractiveParsing:
      capabilities?.supportsNonInteractiveParsing ?? null,
    supportsStructuredJson: capabilities?.supportsStructuredJson ?? null,
    supportsCanonicalFlattenedEvidence:
      capabilities?.supportsCanonicalFlattenedEvidence ?? null,
    acceptsNormalizedTranscript:
      capabilities?.acceptsNormalizedTranscript ?? null,
    acceptsRawStoragePaths: capabilities?.acceptsRawStoragePaths ?? null,
    exposesCredentialsToDomain:
      capabilities?.exposesCredentialsToDomain ?? null,
    predictsPhysicalCoordinates:
      capabilities?.predictsPhysicalCoordinates ?? null,
    maxRequestJsonBytes: capabilities?.maxRequestJsonBytes ?? null,
    maxResponseJsonBytes: capabilities?.maxResponseJsonBytes ?? null,
    maxTimeoutMs: capabilities?.maxTimeoutMs ?? null,
    lastCheckedAt: value.lastCheckedAt ?? null,
    loginStartedAt: value.loginStartedAt ?? null,
    connectedAt: value.connectedAt ?? null,
    refreshedAt: value.refreshedAt ?? null,
    expiresAt: value.expiresAt ?? null,
    disconnectedAt: value.disconnectedAt ?? null,
    revokedAt: value.revokedAt ?? null,
    revocationReason: value.revocationReason ?? null,
    createdAt: value.createdAt,
    deletedAt: value.deletedAt ?? null,
    deletionReason: value.deletionReason ?? null,
  });
}

export function mapAIProviderRuntimeConnection(
  entity: AIProviderRuntimeConnectionEntity,
): AIProviderRuntimeConnection {
  const capabilities = mapCapabilities(entity);
  return {
    id: entity.id,
    ownerUserId: entity.ownerUserId,
    providerKind: entity.providerKind,
    displayName: entity.displayName,
    connectionStatus:
      entity.connectionStatus as AIProviderRuntimeConnection["connectionStatus"],
    authenticationStatus:
      entity.authenticationStatus as AIProviderRuntimeConnection["authenticationStatus"],
    availabilityStatus:
      entity.availabilityStatus as AIProviderRuntimeConnection["availabilityStatus"],
    capabilities,
    capabilitySnapshotAt: entity.capabilitySnapshotAt,
    sessionReference: entity.sessionReference,
    lastCheckedAt: entity.lastCheckedAt,
    loginStartedAt: entity.loginStartedAt,
    connectedAt: entity.connectedAt,
    refreshedAt: entity.refreshedAt,
    expiresAt: entity.expiresAt,
    disconnectedAt: entity.disconnectedAt,
    revokedAt: entity.revokedAt,
    revocationReason:
      entity.revocationReason as AIProviderRuntimeConnection["revocationReason"],
    createdAt: entity.createdAt,
    deletedAt: entity.deletedAt,
    deletionReason:
      entity.deletionReason as AIProviderRuntimeConnection["deletionReason"],
  };
}

function mapCapabilities(
  entity: AIProviderRuntimeConnectionEntity,
): ProviderRuntimeCapabilities | null {
  if (
    entity.capabilitySnapshotAt === null ||
    entity.supportedDocumentFormats === null ||
    entity.supportedDocumentLanguages === null ||
    entity.supportsNonInteractiveParsing === null ||
    entity.supportsStructuredJson === null ||
    entity.supportsCanonicalFlattenedEvidence === null ||
    entity.acceptsNormalizedTranscript === null ||
    entity.acceptsRawStoragePaths === null ||
    entity.exposesCredentialsToDomain === null ||
    entity.predictsPhysicalCoordinates === null ||
    entity.maxRequestJsonBytes === null ||
    entity.maxResponseJsonBytes === null ||
    entity.maxTimeoutMs === null
  ) {
    return null;
  }
  return {
    supportedDocumentFormats:
      entity.supportedDocumentFormats as ProviderRuntimeCapabilities["supportedDocumentFormats"],
    supportedDocumentLanguages:
      entity.supportedDocumentLanguages as ProviderRuntimeCapabilities["supportedDocumentLanguages"],
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
  };
}
