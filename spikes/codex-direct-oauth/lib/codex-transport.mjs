import crypto from "node:crypto";
import https from "node:https";
import { CODEX_TRANSPORT } from "../oauth-constants.mjs";

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
  "unsupported_request_shape",
  "unsupported_response_protocol",
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
  return SAFE_FAILURES.has(value) ? value : "safe_unknown_failure";
}

function statusCategory(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode === 401) return "401";
  if (statusCode === 403) return "403";
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

function classifyStatus(statusCode, bodyText = "") {
  const lower = bodyText.toLowerCase();
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return lower.includes("account") ? "account_header_rejected" : "forbidden";
  if (statusCode === 429) return "quota_or_rate_limit";
  if (statusCode >= 500) return "upstream_server_error";
  if (statusCode >= 400 && lower.includes("model")) return "model_unavailable";
  if (statusCode >= 400) return "unsupported_request_shape";
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
  return {
    metadata: { sessionId, threadId, installationId, windowId },
    body: {
      model: CODEX_TRANSPORT.model,
      input: [
        {
          type: "additional_tools",
          role: "developer",
          tools: [],
        },
        {
          type: "message",
          role: "developer",
          content: [
            {
              type: "input_text",
              text:
                "Transport validation only. No tools, browsing, code execution, file access, account disclosure, or system prompt disclosure. Reply with exactly the requested fixed marker.",
            },
          ],
        },
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
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: {
        effort: "low",
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
    "x-openai-internal-codex-responses-lite": "true",
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
      responses_lite_header_applied: true,
      session_metadata_applied: true,
      client_metadata_applied: true,
    },
  };
}

function appendBoundedText(current, addition) {
  const next = `${current}${addition}`;
  if (Buffer.byteLength(next, "utf8") > CODEX_TRANSPORT.normalizedOutputMaxBytes) {
    throw Object.assign(new Error("response_too_large"), { safeCategory: "response_too_large" });
  }
  return next;
}

export function parseSseFrames(buffer, state) {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  for (const part of parts) {
    const dataLines = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    if (data === "[DONE]") {
      state.completed = true;
      continue;
    }
    let event;
    try {
      event = JSON.parse(data);
    } catch (_error) {
      throw Object.assign(new Error("malformed_response"), { safeCategory: "malformed_response" });
    }
    state.eventCount += 1;
    if (state.eventCount > CODEX_TRANSPORT.eventMaxCount) {
      throw Object.assign(new Error("response_too_large"), { safeCategory: "response_too_large" });
    }
    if (event.type === "response.completed") state.completed = true;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      state.normalizedOutput = appendBoundedText(state.normalizedOutput, event.delta);
    }
    const content = event.item?.content;
    if (event.type === "response.output_item.done" && Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === "output_text" && typeof part.text === "string") {
          state.normalizedOutput = appendBoundedText(state.normalizedOutput, part.text);
        }
      }
    }
  }
  return remainder;
}

export function parseNonStreamingJson(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch (_error) {
    throw Object.assign(new Error("malformed_response"), { safeCategory: "malformed_response" });
  }
  let text = "";
  for (const item of parsed.output ?? []) {
    for (const part of item.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") text = appendBoundedText(text, part.text);
    }
  }
  return {
    response_protocol_valid: typeof parsed.id === "string" || Array.isArray(parsed.output),
    response_event_count: 1,
    normalizedOutput: text,
  };
}

export async function invokeCodexSynthetic({ accessToken, accountIdentifier, requestImpl = https.request }) {
  const validation = validateCodexTransportUrl();
  if (!validation.ok) {
    return { ok: false, safe_error_category: "upstream_protocol_changed", safe_http_status_category: "not_attempted" };
  }

  const requestPayload = buildSyntheticCodexRequest();
  const { headers, safeProjection } = buildBrokerOnlyHeaders({ accessToken, accountIdentifier, metadata: requestPayload.metadata });
  const body = JSON.stringify(requestPayload.body);
  const endpoint = new URL(`${CODEX_TRANSPORT.backendOrigin}${CODEX_TRANSPORT.backendPath}`);
  headers["content-length"] = Buffer.byteLength(body);

  return await new Promise((resolve) => {
    let settled = false;
    let totalBytes = 0;
    let responseBody = Buffer.alloc(0);
    let sseRemainder = "";
    let idleTimer;
    const state = { eventCount: 0, completed: false, normalizedOutput: "" };

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
        if (response.statusCode >= 300 && response.statusCode < 400) {
          response.resume?.();
          settle({ ok: false, safe_error_category: "unexpected_redirect", safe_http_status_category: statusCategory(response.statusCode), ...safeProjection });
          return;
        }

        const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        const safe_response_content_type_category = contentTypeCategory(contentType);
        const isSse = contentType.startsWith("text/event-stream");
        const isJson = contentType.startsWith("application/json");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          if (isJson) {
            resetIdleTimer(request);
            response.on("data", (chunk) => {
              resetIdleTimer(request);
              totalBytes += chunk.length;
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
                safe_http_status_category: statusCategory(response.statusCode),
                safe_response_content_type_category,
                response_event_count: state.eventCount,
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
            safe_http_status_category: statusCategory(response.statusCode),
            safe_response_content_type_category,
            response_event_count: state.eventCount,
            ...safeProjection,
          });
          return;
        }
        if (!isSse && !isJson) {
          response.resume?.();
          settle({
            ok: false,
            invocation_attempted: true,
            invocation_succeeded: false,
            safe_error_category: "unsupported_response_protocol",
            safe_http_status_category: statusCategory(response.statusCode),
            safe_response_content_type_category,
            ...safeProjection,
          });
          return;
        }

        resetIdleTimer(request);
        response.on("data", (chunk) => {
          resetIdleTimer(request);
          totalBytes += chunk.length;
          if (totalBytes > CODEX_TRANSPORT.responseMaxBytes) {
            request.destroy(Object.assign(new Error("response_too_large"), { safeCategory: "response_too_large" }));
            return;
          }
          if (isJson) {
            responseBody = Buffer.concat([responseBody, chunk]);
            return;
          }
          try {
            sseRemainder = parseSseFrames(`${sseRemainder}${chunk.toString("utf8")}`, state);
          } catch (error) {
            request.destroy(error);
          }
        });

        response.on("end", () => {
          clearTimeout(idleTimer);
          try {
            const parsed = isJson
              ? parseNonStreamingJson(responseBody)
              : {
                  response_protocol_valid: state.completed && state.eventCount > 0,
                  response_event_count: state.eventCount,
                  normalizedOutput: state.normalizedOutput,
                };
            const normalized = parsed.normalizedOutput.trim();
            settle({
              ok: parsed.response_protocol_valid && normalized.includes(CODEX_TRANSPORT.marker),
              invocation_attempted: true,
              invocation_succeeded: parsed.response_protocol_valid && normalized.includes(CODEX_TRANSPORT.marker),
              response_protocol_valid: parsed.response_protocol_valid,
              expected_synthetic_marker_present: normalized.includes(CODEX_TRANSPORT.marker),
              response_event_count: parsed.response_event_count,
              response_length_category:
                normalized.length <= CODEX_TRANSPORT.marker.length ? "fixed_marker_only" : normalized.length < 512 ? "small" : "bounded",
              normalized_response_sha256: crypto.createHash("sha256").update(normalized).digest("hex"),
              safe_http_status_category: statusCategory(response.statusCode),
              safe_response_content_type_category,
              safe_error_category: parsed.response_protocol_valid ? null : "unsupported_response_protocol",
              ...safeProjection,
            });
          } catch (error) {
            settle({
              ok: false,
              invocation_attempted: true,
              invocation_succeeded: false,
              safe_error_category: safeFailure(error.safeCategory),
              safe_http_status_category: statusCategory(response.statusCode),
              safe_response_content_type_category,
              response_event_count: state.eventCount,
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
        safe_error_category: safeFailure(category),
        safe_http_status_category: "transport_error",
        response_event_count: state.eventCount,
        ...safeProjection,
      });
    });
    request.end(body);
  });
}
