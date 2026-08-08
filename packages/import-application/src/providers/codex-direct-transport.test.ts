import { describe, expect, it, vi } from "vitest";
import { CodexDirectTransport } from "./codex-direct-transport.js";

const input = {
  accessToken: "access-token",
  accountIdentifier: "account-id",
  instructions: "return JSON",
  inputText: "resume data",
  timeoutMs: 30_000,
};

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
});
