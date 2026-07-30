import { spawn } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const evidencePath = "/evidence/auth-diagnostic.json";
const codexState = "/codex-state";
const redacted = "[REDACTED]";
const activeChildren = new Set();
let evidence = null;

function redactText(value) {
  return String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, redacted)
    .replace(/eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g, redacted)
    .replace(/([?&](code|device_code|user_code|access_token|refresh_token|id_token|state|code_challenge)=)[^"&\s]+/gi, `$1${redacted}`)
    .replace(/[A-Z0-9]{4}-[A-Z0-9]{4}/g, redacted)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
}

function safeJson(value) {
  return JSON.parse(redactText(JSON.stringify(value)));
}

async function writeEvidence() {
  await writeFile(evidencePath, `${JSON.stringify(safeJson(evidence), null, 2)}\n`);
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

function runAs(uid, gid, command, args, options = {}) {
  const child = spawn("setpriv", [
    `--reuid=${uid}`,
    `--regid=${gid}`,
    "--clear-groups",
    command,
    ...args,
  ], options);
  activeChildren.add(child);
  child.on("exit", () => activeChildren.delete(child));
  return child;
}

async function execAs(uid, gid, command, args) {
  const child = runAs(uid, gid, command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  return { ...exit, stdout: stdout.slice(0, 2000), stderr: stderr.slice(0, 2000) };
}

async function permissionProbe() {
  await mkdir(codexState, { recursive: true });
  await writeFile(`${codexState}/nuvitae-sentinel`, "synthetic sentinel\n", { mode: 0o600 });
  await chmod(codexState, 0o700);
  const checks = {
    listStateDir: await execAs(10002, 10002, "ls", ["-la", codexState]),
    readKnownSentinel: await execAs(10002, 10002, "cat", [`${codexState}/nuvitae-sentinel`]),
    copyKnownSentinel: await execAs(10002, 10002, "cp", [`${codexState}/nuvitae-sentinel`, "/runtime-tmp/copied-sentinel"]),
    modifyKnownSentinel: await execAs(10002, 10002, "sh", ["-c", `printf probe >> ${codexState}/nuvitae-sentinel`]),
  };
  return Object.fromEntries(Object.entries(checks).map(([name, result]) => [
    name,
    { code: result.code, signal: result.signal, denied: result.code !== 0 },
  ]));
}

function categorizeText(text) {
  const lower = String(text ?? "").toLowerCase();
  const categories = new Set();
  if (/https:\/\/[^/\s"']+\/[^\s"']*/i.test(text)) categories.add("endpoint_mentioned");
  if (lower.includes("dns") || lower.includes("resolve") || lower.includes("name resolution")) categories.add("dns_resolution_failure");
  if (lower.includes("connection refused") || lower.includes("connection reset") || lower.includes("tcp")) categories.add("tcp_connection_failure");
  if (lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) categories.add("tls_or_certificate_failure");
  if (lower.includes("timeout") || lower.includes("timed out")) categories.add("timeout");
  if (lower.includes("proxy")) categories.add("proxy_failure_or_proxy_reference");
  if (lower.includes("404") || lower.includes("not found")) categories.add("not_found");
  if (lower.includes("403") || lower.includes("permission") || lower.includes("forbidden") || lower.includes("unauthorized")) categories.add("permission_denied_or_unauthorized");
  if (lower.includes("device") && (lower.includes("enable") || lower.includes("disabled"))) categories.add("device_code_authorization_disabled_or_not_enabled");
  if (lower.includes("workspace") || lower.includes("organization") || lower.includes("org")) categories.add("account_or_workspace_policy");
  if (lower.includes("internal error") || lower.includes("-32603")) categories.add("internal_error");
  return [...categories];
}

function safeEndpoints(text) {
  const endpoints = new Set();
  for (const match of String(text ?? "").matchAll(/https:\/\/([^/\s"']+)(\/[^?\s"']*)?/gi)) {
    endpoints.add(`https://${match[1]}${match[2] ?? "/"}`);
  }
  return [...endpoints].slice(0, 10);
}

function httpsProbe(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = httpsRequest(url, { method: "GET", timeout: 15_000 }, (res) => {
      res.resume();
      res.on("end", () => resolve({
        endpoint: "https://auth.openai.com/api/accounts/deviceauth/usercode",
        reachedEndpoint: true,
        statusCategory: `${Math.floor((res.statusCode ?? 0) / 100)}xx`,
        elapsedMs: Date.now() - started,
      }));
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => resolve({
      endpoint: "https://auth.openai.com/api/accounts/deviceauth/usercode",
      reachedEndpoint: false,
      safeErrorCategories: categorizeText(error.message),
      elapsedMs: Date.now() - started,
    }));
    req.end();
  });
}

function containsCredential(value) {
  return /access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{20,}/i.test(JSON.stringify(value));
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

function startServer(label, extraEnv = {}) {
  const stderrChunks = [];
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
      ...extraEnv,
    },
  });
  const responses = new Map();
  const notifications = [];
  child.stdout.on("data", makeParser((message) => {
    if (Object.hasOwn(message, "id")) responses.set(message.id, message);
    else notifications.push(message);
  }));
  child.stderr.on("data", (chunk) => stderrChunks.push(redactText(chunk.toString("utf8")).slice(0, 2000)));
  let nextId = 1;
  const request = async (method, params, timeoutMs = 30_000) => {
    const id = nextId++;
    child.stdin.write(frame({ jsonrpc: "2.0", id, method, params }));
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (responses.has(id)) return responses.get(id);
      await delay(50);
    }
    throw new Error(`Timed out waiting for ${method} during ${label}`);
  };
  const notify = (method, params) => child.stdin.write(frame({ jsonrpc: "2.0", method, params }));
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
  return { request, notify, stop, notifications, stderrChunks };
}

async function initialize(server, version) {
  const response = await server.request("initialize", {
    clientInfo: { name: "nuvitae", title: "Nuvitae", version },
    capabilities: {},
  });
  server.notify("initialized", {});
  return response;
}

async function appServerDeviceDiagnostic() {
  const server = startServer("device-code-diagnostic", {
    RUST_LOG: "codex_app_server=debug,codex_login=debug,codex_core=info,reqwest=info",
  });
  const initializeResponse = await initialize(server, "0.1.0-t191-device-diagnostic");
  const preAccount = await server.request("account/read", { refreshToken: false });
  const login = await server.request("account/login/start", { type: "chatgptDeviceCode" });
  const stderrText = server.stderrChunks.join("\n");
  const stopped = await server.stop();
  return {
    initializeResultKeys: Object.keys(initializeResponse.result ?? {}),
    preLoginAccount: summarizeAccount(preAccount),
    request: { method: "account/login/start", params: { type: "chatgptDeviceCode" } },
    response: login.result ? {
      resultType: login.result.type ?? null,
      responseShape: Object.keys(login.result),
      issuedVerificationUrl: Boolean(login.result.verificationUrl),
      issuedUserCode: Boolean(login.result.userCode),
    } : {
      errorCode: login.error?.code ?? null,
      responseShape: Object.keys(login.error ?? {}),
      safeErrorCategories: categorizeText(login.error?.message),
    },
    stderrCategories: categorizeText(stderrText),
    endpointPaths: safeEndpoints(stderrText),
    rawCredentialExposedByRpc: containsCredential(preAccount) || containsCredential(login),
    stopped,
  };
}

async function cliDeviceAuth() {
  const child = runAs(10001, 10001, "codex", ["login", "--device-auth"], {
    stdio: ["ignore", "pipe", "pipe"],
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
  let issuedUrl = false;
  let issuedCode = false;
  let outputSummary = "";
  const observe = (chunk) => {
    const text = chunk.toString("utf8");
    process.stderr.write(text);
    outputSummary += redactText(text).slice(0, 4000);
    if (/https:\/\/(auth\.openai\.com\/activate|openai\.com\/device|login\.openai\.com)/i.test(text)) issuedUrl = true;
    if (/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.test(text)) issuedCode = true;
  };
  child.stdout.on("data", observe);
  child.stderr.on("data", observe);
  const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  return {
    issuedVerificationUrl: issuedUrl,
    issuedUserCode: issuedCode,
    completed: exit.code === 0,
    exit,
    safeOutputCategories: categorizeText(outputSummary),
    safeEndpointPaths: safeEndpoints(outputSummary),
  };
}

async function appServerAccountRead(label) {
  const server = startServer(label);
  await initialize(server, `0.1.0-t191-${label}`);
  const account = await server.request("account/read", { refreshToken: true });
  const stopped = await server.stop();
  return {
    account: summarizeAccount(account),
    rawCredentialExposedByRpc: containsCredential(account),
    stopped,
  };
}

async function main() {
  evidence = {
    task: "T191",
    diagnostic: "device-code-root-cause",
    package: "@openai/codex",
    version: "0.146.0",
    baseImage: "node:24.15.0-bookworm-slim",
    topology: "managed child process over stdio",
    volume: "nuvitae_codex_app_server_auth_state_t191",
    existingFailuresPreserved: {
      browserFlow: "experimentally unsuccessful in selected Docker topology",
      appServerDeviceCodeRpc: {
        request: { method: "account/login/start", params: { type: "chatgptDeviceCode" } },
        errorCode: -32603,
        safeCategory: "device_code_login_request_rejected",
        normalizedCategory: "device_code_login_internal_error",
      },
    },
  };
  await mkdir(codexState, { recursive: true });
  await execAs(0, 0, "chown", ["-R", "10001:10001", codexState]);
  await chmod(codexState, 0o700);
  evidence.permissionProbeBeforeDiagnostics = await permissionProbe();
  evidence.sameContainerHttpsProbe = await httpsProbe("https://auth.openai.com/api/accounts/deviceauth/usercode");
  await writeEvidence();

  evidence.appServerDeviceDiagnostic = await appServerDeviceDiagnostic();
  await writeEvidence();

  evidence.pinnedDockerCliDeviceAuth = await cliDeviceAuth();
  evidence.permissionProbeAfterCli = await permissionProbe();
  await writeEvidence();

  if (evidence.pinnedDockerCliDeviceAuth.completed) {
    evidence.sameVolumeAppServerAccountRead = await appServerAccountRead("same-volume-cli-auth");
    evidence.sameVolumeAppServerRestartAccountRead = await appServerAccountRead("same-volume-cli-auth-restart");
    evidence.permissionProbeAfterSameVolumeAppServer = await permissionProbe();
    evidence.diagnosticCase = evidence.sameVolumeAppServerAccountRead.account.authenticated
      ? "CASE_1_PINNED_CLI_SUCCEEDS_APP_SERVER_LOGIN_RPC_FAILS"
      : "PINNED_CLI_SUCCEEDED_APP_SERVER_DID_NOT_RECOGNIZE_SAME_VOLUME_AUTH";
  } else {
    evidence.sameVolumeAppServerAccountRead = { skipped: "pinned Docker CLI device login did not complete" };
    evidence.diagnosticCase = "PINNED_CLI_AND_APP_SERVER_DEVICE_CODE_START_FAILED_IN_DOCKER";
  }
  evidence.cleanupCommand = "docker volume rm nuvitae_codex_app_server_auth_state_t191";
  await writeEvidence();
}

main().catch(async (error) => {
  evidence = {
    ...(evidence ?? { task: "T191", diagnostic: "device-code-root-cause" }),
    terminalError: redactText(error.stack || error.message),
  };
  await writeEvidence();
  for (const child of activeChildren) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Best effort cleanup during container exit.
    }
  }
  process.exitCode = 1;
});
