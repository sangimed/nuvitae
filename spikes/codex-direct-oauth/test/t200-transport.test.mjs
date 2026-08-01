import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import {
  BoundedSseParser,
  accountIdentifierFromCredential,
  assertNoHeaderInjection,
  buildCodexResponsesRequest,
  buildCodexResponsesRequestWithOptions,
  buildBrokerOnlyHeaders,
  buildExpectedAuditedRequestManifest,
  buildPreviousMalformedCodexRequestProjection,
  buildSemanticCodexRequest,
  buildSanitizedRequestManifest,
  buildSyntheticCodexRequest,
  classifyTransportFailure,
  diffSanitizedRequestManifests,
  invokeCodexTransport,
  invokeCodexSynthetic,
  parseNonStreamingJson,
  safeNodeErrorCode,
  validateEventTypeDiscriminator,
  validateCodexTransportUrl,
} from "../lib/codex-transport.mjs";
import { CODEX_T200_TRANSPORT_LIMITS, CODEX_T201_TRANSPORT_LIMITS, CODEX_TRANSPORT, CODEX_TRANSPORT_HARD_LIMITS } from "../oauth-constants.mjs";
import { containsSecretLikeValue } from "../lib/sanitize.mjs";

function sse(event) { return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`; }
function message(text, id = "msg_1") { return { type: "response.output_item.done", item: { id, type: "message", role: "assistant", content: [{ type: "output_text", text }] } }; }
function completed() { return { type: "response.completed", response: { id: "resp_1" } }; }
function contentPartAdded(overrides = {}) {
  return {
    type: "response.content_part.added",
    output_index: 0,
    content_index: 0,
    item_id: "msg_1",
    part: { type: "output_text", text: "payload text", annotations: [{ secret: "annotation" }] },
    ...overrides,
  };
}
function contentPartDone(overrides = {}) {
  return {
    type: "response.content_part.done",
    output_index: 0,
    content_index: 0,
    item_id: "msg_1",
    part: { type: "output_text", text: "payload text", annotations: [{ secret: "annotation" }] },
    ...overrides,
  };
}
function validStream(text = CODEX_TRANSPORT.marker) { return [sse({ type: "response.created", response: { id: "resp_1" } }), sse(message(text)), sse(completed())]; }

function testLimits(overrides = {}) {
  return {
    responseCompressedMaxBytes: 4096,
    responseDecompressedMaxBytes: 4096,
    eventMaxBytes: 4096,
    eventMaxCount: 20,
    normalizedOutputMaxBytes: 1024,
    structuredJsonMaxBytes: 1024,
    ...overrides,
  };
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
      queueMicrotask(() => { for (const chunk of chunks) response.emit("data", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); response.emit("end"); });
    };
    request.destroy = (error) => request.emit("error", error);
    return request;
  };
}

function failingHttpsRequest(error) {
  return (_options, _callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => request.emit("error", error));
    request.destroy = (destroyError) => request.emit("error", destroyError);
    return request;
  };
}

function throwingHttpsRequest(error) {
  return () => {
    throw error;
  };
}

function endThrowingHttpsRequest(error) {
  return () => {
    const request = new EventEmitter();
    request.end = () => {
      throw error;
    };
    request.destroy = (destroyError) => request.emit("error", destroyError);
    return request;
  };
}

function parseChunks(chunks) {
  const parser = new BoundedSseParser();
  for (const chunk of chunks) parser.consume(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return parser.finish();
}

function parseFailure(chunks) {
  try {
    parseChunks(chunks);
    assert.fail("expected parser failure");
  } catch (error) {
    return error;
  }
}

test("T200 transport target and broker-only request remain constrained", () => {
  assert.equal(validateCodexTransportUrl().ok, true);
  assert.equal(validateCodexTransportUrl("http://chatgpt.com/backend-api/codex/responses").ok, false);
  assert.equal(validateCodexTransportUrl("https://example.com/backend-api/codex/responses").ok, false);
  const { metadata, body } = buildSyntheticCodexRequest();
  const { headers, safeProjection } = buildBrokerOnlyHeaders({ accessToken: "synthetic-access", accountIdentifier: "synthetic-account", metadata });
  assert.equal(headers["ChatGPT-Account-ID"], "synthetic-account");
  assert.equal(headers["x-openai-internal-codex-responses-lite"], undefined);
  assert.equal(body.input[0].role, "user");
  assert.deepEqual(body.reasoning, { effort: "low", summary: "auto" });
  assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
  assert.equal(body.text.verbosity, "low");
  assert.equal(body.store, false);
  assert.equal(Object.hasOwn(body, "tools"), false);
  assert.equal(safeProjection.responses_lite_header_applied, false);
  assert.throws(() => assertNoHeaderInjection("bad\r\nx: y", "authorization"));
});

test("T201 request uses source-supported output reductions without changing T200 defaults", () => {
  const t200 = buildSyntheticCodexRequest().body;
  const t201 = buildSemanticCodexRequest("synthetic semantic prompt").body;
  assert.deepEqual(t200.reasoning, { effort: "low", summary: "auto" });
  assert.deepEqual(t200.include, ["reasoning.encrypted_content"]);
  assert.deepEqual(t201.reasoning, { effort: "low" });
  assert.equal(Object.hasOwn(t201.reasoning, "summary"), false);
  assert.deepEqual(t201.include, []);
  assert.equal(t201.text.verbosity, "low");
  assert.equal(t201.store, false);
  assert.equal(Object.hasOwn(t201, "tools"), false);
  assert.equal(Object.hasOwn(t201, "tool_choice"), false);
  assert.equal(Object.hasOwn(t201, "parallel_tool_calls"), false);
  assert.equal(Object.hasOwn(t201, "service_tier"), false);
  assert.equal(typeof t201.prompt_cache_key, "string");
  assert.equal(t201.instructions.includes("No explanations, Markdown, commentary, repeated source text, or reasoning summaries."), true);

  const explicitNone = buildCodexResponsesRequestWithOptions({ instructions: "safe", inputText: "safe", reasoningSummary: "none", includeEncryptedReasoning: false }).body;
  assert.deepEqual(explicitNone.reasoning, { effort: "low" });
  assert.deepEqual(explicitNone.include, []);
});

test("T201 serialized request manifest proves the intended reductions", async () => {
  const result = await invokeCodexTransport({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestPayload: buildSemanticCodexRequest("synthetic semantic prompt"),
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    requestImpl: fakeHttpsRequest({ chunks: validStream('{"schema_version":1}') }),
  });
  assert.equal(result.actual_request_manifest.reasoning_effort_category, "low");
  assert.equal(result.actual_request_manifest.reasoning_summary_present, false);
  assert.equal(result.actual_request_manifest.include_category, "empty");
  assert.equal(result.actual_request_manifest.text_verbosity_category, "low");
  assert.equal(result.actual_request_manifest.tools_present, false);
  assert.equal(result.actual_request_manifest.store_false, true);
  assert.equal(result.actual_request_manifest.stream_boolean, true);
  assert.equal(JSON.stringify(result.actual_request_manifest).includes("synthetic semantic prompt"), false);
});

test("transport construction and send failures return sanitized, accurately-attributed state", async () => {
  const requestPayload = buildSemanticCodexRequest("synthetic semantic prompt");
  const construction = await invokeCodexTransport({
    accessToken: "synthetic-access", accountIdentifier: "synthetic-account", requestPayload,
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    requestImpl: throwingHttpsRequest(Object.assign(new Error("private"), { code: "ECONNREFUSED" })),
  });
  assert.equal(construction.invocation_attempted, false);
  assert.equal(construction.invocation_succeeded, false);
  assert.equal(construction.primary_failure_phase, "transport_invocation");
  assert.equal(construction.safe_http_status_category, "not_attempted");
  assert.equal(JSON.stringify(construction).includes("private"), false);

  const send = await invokeCodexTransport({
    accessToken: "synthetic-access", accountIdentifier: "synthetic-account", requestPayload,
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    requestImpl: endThrowingHttpsRequest(Object.assign(new Error("private"), { code: "ECONNRESET" })),
  });
  assert.equal(send.invocation_attempted, true);
  assert.equal(send.invocation_succeeded, false);
  assert.equal(send.primary_failure_phase, "request_send");
  assert.equal(JSON.stringify(send).includes("private"), false);
});

test("T200 retains its previous proven response limits", () => {
  assert.deepEqual(CODEX_T200_TRANSPORT_LIMITS, {
    responseCompressedMaxBytes: CODEX_TRANSPORT.responseMaxBytes,
    responseDecompressedMaxBytes: CODEX_TRANSPORT.responseMaxBytes,
    eventMaxBytes: CODEX_TRANSPORT.responseMaxBytes,
    eventMaxCount: CODEX_TRANSPORT.eventMaxCount,
    normalizedOutputMaxBytes: CODEX_TRANSPORT.normalizedOutputMaxBytes,
    structuredJsonMaxBytes: CODEX_TRANSPORT.normalizedOutputMaxBytes,
  });
});

test("T201 receives explicit larger bounded semantic-output limits", async () => {
  assert.deepEqual(CODEX_T201_TRANSPORT_LIMITS, {
    responseCompressedMaxBytes: 1048576,
    responseDecompressedMaxBytes: 1048576,
    eventMaxBytes: 262144,
    eventMaxCount: 4096,
    normalizedOutputMaxBytes: 65536,
    structuredJsonMaxBytes: 65536,
  });
  assert.equal(CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes, 1048576);
  assert.equal(CODEX_T201_TRANSPORT_LIMITS.eventMaxCount > CODEX_T200_TRANSPORT_LIMITS.eventMaxCount, true);
  assert.equal(CODEX_T201_TRANSPORT_LIMITS.normalizedOutputMaxBytes > CODEX_T200_TRANSPORT_LIMITS.normalizedOutputMaxBytes, true);
  assert.equal(CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes, CODEX_T201_TRANSPORT_LIMITS.normalizedOutputMaxBytes);
  assert.equal(CODEX_T201_TRANSPORT_LIMITS.responseDecompressedMaxBytes <= CODEX_TRANSPORT_HARD_LIMITS.responseDecompressedMaxBytes, true);
  const result = await invokeCodexTransport({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestPayload: buildSemanticCodexRequest("synthetic semantic prompt"),
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    exposeRawModelText: true,
    requestImpl: fakeHttpsRequest({ chunks: validStream('{"schema_version":1}') }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.response_event_limit, CODEX_T201_TRANSPORT_LIMITS.eventMaxCount);
  assert.equal(result.assistant_output_byte_limit, CODEX_T201_TRANSPORT_LIMITS.normalizedOutputMaxBytes);
  assert.equal(result.structured_json_byte_limit, CODEX_T201_TRANSPORT_LIMITS.structuredJsonMaxBytes);
});

test("T201 accepts 4096 typed SSE events while all byte limits remain respected", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    requestImpl: fakeHttpsRequest({ chunks: [...Array.from({ length: 4095 }, () => sse({ type: "response.metadata" })), sse(completed())] }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.response_event_count, 4096);
  assert.equal(result.response_events_observed_before_abort, 4096);
  assert.equal(result.response_truncated_by_safety_limit, false);
});

test("T201 rejects event 4097 safely without semantic evaluation", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    requestImpl: fakeHttpsRequest({ chunks: [...Array.from({ length: 4096 }, () => sse({ type: "response.metadata" })), sse({ type: "response.metadata", marker: "not persisted" })] }),
  });
  assert.equal(result.primary_failure_category, "output_too_large");
  assert.equal(result.limit_that_triggered, "sse_event_count");
  assert.equal(result.response_event_limit, 4096);
  assert.equal(result.response_events_observed_before_abort, 4097);
  assert.equal(result.response_event_count_semantics, "typed_json_protocol_events");
  assert.equal(result.typed_protocol_event_count, 4097);
  assert.equal(result.json_event_count, 4097);
  assert.equal(result.recognized_protocol_event_count, 4096);
  assert.equal(result.event_type_counts.other_known_structural, 4096);
  assert.equal(result.partial_stream_statistics_preserved, true);
  assert.equal(result.triggering_sse_event_bytes > 0, true);
  assert.equal(result.response_truncated_by_safety_limit, true);
  assert.equal(result.model_output_received, false);
  assert.notEqual(result.structured_output_evaluated, true);
  assert.notEqual(result.semantic_quality_evaluated, true);
  assert.equal(JSON.stringify(result).includes("not persisted"), false);
});

test("SSE framing observations count only non-empty typed JSON protocol events", () => {
  const parser = new BoundedSseParser({ limits: testLimits() });
  parser.consume(Buffer.from(": keepalive\n\n\n\ndata: {\"type\":\"response.metadata\",\ndata: \"ignored\":true}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"r\"}}\n\n"));
  const result = parser.finish();
  assert.equal(result.response_event_count, 2);
  assert.equal(result.response_event_count_semantics, "typed_json_protocol_events");
  assert.equal(result.raw_chunk_count, 1);
  assert.equal(result.sse_comment_count, 1);
  assert.equal(result.sse_empty_dispatch_count, 3);
  assert.equal(result.sse_data_dispatch_count, 2);
  assert.equal(result.json_event_count, 2);
  assert.equal(result.typed_protocol_event_count, 2);
  assert.equal(result.event_type_counts.other_known_structural, 1);
  assert.equal(result.event_type_counts["response.completed"], 1);
});

test("SSE rejects malformed JSON separately from an empty dispatch", () => {
  const empty = new BoundedSseParser({ limits: testLimits() });
  empty.consume(Buffer.from("\n\n"));
  const emptyResult = empty.finish();
  assert.equal(emptyResult.sse_empty_dispatch_count, 2);
  assert.equal(emptyResult.json_event_count, 0);
  assert.equal(emptyResult.response_event_count, 0);
  const malformed = parseFailure(["data: {not-json}\n\n"]);
  assert.equal(malformed.safeCategory, "malformed_response");
});

test("partial assistant-output and classified stream statistics survive a bounded abort without text", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ eventMaxCount: 2 }),
    requestImpl: fakeHttpsRequest({
      chunks: [
        sse({ type: "response.output_text.delta", item_id: "m", content_index: 0, delta: "private" }),
        sse({ type: "response.reasoning_summary_text.delta", delta: "not persisted" }),
        sse({ type: "response.metadata" }),
      ],
    }),
  });
  assert.equal(result.limit_that_triggered, "sse_event_count");
  assert.equal(result.output_text_delta_event_count, 1);
  assert.equal(result.reasoning_event_count, 1);
  assert.equal(result.assistant_output_bytes_observed_before_abort, 7);
  assert.equal(result.assistant_output_started, true);
  assert.equal(result.estimated_average_protocol_event_bytes > 0, true);
  assert.notEqual(result.average_protocol_event_bytes_category, "no_events");
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("not persisted"), false);
});

test("T201 event limit remains exactly 4096", () => {
  assert.equal(CODEX_T201_TRANSPORT_LIMITS.eventMaxCount, 4096);
});

test("T201 total response bytes take precedence before event count", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: { ...CODEX_T201_TRANSPORT_LIMITS, responseCompressedMaxBytes: 256, responseDecompressedMaxBytes: 256, eventMaxBytes: 256, normalizedOutputMaxBytes: 256, structuredJsonMaxBytes: 256 },
    requestImpl: fakeHttpsRequest({ chunks: Array.from({ length: 4096 }, () => sse({ type: "response.metadata" })) }),
  });
  assert.equal(result.primary_failure_category, "output_too_large");
  assert.equal(result.limit_that_triggered, "response_compressed_bytes");
  assert.equal(result.response_events_observed_before_abort < 4096, true);
});

test("shared transport rejects unlimited and above-hard-ceiling limits before network request", async () => {
  const unlimited = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ eventMaxCount: Infinity }),
    requestImpl: failingHttpsRequest(new Error("must not run")),
  });
  assert.equal(unlimited.invocation_attempted, false);
  assert.equal(unlimited.primary_failure_phase, "limit_validation");
  assert.equal(unlimited.primary_failure_category, "output_too_large");

  const excessive = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ responseDecompressedMaxBytes: CODEX_TRANSPORT_HARD_LIMITS.responseDecompressedMaxBytes + 1 }),
    requestImpl: failingHttpsRequest(new Error("must not run")),
  });
  assert.equal(excessive.invocation_attempted, false);
  assert.equal(excessive.limit_that_triggered, "responseDecompressedMaxBytes_configuration");

  const excessiveEvents = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ eventMaxCount: 4097 }),
    requestImpl: failingHttpsRequest(new Error("must not run")),
  });
  assert.equal(excessiveEvents.invocation_attempted, false);
  assert.equal(excessiveEvents.limit_that_triggered, "eventMaxCount_configuration");
});

test("T201 rejects every invalid or above-budget caller limit before invocation", async () => {
  const requestPayload = buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" });
  for (const field of Object.keys(CODEX_T201_TRANSPORT_LIMITS)) {
    for (const value of [0, -1, 1.5, Infinity]) {
      const result = await invokeCodexTransport({
        accessToken: "a",
        accountIdentifier: "b",
        requestPayload,
        responseLimits: { ...CODEX_T201_TRANSPORT_LIMITS, [field]: value },
        requestImpl: failingHttpsRequest(new Error("must not run")),
      });
      assert.equal(result.invocation_attempted, false, field);
      assert.equal(result.primary_failure_phase, "limit_validation", field);
      assert.equal(result.limit_that_triggered, `${field}_configuration`, field);
    }
    const result = await invokeCodexTransport({
      accessToken: "a",
      accountIdentifier: "b",
      requestPayload,
      responseLimits: { ...CODEX_T201_TRANSPORT_LIMITS, [field]: CODEX_T201_TRANSPORT_LIMITS[field] + 1 },
      requestImpl: failingHttpsRequest(new Error("must not run")),
    });
    assert.equal(result.invocation_attempted, false, field);
    assert.equal(result.limit_that_triggered, `${field}_configuration`, field);
  }
});

test("T200 sanitized request differential catches the prior malformed shape", () => {
  const expected = buildExpectedAuditedRequestManifest();
  const corrected = buildSanitizedRequestManifest({ url: `${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`, method: "POST", headers: { authorization: "Bearer synthetic", "ChatGPT-Account-ID": "synthetic-account", originator: CODEX_TRANSPORT.originator, accept: "text/event-stream", "content-type": "application/json", "OpenAI-Beta": "responses=experimental", "session-id": "s", "x-client-request-id": "t" }, body: buildSyntheticCodexRequest().body });
  const paths = ["url_path", "http_method", "required_headers_present.authorization", "body_value_types.instructions", "input_item_categories", "stream_boolean"];
  assert.deepEqual(diffSanitizedRequestManifests(expected, corrected, paths), []);
  assert.ok(diffSanitizedRequestManifests(expected, buildPreviousMalformedCodexRequestProjection(), paths).length > 0);
});

test("T200 and T201 share the same transport request manifest outside prompt content", async () => {
  const t200 = buildExpectedAuditedRequestManifest();
  const t201Request = buildSemanticCodexRequest("synthetic semantic prompt");
  const t201 = await invokeCodexTransport({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    requestPayload: t201Request,
    exposeRawModelText: true,
    requestImpl: fakeHttpsRequest({ chunks: validStream('{"schema_version":1}') }),
  });
  const paths = [
    "url_path",
    "http_method",
    "required_headers_present.authorization",
    "required_headers_present.chatgpt_account_id",
    "required_headers_present.originator",
    "required_headers_present.accept",
    "required_headers_present.content_type",
    "required_headers_present.openai_beta",
    "body_value_types.instructions",
    "body_value_types.input",
    "body_value_types.stream",
    "input_item_categories",
    "stream_boolean",
    "model_identifier_category",
    "content_encoding_category",
  ];
  assert.deepEqual(diffSanitizedRequestManifests(t200, t201.actual_request_manifest, paths), []);
  assert.equal(t201.raw_model_text, '{"schema_version":1}');
});

test("shared transport classifies DNS, TLS, timeout, and connection reset safely", async () => {
  const cases = [
    [Object.assign(new Error("synthetic dns detail"), { code: "ENOTFOUND" }), "DNS_resolution", "DNS_failure", "ENOTFOUND"],
    [Object.assign(new Error("synthetic tls detail"), { code: "ERR_TLS_CERT_ALTNAME_INVALID" }), "TLS_handshake", "TLS_failure", "ERR_TLS"],
    [Object.assign(new Error("synthetic timeout detail"), { code: "ETIMEDOUT" }), "request_send", "timeout", "ETIMEDOUT"],
    [Object.assign(new Error("synthetic reset detail"), { code: "ECONNRESET" }), "request_send", "connection_reset", "ECONNRESET"],
    [Object.assign(new Error("synthetic refused detail"), { code: "ECONNREFUSED" }), "TCP_connect", "connection_refused", "ECONNREFUSED"],
  ];
  for (const [error, phase, classification, nodeCode] of cases) {
    assert.equal(safeNodeErrorCode(error), nodeCode);
    const safeCategory =
      classification === "DNS_failure" || classification === "TLS_failure"
        ? classification
        : classification === "timeout"
          ? "transport_timeout"
          : "safe_unknown_failure";
    assert.deepEqual(classifyTransportFailure(error), {
      primary_failure_phase: phase,
      safe_transport_classification: classification,
      safe_error_category: safeCategory,
      safe_node_error_code: nodeCode,
    });
    const result = await invokeCodexTransport({
      accessToken: "synthetic-access",
      accountIdentifier: "synthetic-account",
      requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
      requestImpl: failingHttpsRequest(error),
    });
    assert.equal(result.primary_failure_phase, phase);
    assert.equal(result.safe_transport_classification, classification);
    assert.equal(JSON.stringify(result).includes(error.message), false);
  }
});

test("shared transport prevents request serialization failures and request-size overrun before invocation", async () => {
  const circular = { model: CODEX_TRANSPORT.model };
  circular.self = circular;
  const serialization = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: { metadata: { sessionId: "s", threadId: "t", installationId: "i", windowId: "w" }, body: circular },
    requestImpl: failingHttpsRequest(new Error("must not run")),
  });
  assert.equal(serialization.invocation_attempted, false);
  assert.equal(serialization.primary_failure_phase, "request_serialization");
  assert.equal(serialization.request_serialization_succeeded, false);

  const tooLarge = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "x".repeat(CODEX_TRANSPORT.requestMaxBytes + 1) }),
    requestImpl: failingHttpsRequest(new Error("must not run")),
  });
  assert.equal(tooLarge.invocation_attempted, false);
  assert.equal(tooLarge.safe_transport_classification, "request_too_large");
  assert.equal(tooLarge.serialized_request_bytes_category, "over_limit");
});

test("T200 account identifier remains broker-only", () => {
  const payload = Buffer.from(JSON.stringify({ account_id: "acct_synthetic" })).toString("base64url");
  assert.equal(accountIdentifierFromCredential({ id_token: `x.${payload}.y` }), "acct_synthetic");
  assert.equal(accountIdentifierFromCredential({}), null);
});

test("SSE accepts whole, split, line-split, CRLF, multi-data, comments, and split UTF-8", () => {
  const stream = validStream();
  assert.equal(parseChunks([stream.join("")]).normalizedOutput, CODEX_TRANSPORT.marker);
  assert.equal(parseChunks([stream[0].slice(0, 13), stream[0].slice(13), ...stream.slice(1)]).response_protocol_valid, true);
  assert.equal(parseChunks([`data: {"type":"response.created","response":{}}\r\n\r\ndata: {"type":"response.output_text.delta","item_id":"m","content_index":0,\r\ndata: "delta":"${CODEX_TRANSPORT.marker}"}\r\n\r\n: keepalive\r\n\r\ndata: ${JSON.stringify(completed())}\r\n\r\n`]).normalizedOutput, CODEX_TRANSPORT.marker);
  const accented = "ok cafe \u00e9";
  const bytes = Buffer.from(`${sse({ type: "response.output_text.delta", item_id: "m", content_index: 0, delta: accented })}${sse(completed())}`);
  const split = bytes.indexOf(Buffer.from("\u00e9")) + 1;
  assert.equal(parseChunks([bytes.subarray(0, split), bytes.subarray(split)]).normalizedOutput, accented);
});

test("SSE extracts only verified assistant output text across deltas, done, and item completion", () => {
  const result = parseChunks([
    sse({ type: "response.output_text.delta", item_id: "m", content_index: 0, delta: "NUVITAE_" }),
    sse({ type: "response.output_text.delta", item_id: "m", content_index: 0, delta: "T200_OK" }),
    sse({ type: "response.output_text.done", item_id: "m", content_index: 0, text: CODEX_TRANSPORT.marker }),
    sse({ type: "response.output_item.done", item: { id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: CODEX_TRANSPORT.marker }] } }),
    sse(completed()),
  ]);
  assert.equal(result.normalizedOutput, CODEX_TRANSPORT.marker);
  assert.equal(result.response_protocol_valid, true);
});

test("T200 recognizes content_part.added as bounded structural output_text metadata without extracting text", () => {
  const result = parseChunks([sse(contentPartAdded()), sse(completed())]);
  assert.equal(result.response_event_count, 2);
  assert.equal(result.normalizedOutput, "");
  assert.equal(result.unknown_event_type, null);
  assert.equal(result.unknown_event_index, null);
});

test("T200 content_part.added never accepts marker text from the added-part payload", () => {
  const result = parseChunks([sse(contentPartAdded({ part: { type: "output_text", text: CODEX_TRANSPORT.marker } })), sse(completed())]);
  assert.equal(result.normalizedOutput, "");
});

test("T200 content_part.done is bounded structural metadata and never appends duplicate text", () => {
  const result = parseChunks([
    sse(contentPartAdded()),
    sse({ type: "response.output_text.delta", item_id: "msg_1", content_index: 0, delta: "verified" }),
    sse({ type: "response.output_text.done", item_id: "msg_1", content_index: 0, text: "verified" }),
    sse(contentPartDone({ part: { type: "output_text", text: "verified" } })),
    sse(completed()),
  ]);
  assert.equal(result.normalizedOutput, "verified");
  assert.equal(result.response_event_count, 5);
  assert.equal(result.content_part_done_observed, true);
  assert.equal(result.content_part_done_matched_added_part, true);
  assert.equal(result.content_part_done_text_consistent, true);
  assert.equal(result.content_part_done_index, 0);
  assert.equal(result.unknown_event_type, null);
  assert.equal(result.unknown_event_index, null);
});

test("T200 content_part.done does not accept marker text without verified assistant output", () => {
  const result = parseChunks([sse(contentPartAdded()), sse(contentPartDone({ part: { type: "output_text", text: CODEX_TRANSPORT.marker } })), sse(completed())]);
  assert.equal(result.normalizedOutput, "");
  assert.equal(result.expected_synthetic_marker_present, undefined);
  assert.equal(result.content_part_done_matched_added_part, true);
});

test("T200 content_part.done compares final text to assembled verified output and fails on mismatch", () => {
  const error = parseFailure([
    sse(contentPartAdded()),
    sse({ type: "response.output_text.delta", item_id: "msg_1", content_index: 0, delta: "verified" }),
    sse(contentPartDone({ part: { type: "output_text", text: "different" } })),
  ]);
  assert.equal(error.safeCategory, "malformed_response");
  assert.equal(error.diagnostics.content_part_done_observed, true);
  assert.equal(error.diagnostics.content_part_done_matched_added_part, true);
  assert.equal(error.diagnostics.content_part_done_text_consistent, false);
  assert.equal(error.diagnostics.content_part_done_index, 0);
  assert.equal(JSON.stringify(error).includes("different"), false);
});

test("T200 content_part.done requires one matching prior added part and supported output_text", () => {
  const invalidEvents = [
    [contentPartDone(), "missing prior added part"],
    [contentPartDone({ output_index: 1 }), "mismatched output index"],
    [contentPartDone({ content_index: 1 }), "mismatched content index"],
    [contentPartDone({ item_id: "other" }), "mismatched item id"],
    [contentPartDone({ part: { type: "input_text", text: "payload text" } }), "unsupported part type"],
    [contentPartDone({ output_index: -1 }), "negative output index"],
    [contentPartDone({ content_index: 81 }), "excessive content index"],
    [contentPartDone({ item_id: "" }), "missing item id"],
    [contentPartDone({ item_id: "i".repeat(129) }), "oversized item id"],
  ];
  const missingAdded = parseFailure([sse(contentPartDone())]);
  assert.equal(missingAdded.safeCategory, "malformed_response");
  for (const [event] of invalidEvents.slice(1)) {
    const error = parseFailure([sse(contentPartAdded()), sse(event)]);
    assert.equal(error.safeCategory, "malformed_response");
    assert.equal(JSON.stringify(error).includes("payload text"), false);
    assert.equal(JSON.stringify(error).includes("msg_1"), false);
    assert.equal(JSON.stringify(error).includes("annotation"), false);
  }
  const duplicate = parseFailure([sse(contentPartAdded()), sse(contentPartDone({ part: { type: "output_text" } })), sse(contentPartDone({ part: { type: "output_text" } }))]);
  assert.equal(duplicate.safeCategory, "malformed_response");
  assert.equal(duplicate.diagnostics.content_part_done_observed, true);
});

test("T200 rejects malformed content_part.added structure without persisting raw values", () => {
  const invalidEvents = [
    { output_index: -1 },
    { content_index: -1 },
    { item_id: undefined },
    { item_id: "i".repeat(129) },
    { part: undefined },
    { part: { type: "input_text", text: "unsupported" } },
  ];
  for (const overrides of invalidEvents) {
    const error = parseFailure([sse(contentPartAdded(overrides))]);
    assert.equal(error.safeCategory, "malformed_response");
    assert.equal(JSON.stringify(error).includes("payload text"), false);
    assert.equal(JSON.stringify(error).includes("annotation"), false);
    assert.equal(JSON.stringify(error).includes("msg_1"), false);
  }
});

test("T200 normal content_part.added sequence produces verified assistant output and marker detection", () => {
  const result = parseChunks([
    sse({ type: "response.output_item.added", output_index: 0, item: { id: "msg_1", type: "message", role: "assistant" } }),
    sse(contentPartAdded()),
    sse({ type: "response.output_text.delta", item_id: "msg_1", content_index: 0, delta: "NUVITAE_" }),
    sse({ type: "response.output_text.done", item_id: "msg_1", content_index: 0, text: CODEX_TRANSPORT.marker }),
    sse(completed()),
  ]);
  assert.equal(result.normalizedOutput, CODEX_TRANSPORT.marker);
  assert.equal(result.response_protocol_valid, true);
});

test("T200 complete normal Responses lifecycle validates and detects the marker", () => {
  const result = parseChunks([
    sse({ type: "response.created", response: { id: "resp_1" } }),
    sse({ type: "response.output_item.added", output_index: 0, item: { id: "msg_1", type: "message", role: "assistant" } }),
    sse(contentPartAdded()),
    sse({ type: "response.output_text.delta", item_id: "msg_1", content_index: 0, delta: CODEX_TRANSPORT.marker }),
    sse({ type: "response.output_text.done", item_id: "msg_1", content_index: 0, text: CODEX_TRANSPORT.marker }),
    sse(contentPartDone({ part: { type: "output_text", text: CODEX_TRANSPORT.marker } })),
    sse(message(CODEX_TRANSPORT.marker)),
    sse(completed()),
  ]);
  assert.equal(result.response_protocol_valid, true);
  assert.equal(result.normalizedOutput, CODEX_TRANSPORT.marker);
  assert.equal(result.content_part_done_observed, true);
  assert.equal(result.unknown_event_type, null);
  assert.equal(result.unknown_event_index, null);
});

test("SSE diagnostics record only sanitized event-type counts", () => {
  const result = parseChunks([
    sse({ type: "response.created", response: { id: "resp_private" } }),
    sse({ type: "response.in_progress", response: { id: "resp_private" } }),
    sse({ type: "response.output_item.added", output_index: 0, item: { id: "msg_private", type: "message", role: "assistant" } }),
    sse(contentPartAdded()),
    sse({ type: "response.output_text.delta", item_id: "msg_1", content_index: 0, delta: "a" }),
    sse({ type: "response.output_text.delta", item_id: "msg_1", content_index: 0, delta: "b" }),
    sse({ type: "response.reasoning_summary_part.added", summary_index: 0, item_id: "reasoning_private" }),
    sse({ type: "response.reasoning_summary_text.delta", summary_index: 0, delta: "reasoning private" }),
    sse({ type: "response.reasoning_summary_text.done", summary_index: 0, item_id: "reasoning_private", text: "reasoning private" }),
    sse({ type: "response.reasoning_summary_part.done", summary_index: 0, item_id: "reasoning_private" }),
    sse({ type: "response.reasoning_text.delta", content_index: 0, delta: "encrypted private" }),
    sse({ type: "response.metadata", private_payload: "not persisted" }),
    sse({ type: "response.output_text.done", item_id: "msg_1", content_index: 0, text: "ab" }),
    sse(contentPartDone({ part: { type: "output_text", text: "ab" } })),
    sse(message("ab")),
    sse(completed()),
  ]);
  assert.equal(result.event_type_counts["response.created"], 1);
  assert.equal(result.event_type_counts["response.output_text.delta"], 2);
  assert.equal(result.event_type_counts["response.reasoning_summary_text.delta"], 1);
  assert.equal(result.event_type_counts.encrypted_reasoning_event_category, 1);
  assert.equal(result.event_type_counts.other_known_structural, 1);
  assert.equal(result.event_type_counts.unknown_event_count, 0);
  assert.equal(result.output_text_delta_event_count, 2);
  assert.equal(result.reasoning_event_count, 5);
  assert.equal(result.structural_event_count, 9);
  assert.equal(result.assistant_output_started, true);
  assert.equal(result.assistant_output_bytes_observed_before_abort, 2);
  assert.equal(result.terminal_event_observed, true);
  assert.equal(result.estimated_average_sse_event_bytes > 0, true);
  assert.equal(result.average_sse_event_bytes_category, "small");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("reasoning private"), false);
  assert.equal(serialized.includes("encrypted private"), false);
  assert.equal(serialized.includes("not persisted"), false);
  assert.equal(serialized.includes("resp_private"), false);
  assert.equal(serialized.includes("msg_private"), false);
});

test("SSE rejects failures, explicit errors, malformed JSON, truncation, oversized events, excess events, and mandatory unknown events", () => {
  assert.throws(() => parseChunks([sse({ type: "response.failed", response: {} })]), /stream_failed/);
  assert.throws(() => parseChunks([sse({ type: "error", error: {} })]), /stream_error_event/);
  assert.throws(() => parseChunks(["data: {not-json}\n\n"]), /malformed_response/);
  assert.throws(() => parseChunks(["data: {\"type\":\"response.created\"}"]), /truncated_response_stream/);
  assert.throws(() => parseChunks([`data: ${"x".repeat(CODEX_TRANSPORT.responseMaxBytes + 1)}\n\n`]), /response_too_large/);
  assert.throws(() => parseChunks(Array.from({ length: CODEX_TRANSPORT.eventMaxCount + 1 }, () => sse({ type: "response.metadata" }))), /response_too_large/);
  assert.throws(() => parseChunks([sse({ type: "response.future_required_event" })]), /mandatory_unknown_event/);
});

test("T200 safely projects a valid unknown event without raw values", () => {
  const error = parseFailure([sse({ type: "response.future_event-v2", response: { secret: "do-not-persist" }, item: { text: "private" }, delta: "secret-delta", error: { message: "upstream detail" }, sequence_number: 9, private_value: "not-allowlisted" })]);
  assert.equal(error.safeCategory, "mandatory_unknown_event");
  assert.equal(error.diagnostics.event_type_counts.unknown_event_count, 1);
  assert.deepEqual(error.diagnostics.unknown_event_type, "response.future_event-v2");
  assert.equal(error.diagnostics.unknown_event_index, 1);
  assert.equal(error.diagnostics.unknown_event_assistant_output_phase, "before");
  assert.equal(error.diagnostics.unknown_event_terminal_phase, "before");
  assert.deepEqual(error.diagnostics.unknown_event_top_level_fields, ["delta", "error", "item", "response", "sequence_number", "type"]);
  assert.deepEqual(error.diagnostics.unknown_event_field_presence, { response_present: true, item_present: true, delta_present: true, error_present: true, sequence_number_present: true });
  assert.deepEqual(error.diagnostics.unknown_event_field_categories, { response: "object", item: "object", delta: "string", error: "object", sequence_number: "number" });
  assert.equal(error.diagnostics.unknown_event_contains_text_looking_field, true);
  assert.equal(error.diagnostics.unknown_event_followed_by_more_events, false);
  assert.equal(JSON.stringify(error.diagnostics).includes("do-not-persist"), false);
  assert.equal(JSON.stringify(error.diagnostics).includes("secret-delta"), false);
  assert.equal(JSON.stringify(error.diagnostics).includes("private_value"), false);
  assert.equal(containsSecretLikeValue(JSON.stringify(error.diagnostics)), false);
});

test("T200 rejects unsafe event type discriminators", () => {
  assert.equal(validateEventTypeDiscriminator("response.safe_event-2:ok"), "response.safe_event-2:ok");
  for (const value of ["", "x".repeat(129), "response.bad\nvalue", "response.bad value", "response.\u0000bad"]) {
    assert.throws(() => validateEventTypeDiscriminator(value), /invalid_event_type_discriminator/);
  }
  const error = parseFailure([sse({ type: "response.bad\nvalue", secret: "not persisted" })]);
  assert.equal(error.safeCategory, "invalid_event_type_discriminator");
  assert.equal(JSON.stringify(error).includes("not persisted"), false);
});

test("T200 records unknown event position relative to assistant output and terminal events", () => {
  const beforeOutput = parseFailure([sse({ type: "response.future_before_output" }), sse(message(CODEX_TRANSPORT.marker))]);
  assert.equal(beforeOutput.diagnostics.unknown_event_assistant_output_phase, "before");
  assert.equal(beforeOutput.diagnostics.unknown_event_followed_by_more_events, true);
  assert.deepEqual(beforeOutput.diagnostics.known_event_types_before_failure, []);
  const afterOutput = parseFailure([sse(message(CODEX_TRANSPORT.marker)), sse({ type: "response.future_after_output" })]);
  assert.equal(afterOutput.diagnostics.unknown_event_assistant_output_phase, "after");
  const beforeTerminal = parseFailure([sse({ type: "response.future_before_terminal" }), sse(completed())]);
  assert.equal(beforeTerminal.diagnostics.unknown_event_terminal_phase, "before");
  assert.equal(beforeTerminal.diagnostics.terminal_event_observed_before_failure, false);
  const afterTerminal = parseFailure([sse(completed()), sse({ type: "response.future_after_terminal" })]);
  assert.equal(afterTerminal.diagnostics.unknown_event_terminal_phase, "after");
  assert.equal(afterTerminal.diagnostics.terminal_event_observed_before_failure, true);
});

test("JSON path validates completed Responses shape and ignores echoed input fields", () => {
  const valid = Buffer.from(JSON.stringify({ id: "resp_1", status: "completed", output: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: CODEX_TRANSPORT.marker }] }], input: CODEX_TRANSPORT.marker }));
  assert.equal(parseNonStreamingJson(valid).normalizedOutput, CODEX_TRANSPORT.marker);
  assert.throws(() => parseNonStreamingJson(Buffer.from(JSON.stringify({ id: "r", status: "in_progress", output: [] }))), /unsupported_response_protocol/);
});

test("T200 projection records exact safe response metadata and body observations", async () => {
  const result = await invokeCodexSynthetic({ accessToken: "synthetic-access", accountIdentifier: "synthetic-account", requestImpl: fakeHttpsRequest({ headers: { "content-type": "text/event-stream; charset=utf-8", "transfer-encoding": "chunked", "content-length": "99", "x-request-id": "secret-id", "retry-after": "1" }, chunks: validStream() }) });
  assert.equal(result.ok, true);
  assert.equal(result.safe_exact_http_status, 200);
  assert.equal(result.safe_http_status_category, "2xx");
  assert.equal(result.safe_response_content_type_category, "event_stream");
  assert.equal(result.response_content_type_parameters_present, true);
  assert.equal(result.response_transfer_encoding_category, "chunked");
  assert.equal(result.response_content_length_present, true);
  assert.equal(result.response_body_present, true);
  assert.equal(result.response_body_presence, "present");
  assert.equal(result.response_body_framing_category, "sse");
  assert.equal(result.response_body_is_byte_stream, true);
  assert.equal(result.first_non_empty_body_bytes_category, "sse_data");
  assert.equal(result.response_request_id_header_present, true);
  assert.equal(result.retry_after_header_present, true);
  assert.equal(JSON.stringify(result).includes("secret-id"), false);
  assert.equal(containsSecretLikeValue(JSON.stringify(result)), false);
});

test("shared transport enforces total response byte limits with safe diagnostics", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ responseCompressedMaxBytes: 64, responseDecompressedMaxBytes: 64, eventMaxBytes: 64, normalizedOutputMaxBytes: 32, structuredJsonMaxBytes: 32 }),
    requestImpl: fakeHttpsRequest({ chunks: validStream("bounded text") }),
  });
  assert.equal(result.primary_failure_category, "output_too_large");
  assert.equal(result.safe_transport_classification, "response_too_large");
  assert.equal(result.limit_that_triggered, "response_compressed_bytes");
  assert.equal(result.response_truncated_by_safety_limit, true);
  assert.equal(result.response_compressed_byte_limit, 64);
  assert.equal(result.response_compressed_bytes_category, "over_limit");
  assert.equal(result.event_type_counts.other_known_structural, 0);
  assert.equal(JSON.stringify(result).includes("bounded text"), false);
});

test("shared transport enforces individual SSE event byte limits", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ eventMaxBytes: 40 }),
    requestImpl: fakeHttpsRequest({ chunks: [sse({ type: "response.metadata", private_text: "x".repeat(80) })] }),
  });
  assert.equal(result.primary_failure_category, "output_too_large");
  assert.equal(result.limit_that_triggered, "sse_event_bytes");
  assert.equal(result.response_event_byte_limit, 40);
  assert.equal(result.response_truncated_by_safety_limit, true);
  assert.equal(result.largest_sse_event_bytes_observed > 0, true);
  assert.equal(result.triggering_sse_event_bytes > 0, true);
  assert.equal(result.average_sse_event_bytes_category, "over_limit");
  assert.equal(result.event_type_counts.other_known_structural, 0);
  assert.equal(JSON.stringify(result).includes("private_text"), false);
});

test("shared transport enforces SSE event-count limits", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ eventMaxCount: 2 }),
    requestImpl: fakeHttpsRequest({ chunks: Array.from({ length: 3 }, () => sse({ type: "response.metadata" })) }),
  });
  assert.equal(result.primary_failure_category, "output_too_large");
  assert.equal(result.limit_that_triggered, "sse_event_count");
  assert.equal(result.response_event_limit, 2);
  assert.equal(result.response_events_observed_before_abort, 3);
  assert.equal(result.response_protocol_valid, false);
  assert.equal(result.event_type_counts.other_known_structural, 2);
});

test("shared transport enforces assembled assistant-output limits", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: testLimits({ normalizedOutputMaxBytes: 4, structuredJsonMaxBytes: 4 }),
    requestImpl: fakeHttpsRequest({ chunks: validStream("12345") }),
  });
  assert.equal(result.primary_failure_category, "output_too_large");
  assert.equal(result.primary_failure_phase, "assistant_output_assembly");
  assert.equal(result.limit_that_triggered, "assistant_output_bytes");
  assert.equal(result.assistant_output_byte_limit, 4);
  assert.equal(result.model_output_received, false);
  assert.equal(result.event_type_counts["response.output_item.done"], 1);
  assert.equal(JSON.stringify(result).includes("12345"), false);
});

test("T201 assistant output above 65536 bytes fails safely with retained histogram", async () => {
  const result = await invokeCodexTransport({
    accessToken: "a",
    accountIdentifier: "b",
    requestPayload: buildCodexResponsesRequest({ instructions: "safe", inputText: "safe" }),
    responseLimits: CODEX_T201_TRANSPORT_LIMITS,
    requestImpl: fakeHttpsRequest({ chunks: validStream("x".repeat(65537)) }),
  });
  assert.equal(result.limit_that_triggered, "assistant_output_bytes");
  assert.equal(result.assistant_output_byte_limit, 65536);
  assert.equal(result.assistant_output_bytes_observed_before_abort, 65537);
  assert.equal(result.event_type_counts["response.output_item.done"], 1);
  assert.notEqual(result.structured_output_evaluated, true);
  assert.equal(JSON.stringify(result).includes("x".repeat(64)), false);
});

test("T200 uses byte sniffing for missing Content-Type and distinct empty/unexpected body diagnostics", async () => {
  const sniffed = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: {}, chunks: validStream() }) });
  assert.equal(sniffed.ok, true);
  assert.equal(sniffed.safe_response_content_type_category, "empty");
  assert.equal(sniffed.response_body_presence, "present");
  assert.equal(sniffed.response_body_framing_category, "sse");
  const empty = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: {}, chunks: [] }) });
  assert.equal(empty.safe_error_category, "empty_response_body");
  assert.equal(empty.response_body_presence, "absent");
  assert.equal(empty.response_event_count, 0);
  assert.equal(empty.estimated_average_sse_event_bytes, 0);
  assert.equal(empty.average_sse_event_bytes_category, "no_events");
  const text = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: { "content-type": "text/plain" }, chunks: ["no"] }) });
  assert.equal(text.safe_error_category, "unsupported_response_protocol");
});

test("T200 supports audited gzip decoding and rejects unsupported content encoding", async () => {
  const compressed = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: { "content-type": "text/event-stream", "content-encoding": "gzip" }, chunks: [gzipSync(Buffer.from(validStream().join("")))] }) });
  assert.equal(compressed.ok, true);
  assert.equal(compressed.response_content_encoding_category, "gzip");
  const unsupported = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: { "content-encoding": "zstd" } }) });
  assert.equal(unsupported.safe_error_category, "unsupported_content_encoding");
});

test("T200 JSON invocation, malformed stream, and input echo handling fail closed", async () => {
  const json = JSON.stringify({ id: "resp_1", status: "completed", output: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: CODEX_TRANSPORT.marker }] }] });
  assert.equal((await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: { "content-type": "application/json" }, chunks: [json] }) })).ok, true);
  const echoedOnly = JSON.stringify({ id: "resp_1", status: "completed", output: [], input: CODEX_TRANSPORT.marker });
  const result = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: { "content-type": "application/json" }, chunks: [echoedOnly] }) });
  assert.equal(result.expected_synthetic_marker_present, false);
  assert.equal(result.ok, false);
  const truncated = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ chunks: [sse({ type: "response.created", response: {} })] }) });
  assert.equal(truncated.safe_error_category, "unsupported_response_protocol");
});

test("T200 cancellation and parent projection remain token-, account-, and event-content-blind", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = await invokeCodexSynthetic({ accessToken: "synthetic-access", accountIdentifier: "synthetic-account", signal: controller.signal, requestImpl: fakeHttpsRequest() });
  assert.equal(cancelled.safe_error_category, "stream_cancelled");
  const result = await invokeCodexSynthetic({ accessToken: "synthetic-access", accountIdentifier: "synthetic-account", requestImpl: fakeHttpsRequest({ chunks: validStream("unrelated_assistant_text") }) });
  assert.equal(JSON.stringify(result).includes("unrelated_assistant_text"), false);
  assert.equal(JSON.stringify(result).includes("synthetic-account"), false);
  assert.equal(JSON.stringify(result).includes("synthetic-access"), false);
});
