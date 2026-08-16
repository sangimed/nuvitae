import { describe, expect, it, vi } from "vitest";
import {
  CODEX_DIRECT_TRANSPORT_DEADLINES,
  CodexDirectTransport,
} from "./codex-direct-transport.js";

const input = {
  accessToken: "access-token",
  accountIdentifier: "account-id",
  instructions: "return JSON",
  inputText: "resume data",
  timeoutMs: 30_000,
};

const sse = (...events: string[]) =>
  events.map((event) => `data: ${event}\n\n`).join("");

const eventSse = (...events: string[]) =>
  events
    .map((event) => `event: ${JSON.parse(event).type}\ndata: ${event}\n\n`)
    .join("");

const jsonResponse = () =>
  JSON.stringify({
    id: "response-1",
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: '{"ok":true}' }],
      },
    ],
  });

function delayedSseResponse(
  chunks: readonly string[],
  delaysMs: readonly number[],
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const onAbort = () =>
          controller.error(new DOMException("aborted", "AbortError"));
        signal?.addEventListener("abort", onAbort, { once: true });
        void (async () => {
          try {
            for (const [index, chunk] of chunks.entries()) {
              await new Promise((resolve) =>
                setTimeout(resolve, delaysMs[index] ?? 0),
              );
              if (signal?.aborted) return;
              controller.enqueue(encoder.encode(chunk));
            }
            signal?.removeEventListener("abort", onAbort);
            controller.close();
          } catch {
            // The abort handler owns cancellation of the test stream.
          }
        })();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function completeSse(): string {
  return sse(
    '{"type":"response.created","response":{}}',
    '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
    '{"type":"response.completed","response":{"id":"response-1"}}',
    "[DONE]",
  );
}

function manySmallDeltaSse(): string {
  return sse(
    '{"type":"response.created","response":{}}',
    ...Array.from({ length: 4_500 }, () =>
      JSON.stringify({ type: "response.output_text.delta", delta: "x" }),
    ),
    '{"type":"response.completed","response":{"id":"response-1"}}',
    "[DONE]",
  );
}

function streamResponse(
  chunks: readonly Uint8Array[] | readonly string[],
  headers: Record<string, string> = {},
): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(
            typeof chunk === "string" ? encoder.encode(chunk) : chunk,
          );
        }
        controller.close();
      },
    }),
    { status: 200, headers },
  );
}

describe("CodexDirectTransport", () => {
  it("exposes bounded independent production deadlines", () => {
    expect(CODEX_DIRECT_TRANSPORT_DEADLINES).toEqual({
      headerTimeoutMs: 30_000,
      firstOutputTimeoutMs: 60_000,
      activeStreamInactivityTimeoutMs: 15_000,
      totalGenerationTimeoutMs: 90_000,
    });
  });

  it("preserves the qualified SSE response contract and assembles output", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          [
            'data: {"type":"response.created","response":{}}',
            "",
            'data: {"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
            "",
            'data: {"type":"response.completed","response":{"id":"response-1"}}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );

    const result = await new CodexDirectTransport({ fetch: fetcher }).invoke(
      input,
    );

    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request).toMatchObject({ method: "POST", redirect: "error" });
    expect(
      (request.headers as Record<string, string>)["ChatGPT-Account-ID"],
    ).toBe("account-id");
  });

  it("A. accepts data-only SSE with response.completed", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            sse(
              '{"type":"response.created","response":{}}',
              '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
              '{"type":"response.completed","response":{"id":"response-1"}}',
            ),
            {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            },
          ),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
    expect(shape).toContainEqual(
      expect.objectContaining({
        eventLinesObserved: false,
        eventTypes: [
          "response.created",
          "response.output_text.delta",
          "response.completed",
        ],
        sseFrameCount: 3,
        dataFieldCount: 3,
        eofObserved: true,
        finalRecognizedEventType: "response.completed",
      }),
    );
  });

  it("B. accepts event plus data SSE and records both structural discriminators", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            eventSse(
              '{"type":"response.created","response":{}}',
              '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
              '{"type":"response.completed","response":{"id":"response-1"}}',
            ),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result.ok).toBe(true);
    expect(shape).toContainEqual(
      expect.objectContaining({
        eventLinesObserved: true,
        eventNames: [
          "response.created",
          "response.output_text.delta",
          "response.completed",
        ],
      }),
    );
  });

  it.each([
    [
      "A. data-first SSE",
      sse(
        '{"type":"response.created","response":{}}',
        '{"type":"response.completed","response":{"id":"response-1"}}',
      ),
      { ok: true, normalizedOutput: "" },
      "sse_data",
    ],
    [
      "B. event-first SSE",
      eventSse(
        '{"type":"response.created","response":{}}',
        '{"type":"response.completed","response":{"id":"response-1"}}',
      ),
      { ok: true, normalizedOutput: "" },
      "sse_event",
    ],
    [
      "C. JSON object",
      jsonResponse(),
      { ok: true, normalizedOutput: '{"ok":true}' },
      "json_object",
    ],
    [
      "D. whitespace then SSE",
      ` \n\t${sse(
        '{"type":"response.created","response":{}}',
        '{"type":"response.completed","response":{"id":"response-1"}}',
      )}`,
      { ok: true, normalizedOutput: "" },
      "sse_data",
    ],
    [
      "E. unknown text fails closed",
      "not-sse",
      { ok: false, category: "protocol_invalid" },
      "unknown",
    ],
  ] as const)(
    "accepts only bounded headerless structure: %s",
    async (_name, body, expected, category) => {
      const shape: unknown[] = [];
      const result = await new CodexDirectTransport({
        fetch: vi.fn(async () => streamResponse([body])),
      }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
      expect(result).toEqual(expected);
      expect(shape).toContainEqual(
        expect.objectContaining({
          contentType: "",
          contentTypePresent: false,
          contentEncoding: "absent",
          transferEncoding: "absent",
          firstStructuralTokenCategory: category,
        }),
      );
    },
  );

  it("fails closed for headerless binary-looking bytes", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(async () =>
        streamResponse([new Uint8Array([0x00, 0xff, 0x10])]),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
    expect(shape).toContainEqual(
      expect.objectContaining({ firstStructuralTokenCategory: "unknown" }),
    );
  });

  it("records bounded structural diagnostics without response content", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(async () =>
        streamResponse(
          [
            'data: {"type":"response.created","response":{}}\n\n',
            'data: {"type":"response.completed","response":{"id":"response-1"}}\n\n',
          ],
          {
            "content-encoding": "identity",
            "transfer-encoding": "chunked",
          },
        ),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: true, normalizedOutput: "" });
    expect(shape).toContainEqual(
      expect.objectContaining({
        firstChunkByteCountBucket: "small",
        newlineCountBucket: "1-4",
        additionalBytesAfterFirstByte: true,
        inactivityDurationMs: 0,
      }),
    );
    expect(JSON.stringify(shape)).not.toContain("response-1");
  });

  it("C. accepts CRLF framing", async () => {
    const body = sse(
      '{"type":"response.created","response":{}}',
      '{"type":"response.completed","response":{"id":"response-1"}}',
    ).replaceAll("\n", "\r\n");
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream; charset=utf-8" },
          }),
      ),
    }).invoke(input);
    expect(result).toEqual({ ok: true, normalizedOutput: "" });
  });

  it("D. joins multiline data fields into one JSON event", async () => {
    const shape: unknown[] = [];
    const body =
      'data: {"type":"response.created",\n' +
      'data: "response":{}}\n\n' +
      'data: {"type":"response.output_text.delta",\n' +
      'data: "delta":"{\\"ok\\":true}"}\n\n' +
      'data: {"type":"response.completed","response":{"id":"response-1"}}\n\n';
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
    expect(shape).toContainEqual(
      expect.objectContaining({ multilineDataObserved: true }),
    );
    expect(shape).toContainEqual(
      expect.objectContaining({ parsedSseEventCount: 3, sseFrameCount: 3 }),
    );
  });

  it("E. ignores comments and keepalives while parsing frames", async () => {
    const body =
      ": keepalive\n\n\n" +
      sse(
        '{"type":"response.created","response":{}}',
        '{"type":"response.completed","response":{"id":"response-1"}}',
      );
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke(input);
    expect(result).toEqual({ ok: true, normalizedOutput: "" });
  });

  it("keeps transport frames separate from typed-event accounting", async () => {
    const shapes: unknown[] = [];
    const body =
      ": comment\n\n\n" +
      "\n" +
      sse(
        '{"type":"response.created","response":{}}',
        '{"type":"response.completed","response":{"id":"response-1"}}',
        "[DONE]",
      );
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({ ...input, onProtocolShape: (shape) => shapes.push(shape) });

    expect(result).toEqual({ ok: true, normalizedOutput: "" });
    expect(shapes).toContainEqual(
      expect.objectContaining({
        parsedSseEventCount: 2,
        sseFrameCount: 3,
        doneSentinelObserved: true,
        transportFailureCategory: "none",
      }),
    );
  });

  it("F. tolerates [DONE] after a completed response", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            sse(
              '{"type":"response.created","response":{}}',
              '{"type":"response.completed","response":{"id":"response-1"}}',
              "[DONE]",
            ),
            { status: 200 },
          ),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: true, normalizedOutput: "" });
    expect(shape).toContainEqual(
      expect.objectContaining({ doneSentinelObserved: true }),
    );
  });

  it("G. accepts response.completed followed by a clean EOF", async () => {
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            sse(
              '{"type":"response.created","response":{}}',
              '{"type":"response.completed","response":{"id":"response-1"}}',
            ),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
      ),
    }).invoke(input);
    expect(result).toEqual({ ok: true, normalizedOutput: "" });
  });

  it("H. rejects EOF after a provider terminal-looking frame without response.completed", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            sse(
              '{"type":"response.created","response":{}}',
              '{"type":"response.output_item.done","item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"{\\"ok\\":true}"}]}}',
              "[DONE]",
            ),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
    expect(shape).toContainEqual(
      expect.objectContaining({
        finalRecognizedEventType: "response.output_item.done",
        doneSentinelObserved: true,
        eofObserved: true,
        parsedSseEventCount: 2,
        transportFailureCategory: "missing_response_completed",
      }),
    );
  });

  it("I. accepts a completed JSON response despite an event-stream Accept header", async () => {
    const shape: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(jsonResponse(), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          }),
      ),
    }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
    expect(shape).toContainEqual(
      expect.objectContaining({
        contentType: "application/json; charset=utf-8",
        eventLinesObserved: false,
        sseFrameCount: 0,
        dataFieldCount: 0,
        jsonObjectParsed: true,
        jsonTopLevelKeys: ["id", "status", "output"],
        eofObserved: true,
      }),
    );
  });

  it("J. fails closed for a genuinely malformed SSE stream", async () => {
    const shapes: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response("data: {not-json}\n\n", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({ ...input, onProtocolShape: (shape) => shapes.push(shape) });
    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
    expect(shapes).toContainEqual(
      expect.objectContaining({
        parsedSseEventCount: 0,
        transportFailureCategory: "malformed_protocol",
      }),
    );
  });

  it.each([
    ["untyped JSON", "{}"],
    ["JSON array", "[]"],
  ])("does not count %s as a typed SSE event", async (_name, payload) => {
    const shapes: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(sse(payload), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({ ...input, onProtocolShape: (shape) => shapes.push(shape) });

    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
    expect(shapes).toContainEqual(
      expect.objectContaining({
        parsedSseEventCount: 0,
        sseFrameCount: 1,
        transportFailureCategory: "malformed_protocol",
      }),
    );
  });

  it.each([
    [401, "authentication_expired"],
    [403, "authentication_revoked"],
    [402, "quota_exceeded"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const)("maps HTTP %s without retrying", async (status, category) => {
    const fetcher = vi.fn(async () => new Response("", { status }));
    const result = await new CodexDirectTransport({ fetch: fetcher }).invoke(
      input,
    );
    expect(result).toEqual({ ok: false, category });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed for malformed protocol and oversized responses", async () => {
    const malformed = vi.fn(
      async () =>
        new Response("not-sse", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    expect(
      await new CodexDirectTransport({ fetch: malformed }).invoke(input),
    ).toEqual({ ok: false, category: "protocol_invalid" });

    const oversized = vi.fn(
      async () =>
        new Response("", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": "1048577",
          },
        }),
    );
    expect(
      await new CodexDirectTransport({ fetch: oversized }).invoke(input),
    ).toEqual({ ok: false, category: "response_too_large" });
  });

  it.each([
    [
      "buffered response body",
      () =>
        streamResponse([new Uint8Array(1_048_576), new Uint8Array([1])], {
          "content-type": "application/json",
        }),
      "buffered_response_body_limit",
      { parsedSseEventCount: 0, responseCompletedObserved: false },
    ],
    [
      "single SSE event size",
      () =>
        new Response(
          `data: {"type":"response.output_text.delta","delta":"${"x".repeat(262_145)}"}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      "individual_sse_event_limit",
      { parsedSseEventCount: 0, responseCompletedObserved: false },
    ],
    [
      "incomplete SSE line",
      () =>
        new Response(`data: ${"x".repeat(262_144)}`, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      "individual_sse_event_limit",
      { parsedSseEventCount: 0, responseCompletedObserved: false },
    ],
    [
      "assembled semantic output",
      () =>
        new Response(
          sse(
            `{"type":"response.output_text.delta","delta":"${"x".repeat(65_537)}"}`,
          ),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      "semantic_output_limit",
      { parsedSseEventCount: 1, responseCompletedObserved: false },
    ],
  ] as const)(
    "emits content-free response-limit diagnostics for %s",
    async (_name, response, triggerCategory, expected) => {
      const diagnostics: unknown[] = [];
      const result = await new CodexDirectTransport({
        fetch: vi.fn(async () => response()),
      }).invoke({
        ...input,
        onResponseLimitDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      });

      expect(result).toEqual({ ok: false, category: "response_too_large" });
      expect(diagnostics).toContainEqual(
        expect.objectContaining({
          triggerCategory,
          receivedRawBodyBytesBucket: expect.any(String),
          assembledSemanticOutputBytesBucket: expect.any(String),
          parsedSseEventCountBucket: expect.any(String),
          eventTypes: expect.any(Array),
          ...expected,
        }),
      );
      expect(JSON.stringify(diagnostics)).not.toContain("x".repeat(128));
    },
  );

  it("accepts a valid SSE stream beyond 4,096 typed events", async () => {
    const shapes: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(manySmallDeltaSse(), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({
      ...input,
      onProtocolShape: (shape) => shapes.push(shape),
    });

    expect(result).toEqual({ ok: true, normalizedOutput: "x".repeat(4_500) });
    expect(shapes).toContainEqual(
      expect.objectContaining({
        parsedSseEventCount: 4_502,
        parsedSseEventCountBucket: "1000-9999",
        sseFrameCount: 4_503,
        responseCompletedObserved: true,
      }),
    );
  });

  it("aborts incrementally when cumulative SSE bytes exceed 2 MiB", async () => {
    const encoder = new TextEncoder();
    const chunk = sse(
      ...Array.from({ length: 128 }, () =>
        JSON.stringify({
          type: "response.metadata",
          metadata: "x".repeat(160),
        }),
      ),
    );
    const chunks = Array.from({ length: 100 }, () => encoder.encode(chunk));
    let nextChunk = 0;
    let cancelled = false;
    const diagnostics: unknown[] = [];
    const timings: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              pull(controller) {
                const value = chunks[nextChunk++];
                if (value === undefined) controller.close();
                else controller.enqueue(value);
              },
              cancel() {
                cancelled = true;
              },
            }),
            { status: 200 },
          ),
      ),
    }).invoke({
      ...input,
      onResponseLimitDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onTiming: (timing) => timings.push(timing),
    });

    expect(result).toEqual({ ok: false, category: "response_too_large" });
    expect(cancelled).toBe(true);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        triggerCategory: "cumulative_raw_sse_limit",
        receivedRawBodyBytesBucket: "over_2m",
        parsedSseEventCount: expect.any(Number),
        parsedSseEventCountBucket: expect.any(String),
        responseCompletedObserved: false,
        sseFrameCount: expect.any(Number),
      }),
    );
    expect(timings).toContainEqual(
      expect.objectContaining({
        phase: "transport_error",
        elapsedMs: expect.any(Number),
      }),
    );
  });

  it("still accounts a buffered response chunk that crosses its limit", async () => {
    const diagnostics: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(async () =>
        streamResponse([new Uint8Array(1_048_576), new Uint8Array([1])], {
          "content-type": "application/json",
        }),
      ),
    }).invoke({
      ...input,
      onResponseLimitDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(result).toEqual({ ok: false, category: "response_too_large" });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        triggerCategory: "buffered_response_body_limit",
        receivedRawBodyBytesBucket: "1m-2m",
        responseCompletedObserved: false,
      }),
    );
  });

  it("accounts fixed allowlisted SSE families without a cumulative raw-body abort", async () => {
    const shapes: unknown[] = [];
    const body = sse(
      '{"type":"response.created","response":{}}',
      `{"type":"response.content_part.added","content":"${"x".repeat(70_000)}"}`,
      '{"type":"response.output_text.delta","delta":"{}"}',
    );
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({
      ...input,
      onProtocolShape: (shape) => shapes.push(shape),
    });

    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
    expect(shapes).toContainEqual(
      expect.objectContaining({
        sseEventAccounting: [
          "response.created:1:0-64k",
          "response.in_progress:0:0-64k",
          "response.output_text.delta:1:0-64k",
          "response.output_text.done:0:0-64k",
          "response.output_item.done:0:0-64k",
          "response.completed:0:0-64k",
          "response.content_part.added:1:64k-256k",
          "response.content_part.done:0:0-64k",
          "response.output_item.added:0:0-64k",
          "response.reasoning_summary_part.added:0:0-64k",
          "response.reasoning_summary_text.delta:0:0-64k",
          "response.reasoning_summary_text.done:0:0-64k",
          "response.reasoning_summary_part.done:0:0-64k",
          "response.metadata:0:0-64k",
          "response.failed:0:0-64k",
          "response.incomplete:0:0-64k",
          "error:0:0-64k",
          "unclassified:0:0-64k",
        ],
      }),
    );
  });

  it("keeps unknown SSE payload content out of fixed response-limit accounting", async () => {
    const shapes: unknown[] = [];
    const privatePayload = "PRIVATE-UNKNOWN-SSE-PAYLOAD";
    const result = await new CodexDirectTransport({
      fetch: vi.fn(async () =>
        streamResponse(
          [sse(`{"type":"future.event","private":"${privatePayload}"}`)],
          { "content-type": "text/event-stream" },
        ),
      ),
    }).invoke({
      ...input,
      onProtocolShape: (shape) => shapes.push(shape),
    });

    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
    expect(shapes).toContainEqual(
      expect.objectContaining({
        parsedSseEventCount: 1,
        parsedSseEventCountBucket: "0-4",
        sseFrameCount: 1,
        transportFailureCategory: "malformed_protocol",
      }),
    );
    expect(JSON.stringify(shapes)).not.toContain(privatePayload);
    expect(JSON.stringify(shapes)).not.toContain("private");
    expect(JSON.stringify(shapes)).not.toContain("future.event");
  });

  it("keeps accepted responses and limit diagnostics unchanged", async () => {
    const diagnostics: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response(completeSse(), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke({
      ...input,
      onResponseLimitDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
    expect(diagnostics).toEqual([]);
  });

  it.each([
    [
      "auth expired",
      {
        type: "error",
        error: {
          type: "authentication_error",
          code: "token_expired",
          message: "do-not-log-expired-message",
        },
      },
      "authentication_expired",
      "expired",
      "nested_error_object",
      false,
      "authentication_expired",
    ],
    [
      "auth revoked",
      { type: "error", code: "invalid_token", message: "private-message" },
      "authentication_revoked",
      "revoked",
      "flat_error_object",
      false,
      "authentication_revoked",
    ],
    [
      "rate limit",
      { type: "error", error: { code: "rate_limit_exceeded" } },
      "rate_limited",
      "rate_limit",
      "nested_error_object",
      true,
      "rate_limited",
    ],
    [
      "quota",
      { type: "error", error: { code: "usage_limit_reached" } },
      "quota_exhausted",
      "quota",
      "nested_error_object",
      false,
      "quota_exceeded",
    ],
    [
      "temporary unavailable",
      { type: "error", error: { code: "service_unavailable" } },
      "provider_unavailable",
      "temporary",
      "nested_error_object",
      true,
      "provider_unavailable",
    ],
    [
      "internal provider error",
      {
        type: "response.failed",
        response: { error: { type: "internal_error" } },
      },
      "provider_unavailable",
      "internal",
      "nested_response_error",
      true,
      "provider_unavailable",
    ],
    [
      "malformed error event",
      { type: "error", error: "private raw provider message" },
      "malformed_provider_output",
      "not_present",
      "malformed_error_object",
      true,
      "protocol_invalid",
    ],
    [
      "unknown error code",
      { type: "error", error: { code: "future_provider_code" } },
      "unknown",
      "unknown",
      "nested_error_object",
      true,
      "provider_unavailable",
    ],
  ] as const)(
    "classifies privacy-safe SSE provider error: %s",
    async (
      _name,
      event,
      providerErrorCategory,
      providerErrorCodeCategory,
      eventShapeCategory,
      retryable,
      transportCategory,
    ) => {
      const diagnostics: unknown[] = [];
      const result = await new CodexDirectTransport({
        fetch: vi.fn(
          async () =>
            new Response(sse(JSON.stringify(event)), {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            }),
        ),
      }).invoke({
        ...input,
        onProviderSseError: (diagnostic) => diagnostics.push(diagnostic),
      });
      expect(result).toEqual({ ok: false, category: transportCategory });
      expect(diagnostics).toEqual([
        {
          providerErrorCategory,
          providerErrorCodeCategory,
          retryable,
          eventShapeCategory,
        },
      ]);
      expect(JSON.stringify(diagnostics)).not.toContain("private");
      expect(JSON.stringify(diagnostics)).not.toContain("future_provider_code");
    },
  );

  it("propagates cancellation before any network request", async () => {
    const fetcher = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const result = await new CodexDirectTransport({ fetch: fetcher }).invoke({
      ...input,
      abortSignal: controller.signal,
    });
    expect(result).toEqual({ ok: false, category: "cancelled" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts slow first byte after headers while the stream remains active", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
      delayedSseResponse([completeSse()], [8], init.signal as AbortSignal),
    );
    const timing: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: fetcher,
      streamIdleTimeoutMs: 30,
    }).invoke({
      ...input,
      timeoutMs: 5,
      onTiming: (event) => timing.push(event),
    });
    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
    expect(timing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "response_headers",
          httpStatusCategory: "2xx",
        }),
        expect.objectContaining({
          phase: "first_byte",
          firstByteReceived: true,
        }),
      ]),
    );
    expect(
      timing.some((event) => JSON.stringify(event).includes("access-token")),
    ).toBe(false);
    expect(
      timing.some((event) => JSON.stringify(event).includes("account-id")),
    ).toBe(false);
  });

  it("allows 25 seconds of pre-output provider processing after initial events", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
        delayedSseResponse(
          [
            sse('{"type":"response.created","response":{}}'),
            sse('{"type":"response.output_item.added","item":{}}'),
            sse(
              '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
            ),
            sse('{"type":"response.completed","response":{"id":"response-1"}}'),
            sse("[DONE]"),
          ],
          [0, 0, 25_000, 0, 0],
          init.signal as AbortSignal,
        ),
      );
      const resultPromise = new CodexDirectTransport({ fetch: fetcher }).invoke(
        input,
      );
      await vi.advanceTimersByTimeAsync(25_000);
      await vi.runOnlyPendingTimersAsync();
      await expect(resultPromise).resolves.toEqual({
        ok: true,
        normalizedOutput: '{"ok":true}',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out an active stream only after post-output inactivity", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        async (_url: string, init: RequestInit) =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    sse(
                      '{"type":"response.created","response":{}}',
                      '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
                    ),
                  ),
                );
                (init.signal as AbortSignal).addEventListener(
                  "abort",
                  () =>
                    controller.error(new DOMException("aborted", "AbortError")),
                  { once: true },
                );
              },
            }),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
      );
      const timing: unknown[] = [];
      const resultPromise = new CodexDirectTransport({ fetch: fetcher }).invoke(
        {
          ...input,
          onTiming: (event) => timing.push(event),
        },
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        category: "timeout",
      });
      expect(timing).toContainEqual(
        expect.objectContaining({ phase: "stream_inactivity_timeout" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out when headers never arrive", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        async (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            (init.signal as AbortSignal).addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          }),
      );
      const timing: unknown[] = [];
      const resultPromise = new CodexDirectTransport({ fetch: fetcher }).invoke(
        {
          ...input,
          onTiming: (event) => timing.push(event),
        },
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        category: "timeout",
      });
      expect(timing).toContainEqual(
        expect.objectContaining({ phase: "request_timeout" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces total generation time even when the active stream keeps moving", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        async (_url: string, init: RequestInit) =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(
                  encoder.encode(
                    sse(
                      '{"type":"response.created","response":{}}',
                      '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
                    ),
                  ),
                );
                let timer: ReturnType<typeof setTimeout> | undefined;
                const keepMoving = () => {
                  controller.enqueue(encoder.encode(": keepalive\n\n"));
                  timer = setTimeout(keepMoving, 10_000);
                };
                timer = setTimeout(keepMoving, 10_000);
                (init.signal as AbortSignal).addEventListener(
                  "abort",
                  () => {
                    if (timer !== undefined) clearTimeout(timer);
                    controller.error(new DOMException("aborted", "AbortError"));
                  },
                  { once: true },
                );
              },
            }),
            { status: 200, headers: { "content-type": "text/event-stream" } },
          ),
      );
      const timing: unknown[] = [];
      const resultPromise = new CodexDirectTransport({ fetch: fetcher }).invoke(
        {
          ...input,
          onTiming: (event) => timing.push(event),
        },
      );
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(resultPromise).resolves.toEqual({
        ok: false,
        category: "timeout",
      });
      expect(timing).toContainEqual(
        expect.objectContaining({ phase: "generation_timeout" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes a realistic 59-second stream within the total deadline", async () => {
    vi.useFakeTimers();
    try {
      const body = completeSse();
      const chunkSize = Math.ceil(body.length / 60);
      const chunks = Array.from(
        { length: Math.ceil(body.length / chunkSize) },
        (_, index) => body.slice(index * chunkSize, (index + 1) * chunkSize),
      );
      const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
        delayedSseResponse(
          chunks,
          chunks.map((_chunk, index) => (index === 0 ? 0 : 1_000)),
          init.signal as AbortSignal,
        ),
      );
      const resultPromise = new CodexDirectTransport({ fetch: fetcher }).invoke(
        input,
      );
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.runOnlyPendingTimersAsync();
      await expect(resultPromise).resolves.toEqual({
        ok: true,
        normalizedOutput: '{"ok":true}',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets inactivity timing on stream progress and parses split SSE frames", async () => {
    const created = '{"type":"response.created",';
    const fetcher = vi.fn(async (_url: string, init: RequestInit) =>
      delayedSseResponse(
        [
          ": keepalive\n\n",
          `data: ${created}\n`,
          'data: "response":{}}\n\n',
          'data: {"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}\n\n',
          'data: {"type":"response.completed","response":{"id":"response-1"}}\n\n',
          "data: [DONE]\n\n",
        ],
        [0, 6, 6, 6, 6, 6],
        init.signal as AbortSignal,
      ),
    );
    const result = await new CodexDirectTransport({
      fetch: fetcher,
      streamIdleTimeoutMs: 10,
    }).invoke(input);
    expect(result).toEqual({ ok: true, normalizedOutput: '{"ok":true}' });
  });

  it("times out a genuinely stalled response after headers", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>({}), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const timing: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: fetcher,
      firstOutputTimeoutMs: 10,
    }).invoke({ ...input, onTiming: (event) => timing.push(event) });
    expect(result).toEqual({ ok: false, category: "timeout" });
    expect(timing).toContainEqual(
      expect.objectContaining({
        phase: "first_output_timeout",
        httpStatusCategory: "2xx",
        firstByteReceived: false,
        sseStarted: false,
      }),
    );
  });

  it("returns a timeout after the first byte and settles reader cancellation", async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    const shape: unknown[] = [];
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: "));
            },
            cancel() {
              return Promise.reject("stream_timeout");
            },
          }),
          { status: 200 },
        ),
    );
    try {
      const result = await new CodexDirectTransport({
        fetch: fetcher,
        firstOutputTimeoutMs: 10,
      }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
      expect(result).toEqual({ ok: false, category: "timeout" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(shape).toContainEqual(
        expect.objectContaining({
          firstStructuralTokenCategory: "sse_data",
          inactivityDurationMs: 0,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandledRejections).toEqual([]);
      await expect(Promise.resolve("caller-alive")).resolves.toBe(
        "caller-alive",
      );
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("times out after progress resets the inactivity window", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                sse(
                  '{"type":"response.created","response":{}}',
                  '{"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
                ),
              ),
            );
            const timer = setTimeout(
              () => controller.enqueue(encoder.encode(": progress\n\n")),
              6,
            );
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                controller.error(new DOMException("aborted", "AbortError"));
              },
              { once: true },
            );
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    });
    const timing: unknown[] = [];
    const result = await new CodexDirectTransport({
      fetch: fetcher,
      streamIdleTimeoutMs: 10,
    }).invoke({ ...input, onTiming: (event) => timing.push(event) });
    expect(result).toEqual({ ok: false, category: "timeout" });
    expect(timing).toContainEqual(
      expect.objectContaining({ phase: "stream_inactivity_timeout" }),
    );
  });

  it("aborts a stalled stream promptly when cancelled", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(
      async () =>
        new Response(new ReadableStream<Uint8Array>({}), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const promise = new CodexDirectTransport({ fetch: fetcher }).invoke({
      ...input,
      abortSignal: controller.signal,
    });
    setTimeout(() => controller.abort(), 5);
    await expect(promise).resolves.toEqual({
      ok: false,
      category: "cancelled",
    });
  });
});
