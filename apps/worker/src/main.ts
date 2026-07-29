import "reflect-metadata";
import { startWorkerRuntime } from "./runtime/worker-runtime";

async function bootstrap() {
  const runtime = await startWorkerRuntime();
  await new Promise<void>((resolve, reject) => {
    const keepAlive = setInterval(() => {
      // A standalone worker has no HTTP listener; queue processors are added later.
    }, 60_000);
    const shutdown = () => {
      clearInterval(keepAlive);
      runtime.shutdown().then(resolve, reject);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  });
}

void bootstrap().catch(() => {
  console.error("Worker failed to start.");
  process.exitCode = 1;
});
