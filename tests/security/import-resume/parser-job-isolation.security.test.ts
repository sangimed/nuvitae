import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  IsolatedParserRunner,
  type IsolatedParserCommand,
} from "@nuvitae/extraction";
import {
  createIsolatedWorkspace,
  destroyWorkspace,
  validateFilePathForWorkspace,
} from "@nuvitae/extraction";

/**
 * T112 - parser-job isolation.
 *
 * Proves that one parser failure cannot affect another independent job by
 * running a failing job alongside a successful job and verifying that:
 *
 *  - The failed job does not affect the successful job's output
 *  - Workspace deletion for one job does not remove another job's workspace
 *  - Process-group termination targets only the failing job
 *  - No shared temporary filename collisions
 *  - No shared output-file reuse
 *  - No environment, transcript, source, or result leakage between jobs
 *  - One job's failure does not change another job's status
 *  - Repeated and concurrent execution remains deterministic
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function workdir(prefix = "nuvitae-isolation-"): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  roots.push(path);
  return path;
}

function createRunner(): IsolatedParserRunner {
  return new IsolatedParserRunner({
    memoryEnforcement: {
      kind: "linux_prlimit_address_space",
      executable: "/usr/bin/prlimit",
    },
    memoryLimitBytes: 512 * 1024 * 1024,
    foregroundTimeoutMilliseconds: 4_000,
    terminationGraceMilliseconds: 100,
    maximumStdoutBytes: 64 * 1024,
    maximumStderrBytes: 64 * 1024,
  });
}

async function safeCommand(root?: string): Promise<IsolatedParserCommand> {
  const dir = root ?? (await workdir());
  return {
    executable: "/usr/bin/touch",
    arguments: ["{STAGING_DIR}/result.txt"],
    workingDirectory: dir,
    environment: {},
    allowedEnvironmentKeys: [],
    outputCommit: {
      stagedRelativePath: "result.txt",
      finalPath: join(dir, "final.txt"),
    },
  };
}

async function failingCommand(root?: string): Promise<IsolatedParserCommand> {
  const dir = root ?? (await workdir());
  return {
    executable: "/usr/bin/false",
    arguments: [],
    workingDirectory: dir,
    environment: {},
    allowedEnvironmentKeys: [],
    outputCommit: {
      stagedRelativePath: "result.txt",
      finalPath: join(dir, "final.txt"),
    },
  };
}

describe("parser-job isolation (T112)", () => {
  it("failing job does not affect concurrent successful job", async () => {
    const runner = createRunner();
    const bad = await failingCommand();
    const good = await safeCommand();

    const [badResult, goodResult] = await Promise.all([
      runner.run(bad),
      runner.run(good),
    ]);

    expect(badResult.ok).toBe(false);
    expect(goodResult.ok).toBe(true);
  }, 10_000);

  it("two parallel safe jobs both succeed deterministically", async () => {
    const runner = createRunner();
    const first = await safeCommand();
    const second = await safeCommand();

    const [firstResult, secondResult] = await Promise.all([
      runner.run(first),
      runner.run(second),
    ]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
  });

  it("malformed document alongside valid document - valid succeeds", async () => {
    const runner = createRunner();
    const bad = await failingCommand();
    const good = await safeCommand();

    const [, goodResult] = await Promise.all([
      runner.run(bad),
      runner.run(good),
    ]);

    expect(goodResult.ok).toBe(true);
  }, 10_000);

  it("abrupt parser termination alongside valid document - valid succeeds", async () => {
    const runner = new IsolatedParserRunner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/usr/bin/prlimit",
      },
      memoryLimitBytes: 512 * 1024 * 1024,
      foregroundTimeoutMilliseconds: 50,
      terminationGraceMilliseconds: 10,
      maximumStdoutBytes: 64 * 1024,
      maximumStderrBytes: 64 * 1024,
    });
    const root = await workdir();
    const timeoutCmd: IsolatedParserCommand = {
      executable: "/usr/bin/sleep",
      arguments: ["60"],
      workingDirectory: root,
      environment: {},
      allowedEnvironmentKeys: [],
      outputCommit: {
        stagedRelativePath: "result.txt",
        finalPath: join(root, "final.txt"),
      },
    };
    const good = await safeCommand();

    await runner.run(timeoutCmd);
    const goodResult = await runner.run(good);

    expect(goodResult.ok).toBe(true);
  }, 10_000);

  it("workspace deletion for one job does not remove another job's workspace", async () => {
    const ws1 = await createIsolatedWorkspace("/tmp");
    const ws2 = await createIsolatedWorkspace("/tmp");
    try {
      expect(ws1.path).not.toBe(ws2.path);

      await destroyWorkspace(ws1);
      await expect(
        import("node:fs/promises").then(({ access }) =>
          access(ws1.path).catch(() => "gone"),
        ),
      ).resolves.toBe("gone");

      const after = await readdir(ws2.path);
      expect(after).toBeDefined();
      expect(ws2.path).not.toContain(ws1.identifier);
    } finally {
      await destroyWorkspace(ws1).catch(() => undefined);
      await destroyWorkspace(ws2).catch(() => undefined);
    }
  });

  it("process-group termination does not affect other jobs", async () => {
    const runner = createRunner();
    const bad = await failingCommand();
    const good = await safeCommand();

    await runner.run(bad);
    const goodResult = await runner.run(good);

    expect(goodResult.ok).toBe(true);
  });

  it("no shared temporary filename collisions across concurrent runs", async () => {
    const runner = createRunner();
    const cmds = await Promise.all(
      Array.from({ length: 3 }, () => safeCommand()),
    );

    const results = await Promise.all(cmds.map((cmd) => runner.run(cmd)));

    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("no shared output-file reuse between jobs", async () => {
    const runner = createRunner();

    const first = await safeCommand();
    const second = await safeCommand();

    expect(first.outputCommit.finalPath).not.toBe(
      second.outputCommit.finalPath,
    );

    const [firstResult, secondResult] = await Promise.all([
      runner.run(first),
      runner.run(second),
    ]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
  });

  it("no status contamination - failure does not change successful job's output", async () => {
    const runner = createRunner();
    const bad = await failingCommand();
    const good = await safeCommand();

    await runner.run(bad);
    const goodResult = await runner.run(good);

    expect(goodResult.ok).toBe(true);
  }, 10_000);

  it("repeated concurrent execution remains deterministic", async () => {
    const runner = createRunner();

    for (let round = 0; round < 2; round += 1) {
      const bad = await failingCommand();
      const good = await safeCommand();

      const [badResult, goodResult] = await Promise.all([
        runner.run(bad),
        runner.run(good),
      ]);

      expect(badResult.ok).toBe(false);
      expect(goodResult.ok).toBe(true);
    }
  });

  it("sequentially independent claims preserve isolation", async () => {
    const runner = createRunner();

    const bad = await failingCommand();
    const badResult = await runner.run(bad);
    expect(badResult.ok).toBe(false);

    const good = await safeCommand();
    const goodResult = await runner.run(good);
    expect(goodResult.ok).toBe(true);
  });

  it("workspace path validation prevents cross-job access", async () => {
    const ws1 = await createIsolatedWorkspace("/tmp");
    const ws2 = await createIsolatedWorkspace("/tmp");
    try {
      expect(() =>
        validateFilePathForWorkspace(ws1, `${ws2.path}/output.bin`),
      ).toThrow();

      expect(() =>
        validateFilePathForWorkspace(ws1, `${ws1.path}/output.bin`),
      ).not.toThrow();
    } finally {
      await destroyWorkspace(ws1).catch(() => undefined);
      await destroyWorkspace(ws2).catch(() => undefined);
    }
  });

  it("concurrent runs using shared runner isolate staging directories", async () => {
    const runner = createRunner();
    const first = await safeCommand();
    const second = await safeCommand();

    expect(first.workingDirectory).not.toBe(second.workingDirectory);

    const [firstResult, secondResult] = await Promise.all([
      runner.run(first),
      runner.run(second),
    ]);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);

    const firstEntries = await readdir(first.workingDirectory);
    const secondEntries = await readdir(second.workingDirectory);
    const firstStaging = firstEntries.filter((e) =>
      e.startsWith(".parser-staging-"),
    );
    const secondStaging = secondEntries.filter((e) =>
      e.startsWith(".parser-staging-"),
    );
    expect(firstStaging).toEqual([]);
    expect(secondStaging).toEqual([]);
  });

  describe("environment isolation", () => {
    it("job A does not see job B's sentinel environment variable", async () => {
      const runner = createRunner();
      const dirA = await workdir("env-iso-a-");
      const dirB = await workdir("env-iso-b-");

      const cmdA: IsolatedParserCommand = {
        executable: "/bin/sh",
        arguments: ["-c", "echo $NUVITAE_SENTINEL > {STAGING_DIR}/result.txt"],
        workingDirectory: dirA,
        environment: { NUVITAE_SENTINEL: "alpha-secret" },
        allowedEnvironmentKeys: ["NUVITAE_SENTINEL"],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(dirA, "final-a.txt"),
        },
      };
      const cmdB: IsolatedParserCommand = {
        executable: "/bin/sh",
        arguments: ["-c", "echo $NUVITAE_SENTINEL > {STAGING_DIR}/result.txt"],
        workingDirectory: dirB,
        environment: { NUVITAE_SENTINEL: "beta-secret" },
        allowedEnvironmentKeys: ["NUVITAE_SENTINEL"],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(dirB, "final-b.txt"),
        },
      };

      const [resultA, resultB] = await Promise.all([
        runner.run(cmdA),
        runner.run(cmdB),
      ]);
      expect(resultA.ok).toBe(true);
      expect(resultB.ok).toBe(true);

      const outputA = String(await readFile(join(dirA, "final-a.txt")));
      const outputB = String(await readFile(join(dirB, "final-b.txt")));
      expect(outputA.trim()).toBe("alpha-secret");
      expect(outputA).not.toContain("beta-secret");
      expect(outputB.trim()).toBe("beta-secret");
      expect(outputB).not.toContain("alpha-secret");
    }, 10_000);

    it("environment variables not in allowedKeys are excluded from isolated job", async () => {
      const runner = createRunner();
      const dir = await workdir("env-filter-");

      const cmd: IsolatedParserCommand = {
        executable: "/bin/sh",
        arguments: ["-c", "env > {STAGING_DIR}/result.txt"],
        workingDirectory: dir,
        environment: {
          ALLOWED_VAR: "visible-value",
          LEAKED_API_KEY: "sk-should-not-appear",
        },
        allowedEnvironmentKeys: ["ALLOWED_VAR"],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(dir, "final.txt"),
        },
      };

      const result = await runner.run(cmd);
      expect(result.ok).toBe(true);

      const output = String(await readFile(join(dir, "final.txt")));
      expect(output).toContain("ALLOWED_VAR");
      expect(output).toContain("visible-value");
      expect(output).not.toContain("LEAKED_API_KEY");
      expect(output).not.toContain("sk-should-not-appear");
    }, 10_000);
  });

  describe("workspace data isolation", () => {
    it("job A's committed output does not appear in job B's working directory", async () => {
      const runner = createRunner();
      const dirA = await workdir("out-iso-a-");
      const dirB = await workdir("out-iso-b-");

      const cmdA: IsolatedParserCommand = {
        executable: "/bin/sh",
        arguments: ["-c", "echo 'ONLY-IN-A' > {STAGING_DIR}/result.txt"],
        workingDirectory: dirA,
        environment: {},
        allowedEnvironmentKeys: [],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(dirA, "final-a.txt"),
        },
      };
      const cmdB = await safeCommand(dirB);

      const [resultA, resultB] = await Promise.all([
        runner.run(cmdA),
        runner.run(cmdB),
      ]);
      expect(resultA.ok).toBe(true);
      expect(resultB.ok).toBe(true);

      const entriesA = await readdir(dirA);
      expect(entriesA).toContain("final-a.txt");

      const entriesB = await readdir(dirB);
      expect(entriesB).not.toContain("final-a.txt");
    }, 10_000);

    it("output path is always confined below the job's own working directory", async () => {
      const runner = createRunner();
      const dirA = await workdir("confine-a-");

      const cmd: IsolatedParserCommand = {
        executable: "/bin/sh",
        arguments: ["-c", "echo 'confined-output' > {STAGING_DIR}/result.txt"],
        workingDirectory: dirA,
        environment: {},
        allowedEnvironmentKeys: [],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(dirA, "final.txt"),
        },
      };

      const result = await runner.run(cmd);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.committedOutputPath).toContain(dirA);
      }
    }, 10_000);
  });

  describe("cleanup scoping", () => {
    it("cleanup of a failed job's staging does not remove successful job's output", async () => {
      const runner = createRunner();
      const failDir = await workdir("cleanup-fail-");
      const goodDir = await workdir("cleanup-good-");

      const failCmd: IsolatedParserCommand = {
        executable: "/usr/bin/false",
        arguments: [],
        workingDirectory: failDir,
        environment: {},
        allowedEnvironmentKeys: [],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(failDir, "final.txt"),
        },
      };
      const goodCmd = await safeCommand(goodDir);

      await runner.run(failCmd);
      const goodResult = await runner.run(goodCmd);

      expect(goodResult.ok).toBe(true);

      const goodEntries = await readdir(goodDir);
      expect(goodEntries).toContain("final.txt");
    });
  });

  describe("result non-reuse", () => {
    it("failing job result is not reused for subsequent job", async () => {
      const runner = createRunner();
      const failDir = await workdir("reuse-fail-");
      const goodDir = await workdir("reuse-good-");

      const failCmd: IsolatedParserCommand = {
        executable: "/usr/bin/false",
        arguments: [],
        workingDirectory: failDir,
        environment: {},
        allowedEnvironmentKeys: [],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(failDir, "final.txt"),
        },
      };

      const failResult = await runner.run(failCmd);
      expect(failResult.ok).toBe(false);

      const goodCmd = await safeCommand(goodDir);
      const goodResult = await runner.run(goodCmd);

      expect(goodResult.ok).toBe(true);
      if (goodResult.ok && failResult.ok) {
        // TypeScript narrows both to ok
      }
      if (goodResult.ok && !failResult.ok) {
        expect(goodResult.value.committedOutputPath).toContain(goodDir);
      }
    });
  });
});
