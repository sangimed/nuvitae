import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const evidencePath = "/evidence/auth-lifecycle.json";
const codexState = "/codex-state";
const redacted = "[REDACTED]";
const timeoutMs = 360_000;
const activeServers = new Set();
let currentEvidence = null;

function redact(value) {
  return JSON.stringify(value ?? null)
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, redacted)
    .replace(/eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g, redacted)
    .replace(/([?&](code|device_code|user_code|access_token|refresh_token|id_token)=)[^"&\s]+/gi, `$1${redacted}`)
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

function summarizeAccount(response) {
  const account = response.result?.account ?? null;
  return {
    authenticated: Boolean(account),
    accountType: account?.type ?? null,
    planType: account?.planType ?? null,
    requiresOpenaiAuth: response.result?.requiresOpenaiAuth ?? null,
    emailExposedByProtocol: Boolean(account?.email),
  };
}

function containsCredential(value) {
  const text = JSON.stringify(value);
  return /access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{20,}/i.test(text);
}

function loginStartContainsRawToken(value) {
  const text = JSON.stringify(value);
  return /"accessToken"\s*:|"refreshToken"\s*:|"idToken"\s*:|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{20,}/i.test(text);
}

function categorizeDeviceCodeError(message) {
  const text = String(message ?? "").toLowerCase();
  if (!text) return null;
  if (text.includes("device") && (text.includes("enable") || text.includes("disabled"))) {
    return "device_code_authorization_disabled_or_not_enabled";
  }
  if (text.includes("workspace") || text.includes("organization") || text.includes("org")) {
    return "account_or_workspace_policy";
  }
  if (text.includes("network") || text.includes("dns") || text.includes("connect")) {
    return "provider_network_error";
  }
  if (text.includes("rate") || text.includes("limit")) {
    return "provider_rate_limited";
  }
  return "device_code_login_internal_error";
}

async function waitForLogin(server, loginId) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
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

async function interactiveLogin(server, label) {
  const login = await startDeviceCodeLogin(server);
  const result = login.result;
  if (loginStartContainsRawToken(login)) throw new Error(`${label} login start exposed raw token data`);
  if (result?.type !== "chatgptDeviceCode") {
    return {
      supported: false,
      loginMechanism: result?.type ?? null,
      safeErrorCategory: login.error ? "device_code_login_request_rejected" : "device_code_request_returned_non_device_code_flow",
      errorCode: login.error?.code ?? null,
      errorMessageCategory: categorizeDeviceCodeError(login.error?.message),
      responseShape: Object.keys(result ?? login.error ?? {}),
    };
  }
  const notificationStart = server.notifications.length;
  console.error(`\nT191 ${label}: complete official OpenAI device-code login.`);
  console.error(`Verification URL: ${result.verificationUrl}`);
  console.error(`User code: ${result.userCode}`);
  console.error("Waiting for app-server completion notification...\n");
  const completion = await waitForLogin(server, result.loginId);
  const accountUpdated = await waitForAccountUpdated(server, notificationStart);
  return {
    supported: true,
    loginMechanism: "chatgptDeviceCode",
    loginIdHash: createHash("sha256").update(result.loginId).digest("hex").slice(0, 16),
    loginStartShape: ["type", "loginId", "verificationUrl", "userCode"],
    verificationUrlExposedLiveOnly: Boolean(result.verificationUrl),
    userCodeExposedLiveOnly: Boolean(result.userCode),
    completion: completion ? {
      success: Boolean(completion.params?.success),
      errorCategory: completion.params?.error ? "login_completed_error" : null,
      loginIdMatched: completion.params?.loginId === result.loginId,
    } : null,
    accountUpdated: accountUpdated ? safeJson(accountUpdated.params) : null,
  };
}

async function startDeviceCodeLogin(server) {
  return server.request("account/login/start", { type: "chatgptDeviceCode" });
}

async function startAndInit(label, version) {
  const server = startServer(label);
  const init = await initialize(server, version);
  return { server, init };
}

async function main() {
  const evidence = {
    task: "T191",
    package: "@openai/codex",
    version: "0.146.0",
    topology: "managed child process over stdio",
    volume: "nuvitae_codex_app_server_auth_state_t191",
    protocolDeviceCodeEvidence: {
      requestMethod: "account/login/start",
      requestParams: { type: "chatgptDeviceCode" },
      responseShape: ["type", "loginId", "verificationUrl", "userCode"],
      completionNotification: "account/login/completed",
      accountUpdatedNotification: "account/updated",
    },
    previousBrowserFlowEvidence: {
      classification: "experimentally unsuccessful in selected Docker topology",
      likelyRootCause: "browser OAuth callback targeted host localhost while callback listener was container-local",
      selectedForSelfHostedCandidate: false,
      replacedBy: "official generated-protocol chatgptDeviceCode flow",
    },
    steps: [],
    tokenBlindness: { rawCredentialExposedByRpc: false },
    unverified: [],
  };

  await mkdir(codexState, { recursive: true });
  await execAs(0, 0, "chown", ["-R", "10001:10001", codexState]);
  await chmod(codexState, 0o700);
  evidence.permissionProbeBeforeLogin = await permissionProbe();

  let first = await startAndInit("pre-login", "0.1.0-t191-auth-prelogin");
  evidence.steps.push({ name: "initializeBeforeLogin", ok: true, resultKeys: Object.keys(first.init.result ?? {}) });
  const preAccount = await first.server.request("account/read", { refreshToken: false });
  const preAuthStatus = await first.server.request("getAuthStatus", { includeToken: false, refreshToken: false });
  if (containsCredential(preAccount) || containsCredential(preAuthStatus)) evidence.tokenBlindness.rawCredentialExposedByRpc = true;
  evidence.preLoginAccount = summarizeAccount(preAccount);
  evidence.preLoginAuthStatus = safeJson(preAuthStatus.result);
  await writeEvidence(evidence);

  evidence.initialLogin = await interactiveLogin(first.server, "initial login");
  await writeEvidence(evidence);
  if (!evidence.initialLogin.supported) throw new Error(`Device-code login unavailable: ${evidence.initialLogin.safeErrorCategory}`);
  const postAccount = await first.server.request("account/read", { refreshToken: true });
  const postAuthStatus = await first.server.request("getAuthStatus", { includeToken: false, refreshToken: true });
  if (containsCredential(postAccount) || containsCredential(postAuthStatus)) evidence.tokenBlindness.rawCredentialExposedByRpc = true;
  evidence.postLoginAccount = summarizeAccount(postAccount);
  evidence.postLoginAuthStatus = safeJson(postAuthStatus.result);
  evidence.permissionProbeAfterLogin = await permissionProbe();
  await writeEvidence(evidence);
  if (!evidence.initialLogin.completion?.success || !evidence.postLoginAccount.authenticated) {
    throw new Error("Device-code login did not produce authenticated account/read state");
  }
  evidence.firstStop = await first.server.stop();

  let restarted = await startAndInit("restart-after-login", "0.1.0-t191-auth-restart");
  const restartAccount = await restarted.server.request("account/read", { refreshToken: true });
  evidence.restartAfterLoginAccount = summarizeAccount(restartAccount);
  await writeEvidence(evidence);
  if (!evidence.restartAfterLoginAccount.authenticated) {
    throw new Error("Authenticated state did not survive runtime restart");
  }

  const cancelStart = await startDeviceCodeLogin(restarted.server);
  if (cancelStart.result?.loginId) {
    const cancelResult = await restarted.server.request("account/login/cancel", { loginId: cancelStart.result.loginId });
    evidence.cancellation = {
      startShape: Object.keys(cancelStart.result ?? {}),
      cancelStatus: cancelResult.result?.status ?? null,
      preservedAuthenticatedProfile: summarizeAccount(await restarted.server.request("account/read", { refreshToken: false })).authenticated,
    };
  } else {
    evidence.cancellation = {
      supported: false,
      startErrorCode: cancelStart.error?.code ?? null,
      preservedAuthenticatedProfile: summarizeAccount(await restarted.server.request("account/read", { refreshToken: false })).authenticated,
    };
  }
  await writeEvidence(evidence);

  const malformed = await restarted.server.request("account/login/start", { type: "chatgptAuthTokens" });
  evidence.malformedLoginRequest = {
    rejected: Boolean(malformed.error),
    errorCode: malformed.error?.code ?? null,
  };

  const duplicateA = await startDeviceCodeLogin(restarted.server);
  const duplicateB = await startDeviceCodeLogin(restarted.server);
  const duplicateCancelA = duplicateA.result?.loginId
    ? await restarted.server.request("account/login/cancel", { loginId: duplicateA.result.loginId })
    : null;
  const duplicateCancelB = duplicateB.result?.loginId
    ? await restarted.server.request("account/login/cancel", { loginId: duplicateB.result.loginId })
    : null;
  evidence.duplicateLoginAttempt = {
    firstStartReturnedLoginId: Boolean(duplicateA.result?.loginId),
    secondStartReturnedLoginId: Boolean(duplicateB.result?.loginId),
    firstCancelStatus: duplicateCancelA?.result?.status ?? null,
    secondCancelStatus: duplicateCancelB?.result?.status ?? null,
    firstErrorCode: duplicateA.error?.code ?? null,
    secondErrorCode: duplicateB.error?.code ?? null,
  };

  const logout = await restarted.server.request("account/logout", undefined);
  evidence.logout = { responseKeys: Object.keys(logout.result ?? {}), succeeded: !logout.error };
  evidence.afterLogoutAccount = summarizeAccount(await restarted.server.request("account/read", { refreshToken: false }));
  evidence.secondStop = await restarted.server.stop();

  let afterLogoutRestart = await startAndInit("restart-after-logout", "0.1.0-t191-auth-logout-restart");
  evidence.restartAfterLogoutAccount = summarizeAccount(await afterLogoutRestart.server.request("account/read", { refreshToken: false }));
  evidence.permissionProbeAfterLogout = await permissionProbe();
  if (evidence.restartAfterLogoutAccount.authenticated) {
    throw new Error("Authenticated state persisted after official logout and restart");
  }

  evidence.finalLogin = await interactiveLogin(afterLogoutRestart.server, "final login for T192 volume reuse");
  await writeEvidence(evidence);
  if (!evidence.finalLogin.supported) throw new Error(`Final device-code login unavailable: ${evidence.finalLogin.safeErrorCategory}`);
  evidence.finalAccount = summarizeAccount(await afterLogoutRestart.server.request("account/read", { refreshToken: true }));
  evidence.finalStop = await afterLogoutRestart.server.stop();
  if (!evidence.finalLogin.completion?.success || !evidence.finalAccount.authenticated) {
    throw new Error("Final device-code login did not produce authenticated account/read state");
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
