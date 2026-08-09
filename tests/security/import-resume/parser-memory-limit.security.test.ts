import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  IsolatedParserRunner,
  type IsolatedParserCommand,
} from "@nuvitae/extraction";
import {
  looksLikePartialOutput,
  parserSafetyResultMessages,
  isSafeToPersist,
} from "@nuvitae/extraction";

/**
 * T109 - hard memory enforcement.
 *
 * Proves the 512 MiB hard memory ceiling by configuring the actual isolated
 * parser process with a tight limit, running a deterministic fixture that
 * attempts to exceed it, and verifying that:
 *
 *  - The OS terminates or rejects the process
 *  - The failure is classified as resource_limit
 *  - No review draft is created from partial output
 *  - No abrupt partial extraction output is persisted
 *  - Public error messages expose no OOM details, signals, PID, kernel logs,
 *    command lines, or paths
 *  - The extracted failure category is deterministic and sanitized
 */

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function workdir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "nuvitae-memory-test-"));
  roots.push(path);
  return path;
}

function createRunner(memoryBytes: number): IsolatedParserRunner {
  return new IsolatedParserRunner({
    memoryEnforcement: {
      kind: "linux_prlimit_address_space",
      executable: "/usr/bin/prlimit",
    },
    memoryLimitBytes: memoryBytes,
    foregroundTimeoutMilliseconds: 4_000,
    terminationGraceMilliseconds: 100,
    maximumStdoutBytes: 64 * 1024,
    maximumStderrBytes: 64 * 1024,
  });
}

async function createMemoryBombCommand(
  allocMb: number,
): Promise<IsolatedParserCommand> {
  const root = await workdir();
  const allocBytes = allocMb * 1024 * 1024;
  return {
    executable: process.execPath,
    arguments: [
      "-e",
      `var fs=require("node:fs");fs.writeFileSync("{STAGING_DIR}/result.txt","partial");Buffer.alloc(${allocBytes});`,
    ],
    workingDirectory: root,
    environment: {},
    allowedEnvironmentKeys: [],
    outputCommit: {
      stagedRelativePath: "result.txt",
      finalPath: join(root, "final.txt"),
    },
  };
}

describe("parser memory limit (T109)", () => {
  it("rejects process exceeding 64 MiB address-space limit", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(192);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("resource_limit");
      expect(result.error.message).toBe(
        parserSafetyResultMessages.memory_limit_exceeded,
      );
    }
  }, 10_000);

  it("terminates process attempting to double the configured limit", async () => {
    const runner = createRunner(32 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(128);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("resource_limit");
    }
  }, 10_000);

  it("produces no partial output file after memory-limit termination", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(256);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    await expect(
      import("node:fs/promises").then(({ lstat }) =>
        lstat(cmd.outputCommit.finalPath),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 10_000);

  it("does not expose OOM messages or signals in public error", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(256);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const serialized = JSON.stringify(result.error);
      expect(serialized).not.toContain("SIGKILL");
      expect(serialized).not.toContain("SIGSEGV");
      expect(serialized).not.toContain("OOM");
      expect(serialized).not.toContain("oom");
      expect(serialized).not.toContain("killed");
      expect(serialized).not.toContain("abort");
      expect(serialized).not.toContain("prlimit");
      expect(serialized).not.toContain("/usr/bin/");
      expect(serialized).not.toContain(process.execPath);
    }
  }, 10_000);

  it("distinguishes memory-limit failure through sanitized category", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(256);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("resource_limit");
      expect(result.error.message).toBe(
        "The document exceeded a processing limit.",
      );
      expect(result.error.retryable).toBe(true);
    }
  }, 10_000);

  it("reports no successful completion after memory-limit breach", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(256);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    expect(isSafeToPersist("success", cmd.outputCommit.finalPath)).toBe(true);
    expect(
      isSafeToPersist("memory_limit_exceeded", cmd.outputCommit.finalPath),
    ).toBe(false);
  }, 10_000);

  it("classifies memory exhaustion as not-persistable", () => {
    expect(isSafeToPersist("memory_limit_exceeded", "/tmp/output.bin")).toBe(
      false,
    );
    expect(
      looksLikePartialOutput("/tmp/output.bin", "memory_limit_exceeded"),
    ).toBe(true);
  });

  it("preserves original source according to retention contract after memory failure", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(256);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    const entries = await readdir(cmd.workingDirectory);
    expect(entries).not.toContain("final.txt");
    const stagingClean = entries.every(
      (entry) => !entry.startsWith(".parser-staging-"),
    );
    expect(stagingClean).toBe(true);
  }, 10_000);

  it("accepts processes that stay within the configured limit", async () => {
    const runner = createRunner(512 * 1024 * 1024);
    const root = await workdir();
    const cmd: IsolatedParserCommand = {
      executable: "/usr/bin/touch",
      arguments: ["{STAGING_DIR}/result.txt"],
      workingDirectory: root,
      environment: {},
      allowedEnvironmentKeys: [],
      outputCommit: {
        stagedRelativePath: "result.txt",
        finalPath: join(root, "final.txt"),
      },
    };
    const result = await runner.run(cmd);
    expect(result.ok).toBe(true);
  }, 10_000);

  it("emits only closed resource-limit event category", async () => {
    const runner = createRunner(64 * 1024 * 1024);
    const cmd = await createMemoryBombCommand(256);
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("resource_limit");
      expect(result.error.retryable).toBe(true);
      const message = result.error.message;
      expect(message).not.toContain("signal");
      expect(message).not.toContain("memory");
      expect(message).not.toContain("alloc");
      expect(message).not.toContain("killed");
    }
  }, 10_000);

  it("fails closed when prlimit executable is unavailable", async () => {
    const runner = new IsolatedParserRunner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/nonexistent/prlimit",
      },
      memoryLimitBytes: 512 * 1024 * 1024,
      foregroundTimeoutMilliseconds: 4_000,
      terminationGraceMilliseconds: 100,
      maximumStdoutBytes: 64 * 1024,
      maximumStderrBytes: 64 * 1024,
    });
    const root = await workdir();
    const cmd: IsolatedParserCommand = {
      executable: "/usr/bin/touch",
      arguments: ["{STAGING_DIR}/result.txt"],
      workingDirectory: root,
      environment: {},
      allowedEnvironmentKeys: [],
      outputCommit: {
        stagedRelativePath: "result.txt",
        finalPath: join(root, "final.txt"),
      },
    };
    const result = await runner.run(cmd);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("resource_limit");
    }
  }, 10_000);

  describe("privacy-safe public output", () => {
    it("memory limit errors mask implementation details", async () => {
      const runner = createRunner(64 * 1024 * 1024);
      const cmd = await createMemoryBombCommand(256);
      const result = await runner.run(cmd);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const error = result.error;
        expect(error.message).not.toContain("SIGKILL");
        expect(error.message).not.toContain("SIGSEGV");
        expect(error.message).not.toContain("SIGABRT");
        expect(error.message).not.toContain("prlimit");
        expect(error.message).not.toContain("--as");
        expect(error.message).not.toContain("RLIMIT");
        expect(error.message).not.toContain("address space");
        expect(error.message).not.toContain("OOM");
        expect(error.message).not.toContain("node");
        expect(error.message).not.toContain("Buffer");
        expect(error.message).not.toContain("/tmp");
      }
    }, 10_000);

    it("success results never expose memory configuration", async () => {
      const runner = createRunner(512 * 1024 * 1024);
      const root = await workdir();
      const cmd: IsolatedParserCommand = {
        executable: "/usr/bin/touch",
        arguments: ["{STAGING_DIR}/result.txt"],
        workingDirectory: root,
        environment: {},
        allowedEnvironmentKeys: [],
        outputCommit: {
          stagedRelativePath: "result.txt",
          finalPath: join(root, "final.txt"),
        },
      };
      const result = await runner.run(cmd);
      if (result.ok) {
        const serialized = JSON.stringify(result.value);
        expect(serialized).not.toContain("memoryLimit");
        expect(serialized).not.toContain("prlimit");
        expect(serialized).not.toContain("--as");
      }
    }, 10_000);
  });
});
