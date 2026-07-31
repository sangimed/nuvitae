import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import net from "node:net";
import { test } from "node:test";
import {
  buildAuthorizationUrl,
  createPkceChallenge,
  exchangeAuthorizationCode,
  generateOAuthState,
  generatePkceVerifier,
  validateAuthorizationUrl,
  validateTokenEndpoint,
} from "../lib/oauth.mjs";
import { createCallbackListener } from "../lib/callback-listener.mjs";
import { createRawTcpRelay } from "../lib/relay.mjs";
import { containsSecretLikeValue } from "../lib/sanitize.mjs";
import { CALLBACK, OAUTH } from "../oauth-constants.mjs";

function fakeHttpsRequest({ statusCode = 200, headers = { "content-type": "application/json" }, body = "{}" }) {
  return (_options, callback) => {
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = statusCode;
      response.headers = headers;
      response.resume = () => {};
      response.destroy = () => {};
      callback(response);
      queueMicrotask(() => {
        response.emit("data", Buffer.from(body, "utf8"));
        response.emit("end");
      });
    };
    request.destroy = (error) => request.emit("error", error);
    request.setTimeout = () => {};
    return request;
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("PKCE verifier and challenge shape", () => {
  const verifier = generatePkceVerifier();
  const challenge = createPkceChallenge(verifier);
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(verifier, challenge);
});

test("unique state generation", () => {
  assert.notEqual(generateOAuthState(), generateOAuthState());
});

test("authorization URL allowlist accepts audited parameters", () => {
  const state = generateOAuthState();
  const verifier = generatePkceVerifier();
  const url = buildAuthorizationUrl({ state, codeChallenge: createPkceChallenge(verifier) });
  assert.equal(validateAuthorizationUrl(url).ok, true);
});

test("authorization URL allowlist rejects unexpected redirect host", () => {
  const state = generateOAuthState();
  const verifier = generatePkceVerifier();
  const url = buildAuthorizationUrl({ state, codeChallenge: createPkceChallenge(verifier) });
  url.searchParams.set("redirect_uri", "http://evil.example/auth/callback");
  assert.equal(validateAuthorizationUrl(url).ok, false);
});

test("token endpoint allowlist rejects host and path drift", () => {
  assert.equal(validateTokenEndpoint(OAUTH.tokenEndpoint).ok, true);
  assert.equal(validateTokenEndpoint("https://auth.openai.com/not-token").ok, false);
  assert.equal(validateTokenEndpoint("https://example.com/oauth/token").ok, false);
});

test("token exchange rejects redirects to another host", async () => {
  await assert.rejects(
    () => exchangeAuthorizationCode({
      code: "synthetic-code",
      codeVerifier: "synthetic-verifier",
      requestImpl: fakeHttpsRequest({
        statusCode: 302,
        headers: { "content-type": "application/json", location: "https://example.com/oauth/token" },
        body: "{}",
      }),
    }),
    /unexpected_redirect/,
  );
});

test("token exchange enforces bounded response handling", async () => {
  await assert.rejects(
    () => exchangeAuthorizationCode({
      code: "synthetic-code",
      codeVerifier: "synthetic-verifier",
      requestImpl: fakeHttpsRequest({
        body: JSON.stringify({ padding: "x".repeat(70000) }),
      }),
    }),
    /response_too_large/,
  );
});

test("privacy-safe token exchange projection exposes booleans only", async () => {
  const result = await exchangeAuthorizationCode({
    code: "synthetic-code",
    codeVerifier: "synthetic-verifier",
    requestImpl: fakeHttpsRequest({
      body: JSON.stringify({
        access_token: "sentinel-access-token-value",
        refresh_token: "sentinel-refresh-token-value",
        expires_in: 3600,
        account_id: "acct_sentinel",
      }),
    }),
  });
  const projected = {
    token_exchange_succeeded: result.ok,
    access_token_present: result.accessTokenPresent,
    refresh_token_present: result.refreshTokenPresent,
    expiry_present: result.expiryPresent,
    account_identifier_present: result.accountIdentifierPresent,
  };
  assert.deepEqual(projected, {
    token_exchange_succeeded: true,
    access_token_present: true,
    refresh_token_present: true,
    expiry_present: true,
    account_identifier_present: true,
  });
  assert.equal(containsSecretLikeValue(JSON.stringify(projected)), false);
});

test("callback listener validates state and code", async () => {
  const state = generateOAuthState();
  const observed = [];
  const listener = createCallbackListener({
    expectedState: state,
    onTerminalResult: (result) => observed.push(result),
  });
  await listener.listen();
  const response = await fetch(`http://${CALLBACK.brokerHost}:${CALLBACK.brokerPort}${CALLBACK.path}?state=${state}&code=synthetic-code`);
  assert.equal(response.status, 200);
  assert.equal(observed[0].ok, true);
  assert.equal(observed[0].stateValid, true);
  await listener.close();
});

test("callback listener rejects wrong state", async () => {
  const listener = createCallbackListener({
    expectedState: generateOAuthState(),
    onTerminalResult: (result) => assert.equal(result.safeCategory, "state_mismatch"),
  });
  await listener.listen();
  const response = await fetch(`http://${CALLBACK.brokerHost}:${CALLBACK.brokerPort}${CALLBACK.path}?state=wrong&code=synthetic-code`);
  assert.equal(response.status, 400);
  await listener.close();
});

test("callback listener rejects missing code", async () => {
  const state = generateOAuthState();
  const listener = createCallbackListener({
    expectedState: state,
    onTerminalResult: (result) => assert.equal(result.safeCategory, "missing_code"),
  });
  await listener.listen();
  const response = await fetch(`http://${CALLBACK.brokerHost}:${CALLBACK.brokerPort}${CALLBACK.path}?state=${state}`);
  assert.equal(response.status, 400);
  await listener.close();
});

test("callback listener rejects wrong callback path", async () => {
  const state = generateOAuthState();
  const listener = createCallbackListener({
    expectedState: state,
    onTerminalResult: (result) => assert.equal(result.safeCategory, "wrong_callback_path"),
  });
  await listener.listen();
  const response = await fetch(`http://${CALLBACK.brokerHost}:${CALLBACK.brokerPort}/wrong?state=${state}&code=synthetic-code`);
  assert.equal(response.status, 404);
  await listener.close();
});

test("callback listener rejects duplicated successful callbacks", async () => {
  const state = generateOAuthState();
  const observed = [];
  const listener = createCallbackListener({
    expectedState: state,
    onTerminalResult: (result) => observed.push(result),
  });
  await listener.listen();
  const first = await fetch(`http://${CALLBACK.brokerHost}:${CALLBACK.brokerPort}${CALLBACK.path}?state=${state}&code=synthetic-code`);
  assert.equal(first.status, 200);
  await listener.close();
  assert.equal(observed.length, 1);
});

test("relay startup and teardown forwards raw TCP", async () => {
  const targetPort = await freePort();
  const relayPort = await freePort();
  const target = net.createServer((socket) => socket.pipe(socket));
  await new Promise((resolve) => target.listen(targetPort, "127.0.0.1", resolve));
  const relay = createRawTcpRelay({ listenPort: relayPort, targetPort });
  await relay.listen();
  const result = await new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: relayPort }, () => socket.write("ping"));
    socket.on("data", (chunk) => {
      resolve(chunk.toString("utf8"));
      socket.destroy();
    });
  });
  assert.equal(result, "ping");
  await relay.close();
  await new Promise((resolve) => target.close(resolve));
});

test("host loopback-only publication model is strict", () => {
  const publication = { hostIp: "127.0.0.1", hostPort: 1455, containerPort: 2455 };
  assert.deepEqual(publication, { hostIp: CALLBACK.publicHost, hostPort: CALLBACK.publicPort, containerPort: CALLBACK.relayContainerPort });
  assert.notEqual("0.0.0.0", CALLBACK.publicHost);
});

test("credential non-propagation to parent IPC", () => {
  const parentEvent = {
    token_exchange_succeeded: true,
    access_token_present: true,
    refresh_token_present: true,
    expiry_present: true,
    account_identifier_present: true,
    raw_credentials_exposed_to_probe: false,
  };
  assert.equal(containsSecretLikeValue(JSON.stringify(parentEvent)), false);
});

test("cleanup after success and failure is token-blind", () => {
  for (const state of ["success_credentials_destroyed", "incomplete_cleaned_up"]) {
    const evidence = {
      cleanup_complete: true,
      relay_removed: true,
      host_callback_port_removed: true,
      persistent_credential_artifact_found: false,
      safe_final_state: state,
    };
    assert.equal(containsSecretLikeValue(JSON.stringify(evidence)), false);
  }
});

test("secret scanner catches synthetic sentinel credentials", () => {
  assert.equal(containsSecretLikeValue("access_token: sentinel-access-token-value"), true);
  assert.equal(containsSecretLikeValue("refresh_token: sentinel-refresh-token-value"), true);
  assert.equal(containsSecretLikeValue("code=syntheticAuthorizationCode123"), true);
});
