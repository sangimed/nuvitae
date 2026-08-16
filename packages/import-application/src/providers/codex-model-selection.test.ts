import { describe, expect, it, vi } from "vitest";
import {
  CODEX_BENCHMARK_MODELS,
  CODEX_DEFAULT_MODEL,
  CodexModelSelectionError,
  resolveCodexModelSelection,
} from "./codex-model-selection.js";
import { CodexDirectTransport } from "./codex-direct-transport.js";

const transportInput = {
  accessToken: "access-token",
  accountIdentifier: "account-id",
  instructions: "fixed semantic instructions",
  inputText: "fixed benchmark transcript",
  timeoutMs: 30_000,
};

const completedResponse = () =>
  new Response(
    [
      'data: {"type":"response.created","response":{}}',
      "",
      'data: {"type":"response.output_text.delta","delta":"{\\"ok\\":true}"}',
      "",
      'data: {"type":"response.completed","response":{}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n"),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

describe("Codex model selection", () => {
  it("keeps the production default on Sol", () => {
    expect(resolveCodexModelSelection()).toBe(CODEX_DEFAULT_MODEL);
  });

  it("accepts exactly the supported benchmark models", () => {
    expect(CODEX_BENCHMARK_MODELS).toEqual(["gpt-5.6-sol", "gpt-5.6-terra"]);
    expect(resolveCodexModelSelection({ configuredModel: "gpt-5.6-sol" })).toBe(
      "gpt-5.6-sol",
    );
    expect(
      resolveCodexModelSelection({ configuredModel: "gpt-5.6-terra" }),
    ).toBe("gpt-5.6-terra");
  });

  it.each([
    ["", "empty_model_identifier"],
    ["   ", "empty_model_identifier"],
    ["gpt-5.6-luna", "unsupported_model_identifier"],
  ])("fails closed for %s", (value, code) => {
    expect(() =>
      resolveCodexModelSelection({ configuredModel: value }),
    ).toThrowError(
      expect.objectContaining({
        code,
      }),
    );
  });

  it("rejects an unsupported model before the transport can fetch", () => {
    const fetcher = vi.fn();
    expect(
      () =>
        new CodexDirectTransport({
          model: "gpt-5.6-luna",
          fetch: fetcher,
        }),
    ).toThrowError(
      expect.objectContaining({ code: "unsupported_model_identifier" }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires an explicit value for benchmark execution", () => {
    expect(() =>
      resolveCodexModelSelection({ requireExplicit: true }),
    ).toThrowError(
      expect.objectContaining({ code: "missing_model_identifier" }),
    );
  });

  it("rejects conflicting model sources", () => {
    expect(() =>
      resolveCodexModelSelection({
        configuredModel: "gpt-5.6-sol",
        authorizationModel: "gpt-5.6-terra",
      }),
    ).toThrowError(
      expect.objectContaining({ code: "conflicting_model_identifiers" }),
    );
  });

  it("does not provide a fallback model after a Terra selection failure", () => {
    const invoke = vi.fn();
    expect(() =>
      resolveCodexModelSelection({
        configuredModel: "gpt-5.6-terra",
        authorizationModel: "gpt-5.6-sol",
      }),
    ).toThrowError(CodexModelSelectionError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("serializes equivalent Sol and Terra requests identically except for model", async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(init);
      return completedResponse();
    });

    await new CodexDirectTransport({
      model: "gpt-5.6-sol",
      fetch: fetcher,
    }).invoke(transportInput);
    await new CodexDirectTransport({
      model: "gpt-5.6-terra",
      fetch: fetcher,
    }).invoke(transportInput);

    const bodyForComparison = (request: RequestInit) => {
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      delete body.model;
      delete body.prompt_cache_key;
      delete body.client_metadata;
      return body;
    };

    expect(JSON.parse(String(requests[0]?.body))).toMatchObject({
      model: "gpt-5.6-sol",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
    });
    expect(JSON.parse(String(requests[1]?.body))).toMatchObject({
      model: "gpt-5.6-terra",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
    });
    expect(bodyForComparison(requests[0]!)).toEqual(
      bodyForComparison(requests[1]!),
    );
  });
});
