import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import type { ExtractionFailure, ExtractionResult } from "./adapters.js";
import {
  extractionFailure,
  failed,
  isAborted,
  succeeded,
} from "./extraction-failures.js";

export const isolatedParserDefaults = Object.freeze({
  foregroundTimeoutMilliseconds: 180_000,
  memoryLimitBytes: 512 * 1024 * 1024,
  terminationGraceMilliseconds: 2_000,
  maximumStdoutBytes: 64 * 1024,
  maximumStderrBytes: 64 * 1024,
});

export interface LinuxPrlimitMemoryEnforcement {
  readonly kind: "linux_prlimit_address_space";
  readonly executable: string;
}

export interface IsolatedParserRunnerOptions {
  readonly foregroundTimeoutMilliseconds?: number;
  readonly memoryLimitBytes?: number;
  readonly terminationGraceMilliseconds?: number;
  readonly maximumStdoutBytes?: number;
  readonly maximumStderrBytes?: number;
  readonly memoryEnforcement: LinuxPrlimitMemoryEnforcement;
}

export interface ParserOutputCommit {
  /** Relative path, below the runner-owned staging directory. */
  readonly stagedRelativePath: string;
  /** Absolute final path, confined below the controlled working directory. */
  readonly finalPath: string;
  readonly validate?: (stagedPath: string) => Promise<boolean>;
}

export interface IsolatedParserCommand {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  /**
   * Values are supplied explicitly and filtered by `allowedEnvironmentKeys`.
   * The host/container environment is never inherited.
   */
  readonly environment: Readonly<Record<string, string>>;
  readonly allowedEnvironmentKeys: readonly string[];
  readonly abortSignal?: AbortSignal;
  readonly outputCommit: ParserOutputCommit;
  /**
   * `{STAGING_DIR}` in an argument is replaced with the absolute runner-owned
   * staging directory. No other interpolation occurs.
   */
  readonly cleanupHooks?: readonly (() => Promise<void>)[];
}

export interface IsolatedParserRunResult {
  readonly exitCode: 0;
  readonly stdoutBytesCaptured: number;
  readonly stderrBytesCaptured: number;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly committedOutputPath: string;
}

interface CapturedOutput {
  readonly bytes: Buffer;
  readonly truncated: boolean;
}

interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

/**
 * Runs a parser below Linux `prlimit` address-space and CPU-time ceilings.
 * These process limits are inherited by descendants and are not cgroup limits.
 * RLIMIT_AS can make runtimes with large reservations fail earlier than their
 * resident-memory use suggests. Production callers fail closed when the
 * configured `prlimit` executable is unavailable.
 */
export class IsolatedParserRunner {
  private readonly options: Required<IsolatedParserRunnerOptions>;

  constructor(options: IsolatedParserRunnerOptions) {
    this.options = {
      foregroundTimeoutMilliseconds:
        options.foregroundTimeoutMilliseconds ??
        isolatedParserDefaults.foregroundTimeoutMilliseconds,
      memoryLimitBytes:
        options.memoryLimitBytes ?? isolatedParserDefaults.memoryLimitBytes,
      terminationGraceMilliseconds:
        options.terminationGraceMilliseconds ??
        isolatedParserDefaults.terminationGraceMilliseconds,
      maximumStdoutBytes:
        options.maximumStdoutBytes ?? isolatedParserDefaults.maximumStdoutBytes,
      maximumStderrBytes:
        options.maximumStderrBytes ?? isolatedParserDefaults.maximumStderrBytes,
      memoryEnforcement: options.memoryEnforcement,
    };
    validateOptions(this.options);
  }

  async run(
    command: IsolatedParserCommand,
  ): Promise<ExtractionResult<IsolatedParserRunResult>> {
    let stagingDirectory: string | undefined;
    let cleanupHooksAttempted = false;
    try {
      validateCommand(command);
      if (isAborted(command.abortSignal)) {
        return failed("cancelled");
      }
      const workingDirectory = await validateWorkingDirectory(
        command.workingDirectory,
      );
      await ensureMemoryEnforcerAvailable(this.options.memoryEnforcement);
      stagingDirectory = join(
        workingDirectory,
        `.parser-staging-${randomBytes(16).toString("hex")}`,
      );
      await mkdir(stagingDirectory, { mode: 0o700 });

      const finalPath = await validateFinalPath(
        workingDirectory,
        command.outputCommit.finalPath,
      );
      const stagedRelativePath = validateRelativeOutputPath(
        command.outputCommit.stagedRelativePath,
      );
      const stagedPath = resolve(stagingDirectory, stagedRelativePath);
      const argumentsWithStaging = command.arguments.map((argument) =>
        argument.replaceAll("{STAGING_DIR}", stagingDirectory!),
      );
      const environment = filterEnvironment(
        command.environment,
        command.allowedEnvironmentKeys,
      );
      const cpuLimitSeconds = Math.max(
        1,
        Math.ceil(this.options.foregroundTimeoutMilliseconds / 1_000),
      );
      const childArguments = [
        `--as=${String(this.options.memoryLimitBytes)}:${String(this.options.memoryLimitBytes)}`,
        `--cpu=${String(cpuLimitSeconds)}:${String(cpuLimitSeconds)}`,
        "--",
        command.executable,
        ...argumentsWithStaging,
      ];
      if (command.abortSignal?.aborted === true) {
        return failed("cancelled");
      }

      const execution = await executeChild({
        executable: this.options.memoryEnforcement.executable,
        arguments: childArguments,
        cwd: workingDirectory,
        environment,
        ...(command.abortSignal === undefined
          ? {}
          : { signal: command.abortSignal }),
        timeoutMilliseconds: this.options.foregroundTimeoutMilliseconds,
        graceMilliseconds: this.options.terminationGraceMilliseconds,
        maximumStdoutBytes: this.options.maximumStdoutBytes,
        maximumStderrBytes: this.options.maximumStderrBytes,
      });
      if (!execution.ok) {
        return execution;
      }
      if (
        execution.value.exit.code !== 0 ||
        execution.value.exit.signal !== null
      ) {
        return failed(
          looksLikeMemoryLimitFailure(
            execution.value.exit,
            execution.value.stderr.bytes,
          )
            ? "resource_limit"
            : "unexpected",
        );
      }

      await validateStagedOutput(stagingDirectory, stagedPath);
      if (
        command.outputCommit.validate !== undefined &&
        !(await command.outputCommit.validate(stagedPath))
      ) {
        return failed("corrupted");
      }
      cleanupHooksAttempted = true;
      for (const hook of command.cleanupHooks ?? []) {
        await hook();
      }
      // The final path was checked before execution and is checked again
      // immediately before the same-filesystem atomic rename.
      if (await exists(finalPath)) {
        return failed("unexpected");
      }
      await rename(stagedPath, finalPath);

      return succeeded(
        Object.freeze({
          exitCode: 0 as const,
          stdoutBytesCaptured: execution.value.stdout.bytes.byteLength,
          stderrBytesCaptured: execution.value.stderr.bytes.byteLength,
          stdoutTruncated: execution.value.stdout.truncated,
          stderrTruncated: execution.value.stderr.truncated,
          committedOutputPath: finalPath,
        }),
      );
    } catch (error) {
      return {
        ok: false,
        error: safeRunnerFailure(error, command.abortSignal),
      };
    } finally {
      if (!cleanupHooksAttempted) {
        for (const hook of command.cleanupHooks ?? []) {
          await hook().catch(() => undefined);
        }
      }
      if (stagingDirectory !== undefined) {
        await rm(stagingDirectory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  }
}

async function executeChild(input: {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly timeoutMilliseconds: number;
  readonly graceMilliseconds: number;
  readonly maximumStdoutBytes: number;
  readonly maximumStderrBytes: number;
}): Promise<
  ExtractionResult<{
    readonly exit: ChildExit;
    readonly stdout: CapturedOutput;
    readonly stderr: CapturedOutput;
  }>
> {
  return await new Promise((resolvePromise) => {
    let child: ChildProcess;
    try {
      child = spawn(input.executable, input.arguments, {
        cwd: input.cwd,
        detached: process.platform !== "win32",
        env: input.environment,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolvePromise(failed("unexpected"));
      return;
    }

    const stdout = boundedCapture(child.stdout, input.maximumStdoutBytes);
    const stderr = boundedCapture(child.stderr, input.maximumStderrBytes);
    let settled = false;
    let terminationStarted = false;
    let terminationCategory: "cancelled" | "resource_limit" | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = (category: "cancelled" | "resource_limit"): void => {
      terminationCategory ??= category;
      if (terminationStarted || child.pid === undefined) {
        return;
      }
      terminationStarted = true;
      signalProcessGroup(child, "SIGTERM");
      killTimer = setTimeout(() => {
        signalProcessGroup(child, "SIGKILL");
      }, input.graceMilliseconds);
      killTimer.unref();
    };
    const onAbort = () => terminate("cancelled");
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted === true) {
      terminate("cancelled");
    }
    const timeout = setTimeout(
      () => terminate("resource_limit"),
      input.timeoutMilliseconds,
    );
    timeout.unref();

    const finish = async (result: ExtractionResult<ChildExit>) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
      const [capturedStdout, capturedStderr] = await Promise.all([
        stdout,
        stderr,
      ]);
      if (!result.ok) {
        resolvePromise(result);
      } else if (terminationCategory !== undefined) {
        resolvePromise(failed(terminationCategory));
      } else {
        resolvePromise(
          succeeded({
            exit: result.value,
            stdout: capturedStdout,
            stderr: capturedStderr,
          }),
        );
      }
    };

    child.once("error", () => {
      void finish(failed("unexpected"));
    });
    child.once("exit", (code, signal) => {
      void finish(succeeded({ code, signal }));
    });
  });
}

function boundedCapture(
  stream: NodeJS.ReadableStream | null,
  maximumBytes: number,
): Promise<CapturedOutput> {
  if (stream === null) {
    return Promise.resolve({ bytes: Buffer.alloc(0), truncated: false });
  }
  return new Promise((resolvePromise) => {
    const chunks: Buffer[] = [];
    let capturedBytes = 0;
    let truncated = false;
    stream.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = maximumBytes - capturedBytes;
      if (remaining > 0) {
        const captured = bytes.subarray(0, remaining);
        chunks.push(captured);
        capturedBytes += captured.byteLength;
      }
      if (bytes.byteLength > remaining) {
        truncated = true;
      }
    });
    stream.once("end", () => {
      resolvePromise({
        bytes: Buffer.concat(chunks, capturedBytes),
        truncated,
      });
    });
    stream.once("error", () => {
      resolvePromise({
        bytes: Buffer.concat(chunks, capturedBytes),
        truncated: true,
      });
    });
  });
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) {
    return;
  }
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (!isNoSuchProcess(error)) {
      // Termination remains best-effort and idempotent. The exit event is the
      // source of truth, so a racing kill failure does not replace it.
    }
  }
}

async function validateWorkingDirectory(candidate: string): Promise<string> {
  if (!isAbsolute(candidate) || candidate.includes("\0")) {
    throw new RunnerValidationError();
  }
  const stats = await lstat(candidate);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new RunnerValidationError();
  }
  return await realpath(candidate);
}

async function validateFinalPath(
  workingDirectory: string,
  candidate: string,
): Promise<string> {
  if (!isAbsolute(candidate) || candidate.includes("\0")) {
    throw new RunnerValidationError();
  }
  const finalPath = resolve(candidate);
  ensureConfined(workingDirectory, finalPath);
  const parent = resolve(finalPath, "..");
  const canonicalParent = await realpath(parent);
  ensureConfined(workingDirectory, canonicalParent, true);
  const parentStats = await lstat(canonicalParent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new RunnerValidationError();
  }
  if (await exists(finalPath)) {
    throw new ExistingOutputError();
  }
  return finalPath;
}

function validateRelativeOutputPath(candidate: string): string {
  if (
    candidate.length === 0 ||
    candidate.includes("\0") ||
    candidate.includes("\\") ||
    isAbsolute(candidate) ||
    candidate.split("/").some((segment) => segment === "..")
  ) {
    throw new RunnerValidationError();
  }
  return candidate;
}

async function validateStagedOutput(
  stagingDirectory: string,
  stagedPath: string,
): Promise<void> {
  const canonicalStaging = await realpath(stagingDirectory);
  ensureConfined(stagingDirectory, canonicalStaging, true);
  const entries = await readdir(canonicalStaging, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    entries[0]?.isFile() !== true ||
    entries[0].isSymbolicLink()
  ) {
    throw new RunnerValidationError();
  }
  const stats = await lstat(stagedPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new RunnerValidationError();
  }
  const canonicalOutput = await realpath(stagedPath);
  ensureConfined(canonicalStaging, canonicalOutput);
}

function ensureConfined(
  root: string,
  candidate: string,
  allowSame = false,
): void {
  const relativePath = relative(root, candidate);
  if (
    (!allowSame && relativePath === "") ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new RunnerValidationError();
  }
}

function filterEnvironment(
  supplied: Readonly<Record<string, string>>,
  allowedKeys: readonly string[],
): NodeJS.ProcessEnv {
  const allowed = new Set(allowedKeys);
  const filtered: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(supplied)) {
    if (
      allowed.has(key) &&
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
      !key.includes("\0") &&
      !value.includes("\0")
    ) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function validateCommand(command: IsolatedParserCommand): void {
  if (
    command.executable.length === 0 ||
    command.executable.includes("\0") ||
    command.arguments.some((argument) => argument.includes("\0")) ||
    command.allowedEnvironmentKeys.some((key) => key.includes("\0"))
  ) {
    throw new RunnerValidationError();
  }
}

async function ensureMemoryEnforcerAvailable(
  enforcer: LinuxPrlimitMemoryEnforcement,
): Promise<void> {
  if (
    enforcer.kind !== "linux_prlimit_address_space" ||
    !isAbsolute(enforcer.executable) ||
    enforcer.executable.includes("\0") ||
    process.platform !== "linux"
  ) {
    throw new MemoryEnforcementUnavailableError();
  }
  try {
    await access(enforcer.executable, constants.X_OK);
  } catch {
    throw new MemoryEnforcementUnavailableError();
  }
}

function validateOptions(options: Required<IsolatedParserRunnerOptions>): void {
  const numeric = [
    options.foregroundTimeoutMilliseconds,
    options.memoryLimitBytes,
    options.terminationGraceMilliseconds,
    options.maximumStdoutBytes,
    options.maximumStderrBytes,
  ];
  if (
    numeric.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    options.foregroundTimeoutMilliseconds > 180_000 ||
    options.memoryLimitBytes > 512 * 1024 * 1024
  ) {
    throw new TypeError("Parser limits are invalid or exceed hard ceilings.");
  }
}

function looksLikeMemoryLimitFailure(exit: ChildExit, stderr: Buffer): boolean {
  if (
    exit.signal === "SIGKILL" ||
    exit.signal === "SIGSEGV" ||
    exit.signal === "SIGABRT"
  ) {
    return true;
  }
  const diagnostic = stderr.toString("utf8").toLowerCase();
  return [
    "cannot allocate memory",
    "allocation failed",
    "out of memory",
    "heap limit",
  ].some((marker) => diagnostic.includes(marker));
}

function safeRunnerFailure(
  error: unknown,
  signal: AbortSignal | undefined,
): ExtractionFailure {
  if (signal?.aborted === true) {
    return extractionFailure("cancelled");
  }
  if (error instanceof MemoryEnforcementUnavailableError) {
    return extractionFailure("resource_limit");
  }
  if (error instanceof ExistingOutputError) {
    return extractionFailure("unexpected");
  }
  return extractionFailure(
    error instanceof RunnerValidationError ? "malformed" : "unexpected",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNoEntry(error)) {
      return false;
    }
    throw error;
  }
}

function isNoEntry(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isNoSuchProcess(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ESRCH"
  );
}

class RunnerValidationError extends Error {}
class MemoryEnforcementUnavailableError extends Error {}
class ExistingOutputError extends Error {}
