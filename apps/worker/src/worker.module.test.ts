import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeWorkerReadinessFile } from "./worker.module";

describe("worker readiness", () => {
  it("writes a liveness payload for Docker health checks", () => {
    const path = join(mkdtempSync(join(tmpdir(), "nuvitae-worker-")), "ready");

    writeWorkerReadinessFile(path);

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      service: "worker",
      status: "ok",
    });
  });
});
