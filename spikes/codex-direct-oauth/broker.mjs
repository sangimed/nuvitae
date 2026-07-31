import { once } from "node:events";
import {
  buildAuthorizationUrl,
  createPkceChallenge,
  exchangeAuthorizationCode,
  generateOAuthState,
  generatePkceVerifier,
  projectSafeError,
  validateAuthorizationUrl,
} from "./lib/oauth.mjs";
import { createCallbackListener } from "./lib/callback-listener.mjs";
import { CALLBACK, SAFE_FINAL_STATES, UPSTREAM_REVISIONS } from "./oauth-constants.mjs";
import { sanitizeErrorCategory } from "./lib/sanitize.mjs";

let pkceVerifier;
let oauthState;
let authorizationCode;
let accessToken;
let refreshToken;
let tokenExpiry;
let accountIdentifier;
let listener;
let terminal = false;

function emitSafe(event) {
  if (process.send) {
    process.send(event);
  }
}

function clearCredentialReferences() {
  pkceVerifier = undefined;
  oauthState = undefined;
  authorizationCode = undefined;
  accessToken = undefined;
  refreshToken = undefined;
  tokenExpiry = undefined;
  accountIdentifier = undefined;
}

async function cleanup(finalState = SAFE_FINAL_STATES.incomplete) {
  terminal = true;
  if (listener) {
    await listener.close();
  }
  clearCredentialReferences();
  emitSafe({ type: "cleanup_complete", cleanup_complete: true, safe_final_state: finalState });
  if (process.connected) {
    process.disconnect();
  }
}

async function beginLogin() {
  pkceVerifier = generatePkceVerifier();
  oauthState = generateOAuthState();
  const codeChallenge = createPkceChallenge(pkceVerifier);
  const authorizationUrl = buildAuthorizationUrl({ state: oauthState, codeChallenge });
  const validation = validateAuthorizationUrl(authorizationUrl);

  emitSafe({
    type: "authorization_url_validation",
    authorization_url_validation: validation.ok,
    authorization_url_validation_checks: validation.checks,
    audited_upstream_revisions: UPSTREAM_REVISIONS,
  });

  if (!validation.ok) {
    await cleanup(SAFE_FINAL_STATES.failedSecurity);
    return;
  }

  let resolveTerminalResult;
  const terminalResult = new Promise((resolve) => {
    resolveTerminalResult = resolve;
    listener = createCallbackListener({
      expectedState: oauthState,
      onTerminalResult: resolve,
    });
  });

  await listener.listen();
  emitSafe({ type: "callback_listener_ready", callback_listener_ready: true });
  emitSafe({ type: "authorization_url_ready", authorization_url_ready: true });

  process.stdout.write("\nOpen this authorization URL in the host browser:\n");
  process.stdout.write(`${authorizationUrl.toString()}\n\n`);
  process.stdout.write("The URL is printed live only and is not sent over IPC or persisted by the spike.\n\n");

  const timeout = setTimeout(() => {
    resolveTerminalResult({ ok: false, safeCategory: "callback_timeout" });
  }, CALLBACK.waitTimeoutMs);

  const callback = await terminalResult;
  clearTimeout(timeout);
  emitSafe({ type: "callback_received", callback_received: callback?.ok === true });

  if (!callback?.ok) {
    emitSafe({
      type: "safe_error_category",
      safe_error_category: sanitizeErrorCategory(callback?.safeCategory),
      state_valid: callback?.safeCategory === "state_mismatch" ? false : undefined,
    });
    await cleanup(SAFE_FINAL_STATES.incomplete);
    return;
  }

  emitSafe({ type: "state_valid", state_valid: true });
  authorizationCode = callback.code;

  try {
    const exchange = await exchangeAuthorizationCode({
      code: authorizationCode,
      codeVerifier: pkceVerifier,
    });
    authorizationCode = undefined;

    emitSafe({
      type: "token_exchange_result",
      token_exchange_succeeded: exchange.ok,
      token_exchange_status_category: exchange.statusCategory,
      safe_oauth_error_category: exchange.ok ? undefined : sanitizeErrorCategory(exchange.safeOAuthErrorCategory),
    });

    if (!exchange.ok) {
      await cleanup(SAFE_FINAL_STATES.incomplete);
      return;
    }

    accessToken = exchange.tokenResponse.access_token;
    refreshToken = exchange.tokenResponse.refresh_token;
    tokenExpiry = exchange.tokenResponse.expires_in ?? exchange.tokenResponse.expires_at;
    accountIdentifier =
      exchange.tokenResponse.account_id ??
      exchange.tokenResponse.accountId ??
      exchange.tokenResponse.chatgpt_account_id ??
      exchange.tokenResponse["https://api.openai.com/auth.chatgpt_account_id"] ??
      "present";

    emitSafe({
      type: "credential_presence",
      access_token_present: exchange.accessTokenPresent,
      refresh_token_present: exchange.refreshTokenPresent,
      expiry_present: exchange.expiryPresent,
      account_identifier_present: exchange.accountIdentifierPresent,
      raw_credentials_exposed_to_probe: false,
    });

    const complete =
      exchange.accessTokenPresent &&
      exchange.refreshTokenPresent &&
      exchange.expiryPresent &&
      exchange.accountIdentifierPresent;

    await cleanup(complete ? SAFE_FINAL_STATES.success : SAFE_FINAL_STATES.incomplete);
  } catch (error) {
    emitSafe({
      type: "safe_error_category",
      safe_error_category: projectSafeError(error),
    });
    await cleanup(SAFE_FINAL_STATES.incomplete);
  }
}

process.on("message", async (message) => {
  if (message?.type === "begin_login") {
    await beginLogin();
  }
  if (message?.type === "cancel") {
    await cleanup(SAFE_FINAL_STATES.incomplete);
  }
});

process.on("SIGTERM", () => {
  if (terminal) {
    process.exit(0);
    return;
  }
  cleanup(SAFE_FINAL_STATES.incomplete).then(() => process.exit(0));
});

if (!process.send) {
  process.stderr.write("broker must run as an IPC child process\n");
  process.exit(1);
}

await once(process, "disconnect").catch(() => undefined);
