import { describe, expect, it, vi } from "vitest";
import { CodexDirectTransport } from "./codex-direct-transport.js";

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
            { status: 200, headers: { "content-type": "text/event-stream" } },
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
    const result = await new CodexDirectTransport({
      fetch: vi.fn(
        async () =>
          new Response("data: {not-json}\n\n", {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    }).invoke(input);
    expect(result).toEqual({ ok: false, category: "protocol_invalid" });
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
            "content-type": "text/event-stream",
            "content-length": "1048577",
          },
        }),
    );
    expect(
      await new CodexDirectTransport({ fetch: oversized }).invoke(input),
    ).toEqual({ ok: false, category: "response_too_large" });
  });

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
      streamIdleTimeoutMs: 10,
    }).invoke({ ...input, onTiming: (event) => timing.push(event) });
    expect(result).toEqual({ ok: false, category: "timeout" });
    expect(timing).toContainEqual(
      expect.objectContaining({
        phase: "stream_inactivity_timeout",
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
        streamIdleTimeoutMs: 10,
      }).invoke({ ...input, onProtocolShape: (value) => shape.push(value) });
      expect(result).toEqual({ ok: false, category: "timeout" });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(shape).toContainEqual(
        expect.objectContaining({
          firstStructuralTokenCategory: "sse_data",
          inactivityDurationMs: 10,
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
            controller.enqueue(encoder.encode(": keepalive\n\n"));
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
