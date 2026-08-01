import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { containsSecretLikeValue, sanitizeErrorCategory } from "./sanitize.mjs";

const RESULT_ROOTS = ["/spike/result/", "/tmp/t201-result/"];
const MAX_RESULT_BYTES = 131072;

function resultArtifactError(operation, error) {
  const wrapped = new Error(`result_artifact_${operation}_${error?.code ?? "unknown"}`);
  wrapped.safe_result_artifact_operation = operation;
  wrapped.safe_result_artifact_errno = error?.code ?? "unknown";
  return wrapped;
}

export async function verifyPreparedResultDirectory(resultPath) {
  const directory = path.dirname(path.resolve(resultPath));
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch (error) {
    throw resultArtifactError("stat_directory", error);
  }
  if (!stat.isDirectory()) throw resultArtifactError("stat_directory", { code: "ENOTDIR" });
  if ((stat.mode & 0o077) !== 0) throw resultArtifactError("verify_directory_mode", { code: "EPERM" });
  return { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 };
}

function safeHash(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function safeErrorCategory(text) {
  const value = String(text ?? "").toLowerCase();
  if (value.includes("cannot find module") || value.includes("err_module_not_found") || value.includes("syntaxerror")) return "module_load_failure";
  if (value.includes("permission denied") || value.includes("eacces")) return "permission_failure";
  return sanitizeErrorCategory(value || "unknown");
}

function exactJson(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.endsWith("\n") && value.includes("\n")) return null;
  const body = value.endsWith("\n") ? value.slice(0, -1) : value;
  if (body.length === 0 || body.includes("\n")) return null;
  try {
    return JSON.parse(body);
  } catch (_error) {
    return null;
  }
}

export async function writeAtomicBrokerResult(result, resultPath = process.env.NUVITAE_T201_RESULT_PATH) {
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RESULT_BYTES) throw new Error("broker_result_too_large");
  if (containsSecretLikeValue(serialized)) throw new Error("secret_like_value_in_broker_result");
  if (!resultPath) return `${serialized}\n`;
  const resolved = path.resolve(resultPath);
  if (!RESULT_ROOTS.some((root) => resolved.startsWith(root))) throw new Error("invalid_broker_result_path");
  await verifyPreparedResultDirectory(resolved);
  const temp = `${resolved}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(`${serialized}\n`);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    throw resultArtifactError("create_write_fsync_temp", error);
  }
  try {
    await fs.rename(temp, resolved);
  } catch (error) {
    throw resultArtifactError("rename_same_directory", error);
  }
  return `${serialized}\n`;
}

export async function emitBrokerResult(result) {
  const text = await writeAtomicBrokerResult(result);
  process.stdout.write(text);
}

export async function inspectBrokerResultChannel({ resultPath, stdoutPath, stderrPath, brokerExitCode, processStartFailed = false }) {
  const [resultText, stdoutText, stderrText] = await Promise.all([
    resultPath ? fs.readFile(resultPath, "utf8").catch(() => "") : Promise.resolve(""),
    stdoutPath ? fs.readFile(stdoutPath, "utf8").catch(() => "") : Promise.resolve(""),
    stderrPath ? fs.readFile(stderrPath, "utf8").catch(() => "") : Promise.resolve(""),
  ]);
  const result = exactJson(resultText);
  const stdoutResult = exactJson(stdoutText);
  const resultState = result ? "valid_broker_result" : resultText.length === 0 ? "empty_result" : "malformed_json_result";
  const stdoutState = stdoutText.length === 0 ? "empty_stdout" : stdoutResult ? "single_json_stdout" : "mixed_stdout_result";
  let infrastructureCategory = null;
  if (!result) {
    if (processStartFailed) infrastructureCategory = "process_start_failure";
    else if (safeErrorCategory(stderrText) === "module_load_failure") infrastructureCategory = "module_load_failure";
    else if (resultState === "malformed_json_result") infrastructureCategory = "malformed_json_result";
    else if (stdoutState === "mixed_stdout_result") infrastructureCategory = "mixed_stdout_result";
    else if (brokerExitCode !== 0) infrastructureCategory = "broker_crash";
    else infrastructureCategory = "empty_result";
  }
  return {
    result,
    result_state: resultState,
    stdout_state: stdoutState,
    infrastructure_category: infrastructureCategory,
    stdout_byte_count: Buffer.byteLength(stdoutText, "utf8"),
    stderr_byte_count: Buffer.byteLength(stderrText, "utf8"),
    stdout_sha256: stdoutText ? safeHash(stdoutText) : null,
    stderr_sha256: stderrText ? safeHash(stderrText) : null,
    stderr_safe_category: stderrText ? safeErrorCategory(stderrText) : "none",
  };
}

export async function removeBrokerResultArtifacts(paths) {
  await Promise.all(paths.filter(Boolean).map((item) => fs.rm(item, { force: true }).catch(() => undefined)));
}
