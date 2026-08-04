import type { ImportId, UserId } from "./types.js";

export type SemanticCapabilityDocumentFormat = "pdf" | "docx" | "plain_text";

export type SemanticCapabilityDocumentLanguage =
  "english" | "french" | "bilingual_french_english" | "unsupported" | "unknown";

export type SemanticParseAttemptStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "malformed_output"
  | "invalid_evidence"
  | "provider_unavailable"
  | "auth_expired"
  | "rate_limited"
  | "quota_exceeded"
  | "cancelled";

export type SemanticParseInputRepresentation =
  "normalized_transcript_flattened_fragments" | "plain_text";

export type SemanticSupportabilityClassification =
  | "officially_documented"
  | "verified_official_source"
  | "openclaw_or_hermes_behavior"
  | "undocumented_compatibility"
  | "experimentally_verified"
  | "inference";

export type SemanticParserValidationStatusValue =
  "passed" | "failed" | "requires_review" | "not_run";

export type SemanticAcceptanceStatus =
  "accepted" | "rejected" | "requires_review";

export type SemanticEvidenceValidationStatus = "valid" | "invalid" | "unusable";

export type SemanticEvidenceClassification = "explicit" | "inferred";

export type SemanticConfidenceCategory =
  "high" | "medium" | "low" | "not_applicable";

export interface SemanticParseAttempt {
  readonly id: string;
  readonly importedDocumentId: ImportId;
  readonly ownerUserId: UserId;
  readonly providerRuntimeConnectionId?: string;
  readonly providerKind: string;
  readonly inputRepresentation: SemanticParseInputRepresentation;
  readonly status: SemanticParseAttemptStatus;
  readonly startedAt: Date;
  readonly endedAt?: Date;
  readonly timeoutSeconds: number;
  readonly failureReason?: string;
  readonly supportabilityClassification?: SemanticSupportabilityClassification;
  readonly responseSchemaVersion?: string;
  readonly groundingValidationStatus?: SemanticParserValidationStatusValue;
  readonly noInventionValidationStatus?: SemanticParserValidationStatusValue;
  readonly latencyMs?: number;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface NuvitaeExtractionResponse {
  readonly id: string;
  readonly semanticParseAttemptId: string;
  readonly ownerUserId: UserId;
  readonly schemaVersion: string;
  readonly validationStatus: SemanticAcceptanceStatus;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly responseId: string;
  readonly ownerUserId: UserId;
  readonly candidateId: string;
  readonly line: number;
  readonly start: number;
  readonly end: number;
  readonly fragmentHash: string;
  readonly fragmentId?: string;
  readonly classification: SemanticEvidenceClassification;
  readonly confidenceStatus: SemanticConfidenceCategory;
  readonly validationStatus: SemanticEvidenceValidationStatus;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface ProviderCapabilitySnapshot {
  readonly id: string;
  readonly semanticParseAttemptId: string;
  readonly ownerUserId: UserId;
  readonly providerKind: string;
  readonly supportedDocumentFormats: readonly SemanticCapabilityDocumentFormat[];
  readonly supportedDocumentLanguages: readonly SemanticCapabilityDocumentLanguage[];
  readonly supportsNonInteractiveParsing: boolean;
  readonly supportsStructuredJson: boolean;
  readonly supportsCanonicalFlattenedEvidence: boolean;
  readonly acceptsNormalizedTranscript: boolean;
  readonly acceptsRawStoragePaths: boolean;
  readonly exposesCredentialsToDomain: boolean;
  readonly predictsPhysicalCoordinates: boolean;
  readonly maxRequestJsonBytes: number;
  readonly maxResponseJsonBytes: number;
  readonly maxTimeoutMs: number;
  readonly snapshotAt: Date;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface SemanticParserValidationStatus {
  readonly id: string;
  readonly semanticParseAttemptId: string;
  readonly ownerUserId: UserId;
  readonly schemaStatus: SemanticParserValidationStatusValue;
  readonly groundingStatus: SemanticParserValidationStatusValue;
  readonly absenceStatus: SemanticParserValidationStatusValue;
  readonly noInventionStatus: SemanticParserValidationStatusValue;
  readonly conflictStatus: SemanticParserValidationStatusValue;
  readonly acceptanceStatus: SemanticAcceptanceStatus;
  readonly createdAt: Date;
  readonly retentionExpiresAt: Date;
  readonly deletedAt?: Date;
}

export interface SemanticParseResultGraph {
  readonly attempt: SemanticParseAttempt;
  readonly response: NuvitaeExtractionResponse;
  readonly capabilitySnapshot: ProviderCapabilitySnapshot;
  readonly validationStatuses: SemanticParserValidationStatus;
  readonly evidenceRecords: readonly EvidenceRecord[];
}
