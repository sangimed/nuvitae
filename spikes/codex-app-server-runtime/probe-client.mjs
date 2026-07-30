import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const mode = process.argv[2] ?? "stdio";
const evidencePath = process.argv[3] ?? "/evidence/probe-result.json";
const socketPath = process.env.CODEX_SOCKET_PATH ?? "/socket/codex-app-server.sock";

const redactions = [
  process.env.HOST_SENTINEL_ENV,
  process.env.HOME,
  process.env.CODEX_HOME,
  process.env.NUVITAE_PRIVATE_STORAGE_SENTINEL,
].filter(Boolean);

function redact(value) {
  let output = String(value ?? "");
  for (const secret of redactions) {
    output = output.split(secret).join("[REDACTED]");
  }
  return output.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]");
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
      if (newline !== -1) {
        const body = buffer.subarray(0, newline).toString("utf8").trim();
        buffer = buffer.subarray(newline + 1);
        if (body) onMessage(JSON.parse(body));
        continue;
      }
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const match = /^Content-Length: (\d+)$/im.exec(header);
      if (!match) throw new Error(`Missing Content-Length header: ${header}`);
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;
      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);
      onMessage(JSON.parse(body));
    }
  };
}

async function writeJson(path, value) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createTransport() {
  if (mode === "socket") {
    const socket = createConnection(socketPath);
    return {
      label: `unix://${socketPath}`,
      input: socket,
      output: socket,
      kill: () => socket.destroy(),
      wait: new Promise((resolve) => socket.on("close", () => resolve({ code: null, signal: "socket-close" }))),
      ready: new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      }),
      stderrChunks: [],
      process: null,
    };
  }

  if (mode === "socket-proxy") {
    const proxy = spawn("codex", ["app-server", "proxy", "--sock", socketPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        HOME: process.env.HOME,
        CODEX_HOME: process.env.CODEX_HOME,
        TMPDIR: process.env.TMPDIR,
        NUVITAE_SPIKE: process.env.NUVITAE_SPIKE,
        NO_COLOR: "1",
        PATH: process.env.PATH,
      },
    });
    const stderrChunks = [];
    proxy.stderr.on("data", (chunk) => stderrChunks.push(redact(chunk.toString("utf8"))));
    return {
      label: `unix-proxy://${socketPath}`,
      input: proxy.stdin,
      output: proxy.stdout,
      kill: (signal = "SIGTERM") => proxy.kill(signal),
      wait: new Promise((resolve) => proxy.on("exit", (code, signal) => resolve({ code, signal }))),
      ready: Promise.resolve(),
      stderrChunks,
      process: proxy,
    };
  }

  const child = spawn("codex", ["app-server", "--stdio", "--strict-config"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      HOME: process.env.HOME,
      CODEX_HOME: process.env.CODEX_HOME,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      TMPDIR: process.env.TMPDIR,
      NUVITAE_SPIKE: process.env.NUVITAE_SPIKE,
      NO_COLOR: "1",
      PATH: process.env.PATH,
    },
  });
  const stderrChunks = [];
  child.stderr.on("data", (chunk) => stderrChunks.push(redact(chunk.toString("utf8"))));
  return {
    label: "stdio",
    input: child.stdin,
    output: child.stdout,
    kill: (signal = "SIGTERM") => child.kill(signal),
    wait: new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal }))),
    ready: Promise.resolve(),
    stderrChunks,
    process: child,
  };
}

async function main() {
  const transport = createTransport();
  const responses = new Map();
  const notifications = [];
  const sent = [];
  let nextId = 1;
  let malformedClosed = false;

  transport.output.on("data", makeParser((message) => {
    if (Object.hasOwn(message, "id")) responses.set(message.id, message);
    else notifications.push(message);
  }));

  await transport.ready;

  const request = async (method, params, timeoutMs = 5000) => {
    const id = nextId++;
    sent.push({ id, method });
    transport.input.write(frame({ jsonrpc: "2.0", id, method, params }));
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (responses.has(id)) return responses.get(id);
      await delay(25);
    }
    throw new Error(`Timed out waiting for ${method}; stderr=${transport.stderrChunks.join("").slice(0, 2000)}`);
  };

  const notify = (method, params) => {
    sent.push({ method, notification: true });
    transport.input.write(frame({ jsonrpc: "2.0", method, params }));
  };

  let result;
  try {
    const initialize = await request("initialize", {
      clientInfo: {
        name: "nuvitae",
        title: "Nuvitae",
        version: "0.1.0-t190-runtime-spike",
      },
      capabilities: {},
    });
    notify("initialized", {});

    const accountRead = await request("account/read", {});
    const modelList = await request("model/list", {});
    const malformedInputResult = mode === "stdio" ? await new Promise((resolve) => {
    const malformed = spawn("codex", ["app-server", "--stdio", "--strict-config"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        HOME: process.env.HOME,
        CODEX_HOME: process.env.CODEX_HOME,
        TMPDIR: process.env.TMPDIR,
        PATH: process.env.PATH,
        NO_COLOR: "1",
      },
    });
    const err = [];
    malformed.stderr.on("data", (chunk) => err.push(redact(chunk.toString("utf8"))));
    malformed.stdin.write("not-json-rpc\n");
    malformed.stdin.end();
    malformed.on("exit", (code, signal) => resolve({ code, signal, stderr: err.join("").slice(0, 2000) }));
    setTimeout(() => {
      malformedClosed = true;
      malformed.kill("SIGKILL");
    }, 3000);
    }) : { skipped: "only measured for managed stdio child process" };

    transport.input.end();
    const gracefulExit = await Promise.race([
      transport.wait,
      delay(5000).then(() => {
        transport.kill("SIGKILL");
        return { code: null, signal: "SIGKILL", timedOut: true };
      }),
    ]);

    result = {
      mode,
      transport: transport.label,
      initialize,
      accountRead,
      modelListSummary: {
        responseShape: Object.keys(modelList.result ?? modelList.error ?? {}),
        rawResponseBytes: JSON.stringify(modelList).length,
      },
      sent,
      notificationCount: notifications.length,
      notificationMethods: [...new Set(notifications.map((message) => message.method).filter(Boolean))],
      gracefulExit,
      malformedInputResult,
      malformedInputForcedKill: malformedClosed,
      stderr: transport.stderrChunks.join("").slice(0, 4000),
    };
  } catch (error) {
    transport.kill("SIGKILL");
    const failedExit = await Promise.race([
      transport.wait,
      delay(1000).then(() => ({ code: null, signal: "unknown-after-kill" })),
    ]);
    result = {
      mode,
      transport: transport.label,
      error: redact(error.stack || error.message),
      sent,
      notificationCount: notifications.length,
      notificationMethods: [...new Set(notifications.map((message) => message.method).filter(Boolean))],
      failedExit,
      stderr: transport.stderrChunks.join("").slice(0, 4000),
    };
    process.exitCode = 1;
  }
  await writeJson(evidencePath, result);
}

main().catch(async (error) => {
  await writeJson(evidencePath, {
    mode,
    error: redact(error.stack || error.message),
  });
  process.exitCode = 1;
});
