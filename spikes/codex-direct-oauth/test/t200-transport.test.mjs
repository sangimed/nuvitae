import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import {
  BoundedSseParser,
  accountIdentifierFromCredential,
  assertNoHeaderInjection,
  buildBrokerOnlyHeaders,
  buildExpectedAuditedRequestManifest,
  buildPreviousMalformedCodexRequestProjection,
  buildSanitizedRequestManifest,
  buildSyntheticCodexRequest,
  diffSanitizedRequestManifests,
  invokeCodexSynthetic,
  parseNonStreamingJson,
  validateEventTypeDiscriminator,
  validateCodexTransportUrl,
} from "../lib/codex-transport.mjs";
import { CODEX_TRANSPORT } from "../oauth-constants.mjs";
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
  assert.equal(safeProjection.responses_lite_header_applied, false);
  assert.throws(() => assertNoHeaderInjection("bad\r\nx: y", "authorization"));
});

test("T200 sanitized request differential catches the prior malformed shape", () => {
  const expected = buildExpectedAuditedRequestManifest();
  const corrected = buildSanitizedRequestManifest({ url: `${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`, method: "POST", headers: { authorization: "Bearer synthetic", "ChatGPT-Account-ID": "synthetic-account", originator: CODEX_TRANSPORT.originator, accept: "text/event-stream", "content-type": "application/json", "OpenAI-Beta": "responses=experimental", "session-id": "s", "x-client-request-id": "t" }, body: buildSyntheticCodexRequest().body });
  const paths = ["url_path", "http_method", "required_headers_present.authorization", "body_value_types.instructions", "input_item_categories", "stream_boolean"];
  assert.deepEqual(diffSanitizedRequestManifests(expected, corrected, paths), []);
  assert.ok(diffSanitizedRequestManifests(expected, buildPreviousMalformedCodexRequestProjection(), paths).length > 0);
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

test("T200 uses byte sniffing for missing Content-Type and distinct empty/unexpected body diagnostics", async () => {
  const sniffed = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: {}, chunks: validStream() }) });
  assert.equal(sniffed.ok, true);
  assert.equal(sniffed.safe_response_content_type_category, "empty");
  assert.equal(sniffed.response_body_presence, "present");
  assert.equal(sniffed.response_body_framing_category, "sse");
  const empty = await invokeCodexSynthetic({ accessToken: "a", accountIdentifier: "b", requestImpl: fakeHttpsRequest({ headers: {}, chunks: [] }) });
  assert.equal(empty.safe_error_category, "empty_response_body");
  assert.equal(empty.response_body_presence, "absent");
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
