import type { AIProviderRuntimeConnection } from "@nuvitae/domain";
import type {
  ContextualResumeEditProvider,
  ContextualResumeEditProviderOptions,
  ContextualResumeEditProviderRequest,
  ContextualResumeEditProviderResult,
} from "../contextual-editing/contextual-resume-edit-provider.js";
import type {
  AIProviderRuntimeConnectionsRepository,
  ProviderSessionStore,
} from "../semantic-parser/provider-connections.js";
import {
  createPrivacySafeSemanticProviderError,
  type SemanticProviderErrorCode,
} from "../semantic-parser/provider-errors.js";
import {
  CodexDirectTransport,
  type CodexDirectTransportFailureCategory,
} from "./codex-direct-transport.js";
import {
  resolveCodexModelSelection,
  type CodexModelIdentifier,
} from "./codex-model-selection.js";
import { parseCodexSessionMaterial } from "./codex-session.js";

export interface CodexContextualResumeEditProviderPorts {
  readonly repository: AIProviderRuntimeConnectionsRepository;
  readonly sessionStore: ProviderSessionStore;
  readonly model?: unknown;
  readonly transport?: Pick<CodexDirectTransport, "invoke"> &
    Partial<Pick<CodexDirectTransport, "model">>;
  readonly now?: () => Date;
}

const actionInstructions = {
  improve_writing: "Improve clarity and flow.",
  make_concise: "Make the text more concise.",
  strengthen_impact:
    "Strengthen the wording without adding achievements or scope.",
  fix_grammar: "Fix grammar, spelling, and punctuation.",
} as const;

const instructions = `You edit one resume text field. Return exactly one JSON object: {"proposedText":"..."}.
Never add, alter, infer, or remove a name, employer, date, metric, number, technology, responsibility, achievement, or other fact.
Use only content words already present in the source text; inflections and grammatical function words are allowed.
Preserve explicit negation. Do not include commentary, markdown, or additional keys.`;

/** Codex infrastructure adapter behind the provider-neutral editing port. */
export class CodexContextualResumeEditProvider implements ContextualResumeEditProvider {
  readonly providerKind = "codex";
  readonly model: CodexModelIdentifier;
  private readonly transport: Pick<CodexDirectTransport, "invoke">;
  private readonly now: () => Date;

  constructor(private readonly ports: CodexContextualResumeEditProviderPorts) {
    this.model = resolveCodexModelSelection({
      configuredModel: ports.model,
      transportModel: ports.transport?.model,
    });
    this.transport =
      ports.transport ?? new CodexDirectTransport({ model: this.model });
    this.now = ports.now ?? (() => new Date());
  }

  async propose(
    request: ContextualResumeEditProviderRequest,
    options: ContextualResumeEditProviderOptions,
  ): Promise<ContextualResumeEditProviderResult> {
    if (options.abortSignal?.aborted === true) return failure("cancelled");
    let connection: AIProviderRuntimeConnection | null;
    try {
      connection = await this.ports.repository.findConnectionByProviderAndOwner(
        this.providerKind,
        options.ownerUserId,
      );
    } catch {
      return failure("unknown_provider_failure");
    }
    if (connection === null) return failure("not_configured");
    const connectionError = connectionFailure(connection, this.now());
    if (connectionError !== undefined) return failure(connectionError);
    if (connection.sessionReference === null)
      return failure("authentication_revoked");

    let session;
    try {
      session = parseCodexSessionMaterial(
        await this.ports.sessionStore.readSession({
          ownerUserId: options.ownerUserId,
          connectionId: connection.id,
          sessionReference: connection.sessionReference,
        }),
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

    let result;
    try {
      result = await this.transport.invoke({
        accessToken: session.accessToken,
        accountIdentifier,
        instructions,
        inputText: JSON.stringify({
          action: actionInstructions[request.action],
          sourceText: request.currentText,
        }),
        timeoutMs: Math.min(Math.max(options.timeoutMs, 1), 30_000),
        ...(options.abortSignal === undefined
          ? {}
          : { abortSignal: options.abortSignal }),
      });
    } catch {
      return failure("unknown_provider_failure");
    }
    if (!result.ok) return failure(mapTransportFailure(result.category));
    try {
      const parsed: unknown = JSON.parse(result.normalizedOutput);
      if (
        !isRecord(parsed) ||
        Object.keys(parsed).length !== 1 ||
        typeof parsed.proposedText !== "string" ||
        parsed.proposedText.length === 0 ||
        parsed.proposedText.length > 4_000
      ) {
        return failure("schema_violation");
      }
      return { ok: true, proposedText: parsed.proposedText };
    } catch {
      return failure("invalid_provider_response");
    }
  }
}

function connectionFailure(
  connection: AIProviderRuntimeConnection,
  now: Date,
): SemanticProviderErrorCode | undefined {
  if (connection.deletedAt !== null) return "authentication_revoked";
  if (connection.connectionStatus === "not_configured") return "not_configured";
  if (
    connection.connectionStatus === "authentication_expired" ||
    connection.authenticationStatus === "expired" ||
    (connection.expiresAt !== null && connection.expiresAt <= now)
  ) {
    return "authentication_expired";
  }
  if (
    connection.connectionStatus === "authentication_revoked" ||
    connection.authenticationStatus === "revoked"
  ) {
    return "authentication_revoked";
  }
  if (
    connection.connectionStatus !== "connected" ||
    connection.authenticationStatus !== "authenticated"
  ) {
    return "disconnected";
  }
  switch (connection.availabilityStatus) {
    case "available":
      return undefined;
    case "rate_limited":
      return "rate_limited";
    case "quota_exceeded":
      return "quota_exceeded";
    case "unsupported_capability":
      return "unsupported_capability";
    case "unavailable":
    case "unknown":
      return "provider_unavailable";
  }
}

function mapTransportFailure(
  category: CodexDirectTransportFailureCategory,
): SemanticProviderErrorCode {
  switch (category) {
    case "request_too_large":
    case "response_too_large":
    case "timeout":
    case "cancelled":
    case "rate_limited":
    case "quota_exceeded":
    case "authentication_expired":
    case "authentication_revoked":
    case "provider_unavailable":
    case "unknown_provider_failure":
      return category;
    case "protocol_invalid":
      return "schema_violation";
  }
}

function failure(
  code: SemanticProviderErrorCode,
): ContextualResumeEditProviderResult {
  return { ok: false, error: createPrivacySafeSemanticProviderError(code) };
}

function accountIdentifierFromJwt(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (payload === undefined) return null;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!isRecord(claims)) return null;
    const nested = claims["https://api.openai.com/auth"];
    const candidate = [
      claims["https://api.openai.com/auth.chatgpt_account_id"],
      isRecord(nested) ? nested.chatgpt_account_id : undefined,
      claims.account_id,
      claims.accountId,
      claims.chatgpt_account_id,
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
