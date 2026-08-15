import {
  CodexDirectTransport,
  type CodexDirectTransportOptions,
} from "./codex-direct-transport.js";
import {
  resolveCodexModelSelection,
  type CodexModelIdentifier,
} from "./codex-model-selection.js";

export type Issue25BenchmarkArm = "A" | "B";
export type Issue25BenchmarkAuthorizationState =
  "authorized" | "consumed" | "not_authorized";

export interface Issue25BenchmarkAuthorization {
  readonly issue: 25;
  readonly campaign: "import-resume-latency-confirmatory";
  readonly authorizationId: string;
  readonly arm: Issue25BenchmarkArm;
  readonly state: Issue25BenchmarkAuthorizationState;
  readonly model: unknown;
  readonly reasoning: "low";
  readonly verbosity: "low";
}

export class Issue25BenchmarkAuthorizationError extends Error {
  readonly code:
    | "issue_25_authorization_required"
    | "issue_25_campaign_mismatch"
    | "issue_25_benchmark_not_authorized"
    | "missing_explicit_benchmark_model";

  constructor(code: Issue25BenchmarkAuthorizationError["code"]) {
    super(code);
    this.name = "Issue25BenchmarkAuthorizationError";
    this.code = code;
  }
}

export interface Issue25BenchmarkTransportOptions extends Omit<
  CodexDirectTransportOptions,
  "model"
> {
  readonly authorization: Issue25BenchmarkAuthorization;
  /** Explicit benchmark composition value; it must match authorization.model. */
  readonly model?: unknown;
  /** Optional second composition source, checked for conflicts. */
  readonly configuredModel?: unknown;
}

export function resolveIssue25BenchmarkModel(input: {
  readonly authorization: Issue25BenchmarkAuthorization;
  readonly model?: unknown;
  readonly configuredModel?: unknown;
}): CodexModelIdentifier {
  if (input.authorization.issue !== 25)
    throw new Issue25BenchmarkAuthorizationError(
      "issue_25_authorization_required",
    );
  if (input.authorization.campaign !== "import-resume-latency-confirmatory")
    throw new Issue25BenchmarkAuthorizationError("issue_25_campaign_mismatch");
  if (input.authorization.state !== "authorized")
    throw new Issue25BenchmarkAuthorizationError(
      "issue_25_benchmark_not_authorized",
    );
  if (input.model === undefined)
    throw new Issue25BenchmarkAuthorizationError(
      "missing_explicit_benchmark_model",
    );

  return resolveCodexModelSelection({
    configuredModel: input.configuredModel,
    benchmarkModel: input.model,
    authorizationModel: input.authorization.model,
    requireExplicit: true,
  });
}

/**
 * The benchmark gate is deliberately before transport construction. A caller
 * cannot reach a provider invocation hook with an unauthorized or mismatched
 * model, and the resulting transport keeps that model immutable for its life.
 */
export function createIssue25BenchmarkTransport(
  input: Issue25BenchmarkTransportOptions,
): CodexDirectTransport {
  const model = resolveIssue25BenchmarkModel(input);
  return new CodexDirectTransport({
    model,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    ...(input.streamIdleTimeoutMs === undefined
      ? {}
      : { streamIdleTimeoutMs: input.streamIdleTimeoutMs }),
    ...(input.firstOutputTimeoutMs === undefined
      ? {}
      : { firstOutputTimeoutMs: input.firstOutputTimeoutMs }),
    ...(input.totalGenerationTimeoutMs === undefined
      ? {}
      : { totalGenerationTimeoutMs: input.totalGenerationTimeoutMs }),
  });
}

export async function invokeIssue25BenchmarkTransport<T>(input: {
  readonly authorization: Issue25BenchmarkAuthorization;
  readonly model?: unknown;
  readonly configuredModel?: unknown;
  readonly invoke: (transport: CodexDirectTransport) => Promise<T>;
}): Promise<T> {
  const transport = createIssue25BenchmarkTransport(input);
  return input.invoke(transport);
}
