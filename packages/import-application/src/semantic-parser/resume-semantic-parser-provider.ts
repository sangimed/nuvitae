import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
  SemanticDocumentFormat,
  SemanticDocumentLanguage,
} from "@nuvitae/contracts";

import type { V2CanonicalizationResult } from "./semantic-extraction-v2-canonicalizer.js";

import type { PrivacySafeSemanticProviderError } from "./provider-errors.js";

export type SemanticProviderConnectionState =
  | "not_configured"
  | "login_pending"
  | "connected"
  | "login_cancelled"
  | "disconnected"
  | "authentication_expired"
  | "authentication_revoked";

export type SemanticProviderAvailabilityState =
  | "available"
  | "unavailable"
  | "rate_limited"
  | "quota_exceeded"
  | "unsupported_capability"
  | "unknown";

export interface ResumeSemanticParserCapabilities {
  readonly supportedDocumentFormats: readonly SemanticDocumentFormat[];
  readonly supportedDocumentLanguages: readonly SemanticDocumentLanguage[];
  readonly supportsNonInteractiveParsing: boolean;
  readonly supportsStructuredJson: boolean;
  readonly supportsCanonicalFlattenedEvidence: boolean;
  readonly acceptsNormalizedTranscript: boolean;
  readonly acceptsRawStoragePaths: false;
  readonly exposesCredentialsToDomain: false;
  readonly predictsPhysicalCoordinates: false;
  readonly maxRequestJsonBytes: number;
  readonly maxResponseJsonBytes: number;
  readonly maxTimeoutMs: number;
}

export interface ResumeSemanticParserConnectionSnapshot {
  readonly connectionState: SemanticProviderConnectionState;
  readonly availabilityState: SemanticProviderAvailabilityState;
  readonly checkedAt: Date;
  readonly safeMessage: string | null;
}

export interface ResumeSemanticParserProvider {
  readonly providerKind: string;
  readonly capabilities: ResumeSemanticParserCapabilities;
  inspectConnection(
    ownerUserId?: string,
  ): Promise<ResumeSemanticParserConnectionSnapshot>;
  parse(
    request: ResumeSemanticParseRequest,
    options?: ResumeSemanticParserInvocationOptions,
  ): Promise<ResumeSemanticParserProviderResult>;
  /** Optional newer semantic boundary; V1 providers remain valid. */
  readonly parseV2?: (
    request: ResumeSemanticParseRequest,
    options?: ResumeSemanticParserInvocationOptions,
  ) => Promise<ResumeSemanticParserV2ProviderResult>;
}

export interface ResumeSemanticParserInvocationOptions {
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
  /**
   * Trusted owner context supplied by worker orchestration. It is deliberately
   * not part of the provider-neutral request or queue payload.
   */
  readonly ownerUserId?: string;
}

export type ResumeSemanticParserProviderResult =
  | {
      readonly ok: true;
      readonly response: NuvitaeSemanticExtractionResponse;
    }
  | {
      readonly ok: false;
      readonly error: PrivacySafeSemanticProviderError;
    };

export type ResumeSemanticParserV2ProviderResult =
  | {
      readonly ok: true;
      readonly contractVersion: "nuvitae.semantic-extraction.v2";
      /** V2 is already canonicalized and grounded by Nuvitae. */
      readonly canonical: Extract<V2CanonicalizationResult, { ok: true }>;
    }
  | {
      readonly ok: false;
      readonly error: PrivacySafeSemanticProviderError;
    };

export type { ResumeSemanticParseRequest, NuvitaeSemanticExtractionResponse };
