import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  IsolatedParserRunner,
  type IsolatedParserCommand,
} from "./isolated-parser-runner.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function workdir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "nuvitae-runner-test-"));
  roots.push(path);
  return path;
}

const runner = (
  overrides: ConstructorParameters<typeof IsolatedParserRunner>[0] = {
    memoryEnforcement: {
      kind: "linux_prlimit_address_space",
      executable: "/usr/bin/prlimit",
    },
  },
) =>
  new IsolatedParserRunner({
    memoryEnforcement: {
      kind: "linux_prlimit_address_space",
      executable: "/usr/bin/prlimit",
    },
    foregroundTimeoutMilliseconds: 2_000,
    terminationGraceMilliseconds: 50,
    maximumStdoutBytes: 16,
    maximumStderrBytes: 16,
    ...overrides,
  });

async function command(
  executable: string,
  args: readonly string[],
  stagedRelativePath = "result.bin",
): Promise<IsolatedParserCommand> {
  const root = await workdir();
  return {
    executable,
    arguments: args,
    workingDirectory: root,
    environment: { LANG: "C", SECRET_VALUE: "must-not-be-inherited" },
    allowedEnvironmentKeys: ["LANG"],
    outputCommit: {
      stagedRelativePath,
      finalPath: join(root, "final.bin"),
    },
  };
}

describe("IsolatedParserRunner", () => {
  it("commits successful staged output atomically", async () => {
    const input = await command("/usr/bin/touch", ["{STAGING_DIR}/result.bin"]);
    const result = await runner().run(input);
    expect(result).toMatchObject({ ok: true, value: { exitCode: 0 } });
    await expect(lstat(input.outputCommit.finalPath)).resolves.toMatchObject({
      size: 0,
    });
    expect((await lstat(input.workingDirectory)).isDirectory()).toBe(true);
  });

  it.each([
    ["non-zero exit", "/usr/bin/false"],
    ["spawn failure", "/missing/synthetic-parser"],
  ])("does not commit output after %s", async (_name, executable) => {
    const input = await command(executable, []);
    const result = await runner().run(input);
    expect(result.ok).toBe(false);
    await expect(lstat(input.outputCommit.finalPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("maps timeout and cancellation to stable categories", async () => {
    const timed = await command("/usr/bin/tail", ["-f", "/dev/null"]);
    const timedResult = await runner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/usr/bin/prlimit",
      },
      foregroundTimeoutMilliseconds: 30,
      terminationGraceMilliseconds: 20,
    }).run(timed);
    expect(timedResult).toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });

    const cancelled = await command("/usr/bin/tail", ["-f", "/dev/null"]);
    const controller = new AbortController();
    const pending = runner().run({
      ...cancelled,
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { category: "cancelled" },
    });
  });

  it("fails closed when memory enforcement is unavailable", async () => {
    const input = await command("/usr/bin/touch", ["{STAGING_DIR}/result.bin"]);
    await expect(
      runner({
        memoryEnforcement: {
          kind: "linux_prlimit_address_space",
          executable: "/missing/prlimit",
        },
      }).run(input),
    ).resolves.toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });
  });

  it("maps process-level address-space exhaustion to resource_limit", async () => {
    const input = await command(process.execPath, [
      "-e",
      "Buffer.alloc(256 * 1024 * 1024); setTimeout(() => {}, 1000)",
    ]);
    const result = await runner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/usr/bin/prlimit",
      },
      memoryLimitBytes: 64 * 1024 * 1024,
    }).run(input);
    expect(result).toMatchObject({
      ok: false,
      error: { category: "resource_limit" },
    });
  });

  it("caps stdout and stderr independently without exposing either", async () => {
    const input = await command("/usr/bin/yes", ["synthetic"]);
    const result = await runner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/usr/bin/prlimit",
      },
      foregroundTimeoutMilliseconds: 30,
      maximumStdoutBytes: 8,
      maximumStderrBytes: 8,
    }).run(input);
    expect(result).toMatchObject({
      ok: false,
      error: {
        category: "resource_limit",
        message: "The document exceeded a processing limit.",
      },
    });
  });

  it("treats shell metacharacters as literal argument content", async () => {
    const literal = "literal;$(touch escaped)";
    const input = await command(
      "/usr/bin/touch",
      [`{STAGING_DIR}/${literal}`],
      literal,
    );
    const result = await runner().run(input);
    expect(result.ok).toBe(true);
    await expect(
      lstat(join(input.workingDirectory, "escaped")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("supports concurrent isolated runs", async () => {
    const [one, two] = await Promise.all([
      command("/usr/bin/touch", ["{STAGING_DIR}/result.bin"]),
      command("/usr/bin/touch", ["{STAGING_DIR}/result.bin"]),
    ]);
    const results = await Promise.all([runner().run(one), runner().run(two)]);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("preserves existing final output and rejects staged symlinks", async () => {
    const existing = await command("/usr/bin/touch", [
      "{STAGING_DIR}/result.bin",
    ]);
    await writeFile(existing.outputCommit.finalPath, "existing");
    const existingResult = await runner().run(existing);
    expect(existingResult.ok).toBe(false);
    expect(await readFile(existing.outputCommit.finalPath, "utf8")).toBe(
      "existing",
    );

    const root = await workdir();
    const target = join(root, "target");
    await writeFile(target, "safe");
    const symlinkCommand: IsolatedParserCommand = {
      executable: "/usr/bin/ln",
      arguments: ["-s", target, "{STAGING_DIR}/result.bin"],
      workingDirectory: root,
      environment: {},
      allowedEnvironmentKeys: [],
      outputCommit: {
        stagedRelativePath: "result.bin",
        finalPath: join(root, "final.bin"),
      },
    };
    await expect(runner().run(symlinkCommand)).resolves.toMatchObject({
      ok: false,
      error: { category: "malformed" },
    });
  });

  it("runs cleanup hooks before commit and removes staging on hook failure", async () => {
    const input = await command("/usr/bin/touch", ["{STAGING_DIR}/result.bin"]);
    const result = await runner().run({
      ...input,
      cleanupHooks: [
        async () => {
          throw new Error("synthetic cleanup failure");
        },
      ],
    });
    expect(result.ok).toBe(false);
    const entries = await import("node:fs/promises").then(({ readdir }) =>
      readdir(input.workingDirectory),
    );
    expect(entries.some((entry) => entry.startsWith(".parser-staging-"))).toBe(
      false,
    );
  });

  it("runs cleanup hooks after timeout failure", async () => {
    const input = await command("/usr/bin/tail", ["-f", "/dev/null"]);
    let cleaned = false;
    await runner({
      memoryEnforcement: {
        kind: "linux_prlimit_address_space",
        executable: "/usr/bin/prlimit",
      },
      foregroundTimeoutMilliseconds: 30,
    }).run({
      ...input,
      cleanupHooks: [
        async () => {
          cleaned = true;
        },
      ],
    });
    expect(cleaned).toBe(true);
  });
});
