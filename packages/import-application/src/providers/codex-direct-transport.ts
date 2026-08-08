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

export interface CodexDirectTransportRequest {
  readonly accessToken: string;
  readonly accountIdentifier: string;
  readonly instructions: string;
  readonly inputText: string;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
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
}

/**
 * Bounded, single-request Codex transport graduated from the qualified
 * direct-OAuth spike. It owns request shape, limits, SSE framing and safe
 * status classification; it never logs or returns provider payloads.
 */
export class CodexDirectTransport {
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: CodexDirectTransportOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async invoke(
    input: CodexDirectTransportRequest,
  ): Promise<CodexDirectTransportResult> {
    if (input.abortSignal?.aborted === true)
      return { ok: false, category: "cancelled" };

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
    const timeout = setTimeout(
      () => controller.abort("timeout"),
      input.timeoutMs,
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
      if (!response.ok) return { ok: false, category: "protocol_invalid" };

      const bodyBytes = await readBoundedBody(response, MAX_RESPONSE_BYTES);
      if (bodyBytes === null)
        return { ok: false, category: "response_too_large" };
      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.startsWith("application/json")) {
        return parseJsonResponse(bodyBytes);
      }
      if (!contentType.startsWith("text/event-stream")) {
        return { ok: false, category: "protocol_invalid" };
      }
      return parseSseResponse(bodyBytes);
    } catch (error) {
      if (
        input.abortSignal?.aborted ||
        (controller.signal.aborted && controller.signal.reason === "cancelled")
      ) {
        return { ok: false, category: "cancelled" };
      }
      if (controller.signal.reason === "timeout" || isAbortError(error)) {
        return { ok: false, category: "timeout" };
      }
      return { ok: false, category: "provider_unavailable" };
    } finally {
      clearTimeout(timeout);
      input.abortSignal?.removeEventListener("abort", abort);
    }
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array | null> {
  if (response.body === null) return new Uint8Array();
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maximumBytes)
    return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
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

function parseJsonResponse(bytes: Uint8Array): CodexDirectTransportResult {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
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

function parseSseResponse(bytes: Uint8Array): CodexDirectTransportResult {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const lines = text.split("\n").map((line) => line.replace(/\r$/u, ""));
  const data: string[] = [];
  let output = "";
  let completed = false;
  let eventCount = 0;
  let sawData = false;
  for (const line of lines) {
    if (line.startsWith("data:")) {
      const value = line.slice(5).replace(/^ /u, "");
      data.push(value);
      if (Buffer.byteLength(data.join("\n"), "utf8") > MAX_EVENT_BYTES) {
        return { ok: false, category: "response_too_large" };
      }
      continue;
    }
    if (line !== "" || data.length === 0) continue;
    const payload = data.join("\n");
    data.length = 0;
    if (payload === "[DONE]") continue;
    sawData = true;
    eventCount += 1;
    if (eventCount > MAX_EVENT_COUNT)
      return { ok: false, category: "response_too_large" };
    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      return { ok: false, category: "protocol_invalid" };
    }
    if (!isRecord(event) || typeof event.type !== "string") {
      return { ok: false, category: "protocol_invalid" };
    }
    switch (event.type) {
      case "response.output_text.delta":
        if (typeof event.delta !== "string")
          return { ok: false, category: "protocol_invalid" };
        output += event.delta;
        break;
      case "response.output_text.done":
        if (typeof event.text !== "string")
          return { ok: false, category: "protocol_invalid" };
        output = event.text;
        break;
      case "response.output_item.done":
        if (
          isRecord(event.item) &&
          event.item.type === "message" &&
          Array.isArray(event.item.content)
        ) {
          const itemOutput = outputTextFromItems([event.item]);
          if (itemOutput.length > 0 && output.length === 0) output = itemOutput;
        }
        break;
      case "response.completed":
        if (
          !isRecord(event.response) ||
          typeof event.response.id !== "string"
        ) {
          return { ok: false, category: "protocol_invalid" };
        }
        completed = true;
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
        return { ok: false, category: "provider_unavailable" };
      default:
        return { ok: false, category: "protocol_invalid" };
    }
    if (Buffer.byteLength(output, "utf8") > MAX_OUTPUT_BYTES) {
      return { ok: false, category: "response_too_large" };
    }
  }
  if (data.length > 0 || !sawData || !completed)
    return { ok: false, category: "protocol_invalid" };
  return { ok: true, normalizedOutput: output.trim() };
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
