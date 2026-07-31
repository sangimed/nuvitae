import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  accountIdentifierFromCredential,
  assertNoHeaderInjection,
  buildBrokerOnlyHeaders,
  buildSyntheticCodexRequest,
  invokeCodexSynthetic,
  parseSseFrames,
  validateCodexTransportUrl,
} from "../lib/codex-transport.mjs";
import { CODEX_TRANSPORT } from "../oauth-constants.mjs";
import { containsSecretLikeValue } from "../lib/sanitize.mjs";

function sseEvent(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function fakeHttpsRequest({ statusCode = 200, headers = { "content-type": "text/event-stream" }, chunks = [] } = {}, observe = () => {}) {
  return (options, callback) => {
    observe(options);
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = statusCode;
      response.headers = headers;
      response.resume = () => {};
      callback(response);
      queueMicrotask(() => {
        for (const chunk of chunks) response.emit("data", Buffer.from(chunk, "utf8"));
        response.emit("end");
      });
    };
    request.destroy = (error) => request.emit("error", error);
    request.setTimeout = () => {};
    return request;
  };
}

test("T200 exact hostname/path allowlist and HTTPS enforcement", () => {
  assert.equal(validateCodexTransportUrl().ok, true);
  assert.equal(validateCodexTransportUrl("http://chatgpt.com/backend-api/codex/responses").ok, false);
  assert.equal(validateCodexTransportUrl("https://example.com/backend-api/codex/responses").ok, false);
  assert.equal(validateCodexTransportUrl("https://chatgpt.com/backend-api/codex/wrong").ok, false);
  assert.equal(validateCodexTransportUrl("https://chatgpt.com/backend-api/codex/responses?q=1").ok, false);
});

test("T200 header construction is broker-only and rejects injection", () => {
  const { metadata } = buildSyntheticCodexRequest();
  const { headers, safeProjection } = buildBrokerOnlyHeaders({ accessToken: "synthetic-access", accountIdentifier: "synthetic-account", metadata });
  assert.equal(headers.authorization, "Bearer synthetic-access");
  assert.equal(headers["ChatGPT-Account-ID"], "synthetic-account");
  assert.equal(headers.originator, CODEX_TRANSPORT.originator);
  assert.equal(headers["OpenAI-Beta"], "responses=experimental");
  assert.equal(headers["x-openai-internal-codex-responses-lite"], "true");
  assert.equal(headers["session-id"], metadata.sessionId);
  assert.equal(headers["thread-id"], metadata.threadId);
  assert.equal(headers["x-client-request-id"], metadata.threadId);
  assert.equal(headers["x-codex-installation-id"], metadata.installationId);
  assert.equal(safeProjection.authorization_header_applied, true);
  assert.equal(safeProjection.openai_beta_header_applied, true);
  assert.equal(safeProjection.responses_lite_header_applied, true);
  assert.equal(JSON.stringify(safeProjection).includes("synthetic"), false);
  assert.throws(() => assertNoHeaderInjection("bad\r\nx: y", "authorization"));
  assert.throws(() =>
    buildBrokerOnlyHeaders({ accessToken: "synthetic-access", accountIdentifier: "synthetic-account", metadata: { ...metadata, threadId: "bad\nx" } }),
  );
});

test("T200 originator and synthetic request are fixed and non-personal", () => {
  const request = buildSyntheticCodexRequest();
  assert.equal(request.body.model, CODEX_TRANSPORT.model);
  assert.equal(request.body.store, false);
  assert.equal(request.body.stream, true);
  assert.equal(request.body.input[0].type, "additional_tools");
  assert.deepEqual(request.body.input[0].tools, []);
  assert.equal(request.body.tool_choice, "auto");
  assert.equal(request.body.parallel_tool_calls, false);
  assert.deepEqual(request.body.include, ["reasoning.encrypted_content"]);
  assert.equal(request.body.prompt_cache_key, request.metadata.sessionId);
  assert.equal(request.body.client_metadata.session_id, request.metadata.sessionId);
  assert.equal(request.body.client_metadata.thread_id, request.metadata.threadId);
  assert.equal(request.body.client_metadata["x-codex-installation-id"], request.metadata.installationId);
  assert.equal(JSON.stringify(request.body).includes(CODEX_TRANSPORT.marker), true);
  assert.equal(/resume|email|phone|employment|name/i.test(JSON.stringify(request.body.input)), false);
});

test("T200 account identifier can be recovered internally from id token claims", () => {
  const jwtPayload = Buffer.from(JSON.stringify({ "https://api.openai.com/auth.chatgpt_account_id": "acct_synthetic" })).toString("base64url");
  const nestedJwtPayload = Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_nested" } })).toString("base64url");
  assert.equal(accountIdentifierFromCredential({ id_token: `x.${jwtPayload}.y` }), "acct_synthetic");
  assert.equal(accountIdentifierFromCredential({ access_token: `x.${jwtPayload}.y` }), "acct_synthetic");
  assert.equal(accountIdentifierFromCredential({ id_token: `x.${nestedJwtPayload}.y` }), "acct_nested");
  assert.equal(accountIdentifierFromCredential({ id_token: { chatgpt_account_id: "acct_parsed" } }), "acct_parsed");
  assert.equal(accountIdentifierFromCredential({ account_id: "acct_direct" }), "acct_direct");
  assert.equal(accountIdentifierFromCredential({}), null);
});

test("T200 streaming response validates marker and projects safe result", async () => {
  const result = await invokeCodexSynthetic({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestImpl: fakeHttpsRequest({
      chunks: [
        sseEvent({ type: "response.created", response: { id: "resp_1" } }),
        sseEvent({ type: "response.output_item.done", item: { type: "message", content: [{ type: "output_text", text: CODEX_TRANSPORT.marker }] } }),
        sseEvent({ type: "response.completed", response: { id: "resp_1" } }),
      ],
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.expected_synthetic_marker_present, true);
  assert.equal(result.response_protocol_valid, true);
  assert.equal(result.response_event_count, 3);
  assert.equal(containsSecretLikeValue(JSON.stringify(result)), false);
});

test("T200 non-streaming response is accepted only when JSON protocol is valid", async () => {
  const result = await invokeCodexSynthetic({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestImpl: fakeHttpsRequest({
      headers: { "content-type": "application/json" },
      chunks: [JSON.stringify({ id: "resp_1", output: [{ content: [{ type: "output_text", text: CODEX_TRANSPORT.marker }] }] })],
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.response_event_count, 1);
});

test("T200 malformed streaming event and truncated stream are rejected", async () => {
  assert.throws(() => parseSseFrames("data: {not-json}\n\n", { eventCount: 0, completed: false, normalizedOutput: "" }), /malformed_response/);
  const result = await invokeCodexSynthetic({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestImpl: fakeHttpsRequest({ chunks: [sseEvent({ type: "response.created" })] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.response_protocol_valid, false);
});

test("T200 redirect, content type, status, size, and event bounds fail closed", async () => {
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ statusCode: 302, headers: { location: "https://example.com" } }) })).safe_error_category, "unexpected_redirect");
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: { "content-type": "text/plain" } }) })).safe_error_category, "unsupported_response_protocol");
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ statusCode: 401 }) })).safe_error_category, "unauthorized");
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ statusCode: 403 }) })).safe_error_category, "forbidden");
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ statusCode: 429 }) })).safe_error_category, "quota_or_rate_limit");
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ statusCode: 500 }) })).safe_error_category, "upstream_server_error");
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ chunks: ["x".repeat(CODEX_TRANSPORT.responseMaxBytes + 1)] }) })).safe_error_category, "response_too_large");
});

test("T200 request options do not expose arbitrary endpoint or proxy behavior", async () => {
  let observed;
  await invokeCodexSynthetic({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestImpl: fakeHttpsRequest({
      chunks: [
        sseEvent({ type: "response.output_text.delta", delta: CODEX_TRANSPORT.marker }),
        sseEvent({ type: "response.completed", response: { id: "resp_1" } }),
      ],
    }, (options) => { observed = options; }),
  });
  assert.equal(observed.protocol, "https:");
  assert.equal(observed.hostname, "chatgpt.com");
  assert.equal(observed.path, "/backend-api/codex/responses");
  assert.equal(observed.headers.authorization, "Bearer synthetic-access");
  assert.equal(observed.headers["ChatGPT-Account-ID"], "synthetic-account");
  assert.equal(observed.headers.proxy, undefined);
});
