import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALLBACK, OAUTH } from "./oauth-constants.mjs";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(root, "evidence");
const evidencePath = path.join(evidenceDir, "codex-direct-oauth-preflight.json");
const projectName = "nuvitae-codex-direct-oauth-preflight";

function safeResultSkeleton() {
  return {
    observation_timestamp: new Date().toISOString(),
    localhost_address_families: "unknown",
    redirect_metadata: classifyRedirectUri(OAUTH.redirectUri),
    ipv4_preflight_result: "not_run",
    ipv6_preflight_result: "not_run",
    docker_ipv6_loopback_publication: "not_run",
    selected_redirect_hostname: "localhost",
    selected_host_bindings: ["127.0.0.1:1455"],
    no_wildcard_host_binding: false,
    preflight_port_absent_after_cleanup: false,
  };
}

function classifyLoopbackHostname(hostname) {
  if (hostname === "localhost") return "localhost";
  if (hostname === "127.0.0.1") return "ipv4_loopback";
  if (hostname === "::1" || hostname === "[::1]") return "ipv6_loopback";
  return "not_loopback";
}

function classifyRedirectUri(uri) {
  const url = new URL(uri);
  return {
    scheme: url.protocol.replace(":", ""),
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    hostname_classification: classifyLoopbackHostname(url.hostname),
  };
}

async function localhostAddressFamilies() {
  const records = await dns.lookup("localhost", { all: true }).catch(() => []);
  const has4 = records.some((record) => record.address === "127.0.0.1" || record.family === 4);
  const has6 = records.some((record) => record.address === "::1" || record.family === 6);
  if (has4 && has6) return "both";
  if (has4) return "ipv4_only";
  if (has6) return "ipv6_only";
  return "none";
}

function compose(args, { env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "-p", projectName, "-f", "compose.yml", ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function requestLoopback(host) {
  return await new Promise((resolve) => {
    const request = http.request(
      {
        host,
        port: CALLBACK.publicPort,
        path: "/preflight",
        method: "GET",
        timeout: 1000,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode === 204));
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
    request.end();
  });
}

async function portReachable(host) {
  return await new Promise((resolve) => {
    const socket = net.connect({ host, port: CALLBACK.publicPort });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function runPreflightService(service, env = {}) {
  const up = await compose(["up", "--build", "-d", service], { env });
  if (up.code !== 0) {
    return { started: false, safeCategory: "docker_publication_rejected" };
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const reachable = await requestLoopback("127.0.0.1");
    if (reachable) {
      return { started: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return { started: true, safeCategory: "synthetic_listener_not_reachable" };
}

async function cleanupCompose() {
  await compose(["down", "--remove-orphans", "--volumes"]);
}

async function writeEvidence(evidence) {
  await fs.mkdir(evidenceDir, { recursive: true });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (containsSecretLikeValue(serialized)) {
    throw new Error("preflight_evidence_secret_scan_failed");
  }
  await fs.writeFile(evidencePath, serialized, { mode: 0o600 });
}

async function main() {
  const evidence = safeResultSkeleton();
  evidence.localhost_address_families = await localhostAddressFamilies();

  await cleanupCompose();
  const ipv4 = await runPreflightService("preflight-ipv4");
  evidence.ipv4_preflight_result = ipv4.started && await requestLoopback("127.0.0.1")
    ? "success"
    : ipv4.safeCategory ?? "safe_failure";
  await cleanupCompose();

  const ipv6 = await runPreflightService("preflight-dual");
  if (!ipv6.started) {
    evidence.docker_ipv6_loopback_publication = "ipv6_loopback_publication_unsupported";
    evidence.ipv6_preflight_result = "not_run_publication_unsupported";
    evidence.selected_redirect_hostname = OAUTH.allowedRedirectHosts.includes("127.0.0.1")
      ? "127.0.0.1"
      : "unverified";
    evidence.selected_host_bindings = ["127.0.0.1:1455"];
  } else {
    evidence.docker_ipv6_loopback_publication = "accepted";
    evidence.ipv6_preflight_result = await requestLoopback("::1") ? "success" : "safe_failure";
    evidence.selected_redirect_hostname = "localhost";
    evidence.selected_host_bindings = ["127.0.0.1:1455", "[::1]:1455"];
  }
  await cleanupCompose();

  evidence.preflight_port_absent_after_cleanup =
    !(await portReachable("127.0.0.1")) && !(await portReachable("::1"));
  evidence.no_wildcard_host_binding = evidence.selected_host_bindings.every(
    (binding) => !binding.startsWith("0.0.0.0:") && !binding.startsWith("[::]:"),
  );

  await writeEvidence(evidence);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

  if (evidence.ipv4_preflight_result !== "success" || !evidence.preflight_port_absent_after_cleanup) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const evidence = {
    ...safeResultSkeleton(),
    safe_failure_category: String(error.message ?? "unknown").slice(0, 80),
  };
  await cleanupCompose();
  await writeEvidence(evidence).catch(() => undefined);
  process.stderr.write(`safe preflight failure category: ${evidence.safe_failure_category}\n`);
  process.exitCode = 1;
});
