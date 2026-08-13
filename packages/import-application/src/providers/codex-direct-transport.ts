import { randomUUID } from "node:crypto";

const CODEX_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_MODEL = "gpt-5.6-sol";
const CODEX_ORIGINATOR = "openclaw";
const CODEX_USER_AGENT = "nuvitae-codex-direct-provider/1";
const MAX_REQUEST_BYTES = 65_536;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_EVENT_BYTES = 262_144;
const MAX_EVENT_COUNT = 4_096;
const MAX_OUTPUT_BYTES = 65_536;
const MAX_PROTOCOL_SNIFF_BYTES = 4_096;

/**
 * Independent transport bounds. The header deadline is supplied per request;
 * the remaining limits bound provider generation after headers arrive.
 */
export const CODEX_DIRECT_TRANSPORT_DEADLINES = {
  headerTimeoutMs: 30_000,
  firstOutputTimeoutMs: 60_000,
  activeStreamInactivityTimeoutMs: 15_000,
  totalGenerationTimeoutMs: 90_000,
} as const;

export interface CodexDirectTransportRequest {
  readonly accessToken: string;
  readonly accountIdentifier: string;
  readonly instructions: string;
  readonly inputText: string;
  /** Connection and response-header deadline; it stops when fetch resolves. */
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
  readonly onTiming?: (timing: CodexDirectTransportTiming) => void;
  readonly onProtocolShape?: (shape: CodexDirectTransportProtocolShape) => void;
  readonly onProviderSseError?: (
    diagnostic: CodexDirectTransportSseErrorDiagnostic,
  ) => void;
}

export type CodexDirectTransportTimingPhase =
  | "request_started"
  | "response_headers"
  | "first_byte"
  | "first_semantic_output"
  | "sse_started"
  | "completion_event"
  | "response_eof"
  | "request_timeout"
  | "first_output_timeout"
  | "stream_inactivity_timeout"
  | "generation_timeout"
  | "cancelled"
  | "completed"
  | "transport_error";

export type CodexDirectHttpStatusCategory =
  "not_observed" | "2xx" | "3xx" | "4xx" | "5xx";

export interface CodexDirectTransportTiming {
  readonly phase: CodexDirectTransportTimingPhase;
  readonly timestampMs: number;
  readonly elapsedMs: number;
  readonly httpStatusCategory: CodexDirectHttpStatusCategory;
  readonly firstByteReceived: boolean;
  readonly sseStarted: boolean;
  readonly completionEventReceived: boolean;
}

export interface CodexDirectTransportProtocolShape {
  readonly contentType: string;
  readonly contentTypePresent: boolean;
  readonly contentEncoding: CodexDirectTransportContentEncodingCategory;
  readonly transferEncoding: CodexDirectTransportTransferEncodingCategory;
  readonly firstChunkByteCountBucket: CodexDirectTransportByteCountBucket;
  readonly firstStructuralTokenCategory: CodexDirectTransportStructuralTokenCategory;
  readonly newlineCountBucket: CodexDirectTransportNewlineCountBucket;
  readonly additionalBytesAfterFirstByte: boolean;
  readonly inactivityDurationMs: number;
  readonly eventLinesObserved: boolean;
  readonly eventNames: readonly string[];
  readonly eventTypes: readonly string[];
  readonly sseFrameCount: number;
  readonly dataFieldCount: number;
  readonly multilineDataObserved: boolean;
  readonly doneSentinelObserved: boolean;
  readonly eofObserved: boolean;
  readonly jsonObjectParsed: boolean;
  readonly jsonTopLevelKeys: readonly string[];
  readonly finalRecognizedEventType?: string;
}

export type CodexDirectTransportContentEncodingCategory =
  "absent" | "identity" | "gzip" | "deflate" | "br" | "unsupported";

export type CodexDirectTransportTransferEncodingCategory =
  "absent" | "identity" | "chunked" | "other";

export type CodexDirectTransportByteCountBucket =
  "none" | "small" | "medium" | "large";

export type CodexDirectTransportStructuralTokenCategory =
  "sse_data" | "sse_event" | "json_object" | "whitespace" | "unknown";

export type CodexDirectTransportNewlineCountBucket =
  "none" | "1-4" | "5-19" | "20+";

export type CodexDirectTransportFailureCategory =
  | "request_too_large"
  | "response_too_large"
  | "timeout"
  | "cancelled"
  | "rate_limited"
  | "quota_exceeded"
  | "authentication_expired"
  | "authentication_revoked"
  | "provider_unavailable"
  | "protocol_invalid"
  | "unknown_provider_failure";

/**
 * Provider error diagnostics deliberately expose categories only. The
 * provider's code and message are never returned, logged, or copied into a
 * diagnostic field.
 */
export type CodexDirectTransportProviderErrorCategory =
  | "authentication_expired"
  | "authentication_revoked"
  | "rate_limited"
  | "quota_exhausted"
  | "timeout"
  | "provider_unavailable"
  | "malformed_provider_output"
  | "unknown";

export type CodexDirectTransportProviderErrorCodeCategory =
  | "expired"
  | "revoked"
  | "rate_limit"
  | "quota"
  | "timeout"
  | "temporary"
  | "internal"
  | "unknown"
  | "not_present";

export type CodexDirectTransportProviderErrorShapeCategory =
  | "nested_error_object"
  | "flat_error_object"
  | "nested_response_error"
  | "missing_error_object"
  | "malformed_error_object";

export interface CodexDirectTransportSseErrorDiagnostic {
  readonly providerErrorCategory: CodexDirectTransportProviderErrorCategory;
  readonly providerErrorCodeCategory: CodexDirectTransportProviderErrorCodeCategory;
  readonly retryable: boolean;
  readonly eventShapeCategory: CodexDirectTransportProviderErrorShapeCategory;
}

export type CodexDirectTransportResult =
  | { readonly ok: true; readonly normalizedOutput: string }
  | {
      readonly ok: false;
      readonly category: CodexDirectTransportFailureCategory;
    };

export interface CodexDirectTransportOptions {
  readonly fetch?: typeof globalThis.fetch;
  /** Test-only seam; production uses the bounded active-stream limit. */
  readonly streamIdleTimeoutMs?: number;
  /** Test-only seam; production uses the bounded pre-output grace period. */
  readonly firstOutputTimeoutMs?: number;
  /** Test-only seam; production uses the bounded generation deadline. */
  readonly totalGenerationTimeoutMs?: number;
}

/**
 * Bounded, single-request Codex transport graduated from the qualified
 * direct-OAuth spike. It owns request shape, limits, SSE framing and safe
 * status classification; it never logs or returns provider payloads.
 */
export class CodexDirectTransport {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly streamIdleTimeoutMs: number;
  private readonly firstOutputTimeoutMs: number;
  private readonly totalGenerationTimeoutMs: number;

  constructor(options: CodexDirectTransportOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.streamIdleTimeoutMs = positiveIntegerOrDefault(
      options.streamIdleTimeoutMs,
      CODEX_DIRECT_TRANSPORT_DEADLINES.activeStreamInactivityTimeoutMs,
    );
    this.firstOutputTimeoutMs = positiveIntegerOrDefault(
      options.firstOutputTimeoutMs,
      CODEX_DIRECT_TRANSPORT_DEADLINES.firstOutputTimeoutMs,
    );
    this.totalGenerationTimeoutMs = positiveIntegerOrDefault(
      options.totalGenerationTimeoutMs,
      CODEX_DIRECT_TRANSPORT_DEADLINES.totalGenerationTimeoutMs,
    );
  }

  async invoke(
    input: CodexDirectTransportRequest,
  ): Promise<CodexDirectTransportResult> {
    if (input.abortSignal?.aborted === true)
      return { ok: false, category: "cancelled" };

    const startedAt = Date.now();
    const timingState: TransportTimingState = {
      httpStatusCategory: "not_observed",
      firstByteReceived: false,
      sseStarted: false,
      completionEventReceived: false,
    };
    emitTiming(input, timingState, startedAt, "request_started");

    const sessionId = randomUUID();
    const threadId = randomUUID();
    const installationId = randomUUID();
    const body = {
      model: CODEX_MODEL,
      instructions: input.instructions,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: input.inputText }],
        },
      ],
      reasoning: { effort: "low" },
      store: false,
      stream: true,
      include: [],
      prompt_cache_key: sessionId,
      text: { verbosity: "low" },
      client_metadata: {
        "x-codex-installation-id": installationId,
        session_id: sessionId,
        thread_id: threadId,
        "x-codex-window-id": randomUUID(),
      },
    };
    const serialized = JSON.stringify(body);
    const serializedBytes = Buffer.byteLength(serialized, "utf8");
    if (serializedBytes > MAX_REQUEST_BYTES)
      return { ok: false, category: "request_too_large" };

    const controller = new AbortController();
    let streamIdleTimer: ReturnType<typeof setTimeout> | undefined;
    let firstOutputTimer: ReturnType<typeof setTimeout> | undefined;
    let generationTimer: ReturnType<typeof setTimeout> | undefined;
    let protocolShape: MutableProtocolShape | undefined;
    let abortReason: TransportAbortReason | undefined;
    const abortWithReason = (reason: TransportAbortReason) => {
      if (controller.signal.aborted) return;
      abortReason = reason;
      controller.abort(reason);
    };
    const requestTimeout = setTimeout(
      () => abortWithReason("request_timeout"),
      positiveIntegerOrDefault(
        input.timeoutMs,
        CODEX_DIRECT_TRANSPORT_DEADLINES.headerTimeoutMs,
      ),
    );
    const abort = () => abortWithReason("cancelled");
    input.abortSignal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await this.fetcher(CODEX_ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "ChatGPT-Account-ID": input.accountIdentifier,
          originator: CODEX_ORIGINATOR,
          "User-Agent": CODEX_USER_AGENT,
          accept: "text/event-stream",
          "content-type": "application/json",
          "OpenAI-Beta": "responses=experimental",
          "session-id": sessionId,
          "thread-id": threadId,
          "x-client-request-id": threadId,
          "x-codex-installation-id": installationId,
        },
        body: serialized,
        redirect: "error",
        signal: controller.signal,
      });

      clearTimeout(requestTimeout);
      timingState.httpStatusCategory = httpStatusCategory(response.status);
      emitTiming(input, timingState, startedAt, "response_headers");
      protocolShape = createProtocolShape(
        response.headers.get("content-type"),
        response.headers.get("content-encoding"),
        response.headers.get("transfer-encoding"),
      );

      if (response.status === 401)
        return { ok: false, category: "authentication_expired" };
      if (response.status === 403)
        return { ok: false, category: "authentication_revoked" };
      if (response.status === 429) {
        return { ok: false, category: "rate_limited" };
      }
      if (response.status === 402)
        return { ok: false, category: "quota_exceeded" };
      if (response.status >= 500)
        return { ok: false, category: "provider_unavailable" };
      if (!response.ok) {
        if (response.body !== null)
          await response.body.cancel().catch(() => undefined);
        return { ok: false, category: "protocol_invalid" };
      }

      generationTimer = setTimeout(
        () => abortWithReason("generation_timeout"),
        this.totalGenerationTimeoutMs,
      );

      const contentType = (
        response.headers.get("content-type")?.toLowerCase() ?? ""
      ).trim();
      let protocol = protocolForContentType(contentType);
      let parser = undefined as BoundedSseParser | undefined;
      let sniffedBytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
      const resetStreamIdleTimer = () => {
        if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer);
        streamIdleTimer = setTimeout(() => {
          protocolShape!.inactivityDurationMs = this.streamIdleTimeoutMs;
          abortWithReason("stream_timeout");
        }, this.streamIdleTimeoutMs);
      };
      let firstSemanticOutputSeen = false;
      const markFirstSemanticOutput = () => {
        if (firstSemanticOutputSeen) return;
        firstSemanticOutputSeen = true;
        if (firstOutputTimer !== undefined) clearTimeout(firstOutputTimer);
        emitTiming(input, timingState, startedAt, "first_semantic_output");
        resetStreamIdleTimer();
      };
      if (protocol === "sse") {
        parser = createSseParser(
          protocolShape,
          input,
          timingState,
          startedAt,
          markFirstSemanticOutput,
        );
      }
      firstOutputTimer = setTimeout(() => {
        abortWithReason("first_output_timeout");
      }, this.firstOutputTimeoutMs);
      const bodyBytes = await readBoundedBody(
        response,
        MAX_RESPONSE_BYTES,
        controller.signal,
        (chunk) => {
          if (chunk.byteLength === 0) return;
          if (firstSemanticOutputSeen) resetStreamIdleTimer();
          observeProtocolBytes(protocolShape!, chunk);
          if (chunk.byteLength > 0) {
            sniffedBytes = appendSniffBytes(sniffedBytes, chunk);
            protocolShape!.firstStructuralTokenCategory =
              classifyStructuralToken(sniffedBytes);
          }
          if (!timingState.firstByteReceived && chunk.byteLength > 0) {
            timingState.firstByteReceived = true;
            emitTiming(input, timingState, startedAt, "first_byte");
          }
          if (protocol === undefined && chunk.byteLength > 0) {
            const structuralCategory = classifyStructuralToken(sniffedBytes);
            if (
              structuralCategory === "sse_data" ||
              structuralCategory === "sse_event"
            ) {
              protocol = "sse";
              parser = createSseParser(
                protocolShape!,
                input,
                timingState,
                startedAt,
                markFirstSemanticOutput,
              );
              parser.consume(sniffedBytes);
            } else if (structuralCategory === "json_object") {
              protocol = "json";
              markFirstSemanticOutput();
            }
          } else if (protocol === "sse") {
            parser?.consume(chunk);
          } else if (protocol === "json") {
            markFirstSemanticOutput();
          }
        },
      );
      if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer);
      if (firstOutputTimer !== undefined) clearTimeout(firstOutputTimer);
      if (bodyBytes === null)
        return { ok: false, category: "response_too_large" };
      protocolShape.eofObserved = true;
      emitTiming(input, timingState, startedAt, "response_eof");
      if (protocol === undefined) {
        protocolShape.firstStructuralTokenCategory =
          classifyStructuralToken(sniffedBytes);
        const structuralCategory = protocolShape.firstStructuralTokenCategory;
        if (
          structuralCategory === "sse_data" ||
          structuralCategory === "sse_event"
        )
          protocol = "sse";
        else if (structuralCategory === "json_object") protocol = "json";
      }
      if (protocol === "json") {
        return parseJsonResponse(bodyBytes, protocolShape);
      }
      if (protocol !== "sse") {
        return { ok: false, category: "protocol_invalid" };
      }
      const result =
        parser?.finish() ?? parseSseResponse(bodyBytes, protocolShape);
      if (result.ok) emitTiming(input, timingState, startedAt, "completed");
      return result;
    } catch (error) {
      if (error instanceof SseParseError) {
        return { ok: false, category: error.category };
      }
      if (
        input.abortSignal?.aborted ||
        (controller.signal.aborted && controller.signal.reason === "cancelled")
      ) {
        emitTiming(input, timingState, startedAt, "cancelled");
        return { ok: false, category: "cancelled" };
      }
      if (
        abortReason === "request_timeout" ||
        abortReason === "first_output_timeout" ||
        abortReason === "stream_timeout" ||
        abortReason === "generation_timeout" ||
        isAbortError(error)
      ) {
        emitTiming(
          input,
          timingState,
          startedAt,
          abortReason === "first_output_timeout"
            ? "first_output_timeout"
            : abortReason === "stream_timeout"
              ? "stream_inactivity_timeout"
              : abortReason === "generation_timeout"
                ? "generation_timeout"
                : "request_timeout",
        );
        return { ok: false, category: "timeout" };
      }
      emitTiming(input, timingState, startedAt, "transport_error");
      return { ok: false, category: "provider_unavailable" };
    } finally {
      clearTimeout(requestTimeout);
      if (generationTimer !== undefined) clearTimeout(generationTimer);
      if (firstOutputTimer !== undefined) clearTimeout(firstOutputTimer);
      if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer);
      input.abortSignal?.removeEventListener("abort", abort);
      if (protocolShape !== undefined) {
        emitProtocolShape(input, protocolShape);
      }
    }
  }
}

type TransportAbortReason =
  | "request_timeout"
  | "first_output_timeout"
  | "stream_timeout"
  | "generation_timeout"
  | "cancelled";

interface TransportTimingState {
  httpStatusCategory: CodexDirectHttpStatusCategory;
  firstByteReceived: boolean;
  sseStarted: boolean;
  completionEventReceived: boolean;
}

interface MutableProtocolShape {
  contentType: string;
  contentTypePresent: boolean;
  contentEncoding: CodexDirectTransportContentEncodingCategory;
  transferEncoding: CodexDirectTransportTransferEncodingCategory;
  firstChunkByteCountBucket: CodexDirectTransportByteCountBucket;
  firstStructuralTokenCategory: CodexDirectTransportStructuralTokenCategory;
  newlineCountBucket: CodexDirectTransportNewlineCountBucket;
  additionalBytesAfterFirstByte: boolean;
  inactivityDurationMs: number;
  eventLinesObserved: boolean;
  eventNames: string[];
  eventTypes: string[];
  sseFrameCount: number;
  dataFieldCount: number;
  multilineDataObserved: boolean;
  doneSentinelObserved: boolean;
  eofObserved: boolean;
  jsonObjectParsed: boolean;
  jsonTopLevelKeys: string[];
  finalRecognizedEventType?: string;
}

const MAX_PROTOCOL_SHAPE_STRINGS = 64;
const MAX_PROTOCOL_SHAPE_KEYS = 64;
const SAFE_PROTOCOL_SHAPE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function createProtocolShape(
  contentType: string | null,
  contentEncoding: string | null,
  transferEncoding: string | null,
): MutableProtocolShape {
  return {
    contentType: safeContentType(contentType),
    contentTypePresent: contentType !== null && contentType.trim() !== "",
    contentEncoding: contentEncodingCategory(contentEncoding),
    transferEncoding: transferEncodingCategory(transferEncoding),
    firstChunkByteCountBucket: "none",
    firstStructuralTokenCategory: "unknown",
    newlineCountBucket: "none",
    additionalBytesAfterFirstByte: false,
    inactivityDurationMs: 0,
    eventLinesObserved: false,
    eventNames: [],
    eventTypes: [],
    sseFrameCount: 0,
    dataFieldCount: 0,
    multilineDataObserved: false,
    doneSentinelObserved: false,
    eofObserved: false,
    jsonObjectParsed: false,
    jsonTopLevelKeys: [],
  };
}

function contentEncodingCategory(
  value: string | null,
): CodexDirectTransportContentEncodingCategory {
  const encoding = value?.trim().toLowerCase() ?? "";
  if (encoding === "") return "absent";
  if (encoding === "identity") return "identity";
  if (encoding === "gzip" || encoding === "x-gzip") return "gzip";
  if (encoding === "deflate") return "deflate";
  if (encoding === "br") return "br";
  return "unsupported";
}

function transferEncodingCategory(
  value: string | null,
): CodexDirectTransportTransferEncodingCategory {
  const encoding = value?.trim().toLowerCase() ?? "";
  if (encoding === "") return "absent";
  if (encoding === "identity") return "identity";
  if (encoding.split(",").some((part) => part.trim() === "chunked"))
    return "chunked";
  return "other";
}

function byteCountBucket(bytes: number): CodexDirectTransportByteCountBucket {
  if (bytes <= 0) return "none";
  if (bytes <= 512) return "small";
  if (bytes <= 8_192) return "medium";
  return "large";
}

function newlineCountBucket(
  count: number,
): CodexDirectTransportNewlineCountBucket {
  if (count <= 0) return "none";
  if (count <= 4) return "1-4";
  if (count <= 19) return "5-19";
  return "20+";
}

function observeProtocolBytes(
  shape: MutableProtocolShape,
  chunk: Uint8Array,
): void {
  if (chunk.byteLength === 0) return;
  if (shape.firstChunkByteCountBucket === "none") {
    shape.firstChunkByteCountBucket = byteCountBucket(chunk.byteLength);
    shape.additionalBytesAfterFirstByte = chunk.byteLength > 1;
  } else {
    shape.additionalBytesAfterFirstByte = true;
  }
  let newlineCount = newlineCountForBucket(shape.newlineCountBucket);
  for (const byte of chunk) {
    if (byte === 0x0a && newlineCount < 20) newlineCount += 1;
  }
  shape.newlineCountBucket = newlineCountBucket(newlineCount);
}

function newlineCountForBucket(
  bucket: CodexDirectTransportNewlineCountBucket,
): number {
  switch (bucket) {
    case "1-4":
      return 1;
    case "5-19":
      return 5;
    case "20+":
      return 20;
    case "none":
      return 0;
  }
}

function appendSniffBytes(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (existing.byteLength >= MAX_PROTOCOL_SNIFF_BYTES) return existing;
  const remaining = MAX_PROTOCOL_SNIFF_BYTES - existing.byteLength;
  const addition = chunk.subarray(0, remaining);
  const result = new Uint8Array(existing.byteLength + addition.byteLength);
  result.set(existing);
  result.set(addition, existing.byteLength);
  return result;
}

function classifyStructuralToken(
  bytes: Uint8Array,
): CodexDirectTransportStructuralTokenCategory {
  if (bytes.byteLength === 0) return "unknown";
  let offset = 0;
  while (offset < bytes.byteLength && isAsciiWhitespace(bytes[offset]!))
    offset += 1;
  if (offset === bytes.byteLength) return "whitespace";
  const prefix = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(offset, Math.min(bytes.byteLength, offset + 32)))
    .replace(/^\uFEFF/u, "");
  if (prefix.startsWith("data:")) return "sse_data";
  if (prefix.startsWith("event:")) return "sse_event";
  if (prefix.startsWith("{")) return "json_object";
  return "unknown";
}

function isAsciiWhitespace(byte: number): boolean {
  return (
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20
  );
}

function protocolForContentType(
  contentType: string,
): "sse" | "json" | undefined {
  if (contentType.startsWith("text/event-stream")) return "sse";
  if (contentType.startsWith("application/json")) return "json";
  return undefined;
}

function createSseParser(
  protocolShape: MutableProtocolShape,
  input: CodexDirectTransportRequest,
  timingState: TransportTimingState,
  startedAt: number,
  onOutputText: () => void,
): BoundedSseParser {
  return new BoundedSseParser({
    protocolShape,
    onStarted: () => {
      if (timingState.sseStarted) return;
      timingState.sseStarted = true;
      emitTiming(input, timingState, startedAt, "sse_started");
    },
    onCompleted: () => {
      if (timingState.completionEventReceived) return;
      timingState.completionEventReceived = true;
      emitTiming(input, timingState, startedAt, "completion_event");
    },
    onOutputText,
    ...(input.onProviderSseError === undefined
      ? {}
      : { onProviderSseError: input.onProviderSseError }),
  });
}

function emitProtocolShape(
  input: CodexDirectTransportRequest,
  shape: MutableProtocolShape,
): void {
  try {
    input.onProtocolShape?.({
      ...shape,
      eventNames: [...shape.eventNames],
      eventTypes: [...shape.eventTypes],
      jsonTopLevelKeys: [...shape.jsonTopLevelKeys],
    });
  } catch {
    // Protocol diagnostics must never change provider behavior.
  }
}

function safeContentType(value: string | null): string {
  if (value === null) return "";
  const exactValue = value.trim();
  if (exactValue.length > 256) return "invalid";
  for (const character of exactValue) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return "invalid";
  }
  return exactValue;
}

function recordShapeToken(target: string[], value: unknown): void {
  if (
    typeof value !== "string" ||
    !SAFE_PROTOCOL_SHAPE_TOKEN.test(value) ||
    target.includes(value) ||
    target.length >= MAX_PROTOCOL_SHAPE_STRINGS
  )
    return;
  target.push(value);
}

function recordJsonShape(shape: MutableProtocolShape, value: unknown): void {
  if (!isRecord(value)) return;
  shape.jsonObjectParsed = true;
  for (const key of Object.keys(value)) {
    if (
      SAFE_PROTOCOL_SHAPE_TOKEN.test(key) &&
      !shape.jsonTopLevelKeys.includes(key) &&
      shape.jsonTopLevelKeys.length < MAX_PROTOCOL_SHAPE_KEYS
    ) {
      shape.jsonTopLevelKeys.push(key);
    }
  }
}

function isRecognizedEventType(eventType: string): boolean {
  return [
    "response.created",
    "response.in_progress",
    "response.output_text.delta",
    "response.output_text.done",
    "response.output_item.done",
    "response.completed",
    "response.content_part.added",
    "response.content_part.done",
    "response.output_item.added",
    "response.reasoning_summary_part.added",
    "response.reasoning_summary_text.delta",
    "response.reasoning_summary_text.done",
    "response.reasoning_summary_part.done",
    "response.metadata",
    "response.failed",
    "response.incomplete",
    "error",
  ].includes(eventType);
}

function emitTiming(
  input: CodexDirectTransportRequest,
  state: TransportTimingState,
  startedAt: number,
  phase: CodexDirectTransportTimingPhase,
): void {
  try {
    const timestampMs = Date.now();
    input.onTiming?.({
      phase,
      timestampMs,
      elapsedMs: Math.max(0, timestampMs - startedAt),
      httpStatusCategory: state.httpStatusCategory,
      firstByteReceived: state.firstByteReceived,
      sseStarted: state.sseStarted,
      completionEventReceived: state.completionEventReceived,
    });
  } catch {
    // Timing diagnostics must never change provider behavior.
  }
}

function httpStatusCategory(status: number): CodexDirectHttpStatusCategory {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "not_observed";
}

function positiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback;
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
  abortSignal: AbortSignal,
  onChunk?: (chunk: Uint8Array) => void,
): Promise<Uint8Array | null> {
  if (response.body === null) return new Uint8Array();
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maximumBytes)
    return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let removeAbortListener: (() => void) | undefined;
  let readerCancellation: Promise<void> | undefined;
  const cancelReader = (): Promise<void> => {
    if (readerCancellation !== undefined) return readerCancellation;
    readerCancellation = reader
      .cancel(abortSignal.reason)
      .then(() => undefined)
      .catch(() => undefined);
    return readerCancellation;
  };
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
      void cancelReader();
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });
    removeAbortListener = () =>
      abortSignal.removeEventListener("abort", onAbort);
    if (abortSignal.aborted) onAbort();
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), abortPromise]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await cancelReader();
        return null;
      }
      onChunk?.(next.value);
      chunks.push(next.value);
    }
  } catch (error) {
    await cancelReader();
    throw error;
  } finally {
    removeAbortListener?.();
    await readerCancellation;
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseJsonResponse(
  bytes: Uint8Array,
  protocolShape?: MutableProtocolShape,
): CodexDirectTransportResult {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (protocolShape !== undefined) recordJsonShape(protocolShape, parsed);
    if (
      !isRecord(parsed) ||
      typeof parsed.id !== "string" ||
      parsed.status !== "completed" ||
      !Array.isArray(parsed.output)
    ) {
      return { ok: false, category: "protocol_invalid" };
    }
    const output = outputTextFromItems(parsed.output);
    return output.length > MAX_OUTPUT_BYTES
      ? { ok: false, category: "response_too_large" }
      : { ok: true, normalizedOutput: output };
  } catch {
    return { ok: false, category: "protocol_invalid" };
  }
}

class BoundedSseParser {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private lineRemainder = "";
  private dataLines: string[] = [];
  private dataBytes = 0;
  private output = "";
  private completed = false;
  private eventCount = 0;
  private sawData = false;

  constructor(
    private readonly callbacks: {
      readonly onStarted?: () => void;
      readonly onCompleted?: () => void;
      readonly onOutputText?: () => void;
      readonly onProviderSseError?: (
        diagnostic: CodexDirectTransportSseErrorDiagnostic,
      ) => void;
      readonly protocolShape?: MutableProtocolShape;
    } = {},
  ) {}

  consume(bytes: Uint8Array): void {
    try {
      this.consumeText(this.decoder.decode(bytes, { stream: true }));
    } catch (error) {
      if (error instanceof SseParseError) throw error;
      throw new SseParseError("protocol_invalid");
    }
  }

  finish(): CodexDirectTransportResult {
    try {
      this.consumeText(this.decoder.decode());
    } catch (error) {
      if (error instanceof SseParseError)
        return { ok: false, category: error.category };
      return { ok: false, category: "protocol_invalid" };
    }
    if (this.dataLines.length > 0) {
      if (this.dataLines.join("\n") !== "[DONE]")
        return { ok: false, category: "protocol_invalid" };
      this.dataLines = [];
    }
    if (this.lineRemainder !== "" || !this.sawData || !this.completed) {
      return { ok: false, category: "protocol_invalid" };
    }
    return { ok: true, normalizedOutput: this.output.trim() };
  }

  private consumeText(text: string): void {
    this.lineRemainder += text;
    let cursor = 0;
    while (cursor < this.lineRemainder.length) {
      const lineFeed = this.lineRemainder.indexOf("\n", cursor);
      if (lineFeed === -1) break;
      this.processLine(
        this.lineRemainder.slice(cursor, lineFeed).replace(/\r$/u, ""),
      );
      cursor = lineFeed + 1;
    }
    this.lineRemainder = this.lineRemainder.slice(cursor);
  }

  private processLine(line: string): void {
    this.callbacks.onStarted?.();
    if (line.startsWith(":")) return;
    if (line === "" && this.dataLines.length === 0) return;
    if (line === "" && this.dataLines.length > 0) {
      const payload = this.dataLines.join("\n");
      const shape = this.callbacks.protocolShape;
      if (shape !== undefined) {
        shape.sseFrameCount += 1;
        shape.multilineDataObserved ||= this.dataLines.length > 1;
      }
      this.dataLines = [];
      this.dataBytes = 0;
      if (payload === "[DONE]") {
        if (shape !== undefined) shape.doneSentinelObserved = true;
        return;
      }
      this.sawData = true;
      this.eventCount += 1;
      if (this.eventCount > MAX_EVENT_COUNT)
        throw new SseParseError("response_too_large");
      let event: unknown;
      try {
        event = JSON.parse(payload);
      } catch {
        throw new SseParseError("protocol_invalid");
      }
      if (shape !== undefined) recordJsonShape(shape, event);
      if (!isRecord(event) || typeof event.type !== "string")
        throw new SseParseError("protocol_invalid");
      if (shape !== undefined) recordShapeToken(shape.eventTypes, event.type);
      if (shape !== undefined && isRecognizedEventType(event.type))
        shape.finalRecognizedEventType = event.type;
      this.processEvent(event);
      return;
    }
    if (line === "event" || line.startsWith("event:")) {
      const eventName =
        line === "event" ? "" : line.slice(6).replace(/^ /u, "");
      const shape = this.callbacks.protocolShape;
      if (shape !== undefined) {
        shape.eventLinesObserved = true;
        recordShapeToken(shape.eventNames, eventName);
      }
      return;
    }
    if (line === "data" || line.startsWith("data:")) {
      const value = line === "data" ? "" : line.slice(5).replace(/^ /u, "");
      if (this.callbacks.protocolShape !== undefined)
        this.callbacks.protocolShape.dataFieldCount += 1;
      this.dataBytes += Buffer.byteLength(value, "utf8");
      if (this.dataBytes > MAX_EVENT_BYTES)
        throw new SseParseError("response_too_large");
      this.dataLines.push(value);
    }
  }

  private processEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case "response.output_text.delta":
        if (typeof event.delta !== "string")
          throw new SseParseError("protocol_invalid");
        if (event.delta.length > 0) this.callbacks.onOutputText?.();
        this.output += event.delta;
        break;
      case "response.output_text.done":
        if (typeof event.text !== "string")
          throw new SseParseError("protocol_invalid");
        if (event.text.length > 0) this.callbacks.onOutputText?.();
        this.output = event.text;
        break;
      case "response.output_item.done":
        if (
          isRecord(event.item) &&
          event.item.type === "message" &&
          Array.isArray(event.item.content)
        ) {
          const itemOutput = outputTextFromItems([event.item]);
          if (itemOutput.length > 0) {
            this.callbacks.onOutputText?.();
            if (this.output.length === 0) this.output = itemOutput;
          }
        }
        break;
      case "response.completed":
        if (!isRecord(event.response) || typeof event.response.id !== "string")
          throw new SseParseError("protocol_invalid");
        this.completed = true;
        this.callbacks.onCompleted?.();
        break;
      case "response.created":
      case "response.in_progress":
      case "response.content_part.added":
      case "response.content_part.done":
      case "response.output_item.added":
      case "response.reasoning_summary_part.added":
      case "response.reasoning_summary_text.delta":
      case "response.reasoning_summary_text.done":
      case "response.reasoning_summary_part.done":
      case "response.metadata":
        break;
      case "response.failed":
      case "response.incomplete":
      case "error":
        return throwProviderSseError(event, this.callbacks);
      default:
        throw new SseParseError("protocol_invalid");
    }
    if (Buffer.byteLength(this.output, "utf8") > MAX_OUTPUT_BYTES)
      throw new SseParseError("response_too_large");
  }
}

/**
 * Supported provider error envelopes are intentionally narrow:
 * - `error` events with an `error` object containing a string `code`, `type`,
 *   or `category`;
 * - `error` events with those fields directly on the event; and
 * - `response.failed`/`response.incomplete` events with the same fields under
 *   `response.error`.
 *
 * Messages, arbitrary details, request identifiers, and all other payload
 * fields are ignored. An object with an unknown but well-formed code fails
 * closed to provider_unavailable; a missing or malformed error envelope is a
 * protocol-invalid provider response.
 */
function throwProviderSseError(
  event: Record<string, unknown>,
  callbacks: {
    readonly onProviderSseError?: (
      diagnostic: CodexDirectTransportSseErrorDiagnostic,
    ) => void;
  },
): never {
  const classification = classifyProviderSseError(event);
  try {
    callbacks.onProviderSseError?.(classification.diagnostic);
  } catch {
    // Provider diagnostics must never change provider behavior.
  }
  throw new SseParseError(classification.transportCategory);
}

function classifyProviderSseError(event: Record<string, unknown>): {
  readonly transportCategory: CodexDirectTransportFailureCategory;
  readonly diagnostic: CodexDirectTransportSseErrorDiagnostic;
} {
  const nestedError = event.error;
  let errorObject: Record<string, unknown> | undefined;
  let shape: CodexDirectTransportProviderErrorShapeCategory;

  if (event.type === "error") {
    if (isRecord(nestedError)) {
      errorObject = nestedError;
      shape = "nested_error_object";
    } else if (nestedError !== undefined) {
      return malformedProviderSseError("malformed_error_object");
    } else if (hasProviderErrorField(event)) {
      errorObject = event;
      shape = "flat_error_object";
    } else {
      return malformedProviderSseError("missing_error_object");
    }
  } else {
    const response = event.response;
    const responseError = isRecord(response) ? response.error : undefined;
    if (isRecord(responseError)) {
      errorObject = responseError;
      shape = "nested_response_error";
    } else if (responseError !== undefined) {
      return malformedProviderSseError("malformed_error_object");
    } else if (hasProviderErrorField(event)) {
      errorObject = event;
      shape = "flat_error_object";
    } else {
      return malformedProviderSseError("missing_error_object");
    }
  }

  const code = providerErrorCode(errorObject);
  if (code === "malformed")
    return malformedProviderSseError("malformed_error_object");
  if (code === undefined) return malformedProviderSseError(shape);

  const mapped = mapProviderErrorCode(code);
  return {
    transportCategory: mapped.transportCategory,
    diagnostic: {
      providerErrorCategory: mapped.providerErrorCategory,
      providerErrorCodeCategory: mapped.providerErrorCodeCategory,
      retryable: mapped.retryable,
      eventShapeCategory: shape,
    },
  };
}

function malformedProviderSseError(
  shape: CodexDirectTransportProviderErrorShapeCategory,
): {
  readonly transportCategory: "protocol_invalid";
  readonly diagnostic: CodexDirectTransportSseErrorDiagnostic;
} {
  return {
    transportCategory: "protocol_invalid",
    diagnostic: {
      providerErrorCategory: "malformed_provider_output",
      providerErrorCodeCategory: "not_present",
      retryable: true,
      eventShapeCategory: shape,
    },
  };
}

function hasProviderErrorField(value: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(value, "code") ||
    Object.prototype.hasOwnProperty.call(value, "category")
  );
}

function providerErrorCode(
  value: Record<string, unknown>,
): string | "malformed" | undefined {
  const candidates = [value.code, value.category, value.type];
  let present = false;
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    present = true;
    if (typeof candidate !== "string") return "malformed";
    const normalized = normalizeProviderErrorToken(candidate);
    if (normalized !== "") return normalized;
  }
  return present ? "malformed" : undefined;
}

function normalizeProviderErrorToken(value: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{0,63}$/u.test(normalized) ? normalized : "";
}

function mapProviderErrorCode(code: string): {
  readonly transportCategory: CodexDirectTransportFailureCategory;
  readonly providerErrorCategory: CodexDirectTransportProviderErrorCategory;
  readonly providerErrorCodeCategory: CodexDirectTransportProviderErrorCodeCategory;
  readonly retryable: boolean;
} {
  if (
    [
      "token_expired",
      "access_token_expired",
      "expired_token",
      "authentication_expired",
      "auth_expired",
    ].includes(code)
  )
    return {
      transportCategory: "authentication_expired",
      providerErrorCategory: "authentication_expired",
      providerErrorCodeCategory: "expired",
      retryable: false,
    };
  if (
    [
      "invalid_token",
      "invalid_grant",
      "refresh_token_reused",
      "token_revoked",
      "authentication_revoked",
      "auth_revoked",
      "authentication_required",
      "unauthorized",
      "forbidden",
    ].includes(code)
  )
    return {
      transportCategory: "authentication_revoked",
      providerErrorCategory: "authentication_revoked",
      providerErrorCodeCategory: "revoked",
      retryable: false,
    };
  if (
    [
      "rate_limit_exceeded",
      "rate_limited",
      "rate_limit",
      "too_many_requests",
    ].includes(code)
  )
    return {
      transportCategory: "rate_limited",
      providerErrorCategory: "rate_limited",
      providerErrorCodeCategory: "rate_limit",
      retryable: true,
    };
  if (
    [
      "usage_limit_reached",
      "usage_not_included",
      "quota_exceeded",
      "quota_exhausted",
      "insufficient_quota",
      "billing_hard_limit_reached",
    ].includes(code)
  )
    return {
      transportCategory: "quota_exceeded",
      providerErrorCategory: "quota_exhausted",
      providerErrorCodeCategory: "quota",
      retryable: false,
    };
  if (["timeout", "deadline_exceeded", "upstream_timeout"].includes(code))
    return {
      transportCategory: "timeout",
      providerErrorCategory: "timeout",
      providerErrorCodeCategory: "timeout",
      retryable: true,
    };
  if (
    [
      "service_unavailable",
      "temporarily_unavailable",
      "overloaded",
      "overload",
      "upstream_error",
      "backend_unavailable",
      "connection_error",
    ].includes(code)
  )
    return {
      transportCategory: "provider_unavailable",
      providerErrorCategory: "provider_unavailable",
      providerErrorCodeCategory: "temporary",
      retryable: true,
    };
  if (
    [
      "internal_error",
      "internal_server_error",
      "server_error",
      "provider_error",
      "unknown_error",
    ].includes(code)
  )
    return {
      transportCategory: "provider_unavailable",
      providerErrorCategory: "provider_unavailable",
      providerErrorCodeCategory: "internal",
      retryable: true,
    };
  return {
    transportCategory: "provider_unavailable",
    providerErrorCategory: "unknown",
    providerErrorCodeCategory: "unknown",
    retryable: true,
  };
}

class SseParseError extends Error {
  constructor(readonly category: CodexDirectTransportFailureCategory) {
    super(category);
  }
}

function parseSseResponse(
  bytes: Uint8Array,
  protocolShape?: MutableProtocolShape,
): CodexDirectTransportResult {
  const parser = new BoundedSseParser(
    protocolShape === undefined ? {} : { protocolShape },
  );
  try {
    parser.consume(bytes);
  } catch (error) {
    if (error instanceof SseParseError)
      return { ok: false, category: error.category };
    return { ok: false, category: "protocol_invalid" };
  }
  return parser.finish();
}

function outputTextFromItems(items: readonly unknown[]): string {
  return items
    .flatMap((item) => {
      if (
        !isRecord(item) ||
        item.type !== "message" ||
        item.role !== "assistant" ||
        !Array.isArray(item.content)
      )
        return [];
      return item.content.flatMap((part) =>
        isRecord(part) &&
        part.type === "output_text" &&
        typeof part.text === "string"
          ? [part.text]
          : [],
      );
    })
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
