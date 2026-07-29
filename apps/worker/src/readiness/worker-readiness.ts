import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { bootstrapHealthSchema } from "@nuvitae/contracts";

export function workerReadinessPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.WORKER_READY_FILE ?? "/tmp/nuvitae-worker-ready";
}

export function writeWorkerReadinessFile(path = workerReadinessPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      bootstrapHealthSchema.parse({
        service: "worker",
        status: "ok",
      }),
    ),
    "utf8",
  );
}

export function removeWorkerReadinessFile(path = workerReadinessPath()): void {
  rmSync(path, { force: true });
}
