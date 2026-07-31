import net from "node:net";
import { CALLBACK, NETWORK_LIMITS } from "../oauth-constants.mjs";

export function createRawTcpRelay({
  listenHost = "0.0.0.0",
  listenPort = CALLBACK.relayContainerPort,
  targetHost = CALLBACK.brokerHost,
  targetPort = CALLBACK.brokerPort,
  maxConnections = NETWORK_LIMITS.relayMaxConnections,
  idleTimeoutMs = NETWORK_LIMITS.relayIdleTimeoutMs,
} = {}) {
  const sockets = new Set();
  let activeConnections = 0;

  const server = net.createServer((clientSocket) => {
    if (activeConnections >= maxConnections) {
      clientSocket.destroy();
      return;
    }

    activeConnections += 1;
    sockets.add(clientSocket);
    const targetSocket = net.connect({ host: targetHost, port: targetPort });
    sockets.add(targetSocket);

    const cleanup = () => {
      clientSocket.destroy();
      targetSocket.destroy();
      sockets.delete(clientSocket);
      sockets.delete(targetSocket);
      activeConnections = Math.max(0, activeConnections - 1);
    };

    clientSocket.setTimeout(idleTimeoutMs, cleanup);
    targetSocket.setTimeout(idleTimeoutMs, cleanup);
    clientSocket.on("error", cleanup);
    targetSocket.on("error", cleanup);
    clientSocket.on("close", cleanup);
    targetSocket.on("close", cleanup);

    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(listenPort, listenHost, () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  function close() {
    return new Promise((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
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
    address: () => server.address(),
    activeConnections: () => activeConnections,
  };
}
