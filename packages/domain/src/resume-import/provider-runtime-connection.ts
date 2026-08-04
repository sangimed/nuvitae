import type { UserId } from "./types.js";

/**
 * Provider-neutral runtime connection lifecycle for an AI provider adapter.
 *
 * This model intentionally contains no provider credentials: no access or
 * refresh tokens, authorization codes, prompts, raw provider payloads,
 * account profile data, headers, cookies, or provider-native JSON. The only
 * provider-owned reference persisted by Nuvitae is the opaque
 * `sessionReference` handle that points at encrypted session material in the
 * dedicated provider-session storage, which is separate from resume source
 * artifacts.
 */
export type ProviderRuntimeConnectionStatus =
  | "not_configured"
  | "login_pending"
  | "connected"
  | "login_cancelled"
  | "disconnected"
  | "authentication_expired"
  | "authentication_revoked";

export type ProviderRuntimeAuthenticationStatus =
  | "unauthenticated"
  | "pending"
  | "authenticated"
  | "expired"
  | "revoked"
  | "unknown";

export type ProviderRuntimeAvailabilityStatus =
  | "available"
  | "unavailable"
  | "rate_limited"
  | "quota_exceeded"
  | "unsupported_capability"
  | "unknown";

export type ProviderCapabilityDocumentFormat = "pdf" | "docx" | "plain_text";

export type ProviderCapabilityDocumentLanguage =
  "english" | "french" | "bilingual_french_english" | "unsupported" | "unknown";

/**
 * Provider-neutral capability snapshot. Every capability is a Nuvitae-owned
 * boolean or numeric contract field; no provider-specific detail is allowed.
 */
export interface ProviderRuntimeCapabilities {
  readonly supportedDocumentFormats: readonly ProviderCapabilityDocumentFormat[];
  readonly supportedDocumentLanguages: readonly ProviderCapabilityDocumentLanguage[];
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
}

export type ProviderRevocationReason =
  "user_revoked" | "provider_revoked" | "security" | "expired" | "replaced";

export type ProviderDeletionReason = "user_deleted" | "replaced" | "cleanup";

export interface AIProviderRuntimeConnection {
  readonly id: string;
  readonly ownerUserId: UserId;
  readonly providerKind: string;
  readonly displayName: string | null;
  readonly connectionStatus: ProviderRuntimeConnectionStatus;
  readonly authenticationStatus: ProviderRuntimeAuthenticationStatus;
  readonly availabilityStatus: ProviderRuntimeAvailabilityStatus;
  readonly capabilities: ProviderRuntimeCapabilities | null;
  readonly capabilitySnapshotAt: Date | null;
  /**
   * Opaque handle to encrypted provider-session material stored outside
   * PostgreSQL in the dedicated provider-session storage. It is never a
   * credential and never reusable across owners or connections.
   */
  readonly sessionReference: string | null;
  readonly lastCheckedAt: Date | null;
  readonly loginStartedAt: Date | null;
  readonly connectedAt: Date | null;
  readonly refreshedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly disconnectedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revocationReason: ProviderRevocationReason | null;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly deletionReason: ProviderDeletionReason | null;
}
