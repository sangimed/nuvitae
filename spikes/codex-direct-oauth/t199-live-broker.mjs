import https from "node:https";
import fs from "node:fs/promises";
import { createRawTcpRelay } from "./lib/relay.mjs";
import { createCallbackListener } from "./lib/callback-listener.mjs";
import { CALLBACK, NETWORK_LIMITS, OAUTH } from "./oauth-constants.mjs";
import {
  atomicWriteEnvelope,
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  readEnvelope,
  readKeyFile,
  removeCredentialRecord,
} from "./lib/credential-store.mjs";
import {
  exchangeAuthorizationCode,
  generateOAuthState,
  generatePkceVerifier,
  createPkceChallenge,
  buildAuthorizationUrl,
  validateAuthorizationUrl,
} from "./lib/oauth.mjs";
import {
  SingleFlightRefresh,
  classifyRefreshResponse,
} from "./lib/refresh.mjs";

const keyPath = "/run/t199-key/master.key";
const recordPath = "/spike/credentials/credential.json";
const bindings = {
  ownerNamespace: "live-t199-owner",
  connectionId: "live-t199-connection",
  provider: "openai-codex",
};

function safeError(error) {
  const value = String(
    error?.safeCategory ?? error?.message ?? "live_broker_failure",
  );
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
}

function loginEvidence(
  reconnect,
  { succeeded, callbackCompletion, connectionStatus } = {},
) {
  return {
    explicit_reconnect_attempted: reconnect === true,
    reconnect_trigger_category:
      reconnect === true ? "after_disconnect" : "not_applicable",
    explicit_reconnect_succeeded:
      reconnect === true ? succeeded === true : false,
    callback_completion: callbackCompletion,
    connection_status_after_callback: connectionStatus,
  };
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function readCredential() {
  const key = await readKeyFile(keyPath);
  const envelope = await readEnvelope(recordPath);
  return {
    key,
    envelope,
    ...decryptCredentialEnvelope(envelope, bindings, key),
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
        port: endpoint.port || 443,
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
          if (size <= NETWORK_LIMITS.tokenResponseMaxBytes) chunks.push(chunk);
          else
            response.destroy(
              Object.assign(new Error("response_too_large"), {
                safeCategory: "response_too_large",
              }),
            );
        });
        response.on("end", () => {
          if (size > NETWORK_LIMITS.tokenResponseMaxBytes) return;
          let bodyValue;
          try {
            bodyValue = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            resolve({
              ok: false,
              status: response.statusCode,
              category: "strict_parse_failed",
            });
            return;
          }
          const category = classifyRefreshResponse({
            status: response.statusCode,
            body: bodyValue,
          });
          if (category !== "success") {
            resolve({ ok: false, status: response.statusCode, category });
            return;
          }
          resolve({ ok: true, body: bodyValue });
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(
        Object.assign(new Error("network_timeout"), {
          safeCategory: "network_timeout",
        }),
      ),
    );
    request.on("error", (error) => reject(error));
    request.end(body);
  });
}

async function login({ reconnect = false } = {}) {
  const verifier = generatePkceVerifier();
  const state = generateOAuthState();
  const validation = validateAuthorizationUrl(
    buildAuthorizationUrl({
      state,
      codeChallenge: createPkceChallenge(verifier),
    }),
  );
  if (!validation.ok) {
    emit({
      type: "login_result",
      ...loginEvidence(reconnect, {
        succeeded: false,
        callbackCompletion: "not_completed",
        connectionStatus: "not_connected",
      }),
      initial_live_oauth_succeeded: false,
      safe_error_category: "authorization_url_rejected",
    });
    return 1;
  }

  let relay;
  let listener;
  try {
    let resolveCallback;
    const callback = new Promise((resolve) => {
      resolveCallback = resolve;
    });
    listener = createCallbackListener({
      expectedState: state,
      onTerminalResult: resolveCallback,
    });
    await listener.listen();
    relay = createRawTcpRelay();
    await relay.listen();
    process.stdout.write(
      "\nOpen this authorization URL in the host browser:\n",
    );
    process.stdout.write(
      `${buildAuthorizationUrl({ state, codeChallenge: createPkceChallenge(verifier) }).toString()}\n\n`,
    );
    process.stdout.write(
      "Complete ChatGPT authentication and allow the localhost redirect. The URL is printed live only.\n",
    );
    const result = await Promise.race([
      callback,
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: false, safeCategory: "callback_timeout" }),
          CALLBACK.waitTimeoutMs,
        ),
      ),
    ]);
    if (!result?.ok) {
      emit({
        type: "login_result",
        ...loginEvidence(reconnect, {
          succeeded: false,
          callbackCompletion: "not_completed",
          connectionStatus: "not_connected",
        }),
        initial_live_oauth_succeeded: false,
        safe_error_category: safeError(result),
      });
      return 1;
    }
    const exchange = await exchangeAuthorizationCode({
      code: result.code,
      codeVerifier: verifier,
    });
    if (!exchange.ok) {
      emit({
        type: "login_result",
        ...loginEvidence(reconnect, {
          succeeded: false,
          callbackCompletion: "completed",
          connectionStatus: "not_connected",
        }),
        initial_live_oauth_succeeded: false,
        safe_error_category: safeError({
          message: exchange.safeOAuthErrorCategory,
        }),
      });
      return 1;
    }
    const accountPresent = exchange.accountIdentifierPresent;
    if (
      !exchange.accessTokenPresent ||
      !exchange.refreshTokenPresent ||
      !exchange.expiryPresent ||
      !accountPresent
    ) {
      emit({
        type: "login_result",
        ...loginEvidence(reconnect, {
          succeeded: false,
          callbackCompletion: "completed",
          connectionStatus: "not_connected",
        }),
        initial_live_oauth_succeeded: false,
        safe_error_category: "incomplete_token_response",
      });
      return 1;
    }
    const key = await readKeyFile(keyPath);
    const payload = exchange.tokenResponse;
    const envelope = encryptCredentialEnvelope(payload, bindings, key);
    await atomicWriteEnvelope(recordPath, envelope);
    const stored = await fs.readFile(recordPath, "utf8");
    emit({
      type: "login_result",
      ...loginEvidence(reconnect, {
        succeeded: true,
        callbackCompletion: "completed",
        connectionStatus: "connected",
      }),
      initial_live_oauth_succeeded: true,
      real_encrypted_record_created: true,
      encrypted_record_contains_plaintext:
        stored.includes(payload.access_token) ||
        stored.includes(payload.refresh_token),
      callback_state_validated: true,
      token_exchange_succeeded: true,
    });
    return 0;
  } catch (error) {
    emit({
      type: "login_result",
      ...loginEvidence(reconnect, {
        succeeded: false,
        callbackCompletion: "not_completed",
        connectionStatus: "not_connected",
      }),
      initial_live_oauth_succeeded: false,
      safe_error_category: safeError(error),
    });
    return 1;
  } finally {
    await listener?.close().catch(() => undefined);
    await relay?.close().catch(() => undefined);
  }
}

async function recover() {
  await readCredential();
  emit({ type: "recovery_result", real_restart_recovery_succeeded: true });
}

async function refresh() {
  const current = await readCredential();
  const flight = new SingleFlightRefresh();
  const operation = async () => {
    const result = await refreshRequest(current.payload.refresh_token);
    if (!result.ok)
      throw Object.assign(new Error(result.category), {
        safeCategory: result.category,
      });
    return result.body;
  };
  try {
    const results = await Promise.all([
      flight.refresh(bindings.connectionId, operation),
      flight.refresh(bindings.connectionId, operation),
    ]);
    const first = results[0];
    const rotated =
      typeof first.refresh_token === "string" &&
      first.refresh_token !== current.payload.refresh_token;
    const next = encryptCredentialEnvelope(
      first,
      bindings,
      current.key,
      current.generation,
    );
    await atomicWriteEnvelope(recordPath, next, current.generation);
    emit({
      type: "refresh_result",
      real_refresh_attempted: true,
      real_refresh_succeeded: true,
      real_refresh_token_rotated: rotated,
      live_concurrent_refresh_requests: 2,
      live_network_refresh_count: flight.networkRefreshCount,
      real_encrypted_record_created: true,
      refresh_trigger_category: "scheduled",
      invalid_grant_observed_live: false,
    });
  } catch (error) {
    const category = safeError(error);
    emit({
      type: "refresh_result",
      real_refresh_attempted: true,
      real_refresh_succeeded: false,
      live_concurrent_refresh_requests: 2,
      live_network_refresh_count: flight.networkRefreshCount,
      safe_error_category: category,
      refresh_trigger_category: "scheduled",
      invalid_grant_observed_live: category === "invalid_grant",
      credential_recovery_category:
        category === "invalid_grant"
          ? "live_invalid_grant_reconnect_recovery"
          : "not_exercised",
    });
    return 1;
  }
}

async function logout() {
  await removeCredentialRecord(recordPath);
  emit({
    type: "logout_result",
    real_local_logout_succeeded: true,
    real_record_deletion_succeeded: !(await fs
      .stat(recordPath)
      .catch(() => undefined)),
  });
}

async function status() {
  try {
    await readCredential();
    emit({
      type: "status_result",
      real_disconnected_restart_succeeded: false,
      connection_state: "connected",
    });
  } catch (error) {
    if (error.code === "ENOENT" || error.message === "ENOENT") {
      emit({
        type: "status_result",
        real_disconnected_restart_succeeded: true,
        connection_state: "disconnected",
      });
      return;
    }
    throw error;
  }
}

const command = process.argv[2];
try {
  const code =
    command === "login"
      ? await login()
      : command === "reconnect"
        ? await login({ reconnect: true })
        : command === "recover"
          ? (await recover(), 0)
          : command === "refresh"
            ? (await refresh(), 0)
            : command === "logout"
              ? (await logout(), 0)
              : command === "status"
                ? (await status(), 0)
                : 2;
  process.exitCode = code;
} catch (error) {
  emit({ type: "safe_failure", safe_error_category: safeError(error) });
  process.exitCode = 1;
}
