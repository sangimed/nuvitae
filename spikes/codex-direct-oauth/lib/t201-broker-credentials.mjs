// Shared encrypted credential recovery and refresh machinery for the
// qualified direct-OAuth broker path (T199/T200/T201/T246).
//
// This module is the single owner of broker credential recovery and refresh
// so that the T246 live broker reuses the exact T201-proven boundaries
// instead of duplicating them. Behavior is byte-for-byte the credential code
// previously embedded in `t201-semantic-broker.mjs`; credentials remain
// broker-only, token-blind to the parent, and never persisted outside the
// encrypted credential envelope.
import https from "node:https";
import {
  atomicWriteEnvelope,
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
  readEnvelope,
  readKeyFile,
} from "./credential-store.mjs";
import { classifyRefreshResponse, SingleFlightRefresh } from "./refresh.mjs";
import { NETWORK_LIMITS, OAUTH } from "../oauth-constants.mjs";

export const T199_BROKER_BINDINGS = Object.freeze({
  ownerNamespace: "live-t199-owner",
  connectionId: "live-t199-connection",
  provider: "openai-codex",
});

export const T199_EXPIRY_SKEW_MS = 120000;
export const T199_KEY_PATH = "/run/t199-key/master.key";
export const T199_RECORD_PATH = "/spike/credentials/credential.json";

export async function recoverT199Credential({
  keyPath = T199_KEY_PATH,
  recordPath = T199_RECORD_PATH,
  bindings = T199_BROKER_BINDINGS,
} = {}) {
  const key = await readKeyFile(keyPath).catch((error) => {
    throw Object.assign(error, { safeCategory: "transport_failure" });
  });
  const envelope = await readEnvelope(recordPath).catch((error) => {
    throw Object.assign(error, {
      safeCategory:
        error.code === "ENOENT" ? "transport_failure" : "safe_unknown_failure",
    });
  });
  try {
    return {
      key,
      envelope,
      ...decryptCredentialEnvelope(envelope, bindings, key),
    };
  } catch (error) {
    throw Object.assign(error, { safeCategory: "transport_failure" });
  }
}

export function credentialExpiryMs(payload) {
  if (typeof payload.expires_at === "number")
    return payload.expires_at > 10_000_000_000
      ? payload.expires_at
      : payload.expires_at * 1000;
  if (typeof payload.expiresAt === "number")
    return payload.expiresAt > 10_000_000_000
      ? payload.expiresAt
      : payload.expiresAt * 1000;
  if (
    typeof payload.issued_at_ms === "number" &&
    typeof payload.expires_in === "number"
  )
    return payload.issued_at_ms + payload.expires_in * 1000;
  return 0;
}

export function credentialPayloadAfterRefresh(previousPayload, tokenResponse) {
  const issuedAtMs = Date.now();
  return {
    ...previousPayload,
    ...tokenResponse,
    refresh_token: tokenResponse.refresh_token ?? previousPayload.refresh_token,
    issued_at_ms: issuedAtMs,
    expires_at: issuedAtMs + tokenResponse.expires_in * 1000,
  };
}

export function buildRefreshRequest(refreshToken) {
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
            request.destroy(
              Object.assign(new Error("response_too_large"), {
                safeCategory: "refresh_failure",
              }),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            resolve({ ok: false, category: "refresh_failure" });
            return;
          }
          const category = classifyRefreshResponse({
            status: response.statusCode,
            body: parsed,
          });
          if (category !== "success")
            resolve({ ok: false, category: "refresh_failure" });
          else resolve({ ok: true, body: parsed });
        });
      },
    );
    request.on("timeout", () =>
      request.destroy(
        Object.assign(new Error("transport_timeout"), {
          safeCategory: "refresh_failure",
        }),
      ),
    );
    request.on("error", reject);
    request.end(body);
  });
}

export async function maybeRefreshT199Credential(
  current,
  {
    bindings = T199_BROKER_BINDINGS,
    recordPath = T199_RECORD_PATH,
    recover = recoverT199Credential,
    refreshRequest = buildRefreshRequest,
    onRefreshAttempt = () => {},
  } = {},
) {
  const refreshRequired =
    credentialExpiryMs(current.payload) <= Date.now() + T199_EXPIRY_SKEW_MS;
  if (!refreshRequired)
    return {
      current,
      refresh_required: false,
      refresh_attempted: false,
      refresh_succeeded: false,
    };
  onRefreshAttempt();
  if (
    typeof current.payload.refresh_token !== "string" ||
    current.payload.refresh_token.length === 0
  ) {
    throw Object.assign(new Error("refresh_failure"), {
      safeCategory: "refresh_failure",
    });
  }
  const flight = new SingleFlightRefresh();
  const result = await flight.refresh(bindings.connectionId, async () =>
    refreshRequest(current.payload.refresh_token),
  );
  if (!result.ok)
    throw Object.assign(new Error("refresh_failure"), {
      safeCategory: "refresh_failure",
    });
  const nextPayload = credentialPayloadAfterRefresh(
    current.payload,
    result.body,
  );
  const nextEnvelope = encryptCredentialEnvelope(
    nextPayload,
    bindings,
    current.key,
    current.generation,
  );
  await atomicWriteEnvelope(recordPath, nextEnvelope, current.generation);
  return {
    current: await recover(),
    refresh_required: true,
    refresh_attempted: true,
    refresh_succeeded: true,
    live_network_refresh_count: flight.networkRefreshCount,
  };
}
