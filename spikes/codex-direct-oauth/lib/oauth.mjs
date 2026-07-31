import crypto from "node:crypto";
import https from "node:https";
import { OAUTH, NETWORK_LIMITS } from "../oauth-constants.mjs";

export function base64Url(buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function generatePkceVerifier() {
  return base64Url(crypto.randomBytes(32));
}

export function createPkceChallenge(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier, "ascii").digest());
}

export function generateOAuthState() {
  return base64Url(crypto.randomBytes(32));
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function buildAuthorizationUrl({ state, codeChallenge }) {
  const url = new URL(OAUTH.authorizationEndpoint);
  url.searchParams.set("client_id", OAUTH.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", OAUTH.redirectUri);
  url.searchParams.set("scope", OAUTH.scopes.join(" "));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", OAUTH.codeChallengeMethod);
  url.searchParams.set("state", state);
  for (const [name, value] of Object.entries(OAUTH.authorizationExtras)) {
    url.searchParams.set(name, value);
  }
  return url;
}

function setEquals(actual, expected) {
  if (actual.size !== expected.size) {
    return false;
  }
  for (const value of expected) {
    if (!actual.has(value)) {
      return false;
    }
  }
  return true;
}

export function validateAuthorizationUrl(urlLike) {
  const url = new URL(urlLike);
  const audited = new URL(OAUTH.authorizationEndpoint);
  const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
  const expectedRedirect = new URL(OAUTH.redirectUri);
  const expectedScopes = new Set(OAUTH.scopes);
  const actualScopes = new Set((url.searchParams.get("scope") ?? "").split(" ").filter(Boolean));

  const checks = {
    httpsOnly: url.protocol === "https:",
    exactAuthorizationHost: url.hostname === audited.hostname,
    exactAuthorizationPath: url.pathname === audited.pathname,
    expectedClientId: url.searchParams.get("client_id") === OAUTH.clientId,
    expectedRedirectUri: url.searchParams.get("redirect_uri") === OAUTH.redirectUri,
    expectedScopeSet: setEquals(actualScopes, expectedScopes),
    pkceS256: url.searchParams.get("code_challenge_method") === OAUTH.codeChallengeMethod,
    nonEmptyState: Boolean(url.searchParams.get("state")),
    noEmbeddedUrlCredentials: url.username === "" && url.password === "",
    noUnexpectedRedirectHost:
      redirect.protocol === expectedRedirect.protocol &&
      redirect.hostname === expectedRedirect.hostname &&
      redirect.port === expectedRedirect.port &&
      redirect.pathname === expectedRedirect.pathname,
    responseTypeCode: url.searchParams.get("response_type") === "code",
    expectedExtraParams: Object.entries(OAUTH.authorizationExtras).every(
      ([name, value]) => url.searchParams.get(name) === value,
    ),
  };

  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    redirectMetadata: {
      scheme: redirect.protocol.replace(":", ""),
      hostname: redirect.hostname,
      port: redirect.port,
      path: redirect.pathname,
      hostname_classification:
        redirect.hostname === "localhost"
          ? "localhost"
          : redirect.hostname === "127.0.0.1"
            ? "ipv4_loopback"
            : redirect.hostname === "::1"
              ? "ipv6_loopback"
              : "not_loopback",
    },
  };
}

export function validateTokenEndpoint(urlLike = OAUTH.tokenEndpoint) {
  const url = new URL(urlLike);
  const audited = new URL(OAUTH.tokenEndpoint);
  const checks = {
    httpsOnly: url.protocol === "https:",
    exactTokenHost: url.hostname === audited.hostname,
    exactTokenPath: url.pathname === audited.pathname,
    noEmbeddedUrlCredentials: url.username === "" && url.password === "",
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
  };
}

export function projectSafeError(error) {
  if (error?.safeCategory) {
    return error.safeCategory;
  }
  if (error?.code === "ETIMEDOUT" || error?.name === "AbortError") {
    return "network_timeout";
  }
  if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
    return "network_unreachable";
  }
  if (error?.message === "unexpected_redirect") {
    return "unexpected_redirect";
  }
  if (error?.message === "response_too_large") {
    return "response_too_large";
  }
  if (error?.message === "unexpected_content_type") {
    return "unexpected_content_type";
  }
  if (error?.message === "strict_parse_failed") {
    return "strict_parse_failed";
  }
  return "oauth_exchange_failed";
}

function statusCategory(statusCode) {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return "unknown_status";
}

function parseJsonStrict(buffer) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch (_error) {
    const error = new Error("strict_parse_failed");
    error.safeCategory = "strict_parse_failed";
    throw error;
  }
}

export function accountIdentifierPresentFromTokenResponse(tokenResponse) {
  if (typeof tokenResponse.id_token === "string" && tokenResponse.id_token.split(".").length === 3) {
    const payload = tokenResponse.id_token.split(".")[1];
    try {
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return Boolean(
        decoded["https://api.openai.com/auth.chatgpt_account_id"] ||
          decoded.sub ||
          decoded.account_id,
      );
    } catch (_error) {
      return false;
    }
  }

  return Boolean(
    tokenResponse.account_id ||
      tokenResponse.accountId ||
      tokenResponse.chatgpt_account_id ||
      tokenResponse["https://api.openai.com/auth.chatgpt_account_id"],
  );
}

export async function exchangeAuthorizationCode({ code, codeVerifier, requestImpl = https.request }) {
  const endpointValidation = validateTokenEndpoint();
  if (!endpointValidation.ok) {
    const error = new Error("token_endpoint_rejected");
    error.safeCategory = "token_endpoint_rejected";
    throw error;
  }

  const endpoint = new URL(OAUTH.tokenEndpoint);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OAUTH.clientId,
    code,
    redirect_uri: OAUTH.redirectUri,
    code_verifier: codeVerifier,
  }).toString();

  return await new Promise((resolve, reject) => {
    let settled = false;
    const settleReject = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const settleResolve = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const request = requestImpl(
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
        const location = response.headers.location;
        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
          try {
            const redirect = new URL(location, endpoint);
            if (redirect.hostname !== endpoint.hostname || redirect.pathname !== endpoint.pathname) {
              response.resume();
              settleReject(new Error("unexpected_redirect"));
              return;
            }
          } catch (_error) {
            response.resume();
            settleReject(new Error("unexpected_redirect"));
            return;
          }
        }

        const contentType = String(response.headers["content-type"] ?? "");
        if (!contentType.toLowerCase().startsWith("application/json")) {
          response.resume();
          settleReject(new Error("unexpected_content_type"));
          return;
        }

        let size = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > NETWORK_LIMITS.tokenResponseMaxBytes) {
            response.destroy?.();
            settleReject(new Error("response_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (settled) {
            return;
          }
          let parsed;
          try {
            parsed = parseJsonStrict(Buffer.concat(chunks));
          } catch (error) {
            settleReject(error);
            return;
          }
          if (response.statusCode < 200 || response.statusCode >= 300) {
            settleResolve({
              ok: false,
              statusCategory: statusCategory(response.statusCode),
              safeOAuthErrorCategory: typeof parsed.error === "string" ? parsed.error : "oauth_error",
            });
            return;
          }

          settleResolve({
            ok: true,
            statusCategory: statusCategory(response.statusCode),
            accessTokenPresent: typeof parsed.access_token === "string" && parsed.access_token.length > 0,
            refreshTokenPresent: typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0,
            expiryPresent: Number.isFinite(parsed.expires_in) || typeof parsed.expires_at === "number",
            accountIdentifierPresent: accountIdentifierPresentFromTokenResponse(parsed),
            tokenResponse: parsed,
          });
        });
      },
    );

    request.on("timeout", () => request.destroy(Object.assign(new Error("network_timeout"), { code: "ETIMEDOUT" })));
    request.on("error", settleReject);
    request.end(body);
  });
}
