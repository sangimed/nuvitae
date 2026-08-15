import {
  maxSemanticExtractionV2ResponseJsonBytes,
  maxSemanticParserRequestJsonBytes,
  type ResumeSemanticParseRequest,
} from "@nuvitae/contracts";
import type { AIProviderRuntimeConnection } from "@nuvitae/domain";
import type { AIProviderRuntimeConnectionsRepository } from "@nuvitae/persistence";
import {
  isProviderConnectionReady,
  type ProviderSessionStore,
} from "../semantic-parser/provider-connections.js";
import {
  createPrivacySafeSemanticProviderError,
  type SemanticProviderErrorCode,
} from "../semantic-parser/provider-errors.js";
import { canonicalizeSemanticExtractionV2 } from "../semantic-parser/semantic-extraction-v2-canonicalizer.js";
import {
  diagnoseSemanticExtractionV2Envelope,
  diagnoseSemanticExtractionV2FieldFailure,
  type SemanticExtractionV2EnvelopeDiagnostic,
  type SemanticExtractionV2FieldDiagnostic,
} from "../semantic-parser/semantic-extraction-v2-envelope-diagnostics.js";
import { createSourceRegistryFromSemanticParseRequest } from "../semantic-parser/source-registry.js";
import type {
  ResumeSemanticParserCapabilities,
  ResumeSemanticParserConnectionSnapshot,
  ResumeSemanticParserInvocationOptions,
  ResumeSemanticParserProvider,
  ResumeSemanticParserProviderResult,
  ResumeSemanticParserV2ProviderResult,
} from "../semantic-parser/resume-semantic-parser-provider.js";
import { validateSemanticParseRequest } from "../semantic-parser/validate-semantic-response.js";
import { semanticParserInstructions } from "../validation/semantic-parser-instructions.js";
import {
  CodexDirectTransport,
  emptyCodexDirectTransportSseEventAccounting,
  type CodexDirectTransportFailureCategory,
  type CodexDirectTransportRequest,
  type CodexDirectTransportProtocolShape,
  type CodexDirectTransportResponseLimitDiagnostic,
  type CodexDirectTransportSseErrorDiagnostic,
  type CodexDirectTransportTiming,
} from "./codex-direct-transport.js";
import { parseCodexSessionMaterial } from "./codex-session.js";

export const codexDirectProviderKind = "codex" as const;

const capabilities: ResumeSemanticParserCapabilities = {
  supportedDocumentFormats: ["pdf", "docx"],
  supportedDocumentLanguages: ["english", "french", "bilingual_french_english"],
  supportsNonInteractiveParsing: true,
  supportsStructuredJson: true,
  supportsCanonicalFlattenedEvidence: true,
  acceptsNormalizedTranscript: true,
  acceptsRawStoragePaths: false,
  exposesCredentialsToDomain: false,
  predictsPhysicalCoordinates: false,
  maxRequestJsonBytes: maxSemanticParserRequestJsonBytes,
  maxResponseJsonBytes: maxSemanticExtractionV2ResponseJsonBytes,
  maxTimeoutMs: 30_000,
};

export interface CodexDirectProviderAdapterPorts {
  readonly repository: AIProviderRuntimeConnectionsRepository;
  readonly sessionStore: ProviderSessionStore;
  readonly transport?: Pick<CodexDirectTransport, "invoke">;
  readonly now?: () => Date;
  readonly onTransportTiming?: (
    timing: CodexDirectTransportTiming & {
      readonly importId: string;
      readonly correlationId?: string;
    },
  ) => void;
  readonly onTransportProtocolShape?: (
    shape: CodexDirectTransportProtocolShape & {
      readonly importId: string;
      readonly correlationId?: string;
    },
  ) => void;
  readonly onTransportSseError?: (
    diagnostic: CodexDirectTransportSseErrorDiagnostic & {
      readonly importId: string;
      readonly correlationId?: string;
    },
  ) => void;
  readonly onResponseLimitDiagnostic?: (
    diagnostic: CodexDirectTransportResponseLimitDiagnostic & {
      readonly importId: string;
      readonly correlationId?: string;
    },
  ) => void;
  readonly onV2EnvelopeDiagnostic?: (
    diagnostic: SemanticExtractionV2EnvelopeDiagnostic & {
      readonly importId: string;
      readonly correlationId?: string;
    },
  ) => void;
  readonly onV2FieldDiagnostic?: (
    diagnostic: SemanticExtractionV2FieldDiagnostic & {
      readonly importId: string;
      readonly correlationId?: string;
    },
  ) => void;
  readonly onCanonicalizationTiming?: (timing: {
    readonly importId: string;
    readonly correlationId?: string;
    readonly timestampMs: number;
    readonly durationMs: number;
  }) => void;
}

/**
 * Production Codex adapter. The worker owns one instance, while owner and
 * connection resolution happens for every parse call. Credentials remain in
 * the encrypted session store and are held only while the transport runs.
 */
export class CodexDirectProviderAdapter implements ResumeSemanticParserProvider {
  readonly providerKind = codexDirectProviderKind;
  readonly capabilities = capabilities;
  private readonly transport: Pick<CodexDirectTransport, "invoke">;
  private readonly now: () => Date;

  constructor(private readonly ports: CodexDirectProviderAdapterPorts) {
    this.transport = ports.transport ?? new CodexDirectTransport();
    this.now = ports.now ?? (() => new Date());
  }

  async inspectConnection(
    ownerUserId?: string,
  ): Promise<ResumeSemanticParserConnectionSnapshot> {
    const checkedAt = this.now();
    if (ownerUserId === undefined) {
      return disconnectedSnapshot(checkedAt);
    }
    const connection = await this.findOwnerConnection(ownerUserId);
    if (connection === null) {
      return {
        connectionState: "not_configured",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: null,
      };
    }
    const state = await this.inspectStoredConnection(
      connection,
      ownerUserId,
      checkedAt,
    );
    return state;
  }

  async parse(): Promise<ResumeSemanticParserProviderResult> {
    return failure("unsupported_capability");
  }

  async parseV2(
    request: ResumeSemanticParseRequest,
    options?: ResumeSemanticParserInvocationOptions,
  ): Promise<ResumeSemanticParserV2ProviderResult> {
    if (options?.abortSignal?.aborted === true) return failure("cancelled");
    const validatedRequest = validateSemanticParseRequest(request);
    if (!validatedRequest.ok) return validatedRequest;
    const ownerUserId = options?.ownerUserId;
    if (ownerUserId === undefined) return failure("unknown_provider_failure");

    let connection: AIProviderRuntimeConnection | null;
    try {
      connection = await this.findOwnerConnection(ownerUserId);
    } catch {
      return failure("unknown_provider_failure");
    }
    if (connection === null) return failure("not_configured");

    const readinessFailure = connectionFailureForState(connection);
    if (readinessFailure !== undefined) return failure(readinessFailure);
    if (!isProviderConnectionReady(connection)) return failure("disconnected");
    if (
      connection.expiresAt !== null &&
      connection.expiresAt.getTime() <= this.now().getTime()
    ) {
      return failure("authentication_expired");
    }
    if (connection.sessionReference === null)
      return failure("authentication_revoked");

    let session: Awaited<ReturnType<typeof parseSession>>;
    try {
      session = await parseSession(
        this.ports.sessionStore,
        ownerUserId,
        connection,
      );
    } catch {
      return failure("authentication_revoked");
    }
    if (
      session.expiresAt !== null &&
      session.expiresAt.getTime() <= this.now().getTime()
    ) {
      return failure("authentication_expired");
    }
    const accountIdentifier =
      session.accountId ?? accountIdentifierFromJwt(session.accessToken);
    if (accountIdentifier === null) return failure("authentication_revoked");

    let protocolShape: CodexDirectTransportProtocolShape | undefined;
    const transportRequest: CodexDirectTransportRequest = {
      accessToken: session.accessToken,
      accountIdentifier,
      instructions: semanticInstructions,
      inputText: buildSemanticInput(request),
      timeoutMs: boundedTimeout(
        options?.timeoutMs ?? capabilities.maxTimeoutMs,
      ),
      ...(options?.abortSignal === undefined
        ? {}
        : { abortSignal: options.abortSignal }),
      onTiming: (timing) => {
        try {
          if (request.importId === null) return;
          this.ports.onTransportTiming?.({
            ...timing,
            importId: request.importId,
            ...(request.correlationId === null ||
            request.correlationId === undefined
              ? {}
              : { correlationId: request.correlationId }),
          });
        } catch {
          // Transport diagnostics must never change provider behavior.
        }
      },
      onProtocolShape: (shape) => {
        try {
          protocolShape = shape;
          if (request.importId === null) return;
          this.ports.onTransportProtocolShape?.({
            ...shape,
            importId: request.importId,
            ...(request.correlationId === null ||
            request.correlationId === undefined
              ? {}
              : { correlationId: request.correlationId }),
          });
        } catch {
          // Protocol diagnostics must never change provider behavior.
        }
      },
      onProviderSseError: (diagnostic) => {
        try {
          if (request.importId === null) return;
          this.ports.onTransportSseError?.({
            ...diagnostic,
            importId: request.importId,
            ...(request.correlationId === null ||
            request.correlationId === undefined
              ? {}
              : { correlationId: request.correlationId }),
          });
        } catch {
          // Transport diagnostics must never change provider behavior.
        }
      },
      onResponseLimitDiagnostic: (diagnostic) => {
        try {
          if (request.importId === null) return;
          this.ports.onResponseLimitDiagnostic?.({
            ...diagnostic,
            importId: request.importId,
            ...(request.correlationId === null ||
            request.correlationId === undefined
              ? {}
              : { correlationId: request.correlationId }),
          });
        } catch {
          // Limit diagnostics must never change provider behavior.
        }
      },
    };

    // This is deliberately one call. T217 owns retry/fallback budget.
    let transportResult;
    try {
      transportResult = await this.transport.invoke(transportRequest);
    } catch {
      return failure("unknown_provider_failure");
    }
    if (!transportResult.ok)
      return failure(mapTransportFailure(transportResult.category));

    let candidate: unknown;
    const normalizedOutputBytes = Buffer.byteLength(
      transportResult.normalizedOutput,
      "utf8",
    );
    try {
      candidate = JSON.parse(transportResult.normalizedOutput);
    } catch {
      emitV2EnvelopeDiagnostic(this.ports, request, {
        response: undefined,
        semanticJsonParseSucceeded: false,
        canonicalizerReached: false,
        failureStage: "semantic_json_parse",
        failureCategory: "invalid_json",
        normalizedOutputBytes,
      });
      return failure("invalid_provider_response", "v2_invalid_envelope");
    }
    const canonicalizationStartedAt = this.now();
    let canonical;
    try {
      canonical = canonicalizeSemanticExtractionV2({
        response: candidate,
        sourceRegistry: createSourceRegistryFromSemanticParseRequest(
          validatedRequest.value,
        ),
        importId:
          validatedRequest.value.importId ??
          validatedRequest.value.correlationId ??
          "unbound-import",
      });
    } catch {
      emitV2EnvelopeDiagnostic(this.ports, request, {
        response: candidate,
        semanticJsonParseSucceeded: true,
        canonicalizerReached: true,
        failureStage: "v2_canonicalizer",
        normalizedOutputBytes,
      });
      return failure("schema_violation", "v2_invalid_envelope");
    }
    if (!canonical.ok) {
      this.emitCanonicalizationTiming(request, canonicalizationStartedAt);
      emitV2EnvelopeDiagnostic(this.ports, request, {
        response: candidate,
        semanticJsonParseSucceeded: true,
        canonicalizerReached: true,
        failureStage: "v2_envelope",
        failureCategory: canonical.failureCategory,
        normalizedOutputBytes,
      });
      if (canonical.reason === "response_too_large")
        emitV2ResponseLimitDiagnostic(
          this.ports,
          request,
          normalizedOutputBytes,
          protocolShape,
        );
      return failureForV2WholeResponse(canonical.reason);
    }
    this.emitCanonicalizationTiming(request, canonicalizationStartedAt);
    emitV2FieldDiagnostic(this.ports, request, canonical);
    return {
      ok: true,
      contractVersion: "nuvitae.semantic-extraction.v2",
      canonical,
    };
  }

  private emitCanonicalizationTiming(
    request: ResumeSemanticParseRequest,
    startedAt: Date,
  ): void {
    const completedAt = this.now();
    try {
      if (request.importId !== null) {
        this.ports.onCanonicalizationTiming?.({
          importId: request.importId,
          ...(request.correlationId === null ||
          request.correlationId === undefined
            ? {}
            : { correlationId: request.correlationId }),
          timestampMs: completedAt.getTime(),
          durationMs: completedAt.getTime() - startedAt.getTime(),
        });
      }
    } catch {
      // Timing diagnostics must never change provider behavior.
    }
  }

  private async findOwnerConnection(
    ownerUserId: string,
  ): Promise<AIProviderRuntimeConnection | null> {
    return this.ports.repository.findConnectionByProviderAndOwner(
      codexDirectProviderKind,
      ownerUserId,
    );
  }

  private async inspectStoredConnection(
    connection: AIProviderRuntimeConnection,
    ownerUserId: string,
    checkedAt: Date,
  ): Promise<ResumeSemanticParserConnectionSnapshot> {
    const failure = connectionFailureForState(connection);
    if (failure !== undefined) return snapshotForError(failure, checkedAt);
    if (
      !isProviderConnectionReady(connection) ||
      connection.sessionReference === null
    ) {
      return disconnectedSnapshot(checkedAt);
    }
    if (
      connection.expiresAt !== null &&
      connection.expiresAt.getTime() <= checkedAt.getTime()
    ) {
      return snapshotForError("authentication_expired", checkedAt);
    }
    try {
      const session = await parseSession(
        this.ports.sessionStore,
        ownerUserId,
        connection,
      );
      if (
        session.expiresAt !== null &&
        session.expiresAt.getTime() <= checkedAt.getTime()
      ) {
        return snapshotForError("authentication_expired", checkedAt);
      }
      return {
        connectionState: "connected",
        availabilityState: connection.availabilityStatus,
        checkedAt,
        safeMessage: null,
      };
    } catch {
      return snapshotForError("authentication_revoked", checkedAt);
    }
  }
}

function emitV2ResponseLimitDiagnostic(
  ports: CodexDirectProviderAdapterPorts,
  request: ResumeSemanticParseRequest,
  normalizedOutputBytes: number,
  protocolShape: CodexDirectTransportProtocolShape | undefined,
): void {
  if (request.importId === null) return;
  try {
    ports.onResponseLimitDiagnostic?.({
      triggerCategory: "v2_envelope_size_limit",
      receivedRawBodyBytesBucket:
        protocolShape?.receivedRawBodyBytesBucket ?? "not_observed",
      assembledSemanticOutputBytesBucket: byteBucket(normalizedOutputBytes),
      parsedSseEventCount: protocolShape?.parsedSseEventCount ?? 0,
      parsedSseEventCountBucket:
        protocolShape?.parsedSseEventCountBucket ?? "0-4",
      responseCompletedObserved:
        protocolShape?.responseCompletedObserved ?? false,
      sseFrameCount: protocolShape?.sseFrameCount ?? 0,
      eventTypes: protocolShape?.eventTypes ?? [],
      sseEventAccounting:
        protocolShape?.sseEventAccounting ??
        emptyCodexDirectTransportSseEventAccounting(),
      importId: request.importId,
      ...(request.correlationId === null || request.correlationId === undefined
        ? {}
        : { correlationId: request.correlationId }),
    });
  } catch {
    // Limit diagnostics must never change provider behavior.
  }
}

function byteBucket(
  bytes: number,
): CodexDirectTransportResponseLimitDiagnostic["assembledSemanticOutputBytesBucket"] {
  if (bytes <= 65_536) return "0-64k";
  if (bytes <= 262_144) return "64k-256k";
  if (bytes <= 1_048_576) return "256k-1m";
  if (bytes <= 2_097_152) return "1m-2m";
  return "over_2m";
}

function emitV2EnvelopeDiagnostic(
  ports: CodexDirectProviderAdapterPorts,
  request: ResumeSemanticParseRequest,
  input: Parameters<typeof diagnoseSemanticExtractionV2Envelope>[0],
): void {
  if (request.importId === null) return;
  try {
    ports.onV2EnvelopeDiagnostic?.({
      ...diagnoseSemanticExtractionV2Envelope(input),
      importId: request.importId,
      ...(request.correlationId === null || request.correlationId === undefined
        ? {}
        : { correlationId: request.correlationId }),
    });
  } catch {
    // Envelope diagnostics must never change provider behavior.
  }
}

function emitV2FieldDiagnostic(
  ports: CodexDirectProviderAdapterPorts,
  request: ResumeSemanticParseRequest,
  canonical: Extract<
    Awaited<ReturnType<typeof canonicalizeSemanticExtractionV2>>,
    { readonly ok: true }
  >,
): void {
  if (request.importId === null) return;
  const diagnostic = diagnoseSemanticExtractionV2FieldFailure({ canonical });
  if (diagnostic === undefined) return;
  try {
    ports.onV2FieldDiagnostic?.({
      ...diagnostic,
      importId: request.importId,
      ...(request.correlationId === null || request.correlationId === undefined
        ? {}
        : { correlationId: request.correlationId }),
    });
  } catch {
    // Field diagnostics must never change provider behavior.
  }
}

const semanticInstructions = `${semanticParserInstructions} Use minified JSON serialization.`;

function buildSemanticInput(request: ResumeSemanticParseRequest): string {
  return JSON.stringify({
    contract: "nuvitae.semantic-extraction.v2",
    document: {
      format: request.documentFormat,
      language: request.languageContext.detectedLanguage,
      fragments: request.sourceFragments.map((fragment) => ({
        fragmentId: `fragment-${fragment.order + 1}`,
        order: fragment.order,
        text: fragment.text,
      })),
    },
  });
}

function failureForV2WholeResponse(
  reason:
    | "malformed_json"
    | "response_too_large"
    | "response_depth_limit"
    | "total_atom_limit"
    | "total_node_limit"
    | "unsupported_contract_version"
    | "invalid_top_level_envelope",
) {
  switch (reason) {
    case "response_too_large":
      return failure("response_too_large", "v2_invalid_envelope");
    case "response_depth_limit":
    case "total_atom_limit":
    case "total_node_limit":
      return failure("schema_violation", "v2_invalid_envelope");
    case "unsupported_contract_version":
      return failure("unsupported_contract_version", "v2_invalid_envelope");
    case "malformed_json":
    case "invalid_top_level_envelope":
      return failure("schema_violation", "v2_invalid_envelope");
  }
}

async function parseSession(
  sessionStore: ProviderSessionStore,
  ownerUserId: string,
  connection: AIProviderRuntimeConnection,
) {
  if (connection.sessionReference === null)
    throw new Error("missing_session_reference");
  const payload = await sessionStore.readSession({
    ownerUserId,
    connectionId: connection.id,
    sessionReference: connection.sessionReference,
  });
  return parseCodexSessionMaterial(payload);
}

function connectionFailureForState(
  connection: AIProviderRuntimeConnection,
): SemanticProviderErrorCode | undefined {
  if (connection.deletedAt !== null) return "authentication_revoked";
  if (connection.connectionStatus === "not_configured") return "not_configured";
  if (
    connection.connectionStatus === "authentication_expired" ||
    connection.authenticationStatus === "expired"
  )
    return "authentication_expired";
  if (
    connection.connectionStatus === "authentication_revoked" ||
    connection.authenticationStatus === "revoked"
  )
    return "authentication_revoked";
  if (
    connection.connectionStatus !== "connected" ||
    connection.authenticationStatus !== "authenticated"
  )
    return "disconnected";
  if (connection.availabilityStatus === "unavailable")
    return "provider_unavailable";
  if (connection.availabilityStatus === "rate_limited") return "rate_limited";
  if (connection.availabilityStatus === "quota_exceeded")
    return "quota_exceeded";
  if (connection.availabilityStatus === "unsupported_capability")
    return "unsupported_capability";
  if (connection.availabilityStatus !== "available")
    return "provider_unavailable";
  return undefined;
}

function mapTransportFailure(
  category: CodexDirectTransportFailureCategory,
): SemanticProviderErrorCode {
  switch (category) {
    case "request_too_large":
      return "request_too_large";
    case "response_too_large":
      return "response_too_large";
    case "timeout":
      return "timeout";
    case "cancelled":
      return "cancelled";
    case "rate_limited":
      return "rate_limited";
    case "quota_exceeded":
      return "quota_exceeded";
    case "authentication_expired":
      return "authentication_expired";
    case "authentication_revoked":
      return "authentication_revoked";
    case "provider_unavailable":
      return "provider_unavailable";
    case "protocol_invalid":
      return "schema_violation";
    case "unknown_provider_failure":
      return "unknown_provider_failure";
  }
}

function failure(code: SemanticProviderErrorCode, diagnosticCode?: string) {
  return {
    ok: false as const,
    error: createPrivacySafeSemanticProviderError(
      code,
      diagnosticCode === undefined ? [] : [{ path: [], code: diagnosticCode }],
    ),
  };
}

function snapshotForError(
  code: SemanticProviderErrorCode,
  checkedAt: Date,
): ResumeSemanticParserConnectionSnapshot {
  switch (code) {
    case "not_configured":
      return {
        connectionState: "not_configured",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: null,
      };
    case "authentication_expired":
      return {
        connectionState: "authentication_expired",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: "Codex connection has expired.",
      };
    case "authentication_revoked":
      return {
        connectionState: "authentication_revoked",
        availabilityState: "unknown",
        checkedAt,
        safeMessage: "Codex connection needs attention.",
      };
    case "provider_unavailable":
    case "rate_limited":
    case "quota_exceeded":
      return {
        connectionState: "connected",
        availabilityState:
          code === "provider_unavailable" ? "unavailable" : code,
        checkedAt,
        safeMessage: "Codex is temporarily unavailable.",
      };
    default:
      return disconnectedSnapshot(checkedAt);
  }
}

function disconnectedSnapshot(
  checkedAt: Date,
): ResumeSemanticParserConnectionSnapshot {
  return {
    connectionState: "disconnected",
    availabilityState: "unknown",
    checkedAt,
    safeMessage: null,
  };
}

function boundedTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return capabilities.maxTimeoutMs;
  return Math.min(Math.floor(value), capabilities.maxTimeoutMs);
}

function accountIdentifierFromJwt(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || parts[1] === undefined) return null;
  try {
    const json = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const nested = json["https://api.openai.com/auth"];
    const candidate = [
      json["https://api.openai.com/auth.chatgpt_account_id"],
      isRecord(nested) ? nested.chatgpt_account_id : undefined,
      json.account_id,
      json.accountId,
      json.chatgpt_account_id,
    ].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    return candidate ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
