import type {
  NuvitaeSemanticExtractionResponse,
  ResumeSemanticParseRequest,
  SemanticDocumentFormat,
  SemanticDocumentLanguage,
} from "@nuvitae/contracts";

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
  inspectConnection(): Promise<ResumeSemanticParserConnectionSnapshot>;
  parse(
    request: ResumeSemanticParseRequest,
    options?: ResumeSemanticParserInvocationOptions,
  ): Promise<ResumeSemanticParserProviderResult>;
}

export interface ResumeSemanticParserInvocationOptions {
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
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

export type { ResumeSemanticParseRequest, NuvitaeSemanticExtractionResponse };
