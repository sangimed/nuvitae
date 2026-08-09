import http from "node:http";
import { CALLBACK } from "./oauth-constants.mjs";

const server = http.createServer((_request, response) => {
  response.writeHead(204, {
    "cache-control": "no-store",
    connection: "close",
  });
  response.end();
});

server.listen(CALLBACK.relayContainerPort, "0.0.0.0", () => {
  process.stdout.write("preflight_listener_ready\n");
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
