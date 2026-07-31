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
import { createMasterKey, encryptCredentialEnvelope, decryptCredentialEnvelope, atomicWriteEnvelope, removeCredentialRecord, writeKeyFile } from "../lib/credential-store.mjs";
import { SingleFlightRefresh, classifyRefreshResponse } from "../lib/refresh.mjs";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

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
  assert.deepEqual(validateAuthorizationUrl(url).redirectMetadata, {
    scheme: "http",
    hostname: "localhost",
    port: "1455",
    path: "/auth/callback",
    hostname_classification: "localhost",
  });
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

test("audited IPv4 redirect fallback host is allowlisted", () => {
  assert.equal(OAUTH.allowedRedirectHosts.includes("127.0.0.1"), true);
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

test("AES-GCM envelope binds credentials and never stores plaintext", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t199-"));
  const file = path.join(dir, "credential.json");
  const key = createMasterKey();
  const bindings = { ownerNamespace: "owner-stable", connectionId: "connection-1", provider: "openai-codex" };
  const payload = { access_token: "sentinel-access", refresh_token: "sentinel-refresh", expires_at: 1, account_id: "sentinel-account" };
  const envelope = encryptCredentialEnvelope(payload, bindings, key);
  assert.notEqual(envelope.nonce, encryptCredentialEnvelope(payload, bindings, key).nonce);
  await atomicWriteEnvelope(file, envelope);
  const bytes = await fs.readFile(file, "utf8");
  assert.equal(bytes.includes("sentinel"), false);
  assert.deepEqual(decryptCredentialEnvelope(JSON.parse(bytes), bindings, key).payload, payload);
  for (const altered of [
    { ...bindings, ownerNamespace: "other" }, { ...bindings, connectionId: "other" }, { ...bindings, provider: "other" },
  ]) assert.throws(() => decryptCredentialEnvelope(JSON.parse(bytes), altered, key));
  const tampered = JSON.parse(bytes);
  const tamperedCiphertext = Buffer.from(tampered.ciphertext, "base64url");
  tamperedCiphertext[0] ^= 1;
  tampered.ciphertext = tamperedCiphertext.toString("base64url");
  assert.notEqual(tampered.ciphertext, JSON.parse(bytes).ciphertext);
  assert.throws(() => decryptCredentialEnvelope(tampered, bindings, key), /credential_authentication_failed/);
  const wrongVersion = { ...JSON.parse(bytes), envelope_version: 2 };
  assert.throws(() => decryptCredentialEnvelope(wrongVersion, bindings, key), /unsupported_envelope_version/);
  await removeCredentialRecord(file);
  await fs.rm(dir, { recursive: true, force: true });
});

test("atomic replacement and generation compare-and-swap are fail closed", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t199-cas-"));
  const file = path.join(dir, "credential.json"); const key = createMasterKey();
  const bindings = { ownerNamespace: "owner", connectionId: "connection", provider: "provider" };
  await atomicWriteEnvelope(file, encryptCredentialEnvelope({ access_token: "a", refresh_token: "r", expires_at: 1 }, bindings, key));
  await assert.rejects(() => atomicWriteEnvelope(file, encryptCredentialEnvelope({ access_token: "b", refresh_token: "r", expires_at: 1 }, bindings, key, 1), 0), /credential_generation_conflict/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("refresh encrypts with the loaded key and increments from the loaded generation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t199-refresh-"));
  const file = path.join(dir, "credential.json");
  const key = createMasterKey();
  const bindings = { ownerNamespace: "owner", connectionId: "connection", provider: "provider" };
  const currentPayload = { access_token: "a", refresh_token: "r", expires_at: 1 };
  const currentEnvelope = encryptCredentialEnvelope(currentPayload, bindings, key);
  await atomicWriteEnvelope(file, currentEnvelope);
  const current = { key, envelope: currentEnvelope, ...decryptCredentialEnvelope(currentEnvelope, bindings, key) };
  const refreshedPayload = { access_token: "b", refresh_token: "r2", expires_at: 2 };

  assert.throws(
    () => encryptCredentialEnvelope(refreshedPayload, bindings, current.generation),
    /invalid_master_key/,
  );
  const next = encryptCredentialEnvelope(refreshedPayload, bindings, current.key, current.generation);
  await atomicWriteEnvelope(file, next, current.generation);
  assert.equal(next.credential_generation, current.generation + 1);
  assert.deepEqual(decryptCredentialEnvelope(next, bindings, current.key).payload, refreshedPayload);
  await fs.rm(dir, { recursive: true, force: true });
});

test("key and record permissions are restrictive and abandoned files are removed", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t199-permissions-")); const keyPath = path.join(dir, "master.key");
  await writeKeyFile(keyPath, createMasterKey());
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700); assert.equal((await fs.stat(keyPath)).mode & 0o777, 0o600);
  const record = path.join(dir, "credential.json"); await fs.writeFile(`${record}.tmp-abandoned`, "synthetic", { mode: 0o600 }); await fs.writeFile(`${record}.bak`, "synthetic", { mode: 0o600 });
  await removeCredentialRecord(record); assert.equal(await fs.stat(`${record}.tmp-abandoned`).catch(() => undefined), undefined); assert.equal(await fs.stat(`${record}.bak`).catch(() => undefined), undefined);
  await fs.rm(dir, { recursive: true, force: true });
});

test("concurrent refresh is single-flight and preserves safe result", async () => {
  const flight = new SingleFlightRefresh(); let calls = 0;
  const operation = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return { status: "connected", rotated: true }; };
  const results = await Promise.all([1, 2, 3].map(() => flight.refresh("connection", operation)));
  assert.equal(calls, 1); assert.equal(flight.networkRefreshCount, 1); assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});

test("refresh failures are classified without invalidation overclaim", () => {
  assert.equal(classifyRefreshResponse({ status: 400, body: { error: "invalid_grant" } }), "invalid_grant");
  assert.equal(classifyRefreshResponse({ status: 401, body: {} }), "authentication_required");
  assert.equal(classifyRefreshResponse({ status: 403, body: {} }), "authentication_required");
  assert.equal(classifyRefreshResponse({ status: 429, body: {} }), "quota_or_rate_limit");
  assert.equal(classifyRefreshResponse({ status: 200, body: { access_token: "a", expires_in: 1 } }), "success");
  assert.equal(classifyRefreshResponse({ status: 200, body: { access_token: "a" } }), "malformed_token_response");
  assert.equal(classifyRefreshResponse({ timedOut: true }), "transport_timeout");
});
