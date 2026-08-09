import http from "node:http";
import { CALLBACK } from "../oauth-constants.mjs";
import { constantTimeEqual } from "./oauth.mjs";

function send(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    connection: "close",
  });
  response.end(body);
}

export function createCallbackListener({ expectedState, onTerminalResult }) {
  let completed = false;
  let server;

  server = http.createServer({ maxHeaderSize: CALLBACK.maxRequestBytes }, (request, response) => {
    const rawTarget = request.url ?? "";
    if (rawTarget.length > CALLBACK.maxRequestBytes) {
      send(response, 414, "OAuth callback rejected.");
      onTerminalResult({ ok: false, safeCategory: "callback_too_large" });
      close();
      return;
    }

    let url;
    try {
      url = new URL(rawTarget, `http://${CALLBACK.brokerHost}:${CALLBACK.brokerPort}`);
    } catch (_error) {
      send(response, 400, "OAuth callback rejected.");
      onTerminalResult({ ok: false, safeCategory: "invalid_callback_url" });
      close();
      return;
    }

    if (url.pathname !== CALLBACK.path) {
      send(response, 404, "OAuth callback rejected.");
      onTerminalResult({ ok: false, safeCategory: "wrong_callback_path" });
      close();
      return;
    }

    if (completed) {
      send(response, 409, "OAuth callback already completed.");
      onTerminalResult({ ok: false, safeCategory: "duplicate_callback" });
      close();
      return;
    }

    const suppliedState = url.searchParams.get("state") ?? "";
    if (!constantTimeEqual(suppliedState, expectedState)) {
      send(response, 400, "OAuth callback rejected.");
      onTerminalResult({ ok: false, safeCategory: "state_mismatch" });
      close();
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      send(response, 400, "OAuth callback rejected.");
      onTerminalResult({ ok: false, safeCategory: "missing_code" });
      close();
      return;
    }

    completed = true;
    send(response, 200, "OAuth callback received. You may return to the terminal.");
    onTerminalResult({ ok: true, code, stateValid: true });
    close();
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(CALLBACK.brokerPort, CALLBACK.brokerHost, () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  function close() {
    return new Promise((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
  }

  return {
    listen,
    close,
    get completed() {
      return completed;
    },
  };
}
