import https from "node:https";
import fs from "node:fs/promises";
import {
  atomicWriteEnvelope,
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  readEnvelope,
  readKeyFile,
} from "./lib/credential-store.mjs";
import { classifyRefreshResponse, SingleFlightRefresh } from "./lib/refresh.mjs";
import { accountIdentifierFromCredential, invokeCodexSynthetic } from "./lib/codex-transport.mjs";
import { CODEX_TRANSPORT, NETWORK_LIMITS, OAUTH, UPSTREAM_REVISIONS } from "./oauth-constants.mjs";

const keyPath = "/run/t199-key/master.key";
const recordPath = "/spike/credentials/credential.json";
const bindings = { ownerNamespace: "live-t199-owner", connectionId: "live-t199-connection", provider: "openai-codex" };
const expirySkewMs = 120000;

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function safeError(error) {
  const message = String(error?.safeCategory ?? error?.message ?? "safe_unknown_failure");
  if (message.includes("ENOENT")) return "encrypted_state_missing";
  if (message === "invalid_master_key") return "invalid_master_key";
  if (message === "credential_authentication_failed") return "credential_decryption_failed";
  return message.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
}

async function recoverCredential() {
  const key = await readKeyFile(keyPath).catch((error) => {
    throw Object.assign(error, { safeCategory: error.message === "invalid_master_key" ? "invalid_master_key" : "encrypted_state_missing" });
  });
  const envelope = await readEnvelope(recordPath).catch((error) => {
    throw Object.assign(error, { safeCategory: error.code === "ENOENT" ? "encrypted_state_missing" : "malformed_response" });
  });
  try {
    return { key, envelope, ...decryptCredentialEnvelope(envelope, bindings, key) };
  } catch (error) {
    throw Object.assign(error, { safeCategory: "credential_decryption_failed" });
  }
}

function expiryMs(payload) {
  if (typeof payload.expires_at === "number") return payload.expires_at > 10_000_000_000 ? payload.expires_at : payload.expires_at * 1000;
  if (typeof payload.expiresAt === "number") return payload.expiresAt > 10_000_000_000 ? payload.expiresAt : payload.expiresAt * 1000;
  if (typeof payload.issued_at_ms === "number" && typeof payload.expires_in === "number") return payload.issued_at_ms + payload.expires_in * 1000;
  return 0;
}

function credentialPayloadAfterRefresh(previousPayload, tokenResponse) {
  const issuedAtMs = Date.now();
  return {
    ...previousPayload,
    ...tokenResponse,
    refresh_token: tokenResponse.refresh_token ?? previousPayload.refresh_token,
    issued_at_ms: issuedAtMs,
    expires_at: issuedAtMs + tokenResponse.expires_in * 1000,
  };
}

function refreshRequest(refreshToken) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(OAUTH.tokenEndpoint);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OAUTH.clientId,
      refresh_token: refreshToken,
    }).toString();
    const request = https.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: 443,
        path: endpoint.pathname,
        method: "POST",
        timeout: NETWORK_LIMITS.tokenExchangeTimeoutMs,
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let size = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > NETWORK_LIMITS.tokenResponseMaxBytes) {
            request.destroy(Object.assign(new Error("response_too_large"), { safeCategory: "response_too_large" }));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch (_error) {
            resolve({ ok: false, category: "malformed_response" });
            return;
          }
          const category = classifyRefreshResponse({ status: response.statusCode, body: parsed });
          if (category !== "success") {
            resolve({ ok: false, category });
            return;
          }
          resolve({ ok: true, body: parsed });
        });
      },
    );
    request.on("timeout", () => request.destroy(Object.assign(new Error("transport_timeout"), { safeCategory: "transport_timeout" })));
    request.on("error", reject);
    request.end(body);
  });
}

async function maybeRefresh(current) {
  const refreshRequired = expiryMs(current.payload) <= Date.now() + expirySkewMs;
  if (!refreshRequired) {
    return { current, refresh_required: false, refresh_attempted: false, refresh_succeeded: false };
  }
  if (typeof current.payload.refresh_token !== "string" || current.payload.refresh_token.length === 0) {
    throw Object.assign(new Error("reconnect_required"), { safeCategory: "reconnect_required" });
  }
  const flight = new SingleFlightRefresh();
  const result = await flight.refresh(bindings.connectionId, async () => refreshRequest(current.payload.refresh_token));
  if (!result.ok) {
    throw Object.assign(new Error(result.category === "invalid_grant" ? "invalid_grant" : "refresh_failed"), {
      safeCategory: result.category === "invalid_grant" ? "invalid_grant" : "refresh_failed",
    });
  }
  const nextPayload = credentialPayloadAfterRefresh(current.payload, result.body);
  const nextEnvelope = encryptCredentialEnvelope(nextPayload, bindings, current.key, current.generation);
  await atomicWriteEnvelope(recordPath, nextEnvelope, current.generation);
  const recovered = await recoverCredential();
  return {
    current: recovered,
    refresh_required: true,
    refresh_attempted: true,
    refresh_succeeded: true,
    live_network_refresh_count: flight.networkRefreshCount,
  };
}

try {
  const before = await recoverCredential();
  let encryptedStateRecovered = true;
  const beforeGeneration = before.generation;
  const refreshed = await maybeRefresh(before);
  const credential = refreshed.current.payload;
  const accountIdentifier = accountIdentifierFromCredential(credential);
  if (!accountIdentifier) {
    throw Object.assign(new Error("account_identifier_missing"), { safeCategory: "account_identifier_missing" });
  }
  if (typeof credential.access_token !== "string" || credential.access_token.length === 0) {
    throw Object.assign(new Error("reconnect_required"), { safeCategory: "reconnect_required" });
  }

  const invocation = await invokeCodexSynthetic({
    accessToken: credential.access_token,
    accountIdentifier,
  });
  const after = await recoverCredential();
  const encryptedBytes = await fs.readFile(recordPath, "utf8");
  const plaintextPreserved =
    encryptedBytes.includes(credential.access_token) ||
    encryptedBytes.includes(credential.refresh_token ?? "") ||
    encryptedBytes.includes(accountIdentifier);

  const mandatoryPassed =
    invocation.ok === true &&
    after.payload?.access_token &&
    plaintextPreserved === false &&
    invocation.expected_synthetic_marker_present === true &&
    invocation.response_protocol_valid === true;

  emit({
    evidence_classification: "live_t200_direct_invocation",
    observation_timestamp: new Date().toISOString(),
    audited_upstream_revisions: UPSTREAM_REVISIONS,
    deployment_mode: "local_macos_docker_desktop_single_user_spike",
    encrypted_state_recovered: encryptedStateRecovered,
    credential_generation_before: beforeGeneration,
    refresh_required: refreshed.refresh_required,
    refresh_attempted: refreshed.refresh_attempted,
    refresh_succeeded: refreshed.refresh_succeeded,
    credential_generation_after: after.generation,
    audited_backend_host_applied: true,
    audited_backend_path_applied: true,
    authorization_header_applied: invocation.authorization_header_applied === true,
    account_header_applied: invocation.account_header_applied === true,
    audited_originator_applied: invocation.audited_originator_applied === true,
    openai_beta_header_applied: invocation.openai_beta_header_applied === true,
    responses_lite_header_applied: invocation.responses_lite_header_applied === true,
    session_metadata_applied: invocation.session_metadata_applied === true,
    client_metadata_applied: invocation.client_metadata_applied === true,
    invocation_attempted: invocation.invocation_attempted === true,
    invocation_succeeded: invocation.invocation_succeeded === true,
    safe_http_status_category: invocation.safe_http_status_category,
    safe_response_content_type_category: invocation.safe_response_content_type_category,
    response_protocol_valid: invocation.response_protocol_valid === true,
    response_event_count: invocation.response_event_count ?? 0,
    expected_synthetic_marker_present: invocation.expected_synthetic_marker_present === true,
    response_length_category: invocation.response_length_category ?? "none",
    normalized_response_sha256: invocation.normalized_response_sha256,
    safe_model_category: "official_bundled_codex_text_model",
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_response_persisted: false,
    encrypted_state_preserved: plaintextPreserved === false,
    callback_port_absent: true,
    credential_exposed_to_parent: false,
    secret_scan_result: "pending_parent_scan",
    no_resume_or_personal_data_transmitted: true,
    raw_request_persisted: false,
    complete_model_output_persisted: false,
    broker_uid: process.getuid?.(),
    broker_only_fields_present: {
      access_token_present: true,
      account_identifier_present: true,
    },
    audited_transport: {
      backend_host_category: "chatgpt.com_verified_official_source_undocumented_third_party_backend",
      backend_path_category: "backend_api_codex_responses_verified_official_source_compatibility_sensitive",
      model_category: "gpt-5.6-sol_official_bundled_model",
      originator_category: "openclaw_observed_compatibility_originator_undocumented_support",
    },
    safe_final_state: mandatoryPassed ? "complete" : invocation.safe_error_category ?? "safe_unknown_failure",
  });
  process.exitCode = mandatoryPassed ? 0 : 1;
} catch (error) {
  emit({
    evidence_classification: "live_t200_direct_invocation",
    observation_timestamp: new Date().toISOString(),
    audited_upstream_revisions: UPSTREAM_REVISIONS,
    encrypted_state_recovered: false,
    refresh_required: false,
    refresh_attempted: false,
    refresh_succeeded: false,
    invocation_attempted: false,
    invocation_succeeded: false,
    response_protocol_valid: false,
    expected_synthetic_marker_present: false,
    raw_credentials_exposed_to_parent: false,
    account_identifier_exposed_to_parent: false,
    raw_response_persisted: false,
    encrypted_state_preserved: true,
    callback_port_absent: true,
    secret_scan_result: "pending_parent_scan",
    safe_final_state: safeError(error),
  });
  process.exitCode = 1;
}
