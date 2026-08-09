import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { spawn } from "node:child_process";
import type { ExtractionFailure, ExtractionResult } from "./adapters.js";
import {
  ExtractionOperationError,
  extractionFailure,
  failed,
  isAborted,
  succeeded,
} from "./extraction-failures.js";

export type HostileDocumentCategory =
  | "javascript"
  | "launch_action"
  | "embedded_file"
  | "file_attachment"
  | "uri_link"
  | "remote_link"
  | "form_action"
  | "auto_action"
  | "malformed_structure"
  | "deeply_nested"
  | "decompression_bomb"
  | "excessive_objects"
  | "recursive_reference"
  | "oversized_metadata"
  | "unusual_encoding"
  | "hidden_text"
  | "prompt_injection"
  | "macro"
  | "ole_object"
  | "external_relationship"
  | "remote_template"
  | "linked_image"
  | "script"
  | "active_content"
  | "malformed_xml"
  | "entity_expansion"
  | "path_traversal"
  | "zip_bomb"
  | "encrypted_or_password";

export type ParserSafetyResultCategory =
  | "success"
  | "unsupported"
  | "password_protected"
  | "malformed_document"
  | "unsafe_document"
  | "memory_limit_exceeded"
  | "parser_terminated"
  | "parser_failed";

export interface ParserIsolationConfig {
  readonly workspaceParent: string;
  readonly maxWorkspaceFiles: number;
  readonly maxOutputSizeBytes: number;
  readonly executable: string;
  readonly allowedArguments: readonly string[];
  readonly allowedEnvironmentKeys: readonly string[];
  readonly memoryLimitBytes: number;
  readonly timeoutMilliseconds: number;
  readonly terminationGraceMilliseconds: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

export interface ParserWorkspace {
  readonly path: string;
  readonly identifier: string;
}

export interface IsolationOptions {
  readonly executable: string;
  readonly argumentValues: Readonly<Record<string, string>>;
  readonly environment: Readonly<Record<string, string>>;
  readonly abortSignal?: AbortSignal;
}

export interface SafeParserResult {
  readonly category: ParserSafetyResultCategory;
  readonly workspace: ParserWorkspace;
  readonly outputPath?: string;
  readonly stdoutBytesCaptured: number;
  readonly stderrBytesCaptured: number;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
}

const hostnamePattern = /^(?!0)(?:[a-z0-9-]{1,63})(?:\.[a-z0-9-]{1,63})*$/i;
const safeEnvKeyPattern = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const maxArgLength = 4096;

const hostileMcpTerms = [
  "mcp__",
  "mcp-server",
  "mcp_config",
  "tools",
  "execute_command",
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "list_files",
  "run_shell",
  "spawn_process",
  "subprocess",
  "thread.run",
  "thread.create",
  "assistant",
  "system_prompt",
  "system message",
  "replicate.com",
  "huggingface.co",
  "openai.com",
  "anthropic.com",
  "ignore previous instructions",
  "ignore all previous",
  "disregard previous",
  "reveal the system prompt",
  "reveal your instructions",
  "return this candidate as hired",
  "mark every value as high",
  "do not provide evidence",
  "bypass validation",
  "alter privacy handling",
  "hide content",
  "invent facts",
  "reveal oauth tokens",
  "reveal session details",
  "call tools",
  "execute shell commands",
  "read files",
  "return a confidence of high",
  "do not require evidence",
].map((term) => term.toLowerCase());

export function scanTextForHostileContent(
  text: string,
): readonly HostileDocumentCategory[] {
  const found: HostileDocumentCategory[] = [];
  const lower = text.toLowerCase();

  if (
    /\/javascript/i.test(text) ||
    /\bjs\s*\(/.test(text) ||
    /<\/\s*script\b/i.test(text)
  ) {
    found.push("script");
  }
  if (
    /\blaunch\s*=\s*["']/.test(lower) ||
    /\blaunch\b/.test(lower) ||
    /\/launch\b/i.test(text)
  ) {
    found.push("launch_action");
  }
  if (/\bembedded\s*?file\b/i.test(lower) || /\/embedfile\b/i.test(text)) {
    found.push("embedded_file");
  }
  if (
    /\/filespec\b/i.test(text) ||
    /attachment\s*=\s*["'].+\.[a-z]{2,4}["']/i.test(lower)
  ) {
    found.push("file_attachment");
  }
  if (
    /\/uri\b/i.test(text) ||
    /uri\s*=\s*["']https?:/i.test(lower) ||
    /\/gotouri\b/i.test(text)
  ) {
    found.push("uri_link");
  }
  if (
    /https?:\/\/[^\s"'<>]+/i.test(text) &&
    !/https?:\/\/schemas\.(openxmlformats|microsoft)\./i.test(text)
  ) {
    found.push("remote_link");
  }
  if (
    /\bform\b.*\baction\b/i.test(lower) ||
    /\bsubmit\s*form\b/i.test(lower) ||
    /\/form\b/i.test(text)
  ) {
    found.push("form_action");
  }
  if (
    /\bauto\s*=\s*["']open/i.test(lower) ||
    /\bon\s*(focus|open|load)\b/i.test(lower) ||
    /\/aa\b/i.test(text) ||
    /\/ao\b/i.test(text)
  ) {
    found.push("auto_action");
  }
  if (
    /\bvbaproject\.bin\b/i.test(lower) ||
    /\/macros\//i.test(lower) ||
    /\.bas\b/i.test(lower) ||
    /\.cls\b/i.test(lower)
  ) {
    found.push("macro");
  }
  if (
    /\bole\s*(object|link)?\b/i.test(lower) ||
    /\/oleobject\b/i.test(text) ||
    /embed\s*src\b/i.test(lower)
  ) {
    found.push("ole_object");
  }
  if (
    /targetmode\s*=\s*["']external["']/i.test(lower) ||
    /<relationship[^>]*targetmode\s*=\s*["']external/i.test(lower)
  ) {
    found.push("external_relationship");
  }
  if (
    /target\s*=\s*["']https?:\/\//i.test(text) &&
    !/target\s*=\s*["']word\/document\.xml["']/i.test(lower)
  ) {
    found.push("remote_template");
  }
  if (
    /\btarget\s*=\s*["'][^"'\s]+\.(png|jpe?g|gif|svg|webp|bmp)[?&]?/i.test(
      lower,
    )
  ) {
    found.push("linked_image");
  }
  if (
    /<!doctype\b/i.test(text) ||
    /<!entity\b/i.test(text) ||
    /%[a-z]+;/i.test(text)
  ) {
    found.push("entity_expansion");
  }
  if (
    /(?:\/[^\s"'<>]*\.\.\/[^\s"'<>]+)|(?:\.\.\\)/i.test(text) ||
    /\b[A-Za-z]:\\(?:Windows|Program\sFiles|Users|Temp|Windows\\System32)/i.test(
      text,
    )
  ) {
    found.push("path_traversal");
  }

  for (const term of hostileMcpTerms) {
    if (lower.includes(term)) {
      found.push("prompt_injection");
      break;
    }
  }

  return found;
}

export function categorizeMalformedInput(
  bytes: Uint8Array,
  detectedCategories: readonly HostileDocumentCategory[],
): ParserSafetyResultCategory {
  if (detectedCategories.includes("macro")) {
    return "unsafe_document";
  }
  if (detectedCategories.includes("script")) {
    return "unsafe_document";
  }
  if (detectedCategories.includes("active_content")) {
    return "unsafe_document";
  }
  if (detectedCategories.includes("ole_object")) {
    return "unsafe_document";
  }
  if (detectedCategories.includes("encrypted_or_password")) {
    return "password_protected";
  }
  if (
    detectedCategories.includes("entity_expansion") ||
    detectedCategories.includes("malformed_xml") ||
    detectedCategories.includes("malformed_structure")
  ) {
    return "malformed_document";
  }
  if (bytes.length === 0) {
    return "malformed_document";
  }
  return "malformed_document";
}

export function looksLikePartialOutput(
  outputPath: string | undefined,
  category: ParserSafetyResultCategory,
): boolean {
  return (
    outputPath !== undefined &&
    (category === "parser_terminated" ||
      category === "memory_limit_exceeded" ||
      category === "parser_failed")
  );
}

export function sanitizeResultCategory(
  category: ParserSafetyResultCategory,
): ParserSafetyResultCategory {
  return category;
}

export const parserSafetyResultMessages: Record<
  ParserSafetyResultCategory,
  string
> = {
  success: "Document processed successfully.",
  unsupported: "The document contains an unsupported feature.",
  password_protected: "Password-protected documents are not supported.",
  malformed_document: "The document structure is invalid.",
  unsafe_document: "The document could not be processed safely.",
  memory_limit_exceeded: "The document exceeded a processing limit.",
  parser_terminated: "Document processing was stopped.",
  parser_failed: "Document processing could not be completed safely.",
};

export function extractionFailureToSafetyCategory(
  failure: ExtractionFailure,
): ParserSafetyResultCategory {
  switch (failure.category) {
    case "malformed":
    case "corrupted":
      return "malformed_document";
    case "encrypted":
    case "password_protected":
      return "password_protected";
    case "unsupported":
      return "unsupported";
    case "resource_limit":
      return "memory_limit_exceeded";
    case "cancelled":
      return "parser_terminated";
    case "scanned_or_image_only":
      return "unsupported";
    case "unexpected":
      return "parser_failed";
  }
}

export async function createIsolatedWorkspace(
  parent: string,
): Promise<ParserWorkspace> {
  const identifier = randomBytes(16).toString("hex");
  if (!isAbsolute(parent) || parent.includes("\0")) {
    throw new ExtractionOperationError("unexpected");
  }
  const path = join(parent, `.nuvitae-safety-${identifier}`);
  await mkdir(path, { mode: 0o700 });
  return { path, identifier };
}

export async function destroyWorkspace(
  workspace: ParserWorkspace,
): Promise<void> {
  await rm(workspace.path, { recursive: true, force: true }).catch(
    () => undefined,
  );
}

export function validateIsolatedExecuteArguments(
  command: readonly string[],
): void {
  if (command.length === 0) {
    throw new ExtractionOperationError("unexpected");
  }
  for (const argument of command) {
    if (argument.includes("\0") || argument.length > maxArgLength) {
      throw new ExtractionOperationError("malformed");
    }
  }
  const executable = command[0]!;
  if (
    executable.includes("sh") ||
    executable.includes("bash") ||
    executable.includes("cmd") ||
    executable.includes("powershell") ||
    executable.includes("python") ||
    executable.includes("perl") ||
    executable.includes("ruby") ||
    executable.includes("php") ||
    executable.includes("lua") ||
    executable.includes("node")
  ) {
    throw new ExtractionOperationError("unsupported");
  }
}

export function filterSafeEnvironment(
  supplied: Readonly<Record<string, string>>,
  allowedKeys: readonly string[],
): NodeJS.ProcessEnv {
  const allowed = new Set(allowedKeys);
  const filtered: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(supplied)) {
    if (
      allowed.has(key) &&
      safeEnvKeyPattern.test(key) &&
      !key.includes("\0") &&
      !value.includes("\0") &&
      value.length <= 8192
    ) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export interface IsolateExecute {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly timeoutMilliseconds: number;
  readonly graceMilliseconds: number;
  readonly signal?: AbortSignal;
}

export async function isolateExecute(input: IsolateExecute): Promise<
  ExtractionResult<{
    readonly exitCode: number;
    readonly signal: string | null;
  }>
> {
  if (isAborted(input.signal)) {
    return failed("cancelled");
  }
  validateIsolatedExecuteArguments(input.command);

  return await new Promise((resolve) => {
    let child = undefined;
    try {
      child = spawn(input.command[0]!, input.command.slice(1), {
        cwd: input.cwd,
        detached: process.platform !== "win32",
        env: input.environment,
        shell: false,
        stdio: "ignore",
      });
    } catch {
      resolve(failed("unexpected"));
      return;
    }

    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const onAbort = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Termination is best-effort.
      }
      killTimer = setTimeout(() => {
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        } catch {
          // Force kill is best-effort.
        }
      }, input.graceMilliseconds);
      killTimer.unref();
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted === true) {
      onAbort();
    }

    const timeout = setTimeout(onAbort, input.timeoutMilliseconds);
    timeout.unref();

    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve(succeeded({ exitCode: code ?? -1, signal: signal ?? null }));
    });

    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve(failed("unexpected"));
    });
  });
}

export function safetyResultToExtractionFailure(
  category: ParserSafetyResultCategory,
): ExtractionFailure {
  switch (category) {
    case "success":
      return extractionFailure("unexpected");
    case "unsupported":
    case "password_protected":
      return extractionFailure(
        category === "password_protected"
          ? "password_protected"
          : "unsupported",
      );
    case "malformed_document":
      return extractionFailure("malformed");
    case "unsafe_document":
      return extractionFailure("unsupported");
    case "memory_limit_exceeded":
      return extractionFailure("resource_limit");
    case "parser_terminated":
      return extractionFailure("cancelled");
    case "parser_failed":
      return extractionFailure("unexpected");
  }
}

export function isSafeToPersist(
  category: ParserSafetyResultCategory,
  outputPath: string | undefined,
): boolean {
  return category === "success" && outputPath !== undefined;
}

export function validateFilePathForWorkspace(
  workspace: ParserWorkspace,
  candidate: string,
): string {
  if (!isAbsolute(candidate) || candidate.includes("\0")) {
    throw new ExtractionOperationError("malformed");
  }
  const prefix = workspace.path.endsWith("/")
    ? workspace.path
    : workspace.path + "/";
  if (!candidate.startsWith(prefix)) {
    throw new ExtractionOperationError("malformed");
  }
  const relative = candidate.slice(workspace.path.length);
  let normalized = relative;
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.includes("\\") ||
    normalized.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw new ExtractionOperationError("malformed");
  }
  return candidate;
}

export async function validateWorkspaceClean(
  workspace: ParserWorkspace,
): Promise<boolean> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(workspace.path, { withFileTypes: true });
    return entries.every((entry) => entry.isFile() && !entry.isSymbolicLink());
  } catch {
    return false;
  }
}

export function maskSensitiveOutput(text: string): string {
  return text
    .replace(/[A-Za-z0-9+/=]{40,}/g, "[redacted-base64]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    .replace(/\b(?:https?:\/\/)[^\s"'<>]+\b/g, (match) =>
      hostnamePattern.test(new URL(match).hostname) ? "[redacted-url]" : match,
    )
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted-ip]");
}
