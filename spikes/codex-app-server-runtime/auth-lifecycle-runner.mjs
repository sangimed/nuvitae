import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const evidencePath = "/evidence/auth-lifecycle.json";
const codexState = "/codex-state";
const redacted = "[REDACTED]";
const loginTimeoutMs = 600_000;
const callbackPorts = new Set([1455, 1457]);
const relayPortByCallbackPort = new Map([[1455, 2455], [1457, 2457]]);
const allowedAuthHosts = new Set(["auth.openai.com"]);
const activeServers = new Set();
let currentEvidence = null;

function redact(value) {
  return JSON.stringify(value ?? null)
    .replace(/https:\/\/[^\s"']+/g, "[URL_REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, redacted)
    .replace(/eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g, redacted)
    .replace(/([?&](code|device_code|user_code|access_token|refresh_token|id_token|state)=)[^"&\s]+/gi, `$1${redacted}`)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
}

function safeJson(value) {
  return JSON.parse(redact(value));
}

function frame(message) {
  return `${JSON.stringify(message)}\n`;
}

function makeParser(onMessage) {
  let buffer = Buffer.alloc(0);
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const body = buffer.subarray(0, newline).toString("utf8").trim();
      buffer = buffer.subarray(newline + 1);
      if (body) onMessage(JSON.parse(body));
    }
  };
}

async function writeEvidence(value) {
  currentEvidence = value;
  await writeFile(evidencePath, `${JSON.stringify(safeJson(value), null, 2)}\n`);
}

function runAs(uid, gid, command, args, options = {}) {
  return spawn("setpriv", [
    `--reuid=${uid}`,
    `--regid=${gid}`,
    "--clear-groups",
    command,
    ...args,
  ], options);
}

async function execAs(uid, gid, command, args) {
  const child = runAs(uid, gid, command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  return { ...exit, stdout: stdout.slice(0, 1000), stderr: stderr.slice(0, 1000) };
}

async function permissionProbe() {
  await mkdir(codexState, { recursive: true });
  await writeFile(`${codexState}/nuvitae-sentinel`, "synthetic sentinel\n", { mode: 0o600 });
  await chmod(codexState, 0o700);
  const checks = {
    listStateDir: await execAs(10002, 10002, "ls", ["-la", codexState]),
    statKnownSentinel: await execAs(10002, 10002, "stat", [`${codexState}/nuvitae-sentinel`]),
    readKnownSentinel: await execAs(10002, 10002, "cat", [`${codexState}/nuvitae-sentinel`]),
    copyKnownSentinel: await execAs(10002, 10002, "cp", [`${codexState}/nuvitae-sentinel`, "/runtime-tmp/copied-sentinel"]),
    modifyKnownSentinel: await execAs(10002, 10002, "sh", ["-c", `printf probe >> ${codexState}/nuvitae-sentinel`]),
    deleteKnownSentinel: await execAs(10002, 10002, "rm", [`${codexState}/nuvitae-sentinel`]),
  };
  return Object.fromEntries(Object.entries(checks).map(([name, result]) => [
    name,
    { code: result.code, signal: result.signal, denied: result.code !== 0 },
  ]));
}

function startServer(label) {
  const child = runAs(10001, 10001, "codex", ["app-server", "--stdio", "--strict-config"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      HOME: codexState,
      CODEX_HOME: codexState,
      XDG_CONFIG_HOME: `${codexState}/.config`,
      XDG_CACHE_HOME: "/runtime-tmp/.cache",
      XDG_DATA_HOME: `${codexState}/.local/share`,
      TMPDIR: "/runtime-tmp",
      NO_COLOR: "1",
      PATH: process.env.PATH,
    },
  });
  const responses = new Map();
  const notifications = [];
  const stderr = [];
  child.stdout.on("data", makeParser((message) => {
    if (Object.hasOwn(message, "id")) responses.set(message.id, message);
    else notifications.push(message);
  }));
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8").slice(0, 1000)));
  let nextId = 1;
  const request = async (method, params, waitMs = 30_000) => {
    const id = nextId++;
    child.stdin.write(frame({ jsonrpc: "2.0", id, method, params }));
    const started = Date.now();
    while (Date.now() - started < waitMs) {
      if (responses.has(id)) return responses.get(id);
      await delay(50);
    }
    throw new Error(`Timed out waiting for ${method} during ${label}`);
  };
  const notify = (method, params) => {
    child.stdin.write(frame({ jsonrpc: "2.0", method, params }));
  };
  const stop = async () => {
    child.stdin.end();
    return Promise.race([
      new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal }))),
      delay(5000).then(() => {
        child.kill("SIGKILL");
        return { code: null, signal: "SIGKILL", timedOut: true };
      }),
    ]);
  };
  const server = { child, request, notify, stop, notifications, stderr };
  activeServers.add(server);
  child.on("exit", () => activeServers.delete(server));
  return server;
}

async function initialize(server, version) {
  const initializeResponse = await server.request("initialize", {
    clientInfo: { name: "nuvitae", title: "Nuvitae", version },
    capabilities: {},
  });
  server.notify("initialized", {});
  return initializeResponse;
}

async function startAndInit(label, version) {
  const server = startServer(label);
  const init = await initialize(server, version);
  return { server, init };
}

function summarizeAccount(response) {
  const account = response.result?.account ?? null;
  return {
    authenticated: Boolean(account),
    accountType: account?.type ?? null,
    planType: account?.planType ?? null,
    requiresOpenaiAuth: response.result?.requiresOpenaiAuth ?? null,
    emailExposedByProtocol: Boolean(account?.email),
    hasOpaqueAccountObject: Boolean(account),
  };
}

function containsCredential(value) {
  const text = JSON.stringify(value);
  return /access[_-]?token|refresh[_-]?token|id[_-]?token|authorizationCode|"code"\s*:|pkce|codeVerifier|cookie|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{20,}/i.test(text);
}

function loginStartContainsRawSecret(value) {
  const clone = structuredClone(value);
  if (clone?.result?.authUrl) clone.result.authUrl = "[URL_REDACTED]";
  const text = JSON.stringify(clone);
  return /"accessToken"\s*:|"refreshToken"\s*:|"idToken"\s*:|"authorizationCode"\s*:|"code"\s*:|"state"\s*:|"codeVerifier"\s*:|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{20,}/i.test(text);
}

function validateAuthorizationUrl(authUrl) {
  const authorization = new URL(authUrl);
  if (authorization.protocol !== "https:") throw new Error("Unexpected authorization URL scheme");
  if (!allowedAuthHosts.has(authorization.hostname)) throw new Error("Unexpected authorization URL host");
  const redirectParam = authorization.searchParams.get("redirect_uri");
  if (!redirectParam) throw new Error("Missing redirect_uri in authorization URL");
  const redirect = new URL(redirectParam);
  if (redirect.protocol !== "http:") throw new Error("Unexpected redirect URI scheme");
  if (!["localhost", "127.0.0.1"].includes(redirect.hostname)) throw new Error("Unexpected redirect URI host");
  if (redirect.pathname !== "/auth/callback") throw new Error("Unexpected redirect URI path");
  const callbackPort = Number(redirect.port);
  if (!callbackPorts.has(callbackPort)) throw new Error("Unexpected redirect URI port");
  return {
    authorizationScheme: authorization.protocol.replace(":", ""),
    authorizationHost: authorization.hostname,
    redirectScheme: redirect.protocol.replace(":", ""),
    redirectHost: redirect.hostname,
    redirectPath: redirect.pathname,
    callbackPort,
    relayPort: relayPortByCallbackPort.get(callbackPort),
  };
}

function createRelay(callbackPort) {
  const relayPort = relayPortByCallbackPort.get(callbackPort);
  if (!relayPort) throw new Error(`Unsupported callback relay port for ${callbackPort}`);
  let acceptedConnections = 0;
  let rejectedConnections = 0;
  const sockets = new Set();
  const server = net.createServer((client) => {
    acceptedConnections += 1;
    if (acceptedConnections > 4) {
      rejectedConnections += 1;
      client.destroy();
      return;
    }
    const upstream = net.connect({ host: "127.0.0.1", port: callbackPort });
    sockets.add(client);
    sockets.add(upstream);
    client.setTimeout(120_000);
    upstream.setTimeout(120_000);
    const closeBoth = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("timeout", closeBoth);
    upstream.on("timeout", closeBoth);
    client.on("error", closeBoth);
    upstream.on("error", closeBoth);
    client.on("close", () => sockets.delete(client));
    upstream.on("close", () => sockets.delete(upstream));
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return {
    callbackPort,
    relayPort,
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "0.0.0.0", port: relayPort }, () => {
        server.off("error", reject);
        resolve();
      });
    }),
    stop: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
    metadata: () => ({
      callbackPort,
      relayPort,
      containerRelayBindAddress: "0.0.0.0",
      requiredHostCallbackBindAddress: "127.0.0.1",
      targetHost: "127.0.0.1",
      targetPort: callbackPort,
      acceptedConnections,
      rejectedConnections,
      boundedConnectionLimit: 4,
      idleTimeoutMs: 120_000,
      httpAware: false,
      callbackPayloadLogged: false,
    }),
  };
}

async function probeTcp(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done({ reachable: true, category: "tcp_connect_succeeded" }));
    socket.once("timeout", () => done({ reachable: false, category: "tcp_connect_timeout" }));
    socket.once("error", (error) => done({ reachable: false, category: error.code ?? "tcp_connect_error" }));
  });
}

async function waitForLogin(server, loginId) {
  const started = Date.now();
  while (Date.now() - started < loginTimeoutMs) {
    const completed = server.notifications.find((message) =>
      message.method === "account/login/completed" && message.params?.loginId === loginId
    );
    if (completed) return completed;
    await delay(1000);
  }
  return null;
}

async function waitForAccountUpdated(server, startIndex) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const updated = server.notifications.slice(startIndex).find((message) => message.method === "account/updated");
    if (updated) return updated;
    await delay(250);
  }
  return null;
}

async function browserLogin(server, label, evidence, requireCompletion = true) {
  const login = await server.request("account/login/start", { type: "chatgpt" });
  if (loginStartContainsRawSecret(login)) throw new Error(`${label} login start exposed raw secret data`);
  if (login.error || login.result?.type !== "chatgpt" || !login.result?.authUrl || !login.result?.loginId) {
    return {
      supported: false,
      loginMechanism: login.result?.type ?? null,
      safeErrorCategory: login.error ? "browser_login_request_rejected" : "browser_login_unexpected_response_shape",
      errorCode: login.error?.code ?? null,
      responseShape: Object.keys(login.result ?? login.error ?? {}),
    };
  }

  const validation = validateAuthorizationUrl(login.result.authUrl);
  const relay = createRelay(validation.callbackPort);
  await relay.listen();
  const reachability = await probeTcp("127.0.0.1", validation.callbackPort);
  const relayProbe = await probeTcp("127.0.0.1", validation.relayPort);
  const notificationStart = server.notifications.length;
  const loginIdHash = createHash("sha256").update(login.result.loginId).digest("hex").slice(0, 16);

  evidence[`${label}LoginStart`] = {
    supported: true,
    loginMechanism: "chatgpt",
    loginIdHash,
    responseShape: ["type", "loginId", "authUrl"],
    authorizationUrlValidation: validation,
    relayBeforePrompt: relay.metadata(),
    codexListenerReachability: reachability,
    relayReachability: relayProbe,
    authorizationUrlDisplayedLiveOnly: true,
  };
  await writeEvidence(evidence);

  console.error(`\nT191 ${label}: open this official Codex ChatGPT authorization URL in the host browser.`);
  console.error("The URL is intentionally displayed only in this live terminal and is not written to evidence.");
  console.error(login.result.authUrl);
  console.error("\nWaiting for account/login/completed from Codex app-server...\n");

  let completion = null;
  let accountUpdated = null;
  if (requireCompletion) {
    completion = await waitForLogin(server, login.result.loginId);
    accountUpdated = await waitForAccountUpdated(server, notificationStart);
  }
  await relay.stop();
  evidence[`${label}LoginResult`] = {
    relayAfterCompletion: relay.metadata(),
    completion: completion ? {
      success: Boolean(completion.params?.success),
      errorCategory: completion.params?.error ? "login_completed_error" : null,
      loginIdMatched: completion.params?.loginId === login.result.loginId,
    } : null,
    accountUpdated: accountUpdated ? {
      received: true,
      authenticated: Boolean(accountUpdated.params?.account),
      accountType: accountUpdated.params?.account?.type ?? null,
      hasOpaqueAccountObject: Boolean(accountUpdated.params?.account),
      emailExposedByProtocol: Boolean(accountUpdated.params?.account?.email),
    } : null,
    relayStopped: true,
  };
  await writeEvidence(evidence);
  return {
    loginId: login.result.loginId,
    loginIdHash,
    validation,
    relay,
    completion,
    accountUpdated,
  };
}

async function pendingLoginCancellation(server, evidence) {
  const login = await server.request("account/login/start", { type: "chatgpt" });
  if (loginStartContainsRawSecret(login)) throw new Error("cancellation login start exposed raw secret data");
  if (login.error || login.result?.type !== "chatgpt" || !login.result?.authUrl || !login.result?.loginId) {
    evidence.cancellation = {
      supported: false,
      safeErrorCategory: login.error ? "browser_login_request_rejected" : "browser_login_unexpected_response_shape",
      preservedAuthenticatedProfile: summarizeAccount(await server.request("account/read", { refreshToken: false })).authenticated,
    };
    return;
  }
  const validation = validateAuthorizationUrl(login.result.authUrl);
  const relay = createRelay(validation.callbackPort);
  await relay.listen();
  const notificationStart = server.notifications.length;
  const cancelResult = await server.request("account/login/cancel", { loginId: login.result.loginId });
  await relay.stop();
  const canceledNotification = server.notifications.slice(notificationStart).find((message) =>
    message.method === "account/login/completed" && message.params?.loginId === login.result.loginId
  );
  evidence.cancellation = {
    startShape: ["type", "loginId", "authUrl"],
    loginIdRetainedOnlyInMemory: true,
    authorizationUrlPersisted: false,
    selectedCallbackPort: validation.callbackPort,
    cancelStatus: cancelResult.result?.status ?? null,
    cancelErrorCode: cancelResult.error?.code ?? null,
    canceledNotification: canceledNotification ? {
      success: Boolean(canceledNotification.params?.success),
      hasError: Boolean(canceledNotification.params?.error),
    } : null,
    relayStopped: true,
    preservedAuthenticatedProfile: summarizeAccount(await server.request("account/read", { refreshToken: false })).authenticated,
  };
}

async function main() {
  const evidence = {
    task: "T191",
    package: "@openai/codex",
    version: "0.146.0",
    topology: "managed child process over JSON-RPC stdio",
    volume: "nuvitae_codex_app_server_auth_state_t191",
    protocolBrowserLoginEvidence: {
      requestMethod: "account/login/start",
      requestParams: { type: "chatgpt" },
      responseShape: ["type", "loginId", "authUrl"],
      completionNotification: "account/login/completed",
      accountUpdatedNotification: "account/updated",
    },
    preservedDeviceCodeClassification: {
      repeatedDeviceCodeRetriesRequired: false,
      appServerDeviceCodeRejectedBeforeCodeIssuance: true,
      enabledDeviceCodeAuthorizationDidNotChangeDockerAppServerResult: true,
    },
    relaySecurityModel: {
      rawBidirectionalTcpOnly: true,
      httpAware: false,
      callbackPayloadLogged: false,
      callbackPayloadPersisted: false,
      authorizationCodeHandledByProbe: false,
      tokenHandledByProbe: false,
      dockerSocketMounted: false,
      hostHomeMounted: false,
      hostCodexStateMounted: false,
      postgresqlAccess: false,
      valkeyAccess: false,
    },
    steps: [],
    tokenBlindness: { rawCredentialExposedByRpc: false, rawCredentialExposedInEvidence: false },
    unverified: [],
  };

  await mkdir(codexState, { recursive: true });
  await execAs(0, 0, "chown", ["-R", "10001:10001", codexState]);
  await chmod(codexState, 0o700);
  evidence.permissionProbeBeforeLogin = await permissionProbe();

  const first = await startAndInit("pre-login", "0.1.0-t191-browser-prelogin");
  evidence.steps.push({ name: "initializeBeforeLogin", ok: true, resultKeys: Object.keys(first.init.result ?? {}) });
  const preAccount = await first.server.request("account/read", { refreshToken: false });
  const preAuthStatus = await first.server.request("getAuthStatus", { includeToken: false, refreshToken: false });
  if (containsCredential(preAccount) || containsCredential(preAuthStatus)) evidence.tokenBlindness.rawCredentialExposedByRpc = true;
  evidence.preLoginAccount = summarizeAccount(preAccount);
  evidence.preLoginAuthStatus = safeJson(preAuthStatus.result);
  await writeEvidence(evidence);

  const initial = await browserLogin(first.server, "initial", evidence);
  const postAccount = await first.server.request("account/read", { refreshToken: true });
  const postAuthStatus = await first.server.request("getAuthStatus", { includeToken: false, refreshToken: true });
  if (containsCredential(postAccount) || containsCredential(postAuthStatus)) evidence.tokenBlindness.rawCredentialExposedByRpc = true;
  evidence.postLoginAccount = summarizeAccount(postAccount);
  evidence.postLoginAuthStatus = safeJson(postAuthStatus.result);
  evidence.permissionProbeAfterLogin = await permissionProbe();
  await writeEvidence(evidence);
  if (!initial.completion?.params?.success || !evidence.initialLoginResult.accountUpdated?.authenticated || !evidence.postLoginAccount.authenticated) {
    throw new Error("Browser login did not produce completed, account/updated, and account/read authenticated state");
  }
  evidence.firstStop = await first.server.stop();

  const restarted = await startAndInit("restart-after-login", "0.1.0-t191-browser-restart");
  const restartAccount = await restarted.server.request("account/read", { refreshToken: true });
  evidence.restartAfterLoginAccount = summarizeAccount(restartAccount);
  evidence.permissionProbeAfterRestart = await permissionProbe();
  await writeEvidence(evidence);
  if (!evidence.restartAfterLoginAccount.authenticated) {
    throw new Error("Authenticated state did not survive runtime restart");
  }

  await pendingLoginCancellation(restarted.server, evidence);
  await writeEvidence(evidence);
  if (!evidence.cancellation.cancelStatus && !evidence.cancellation.canceledNotification) {
    throw new Error("Browser login cancellation was not verified");
  }
  if (!evidence.cancellation.preservedAuthenticatedProfile) {
    throw new Error("Cancellation did not preserve the authenticated account state");
  }

  const logout = await restarted.server.request("account/logout", undefined);
  evidence.logout = { responseKeys: Object.keys(logout.result ?? {}), succeeded: !logout.error, errorCode: logout.error?.code ?? null };
  evidence.afterLogoutAccount = summarizeAccount(await restarted.server.request("account/read", { refreshToken: false }));
  evidence.secondStop = await restarted.server.stop();
  if (!evidence.logout.succeeded || evidence.afterLogoutAccount.authenticated) {
    throw new Error("Authenticated logout did not produce unauthenticated account/read state");
  }

  const afterLogoutRestart = await startAndInit("restart-after-logout", "0.1.0-t191-browser-logout-restart");
  evidence.restartAfterLogoutAccount = summarizeAccount(await afterLogoutRestart.server.request("account/read", { refreshToken: false }));
  evidence.permissionProbeAfterLogout = await permissionProbe();
  await writeEvidence(evidence);
  if (evidence.restartAfterLogoutAccount.authenticated) {
    throw new Error("Authenticated state persisted after official logout and restart");
  }

  const final = await browserLogin(afterLogoutRestart.server, "final", evidence);
  evidence.finalAccount = summarizeAccount(await afterLogoutRestart.server.request("account/read", { refreshToken: true }));
  evidence.finalStop = await afterLogoutRestart.server.stop();
  await writeEvidence(evidence);
  if (!final.completion?.params?.success || !evidence.finalLoginResult.accountUpdated?.authenticated || !evidence.finalAccount.authenticated) {
    throw new Error("Final browser login did not produce authenticated account/read state");
  }

  evidence.unverified.push(
    "login timeout beyond normal completion window",
    "runtime crash during login",
    "revoked authentication",
    "expired authentication",
    "token refresh after natural expiry",
    "provider network failure",
    "rate limiting during authentication"
  );
  evidence.cleanupCommand = "docker volume rm nuvitae_codex_app_server_auth_state_t191";
  await writeEvidence(evidence);
}

main().catch(async (error) => {
  console.error(`T191 auth lifecycle failed: ${String(error?.message ?? error).split("\n")[0]}`);
  await writeEvidence({
    ...(currentEvidence ?? { task: "T191" }),
    terminalError: String(error.stack || error.message),
  });
  for (const server of activeServers) {
    try {
      server.child.kill("SIGKILL");
    } catch {
      // Best-effort cleanup; the container exits immediately after this block.
    }
  }
  process.exitCode = 1;
});
