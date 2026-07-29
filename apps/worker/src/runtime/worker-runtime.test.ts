import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplicationContext } from "@nestjs/common";
import { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { writeWorkerReadinessFile } from "../readiness/worker-readiness";
import { startWorkerRuntime } from "./worker-runtime";

function deferred(): {
  readonly promise: Promise<unknown>;
  resolve(): void;
  reject(error: Error): void;
} {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  return {
    promise: new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

function application(
  source: Pick<DataSource, "isInitialized" | "query">,
): INestApplicationContext {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    enableShutdownHooks: vi.fn(),
    get: vi.fn((token) => {
      if (token === DataSource) return source;
      throw new Error("unexpected_token");
    }),
  } as unknown as INestApplicationContext;
}

describe("worker runtime readiness lifecycle", () => {
  it("does not write readiness before the database probe succeeds", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "nuvitae-worker-")), "ready");
    const probe = deferred();
    const app = application({
      isInitialized: true,
      query: vi.fn().mockReturnValue(probe.promise),
    });

    const starting = startWorkerRuntime({
      readinessPath: path,
      createApplication: vi.fn().mockResolvedValue(app),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(existsSync(path)).toBe(false);

    probe.resolve();
    const runtime = await starting;
    expect(existsSync(path)).toBe(true);
    await runtime.shutdown();
  });

  it("removes readiness before closing resources and shuts down once", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "nuvitae-worker-")), "ready");
    const events: string[] = [];
    const app = application({
      isInitialized: true,
      query: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    });
    vi.mocked(app.close).mockImplementation(async () => {
      events.push(
        existsSync(path) ? "closed-while-ready" : "closed-after-remove",
      );
    });

    const runtime = await startWorkerRuntime({
      readinessPath: path,
      createApplication: vi.fn().mockResolvedValue(app),
    });

    await Promise.all([runtime.shutdown(), runtime.shutdown()]);

    expect(existsSync(path)).toBe(false);
    expect(events).toEqual(["closed-after-remove"]);
  });

  it("removes stale readiness and leaves no file after bootstrap failure", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "nuvitae-worker-")), "ready");
    writeWorkerReadinessFile(path);
    const app = application({
      isInitialized: true,
      query: vi.fn().mockRejectedValue(new Error("private driver details")),
    });

    await expect(
      startWorkerRuntime({
        readinessPath: path,
        createApplication: vi.fn().mockResolvedValue(app),
      }),
    ).rejects.toThrow("worker_bootstrap_failed");

    expect(existsSync(path)).toBe(false);
    expect(app.close).toHaveBeenCalledOnce();
  });
});
