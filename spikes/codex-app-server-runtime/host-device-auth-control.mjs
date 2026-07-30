import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const evidencePath = "spikes/codex-app-server-runtime/evidence/auth-host-control.json";
const redacted = "[REDACTED]";

function redactText(value) {
  return String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, redacted)
    .replace(/eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g, redacted)
    .replace(/([?&](code|device_code|user_code|access_token|refresh_token|id_token|state|code_challenge)=)[^"&\s]+/gi, `$1${redacted}`)
    .replace(/[A-Z0-9]{4}-[A-Z0-9]{4}/g, redacted)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
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
  if (lower.includes("error sending request")) categories.add("request_send_failure");
  return [...categories];
}

async function run(command, args, env) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  return { exit, stdout, stderr };
}

async function main() {
  const version = await run("codex", ["--version"], process.env);
  const versionText = `${version.stdout}${version.stderr}`;
  const exactVersion = versionText.includes("codex-cli 0.146.0");
  const evidence = {
    task: "T191",
    diagnostic: "isolated-host-control",
    hostCodexVersionExact: exactVersion,
    hostCodexVersionSafe: exactVersion ? "codex-cli 0.146.0" : "not-0.146.0-or-unavailable",
    tempCodexHomeUsed: true,
    normalHostCodexHomeUsed: false,
    credentialFilesInspected: false,
    credentialFilesCopied: false,
  };

  if (!exactVersion) {
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    return;
  }

  const tempHome = await mkdtemp(join(tmpdir(), "nuvitae-t191-host-codex-"));
  try {
    const env = {
      ...process.env,
      HOME: tempHome,
      CODEX_HOME: tempHome,
      NO_COLOR: "1",
    };
    const child = spawn("codex", ["login", "--device-auth"], { stdio: ["ignore", "pipe", "pipe"], env });
    let outputSummary = "";
    let issuedVerificationUrl = false;
    let issuedUserCode = false;
    const observe = (chunk) => {
      const text = chunk.toString("utf8");
      process.stderr.write(text);
      outputSummary += redactText(text).slice(0, 4000);
      if (/https:\/\/(auth\.openai\.com\/activate|openai\.com\/device|login\.openai\.com)/i.test(text)) issuedVerificationUrl = true;
      if (/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.test(text)) issuedUserCode = true;
    };
    child.stdout.on("data", observe);
    child.stderr.on("data", observe);
    const exit = await new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
    evidence.issuedVerificationUrl = issuedVerificationUrl;
    evidence.issuedUserCode = issuedUserCode;
    evidence.completed = exit.code === 0;
    evidence.exit = exit;
    evidence.safeOutputCategories = categorizeText(outputSummary);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
    evidence.tempCodexHomeRemoved = true;
  }

  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch(async (error) => {
  await writeFile(evidencePath, `${JSON.stringify({
    task: "T191",
    diagnostic: "isolated-host-control",
    terminalError: redactText(error.stack || error.message),
  }, null, 2)}\n`);
  process.exitCode = 1;
});
