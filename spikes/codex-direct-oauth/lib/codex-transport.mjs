import crypto from "node:crypto";
import https from "node:https";
import { promisify } from "node:util";
import { brotliDecompress as brotliDecompressCallback, gunzip as gunzipCallback, inflate as inflateCallback } from "node:zlib";
import { CODEX_TRANSPORT } from "../oauth-constants.mjs";

const brotliDecompress = promisify(brotliDecompressCallback);
const gunzip = promisify(gunzipCallback);
const inflate = promisify(inflateCallback);

const SAFE_FAILURES = new Set([
  "encrypted_state_missing",
  "invalid_master_key",
  "credential_decryption_failed",
  "reconnect_required",
  "refresh_failed",
  "invalid_grant",
  "account_identifier_missing",
  "account_header_rejected",
  "unauthorized",
  "forbidden",
  "quota_or_rate_limit",
  "model_unavailable",
  "invalid_request_shape",
  "forbidden_or_entitlement",
  "endpoint_or_model_not_found",
  "conflict",
  "semantic_request_validation",
  "exact_http_4xx_402",
  "exact_http_4xx_405",
  "exact_http_4xx_406",
  "exact_http_4xx_407",
  "exact_http_4xx_408",
  "exact_http_4xx_410",
  "exact_http_4xx_411",
  "exact_http_4xx_412",
  "exact_http_4xx_413",
  "exact_http_4xx_414",
  "exact_http_4xx_415",
  "exact_http_4xx_416",
  "exact_http_4xx_417",
  "exact_http_4xx_418",
  "exact_http_4xx_421",
  "exact_http_4xx_423",
  "exact_http_4xx_424",
  "exact_http_4xx_425",
  "exact_http_4xx_426",
  "exact_http_4xx_428",
  "exact_http_4xx_431",
  "exact_http_4xx_451",
  "unsupported_response_protocol",
  "empty_response_body",
  "truncated_response_stream",
  "stream_failed",
  "stream_error_event",
  "unsupported_content_encoding",
  "mandatory_unknown_event",
  "invalid_event_type_discriminator",
  "stream_cancelled",
  "transport_timeout",
  "DNS_failure",
  "TLS_failure",
  "unexpected_redirect",
  "malformed_response",
  "response_too_large",
  "upstream_server_error",
  "upstream_protocol_changed",
  "safe_unknown_failure",
]);

function safeFailure(value) {
  if (/^exact_http_4xx_\d{3}$/.test(String(value))) return value;
  return SAFE_FAILURES.has(value) ? value : "safe_unknown_failure";
}

function statusCategory(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode === 400) return "400";
  if (statusCode === 401) return "401";
  if (statusCode === 403) return "403";
  if (statusCode === 404) return "404";
  if (statusCode === 409) return "409";
  if (statusCode === 422) return "422";
  if (statusCode === 429) return "429";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return "unknown_status";
}

function contentTypeCategory(value) {
  const contentType = String(value ?? "").toLowerCase();
  if (contentType === "") return "empty";
  if (contentType.startsWith("text/event-stream")) return "event_stream";
  if (contentType.startsWith("application/json")) return "json";
  if (contentType.startsWith("text/plain")) return "text";
  if (contentType.startsWith("text/html")) return "html";
  return "other";
}

function headerValue(headers, name) {
  const direct = headers?.[name];
  if (direct !== undefined) return Array.isArray(direct) ? direct[0] : direct;
  const matching = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return Array.isArray(matching?.[1]) ? matching[1][0] : matching?.[1];
}

function contentEncodingCategory(value) {
  const encoding = String(value ?? "").trim().toLowerCase();
  if (encoding === "") return "absent";
  if (encoding === "identity") return "identity";
  if (encoding === "gzip" || encoding === "x-gzip") return "gzip";
  if (encoding === "deflate") return "deflate";
  if (encoding === "br") return "br";
  return "unsupported";
}

function transferEncodingCategory(value) {
  const encoding = String(value ?? "").trim().toLowerCase();
  if (encoding === "") return "absent";
  if (encoding.split(",").map((part) => part.trim()).includes("chunked")) return "chunked";
  if (encoding === "identity") return "identity";
  return "other";
}

function chunkLengthCategory(length) {
  if (length <= 0) return "none";
  if (length <= 512) return "small";
  if (length <= 8192) return "medium";
  return "large";
}

function firstBytesCategory(bytes) {
  if (bytes.length === 0) return "empty_content";
  const prefix = bytes.subarray(0, 32);
  if (prefix[0] === 0x1f && prefix[1] === 0x8b) return "compressed_or_binary";
  const text = prefix.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (text.startsWith("data:") || text.startsWith("event:") || text.startsWith(":")) return "sse_data";
  if (text.startsWith("{")) return "json_object";
  if (text.startsWith("[")) return "json_array";
  if (/^[\x00-\x08\x0e-\x1f\x7f-\x9f]/.test(text)) return "compressed_or_binary";
  return text === "" ? "unknown_text" : "unknown_text";
}

const SAFE_EVENT_FIELD_NAMES = new Set([
  "content_index",
  "delta",
  "error",
  "event_id",
  "item",
  "item_id",
  "output_index",
  "response",
  "sequence_number",
  "text",
  "type",
]);

const STRUCTURAL_FIELDS = ["response", "item", "delta", "error", "sequence_number"];
const TEXT_LOOKING_FIELDS = new Set(["delta", "text", "content", "message", "output_text"]);
const MAX_EVENT_TYPE_LENGTH = 128;
const MAX_EVENT_INDEX = 80;
const MAX_OPAQUE_ITEM_ID_LENGTH = 128;

export function validateEventTypeDiscriminator(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_EVENT_TYPE_LENGTH || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw protocolError("invalid_event_type_discriminator");
  }
  return value;
}

function structuralCategory(value) {
  if (value === undefined) return "absent";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isFinite(value) ? "number" : "non_finite_number";
  if (typeof value === "boolean") return "boolean";
  return "other";
}

function projectUnknownEvent(event, state) {
  const topLevelFields = Object.keys(event).filter((field) => SAFE_EVENT_FIELD_NAMES.has(field)).sort((left, right) => left.localeCompare(right));
  return {
    unknown_event_type: event.type,
    unknown_event_index: state.eventCount,
    unknown_event_assistant_output_phase: state.assistantOutput.size > 0 ? "after" : "before",
    unknown_event_terminal_phase: state.terminalObserved ? "after" : "before",
    unknown_event_top_level_fields: topLevelFields,
    unknown_event_field_presence: Object.fromEntries(STRUCTURAL_FIELDS.map((field) => [`${field}_present`, Object.prototype.hasOwnProperty.call(event, field)])),
    unknown_event_field_categories: Object.fromEntries(STRUCTURAL_FIELDS.map((field) => [field, structuralCategory(event[field])])),
    unknown_event_contains_text_looking_field: Object.keys(event).some((field) => TEXT_LOOKING_FIELDS.has(field)),
    unknown_event_followed_by_more_events: false,
  };
}

function parserDiagnostics(state) {
  return {
    response_event_count: state.eventCount,
    unknown_event_type: state.unknownEvent?.unknown_event_type ?? null,
    unknown_event_index: state.unknownEvent?.unknown_event_index ?? null,
    unknown_event_assistant_output_phase: state.unknownEvent?.unknown_event_assistant_output_phase ?? null,
    unknown_event_terminal_phase: state.unknownEvent?.unknown_event_terminal_phase ?? null,
    unknown_event_top_level_fields: state.unknownEvent?.unknown_event_top_level_fields ?? [],
    unknown_event_field_presence: state.unknownEvent?.unknown_event_field_presence ?? Object.fromEntries(STRUCTURAL_FIELDS.map((field) => [`${field}_present`, false])),
    unknown_event_field_categories: state.unknownEvent?.unknown_event_field_categories ?? Object.fromEntries(STRUCTURAL_FIELDS.map((field) => [field, "absent"])),
    unknown_event_contains_text_looking_field: state.unknownEvent?.unknown_event_contains_text_looking_field ?? false,
    unknown_event_followed_by_more_events: state.unknownEvent?.unknown_event_followed_by_more_events ?? false,
    content_part_done_observed: state.contentPartDoneObserved,
    content_part_done_matched_added_part: state.contentPartDoneMatchedAddedPart,
    content_part_done_text_consistent: state.contentPartDoneTextConsistent,
    content_part_done_index: state.contentPartDoneIndex,
    known_event_types_before_failure: state.knownEventTypesBeforeFailure,
    terminal_event_observed_before_failure: state.unknownEvent?.unknown_event_terminal_phase === "after",
  };
}

function safeResponseDiagnostics(response) {
  const contentType = String(headerValue(response.headers, "content-type") ?? "");
  const contentEncoding = headerValue(response.headers, "content-encoding");
  return {
    safe_exact_http_status: Number.isInteger(response.statusCode) ? response.statusCode : null,
    safe_http_status_category: statusCategory(response.statusCode),
    safe_response_content_type_category: contentTypeCategory(contentType),
    response_content_type_parameters_present: contentType.includes(";"),
    response_content_encoding_category: contentEncodingCategory(contentEncoding),
    response_transfer_encoding_category: transferEncodingCategory(headerValue(response.headers, "transfer-encoding")),
    response_content_length_present: headerValue(response.headers, "content-length") !== undefined,
    response_body_present: false,
    response_body_presence: "absent",
    response_body_framing_category: "empty",
    response_body_is_byte_stream: true,
    first_non_empty_body_chunk_length_category: "none",
    first_non_empty_body_bytes_category: "empty_content",
    response_request_id_header_present: headerValue(response.headers, "x-request-id") !== undefined,
    retry_after_header_present:
      headerValue(response.headers, "retry-after") !== undefined || headerValue(response.headers, "retry-after-ms") !== undefined,
  };
}

function classifyStatus(statusCode, bodyText = "") {
  const lower = bodyText.toLowerCase();
  if (statusCode === 400) return "invalid_request_shape";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return lower.includes("account") ? "account_header_rejected" : "forbidden_or_entitlement";
  if (statusCode === 404) return "endpoint_or_model_not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 422) return "semantic_request_validation";
  if (statusCode === 429) return "quota_or_rate_limit";
  if (statusCode >= 500) return "upstream_server_error";
  if (statusCode >= 400 && lower.includes("model")) return "model_unavailable";
  if (statusCode >= 400 && statusCode < 500) return `exact_http_4xx_${statusCode}`;
  return "safe_unknown_failure";
}

export function validateCodexTransportUrl(urlLike = `${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`) {
  const url = new URL(urlLike);
  const origin = new URL(CODEX_TRANSPORT.backendOrigin);
  const checks = {
    httpsOnly: url.protocol === "https:",
    exactBackendHost: url.hostname === origin.hostname,
    exactBackendPath: url.pathname === CODEX_TRANSPORT.backendPath,
    noEmbeddedUrlCredentials: url.username === "" && url.password === "",
    noQueryString: url.search === "",
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export function assertNoHeaderInjection(value, fieldName = "header") {
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) {
    throw Object.assign(new Error(`${fieldName}_header_rejected`), { safeCategory: `${fieldName}_header_rejected` });
  }
}

export function accountIdentifierFromCredential(payload) {
  for (const tokenField of ["id_token", "access_token"]) {
    if (typeof payload?.[tokenField] !== "string" || payload[tokenField].split(".").length !== 3) continue;
    try {
      const decoded = JSON.parse(Buffer.from(payload[tokenField].split(".")[1], "base64url").toString("utf8"));
      const fromJwt =
        decoded["https://api.openai.com/auth.chatgpt_account_id"] ??
        decoded["https://api.openai.com/auth"]?.chatgpt_account_id ??
        decoded.account_id ??
        decoded.accountId ??
        decoded.chatgpt_account_id;
      if (typeof fromJwt === "string" && fromJwt.length > 0) return fromJwt;
    } catch (_error) {
      // Fall through to explicit token response fields.
    }
  }
  for (const key of ["account_id", "accountId", "chatgpt_account_id", "https://api.openai.com/auth.chatgpt_account_id"]) {
    if (typeof payload?.[key] === "string" && payload[key].length > 0) return payload[key];
  }
  if (typeof payload?.id_token?.chatgpt_account_id === "string" && payload.id_token.chatgpt_account_id.length > 0) {
    return payload.id_token.chatgpt_account_id;
  }
  return null;
}

export function buildSyntheticCodexRequest() {
  const sessionId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const installationId = crypto.randomUUID();
  const windowId = crypto.randomUUID();
  const instructions =
    "Transport validation only. No tools, browsing, code execution, file access, account disclosure, or system prompt disclosure. Reply with exactly the requested fixed marker.";
  return {
    metadata: { sessionId, threadId, installationId, windowId },
    body: {
      model: CODEX_TRANSPORT.model,
      instructions,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Return exactly this fixed marker and nothing else: ${CODEX_TRANSPORT.marker}`,
            },
          ],
        },
      ],
      reasoning: {
        effort: "low",
        summary: "auto",
      },
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: sessionId,
      text: {
        verbosity: "low",
      },
      client_metadata: {
        "x-codex-installation-id": installationId,
        session_id: sessionId,
        thread_id: threadId,
        "x-codex-window-id": windowId,
      },
    },
  };
}

export function buildPreviousMalformedCodexRequestProjection() {
  const sessionId = "previous-session-id";
  return buildSanitizedRequestManifest({
    url: `${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`,
    method: "POST",
    headers: {
      authorization: "Bearer previous",
      "ChatGPT-Account-ID": "previous-account",
      originator: CODEX_TRANSPORT.originator,
      "User-Agent": CODEX_TRANSPORT.userAgent,
      accept: "text/event-stream",
      "content-type": "application/json",
      "OpenAI-Beta": "responses=experimental",
      "x-openai-internal-codex-responses-lite": "true",
      "session-id": "previous-session-id",
      "thread-id": "previous-thread-id",
      "x-client-request-id": "previous-thread-id",
      "x-codex-installation-id": "previous-installation-id",
      "content-length": "1",
    },
    body: {
      model: CODEX_TRANSPORT.model,
      input: [
        { type: "additional_tools", role: "developer", tools: [] },
        {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "previous developer instruction" }],
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: CODEX_TRANSPORT.marker }],
        },
      ],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: { effort: "low" },
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: sessionId,
      text: { verbosity: "low" },
      client_metadata: {
        "x-codex-installation-id": "previous-installation-id",
        session_id: "previous-session-id",
        thread_id: "previous-thread-id",
        "x-codex-window-id": "previous-window-id",
      },
    },
  });
}

export function buildBrokerOnlyHeaders({ accessToken, accountIdentifier, metadata }) {
  assertNoHeaderInjection(accessToken, "authorization");
  assertNoHeaderInjection(accountIdentifier, "account");
  assertNoHeaderInjection(CODEX_TRANSPORT.originator, "originator");
  for (const [field, value] of Object.entries(metadata ?? {})) {
    assertNoHeaderInjection(value, field);
  }
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "ChatGPT-Account-ID": accountIdentifier,
    originator: CODEX_TRANSPORT.originator,
    "User-Agent": CODEX_TRANSPORT.userAgent,
    accept: "text/event-stream",
    "content-type": "application/json",
    "OpenAI-Beta": "responses=experimental",
    "session-id": metadata.sessionId,
    "thread-id": metadata.threadId,
    "x-client-request-id": metadata.threadId,
    "x-codex-installation-id": metadata.installationId,
  };
  return {
    headers,
    safeProjection: {
      authorization_header_applied: true,
      account_header_applied: true,
      audited_originator_applied: true,
      openai_beta_header_applied: true,
      responses_lite_header_applied: false,
      session_metadata_applied: true,
      client_metadata_applied: true,
    },
  };
}

function urlHostCategory(urlLike) {
  const url = new URL(urlLike);
  if (url.hostname === "chatgpt.com") return "chatgpt.com";
  if (url.hostname.endsWith(".openai.com")) return "openai_host";
  return "other";
}

function valueType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function bodyFieldTypes(body) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, valueType(value)]).sort(([left], [right]) => left.localeCompare(right)));
}

function bodyArrayLengths(body) {
  return Object.fromEntries(
    Object.entries(body)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, value.length])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function contentPartCategories(item) {
  return Array.isArray(item?.content) ? item.content.map((part) => part?.type ?? "unknown") : [];
}

export function buildSanitizedRequestManifest({ url, method, headers, body, serializedBodyByteLength }) {
  const parsed = new URL(url);
  const headerNames = Object.keys(headers).sort((left, right) => left.localeCompare(right));
  const input = Array.isArray(body.input) ? body.input : [];
  const serializedLength =
    typeof serializedBodyByteLength === "number"
      ? serializedBodyByteLength
      : Buffer.byteLength(JSON.stringify(body), "utf8");
  return {
    url_host_category: urlHostCategory(url),
    url_path: parsed.pathname,
    http_method: method,
    header_names: headerNames,
    required_headers_present: {
      authorization: headerNames.some((name) => name.toLowerCase() === "authorization"),
      chatgpt_account_id: headerNames.some((name) => name.toLowerCase() === "chatgpt-account-id"),
      originator: headerNames.some((name) => name.toLowerCase() === "originator"),
      accept: headerNames.some((name) => name.toLowerCase() === "accept"),
      content_type: headerNames.some((name) => name.toLowerCase() === "content-type"),
      openai_beta: headerNames.some((name) => name.toLowerCase() === "openai-beta"),
      session_id: headerNames.some((name) => name.toLowerCase() === "session-id"),
      x_client_request_id: headerNames.some((name) => name.toLowerCase() === "x-client-request-id"),
    },
    content_encoding_category: headerNames.some((name) => name.toLowerCase() === "content-encoding") ? "present" : "absent",
    accept_category: String(headers.accept ?? headers.Accept ?? "").toLowerCase().startsWith("text/event-stream") ? "event_stream" : "other",
    content_type_category: String(headers["content-type"] ?? headers["Content-Type"] ?? "").toLowerCase().startsWith("application/json") ? "json" : "other",
    body_field_names: Object.keys(body).sort((left, right) => left.localeCompare(right)),
    body_value_types: bodyFieldTypes(body),
    body_array_lengths: bodyArrayLengths(body),
    model_identifier_category: body.model === CODEX_TRANSPORT.model ? "audited_codex_text_model" : "other",
    input_item_categories: input.map((item) => ({
      type: item?.type ?? "unknown",
      role: item?.role ?? "absent",
      content_part_types: contentPartCategories(item),
      tools_length: Array.isArray(item?.tools) ? item.tools.length : undefined,
    })),
    stream_boolean: body.stream === true,
    serialized_body_byte_length: serializedLength,
    harmless_marker_present: JSON.stringify(body.input ?? []).includes(CODEX_TRANSPORT.marker),
  };
}

export function buildExpectedAuditedRequestManifest() {
  const { metadata, body } = buildSyntheticCodexRequest();
  const { headers } = buildBrokerOnlyHeaders({
    accessToken: "synthetic-access",
    accountIdentifier: "synthetic-account",
    metadata,
  });
  const serialized = JSON.stringify(body);
  return buildSanitizedRequestManifest({
    url: `${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`,
    method: "POST",
    headers: { ...headers, "content-length": String(Buffer.byteLength(serialized)) },
    body,
    serializedBodyByteLength: Buffer.byteLength(serialized),
  });
}

export function diffSanitizedRequestManifests(expected, actual, requiredPaths = []) {
  const mismatches = [];
  for (const path of requiredPaths) {
    const expectedValue = path.split(".").reduce((value, key) => value?.[key], expected);
    const actualValue = path.split(".").reduce((value, key) => value?.[key], actual);
    if (JSON.stringify(expectedValue) !== JSON.stringify(actualValue)) {
      mismatches.push({
        path,
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }
  return mismatches;
}

function protocolError(safeCategory) {
  return Object.assign(new Error(safeCategory), { safeCategory });
}

function outputKey(itemId, contentIndex, fallback) {
  return `${typeof itemId === "string" ? itemId : fallback}:${Number.isInteger(contentIndex) ? contentIndex : 0}`;
}

function validateContentPartAddedEvent(event) {
  if (!Number.isInteger(event.output_index) || event.output_index < 0 || event.output_index > MAX_EVENT_INDEX) {
    throw protocolError("malformed_response");
  }
  if (!Number.isInteger(event.content_index) || event.content_index < 0 || event.content_index > MAX_EVENT_INDEX) {
    throw protocolError("malformed_response");
  }
  if (
    typeof event.item_id !== "string" ||
    event.item_id.length === 0 ||
    event.item_id.length > MAX_OPAQUE_ITEM_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(event.item_id)
  ) {
    throw protocolError("malformed_response");
  }
  if (!event.part || typeof event.part !== "object" || Array.isArray(event.part) || event.part.type !== "output_text") {
    throw protocolError("malformed_response");
  }
}

function contentPartKey(outputIndex, contentIndex, itemId) {
  return `${outputIndex}:${contentIndex}:${itemId}`;
}

function validateContentPartIdentity(event) {
  if (!Number.isInteger(event.output_index) || event.output_index < 0 || event.output_index > MAX_EVENT_INDEX) {
    throw protocolError("malformed_response");
  }
  if (!Number.isInteger(event.content_index) || event.content_index < 0 || event.content_index > MAX_EVENT_INDEX) {
    throw protocolError("malformed_response");
  }
  if (
    typeof event.item_id !== "string" ||
    event.item_id.length === 0 ||
    event.item_id.length > MAX_OPAQUE_ITEM_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(event.item_id)
  ) {
    throw protocolError("malformed_response");
  }
  return contentPartKey(event.output_index, event.content_index, event.item_id);
}

function validateContentPartDoneEvent(event, state) {
  const key = validateContentPartIdentity(event);
  if (!event.part || typeof event.part !== "object" || Array.isArray(event.part) || event.part.type !== "output_text") {
    throw protocolError("malformed_response");
  }
  const addedPart = state.contentParts.get(key);
  if (!addedPart) throw protocolError("malformed_response");
  if (state.completedContentParts.has(key)) throw protocolError("malformed_response");
  if (addedPart.partType !== event.part.type) throw protocolError("malformed_response");

  state.contentPartDoneMatchedAddedPart = true;
  state.contentPartDoneIndex = event.content_index;
  const assembled = state.assistantOutput.get(outputKey(event.item_id, event.content_index, ""));
  if (typeof event.part.text === "string" && assembled !== undefined) {
    if (event.part.text !== assembled) throw protocolError("malformed_response");
    state.contentPartDoneTextConsistent = true;
  }
  state.completedContentParts.add(key);
}

function appendOutput(state, key, text, replace = false) {
  const previous = state.assistantOutput.get(key) ?? "";
  const next = replace ? text : `${previous}${text}`;
  if (Buffer.byteLength(next, "utf8") > CODEX_TRANSPORT.normalizedOutputMaxBytes) throw protocolError("response_too_large");
  state.assistantOutput.set(key, next);
}

function eventOutput(state) {
  return [...state.assistantOutput.values()].join("");
}

function processSseEvent(event, state) {
  if (!event || typeof event !== "object" || Array.isArray(event)) throw protocolError("malformed_response");
  validateEventTypeDiscriminator(event.type);
  state.eventCount += 1;
  if (state.eventCount > CODEX_TRANSPORT.eventMaxCount) throw protocolError("response_too_large");
  if (state.unknownEvent) state.unknownEvent.unknown_event_followed_by_more_events = true;
  switch (event.type) {
    case "response.created":
    case "response.in_progress":
      if (!event.response || typeof event.response !== "object") throw protocolError("malformed_response");
      return;
    case "response.output_text.delta":
      if (typeof event.delta !== "string") throw protocolError("malformed_response");
      appendOutput(state, outputKey(event.item_id, event.content_index, `delta-${state.eventCount}`), event.delta);
      return;
    case "response.output_text.done":
      if (typeof event.text !== "string") throw protocolError("malformed_response");
      appendOutput(state, outputKey(event.item_id, event.content_index, `done-${state.eventCount}`), event.text, true);
      return;
    case "response.content_part.added":
      validateContentPartAddedEvent(event);
      state.contentParts.set(contentPartKey(event.output_index, event.content_index, event.item_id), { partType: event.part.type });
      return;
    case "response.content_part.done":
      state.contentPartDoneObserved = true;
      validateContentPartDoneEvent(event, state);
      return;
    case "response.output_item.done": {
      const item = event.item;
      if (!item || typeof item !== "object") throw protocolError("malformed_response");
      if (item.type === "reasoning" || item.type === "compaction") return;
      if (item.type !== "message" || item.role !== "assistant" || !Array.isArray(item.content)) throw protocolError("malformed_response");
      for (const [index, part] of item.content.entries()) {
        if (part?.type !== "output_text" || typeof part.text !== "string") continue;
        const key = outputKey(item.id, index, `item-${state.eventCount}`);
        if (!state.assistantOutput.has(key)) appendOutput(state, key, part.text, true);
      }
      return;
    }
    case "response.completed":
      if (typeof event.response?.id !== "string") throw protocolError("malformed_response");
      state.completed = true;
      state.terminalObserved = true;
      return;
    case "response.failed":
    case "response.incomplete":
      state.failure = "stream_failed";
      return;
    case "error":
      state.failure = "stream_error_event";
      return;
    case "response.metadata":
    case "response.output_item.added":
    case "response.reasoning_summary_part.added":
    case "response.reasoning_summary_text.delta":
    case "response.reasoning_summary_text.done":
    case "response.reasoning_text.delta":
    case "response.custom_tool_call_input.delta":
      return;
    default:
      state.unknownEvent ??= projectUnknownEvent(event, state);
      state.failure = "mandatory_unknown_event";
  }
}

export class BoundedSseParser {
  constructor() {
    this.decoder = new TextDecoder("utf-8", { fatal: true });
    this.lineRemainder = "";
    this.dataLines = [];
    this.dataBytes = 0;
    this.state = {
      eventCount: 0,
      completed: false,
      failure: null,
      assistantOutput: new Map(),
      contentParts: new Map(),
      completedContentParts: new Set(),
      contentPartDoneObserved: false,
      contentPartDoneMatchedAddedPart: false,
      contentPartDoneTextConsistent: false,
      contentPartDoneIndex: null,
      knownEventTypesBeforeFailure: [],
      terminalObserved: false,
      unknownEvent: null,
    };
  }

  processLine(line) {
    if (line === "") {
      if (this.dataLines.length === 0) return;
      const data = this.dataLines.join("\n");
      this.dataLines = [];
      this.dataBytes = 0;
      if (data === "[DONE]") {
        this.state.doneSentinel = true;
        return;
      }
      let event;
      try {
        event = JSON.parse(data);
      } catch (_error) {
        throw protocolError("malformed_response");
      }
      try {
        processSseEvent(event, this.state);
      } catch (error) {
        if (!error.diagnostics) error.diagnostics = parserDiagnostics(this.state);
        throw error;
      }
      if (!this.state.unknownEvent && this.state.failure === null) this.state.knownEventTypesBeforeFailure.push(event.type);
      return;
    }
    if (line.startsWith(":")) return;
    if (line === "data" || line.startsWith("data:")) {
      const value = line === "data" ? "" : line.slice(5).replace(/^ /, "");
      this.dataBytes += Buffer.byteLength(value, "utf8");
      if (this.dataBytes > CODEX_TRANSPORT.responseMaxBytes) throw protocolError("response_too_large");
      this.dataLines.push(value);
    }
  }

  consume(bytes) {
    let text;
    try {
      text = this.decoder.decode(bytes, { stream: true });
    } catch (_error) {
      throw protocolError("malformed_response");
    }
    this.consumeText(text);
  }

  consumeText(text) {
    this.lineRemainder += text;
    let cursor = 0;
    while (cursor < this.lineRemainder.length) {
      const lf = this.lineRemainder.indexOf("\n", cursor);
      if (lf === -1) break;
      const line = this.lineRemainder.slice(cursor, lf).replace(/\r$/, "");
      this.processLine(line);
      cursor = lf + 1;
    }
    this.lineRemainder = this.lineRemainder.slice(cursor);
  }

  finish() {
    try {
      this.consumeText(this.decoder.decode());
    } catch (_error) {
      throw protocolError("malformed_response");
    }
    if (this.lineRemainder !== "" || this.dataLines.length > 0) throw protocolError("truncated_response_stream");
    if (this.state.failure) throw Object.assign(protocolError(this.state.failure), { diagnostics: parserDiagnostics(this.state) });
    return {
      response_protocol_valid: this.state.completed && this.state.eventCount > 0,
      response_event_count: this.state.eventCount,
      normalizedOutput: eventOutput(this.state),
      ...parserDiagnostics(this.state),
    };
  }
}

export function parseSseFrames(buffer, state = undefined) {
  const parser = new BoundedSseParser();
  parser.consume(Buffer.from(buffer, "utf8"));
  const result = parser.finish();
  if (state) Object.assign(state, { eventCount: result.response_event_count, completed: result.response_protocol_valid, normalizedOutput: result.normalizedOutput });
  return "";
}

export function parseNonStreamingJson(buffer) {
  if (buffer.length > CODEX_TRANSPORT.responseMaxBytes) throw protocolError("response_too_large");
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch (_error) {
    throw protocolError("malformed_response");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.id !== "string" || parsed.status !== "completed" || !Array.isArray(parsed.output)) {
    throw protocolError("unsupported_response_protocol");
  }
  const state = { assistantOutput: new Map() };
  for (const item of parsed.output) {
    if (item?.type !== "message" || item.role !== "assistant" || !Array.isArray(item.content)) continue;
    for (const [index, part] of item.content.entries()) {
      if (part?.type === "output_text" && typeof part.text === "string") appendOutput(state, outputKey(item.id, index, "json-item"), part.text, true);
    }
  }
  return { response_protocol_valid: true, response_event_count: 1, normalizedOutput: eventOutput(state) };
}

export async function invokeCodexSynthetic({ accessToken, accountIdentifier, requestImpl = https.request, signal }) {
  const validation = validateCodexTransportUrl();
  if (!validation.ok) {
    return { ok: false, safe_error_category: "upstream_protocol_changed", safe_http_status_category: "not_attempted" };
  }

  const requestPayload = buildSyntheticCodexRequest();
  const { headers, safeProjection } = buildBrokerOnlyHeaders({ accessToken, accountIdentifier, metadata: requestPayload.metadata });
  const body = JSON.stringify(requestPayload.body);
  const endpoint = new URL(`${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`);
  headers["content-length"] = Buffer.byteLength(body);
  const actual_request_manifest = buildSanitizedRequestManifest({
    url: endpoint.toString(),
    method: "POST",
    headers,
    body: requestPayload.body,
    serializedBodyByteLength: Buffer.byteLength(body),
  });

  return await new Promise((resolve) => {
    let settled = false;
    let totalBytes = 0;
    let responseBody = Buffer.alloc(0);
    let parser;
    let protocol;
    let diagnostics;
    let idleTimer;

    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      resolve(value);
    };

    const resetIdleTimer = (request) => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => request.destroy(Object.assign(new Error("transport_timeout"), { safeCategory: "transport_timeout" })), CODEX_TRANSPORT.idleTimeoutMs);
    };

    const request = requestImpl(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: 443,
        path: endpoint.pathname,
        method: "POST",
        timeout: CODEX_TRANSPORT.requestTimeoutMs,
        headers,
      },
      (response) => {
        diagnostics = safeResponseDiagnostics(response);
        if (response.statusCode >= 300 && response.statusCode < 400) {
          response.resume?.();
          settle({
            ok: false,
            safe_error_category: "unexpected_redirect",
            ...diagnostics,
            actual_request_manifest,
            ...safeProjection,
          });
          return;
        }

        const contentType = String(headerValue(response.headers, "content-type") ?? "").toLowerCase();
        const isSse = contentType.startsWith("text/event-stream");
        const isJson = contentType.startsWith("application/json");
        const encoding = diagnostics.response_content_encoding_category;
        if (encoding === "unsupported") {
          response.resume?.();
          settle({ ok: false, invocation_attempted: true, invocation_succeeded: false, safe_error_category: "unsupported_content_encoding", ...diagnostics, actual_request_manifest, ...safeProjection });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          if (isJson || contentType === "") {
            resetIdleTimer(request);
            response.on("data", (chunk) => {
              resetIdleTimer(request);
              totalBytes += chunk.length;
              diagnostics.response_body_present = diagnostics.response_body_present || chunk.length > 0;
              diagnostics.response_body_presence = diagnostics.response_body_present ? "present" : "absent";
              if (chunk.length > 0 && diagnostics.first_non_empty_body_chunk_length_category === "none") {
                diagnostics.first_non_empty_body_chunk_length_category = chunkLengthCategory(chunk.length);
                diagnostics.first_non_empty_body_bytes_category = firstBytesCategory(chunk);
              }
              if (totalBytes > CODEX_TRANSPORT.responseMaxBytes) {
                request.destroy(Object.assign(new Error("response_too_large"), { safeCategory: "response_too_large" }));
                return;
              }
              responseBody = Buffer.concat([responseBody, chunk]);
            });
            response.on("end", () => {
              clearTimeout(idleTimer);
              settle({
                ok: false,
                invocation_attempted: true,
                invocation_succeeded: false,
                safe_error_category: classifyStatus(response.statusCode, responseBody.toString("utf8")),
                ...diagnostics,
                response_event_count: 0,
                actual_request_manifest,
                ...safeProjection,
              });
            });
            return;
          }
          response.resume?.();
          settle({
            ok: false,
            invocation_attempted: true,
            invocation_succeeded: false,
            safe_error_category: classifyStatus(response.statusCode),
            ...diagnostics,
            response_event_count: 0,
            actual_request_manifest,
            ...safeProjection,
          });
          return;
        }
        protocol = isSse ? "sse" : isJson ? "json" : null;

        resetIdleTimer(request);
        response.on("data", (chunk) => {
          resetIdleTimer(request);
          totalBytes += chunk.length;
          diagnostics.response_body_present = diagnostics.response_body_present || chunk.length > 0;
          diagnostics.response_body_presence = diagnostics.response_body_present ? "present" : "absent";
          if (chunk.length > 0 && diagnostics.first_non_empty_body_chunk_length_category === "none") {
            diagnostics.first_non_empty_body_chunk_length_category = chunkLengthCategory(chunk.length);
            diagnostics.first_non_empty_body_bytes_category = firstBytesCategory(chunk);
            if (!protocol) protocol = diagnostics.first_non_empty_body_bytes_category === "sse_data" ? "sse" : diagnostics.first_non_empty_body_bytes_category === "json_object" ? "json" : "unsupported";
            diagnostics.response_body_framing_category = protocol === "sse" ? "sse" : protocol === "json" ? "json" : "unknown";
            if (protocol === "sse") parser = new BoundedSseParser();
          }
          if (totalBytes > CODEX_TRANSPORT.responseMaxBytes) {
            request.destroy(Object.assign(new Error("response_too_large"), { safeCategory: "response_too_large" }));
            return;
          }
          if (encoding !== "absent" && encoding !== "identity") {
            responseBody = Buffer.concat([responseBody, chunk]);
            return;
          }
          if (protocol === "json") {
            responseBody = Buffer.concat([responseBody, chunk]);
            return;
          }
          if (protocol !== "sse") return;
          try {
            parser.consume(chunk);
          } catch (error) {
            request.destroy(error);
          }
        });

        response.on("end", async () => {
          clearTimeout(idleTimer);
          try {
            if (encoding !== "absent" && encoding !== "identity") {
              responseBody = await ({ gzip: gunzip, deflate: inflate, br: brotliDecompress }[encoding])(responseBody);
              if (responseBody.length > CODEX_TRANSPORT.responseMaxBytes) throw protocolError("response_too_large");
              protocol = isSse ? "sse" : isJson ? "json" : firstBytesCategory(responseBody) === "sse_data" ? "sse" : firstBytesCategory(responseBody) === "json_object" ? "json" : "unsupported";
              diagnostics.response_body_framing_category = protocol === "sse" ? "sse" : protocol === "json" ? "json" : "unknown";
              if (protocol === "sse") {
                parser = new BoundedSseParser();
                parser.consume(responseBody);
              }
            }
            if (!diagnostics.response_body_present) throw protocolError("empty_response_body");
            if (protocol === "unsupported" || !protocol) throw protocolError("unsupported_response_protocol");
            const parsed = protocol === "json" ? parseNonStreamingJson(responseBody) : parser.finish();
            const normalized = parsed.normalizedOutput.trim();
            const markerOccurrences = normalized.split(CODEX_TRANSPORT.marker).length - 1;
            const markerPresent = markerOccurrences === 1;
            settle({
              ok: parsed.response_protocol_valid && markerPresent,
              invocation_attempted: true,
              invocation_succeeded: parsed.response_protocol_valid && markerPresent,
              response_protocol_valid: parsed.response_protocol_valid,
              expected_synthetic_marker_present: markerPresent,
              response_event_count: parsed.response_event_count,
              response_length_category:
                normalized.length <= CODEX_TRANSPORT.marker.length ? "fixed_marker_only" : normalized.length < 512 ? "small" : "bounded",
              normalized_response_sha256: crypto.createHash("sha256").update(normalized).digest("hex"),
              ...diagnostics,
              safe_error_category: parsed.response_protocol_valid ? null : "unsupported_response_protocol",
              actual_request_manifest,
              ...safeProjection,
            });
          } catch (error) {
            settle({
              ok: false,
              invocation_attempted: true,
              invocation_succeeded: false,
              response_protocol_valid: false,
              expected_synthetic_marker_present: false,
              safe_error_category: safeFailure(error.safeCategory),
              ...diagnostics,
              ...(error.diagnostics ?? (parser ? parserDiagnostics(parser.state) : {})),
              response_event_count: parser?.state.eventCount ?? 0,
              actual_request_manifest,
              ...safeProjection,
            });
          }
        });
      },
    );

    request.on("timeout", () => request.destroy(Object.assign(new Error("transport_timeout"), { safeCategory: "transport_timeout" })));
    request.on("error", (error) => {
      const category =
        error.safeCategory ??
        (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN" ? "DNS_failure" : undefined) ??
        (String(error.code ?? "").startsWith("ERR_TLS") ? "TLS_failure" : undefined) ??
        (error.code === "ETIMEDOUT" ? "transport_timeout" : undefined) ??
        "safe_unknown_failure";
      settle({
        ok: false,
        invocation_attempted: true,
        invocation_succeeded: false,
        response_protocol_valid: false,
        expected_synthetic_marker_present: false,
        safe_error_category: safeFailure(category),
        safe_http_status_category: "transport_error",
        response_event_count: parser?.state.eventCount ?? 0,
        ...(diagnostics ?? {}),
        actual_request_manifest,
        ...safeProjection,
      });
    });
    if (signal?.aborted) request.destroy(protocolError("stream_cancelled"));
    else if (signal) signal.addEventListener("abort", () => request.destroy(protocolError("stream_cancelled")), { once: true });
    request.end(body);
  });
}
