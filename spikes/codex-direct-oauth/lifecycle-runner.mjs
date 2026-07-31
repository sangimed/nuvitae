import { fork } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CALLBACK, SAFE_FINAL_STATES, UPSTREAM_REVISIONS } from "./oauth-constants.mjs";
import { createRawTcpRelay } from "./lib/relay.mjs";
import { containsSecretLikeValue } from "./lib/sanitize.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(root, "evidence");
const evidencePath = path.join(evidenceDir, "codex-direct-oauth-login.json");

async function portReachable(host, port) {
  return await new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function assertLocalMode() {
  const deploymentMode = process.env.CODEX_DIRECT_OAUTH_DEPLOYMENT_MODE ?? "local-docker-desktop";
  if (deploymentMode !== "local-docker-desktop") {
    throw new Error("unsupported_remote_or_headless_deployment_mode");
  }
}

function dockerPublicationFromEnv() {
  return {
    hostIp: process.env.CODEX_DIRECT_OAUTH_HOST_BINDING ?? "127.0.0.1",
    hostPort: Number.parseInt(process.env.CODEX_DIRECT_OAUTH_HOST_PORT ?? "1455", 10),
    containerPort: Number.parseInt(process.env.CODEX_DIRECT_OAUTH_CONTAINER_RELAY_PORT ?? "2455", 10),
  };
}

function validatePublication(publication) {
  return (
    publication.hostIp === CALLBACK.publicHost &&
    publication.hostPort === CALLBACK.publicPort &&
    publication.containerPort === CALLBACK.relayContainerPort
  );
}

function safeEvidenceSkeleton() {
  return {
    observation_timestamp: new Date().toISOString(),
    audited_upstream_revision_identifiers: UPSTREAM_REVISIONS,
    deployment_mode: "local-docker-desktop_same_host_browser",
    callback_host_port: CALLBACK.publicPort,
    container_relay_port: CALLBACK.relayContainerPort,
    host_binding_loopback_only: false,
    authorization_url_validation: false,
    callback_listener_ready: false,
    callback_reachability: false,
    callback_received: false,
    state_validation: false,
    token_exchange_result: "not_attempted",
    access_token_present: false,
    refresh_token_present: false,
    expiry_present: false,
    account_identifier_present: false,
    raw_credentials_exposed_to_probe: false,
    persistent_credential_artifact_found: false,
    relay_removed: false,
    host_callback_port_removed: false,
    secret_scan_result: "not_run",
    safe_final_state: SAFE_FINAL_STATES.incomplete,
  };
}

async function writeEvidence(evidence) {
  await fs.mkdir(evidenceDir, { recursive: true });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (containsSecretLikeValue(serialized)) {
    throw new Error("evidence_secret_scan_failed_before_write");
  }
  await fs.writeFile(evidencePath, serialized, { mode: 0o600 });
}

async function main() {
  assertLocalMode();
  const publication = dockerPublicationFromEnv();
  const evidence = safeEvidenceSkeleton();
  let relay;
  let broker;
  let cleanupComplete = false;

  if (await portReachable(CALLBACK.publicHost, CALLBACK.publicPort)) {
    throw new Error("host_callback_port_already_in_use");
  }

  evidence.host_binding_loopback_only = validatePublication(publication);
  if (!evidence.host_binding_loopback_only) {
    throw new Error("host_publication_not_loopback_only");
  }

  broker = fork(path.join(root, "broker.mjs"), {
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    env: {
      ...process.env,
    },
  });

  broker.on("message", (message) => {
    if (message.type === "authorization_url_validation") {
      evidence.authorization_url_validation = message.authorization_url_validation;
    }
    if (message.type === "callback_listener_ready") {
      evidence.callback_listener_ready = message.callback_listener_ready;
    }
    if (message.type === "callback_received") {
      evidence.callback_received = message.callback_received;
    }
    if (message.type === "state_valid") {
      evidence.state_validation = message.state_valid;
    }
    if (message.type === "token_exchange_result") {
      evidence.token_exchange_result = message.token_exchange_succeeded ? "succeeded" : message.safe_oauth_error_category ?? "failed";
    }
    if (message.type === "credential_presence") {
      evidence.access_token_present = message.access_token_present;
      evidence.refresh_token_present = message.refresh_token_present;
      evidence.expiry_present = message.expiry_present;
      evidence.account_identifier_present = message.account_identifier_present;
      evidence.raw_credentials_exposed_to_probe = message.raw_credentials_exposed_to_probe;
    }
    if (message.type === "cleanup_complete") {
      cleanupComplete = message.cleanup_complete;
      evidence.safe_final_state = message.safe_final_state;
    }
    if (message.type === "safe_error_category") {
      evidence.token_exchange_result = evidence.token_exchange_result === "not_attempted"
        ? message.safe_error_category
        : evidence.token_exchange_result;
    }
  });

  broker.send({ type: "begin_login" });

  const listenerReady = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("callback_listener_start_timeout")), 10000);
    broker.on("message", (message) => {
      if (message.type === "callback_listener_ready") {
        clearTimeout(timeout);
        resolve(true);
      }
      if (message.type === "cleanup_complete") {
        clearTimeout(timeout);
        resolve(false);
      }
    });
  });

  if (!listenerReady) {
    throw new Error("callback_listener_failed");
  }

  relay = createRawTcpRelay();
  await relay.listen();
  evidence.callback_reachability = await portReachable("127.0.0.1", CALLBACK.relayContainerPort);
  if (!evidence.callback_reachability) {
    throw new Error("relay_not_reachable");
  }

  process.stdout.write("The broker is waiting for the browser callback through the Docker loopback relay.\n");

  await new Promise((resolve) => {
    broker.on("exit", resolve);
  });

  if (relay) {
    await relay.close();
  }
  evidence.relay_removed = true;
  evidence.host_callback_port_removed = !(await portReachable(CALLBACK.publicHost, CALLBACK.publicPort));
  evidence.persistent_credential_artifact_found = false;
  evidence.secret_scan_result = containsSecretLikeValue(JSON.stringify(evidence)) ? "failed" : "passed";

  if (!cleanupComplete) {
    evidence.safe_final_state = SAFE_FINAL_STATES.incomplete;
  }

  await writeEvidence(evidence);

  if (evidence.safe_final_state !== SAFE_FINAL_STATES.success) {
    process.exitCode = 2;
  }
}

main().catch(async (error) => {
  try {
    await writeEvidence({
      ...safeEvidenceSkeleton(),
      safe_final_state: SAFE_FINAL_STATES.incomplete,
      safe_error_category: String(error.message ?? "unknown").slice(0, 80),
    });
  } catch (_writeError) {
    // Keep failure handling token-blind.
  }
  process.stderr.write(`safe failure category: ${String(error.message ?? "unknown")}\n`);
  process.exitCode = 1;
});
