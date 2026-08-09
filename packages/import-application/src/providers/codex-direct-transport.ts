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
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 15_000;

export interface CodexDirectTransportRequest {
  readonly accessToken: string;
  readonly accountIdentifier: string;
  readonly instructions: string;
  readonly inputText: string;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
  readonly onTiming?: (timing: CodexDirectTransportTiming) => void;
  readonly onProtocolShape?: (shape: CodexDirectTransportProtocolShape) => void;
}

export type CodexDirectTransportTimingPhase =
  | "request_started"
  | "response_headers"
  | "first_byte"
  | "sse_started"
  | "completion_event"
  | "response_eof"
  | "request_timeout"
  | "stream_inactivity_timeout"
  | "cancelled"
  | "completed"
  | "transport_error";

export type CodexDirectHttpStatusCategory =
  "not_observed" | "2xx" | "3xx" | "4xx" | "5xx";

export interface CodexDirectTransportTiming {
  readonly phase: CodexDirectTransportTimingPhase;
  readonly elapsedMs: number;
  readonly httpStatusCategory: CodexDirectHttpStatusCategory;
  readonly firstByteReceived: boolean;
  readonly sseStarted: boolean;
  readonly completionEventReceived: boolean;
}

export interface CodexDirectTransportProtocolShape {
  readonly contentType: string;
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

export type CodexDirectTransportResult =
  | { readonly ok: true; readonly normalizedOutput: string }
  | {
      readonly ok: false;
      readonly category: CodexDirectTransportFailureCategory;
    };

export interface CodexDirectTransportOptions {
  readonly fetch?: typeof globalThis.fetch;
  /** Test-only seam; production uses the audited 15-second idle limit. */
  readonly streamIdleTimeoutMs?: number;
}

/**
 * Bounded, single-request Codex transport graduated from the qualified
 * direct-OAuth spike. It owns request shape, limits, SSE framing and safe
 * status classification; it never logs or returns provider payloads.
 */
export class CodexDirectTransport {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly streamIdleTimeoutMs: number;

  constructor(options: CodexDirectTransportOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.streamIdleTimeoutMs = positiveIntegerOrDefault(
      options.streamIdleTimeoutMs,
      DEFAULT_STREAM_IDLE_TIMEOUT_MS,
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
    let protocolShape: MutableProtocolShape | undefined;
    const requestTimeout = setTimeout(
      () => controller.abort("request_timeout"),
      positiveIntegerOrDefault(input.timeoutMs, 1),
    );
    const abort = () => controller.abort("cancelled");
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
      protocolShape = createProtocolShape(response.headers.get("content-type"));

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

      const parser = (
        response.headers.get("content-type")?.toLowerCase() ?? ""
      ).startsWith("text/event-stream")
        ? new BoundedSseParser({
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
          })
        : undefined;
      const resetStreamIdleTimer = () => {
        if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer);
        streamIdleTimer = setTimeout(
          () => controller.abort("stream_timeout"),
          this.streamIdleTimeoutMs,
        );
      };
      resetStreamIdleTimer();
      const bodyBytes = await readBoundedBody(
        response,
        MAX_RESPONSE_BYTES,
        controller.signal,
        (chunk) => {
          resetStreamIdleTimer();
          if (!timingState.firstByteReceived && chunk.byteLength > 0) {
            timingState.firstByteReceived = true;
            emitTiming(input, timingState, startedAt, "first_byte");
          }
          parser?.consume(chunk);
        },
      );
      if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer);
      if (bodyBytes === null)
        return { ok: false, category: "response_too_large" };
      protocolShape.eofObserved = true;
      emitTiming(input, timingState, startedAt, "response_eof");
      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.startsWith("application/json")) {
        return parseJsonResponse(bodyBytes, protocolShape);
      }
      if (!contentType.startsWith("text/event-stream")) {
        return { ok: false, category: "protocol_invalid" };
      }
      const result = parser?.finish() ?? parseSseResponse(bodyBytes);
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
        controller.signal.reason === "request_timeout" ||
        controller.signal.reason === "stream_timeout" ||
        isAbortError(error)
      ) {
        emitTiming(
          input,
          timingState,
          startedAt,
          controller.signal.reason === "stream_timeout"
            ? "stream_inactivity_timeout"
            : "request_timeout",
        );
        return { ok: false, category: "timeout" };
      }
      emitTiming(input, timingState, startedAt, "transport_error");
      return { ok: false, category: "provider_unavailable" };
    } finally {
      clearTimeout(requestTimeout);
      if (streamIdleTimer !== undefined) clearTimeout(streamIdleTimer);
      input.abortSignal?.removeEventListener("abort", abort);
      if (protocolShape !== undefined) {
        emitProtocolShape(input, protocolShape);
      }
    }
  }
}

interface TransportTimingState {
  httpStatusCategory: CodexDirectHttpStatusCategory;
  firstByteReceived: boolean;
  sseStarted: boolean;
  completionEventReceived: boolean;
}

interface MutableProtocolShape {
  contentType: string;
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

function createProtocolShape(contentType: string | null): MutableProtocolShape {
  return {
    contentType: safeContentType(contentType),
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
    input.onTiming?.({
      phase,
      elapsedMs: Math.max(0, Date.now() - startedAt),
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
  const abortPromise = new Promise<never>((_, reject) => {
    const onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
      void reader.cancel();
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
        await reader.cancel();
        return null;
      }
      onChunk?.(next.value);
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    removeAbortListener?.();
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
        this.output += event.delta;
        break;
      case "response.output_text.done":
        if (typeof event.text !== "string")
          throw new SseParseError("protocol_invalid");
        this.output = event.text;
        break;
      case "response.output_item.done":
        if (
          isRecord(event.item) &&
          event.item.type === "message" &&
          Array.isArray(event.item.content)
        ) {
          const itemOutput = outputTextFromItems([event.item]);
          if (itemOutput.length > 0 && this.output.length === 0)
            this.output = itemOutput;
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
        throw new SseParseError("provider_unavailable");
      default:
        throw new SseParseError("protocol_invalid");
    }
    if (Buffer.byteLength(this.output, "utf8") > MAX_OUTPUT_BYTES)
      throw new SseParseError("response_too_large");
  }
}

class SseParseError extends Error {
  constructor(
    readonly category:
      "response_too_large" | "protocol_invalid" | "provider_unavailable",
  ) {
    super(category);
  }
}

function parseSseResponse(bytes: Uint8Array): CodexDirectTransportResult {
  const parser = new BoundedSseParser();
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
