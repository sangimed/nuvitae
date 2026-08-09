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

function resolvedResultPath(resultPath) {
  const resolved = path.resolve(resultPath);
  if (!RESULT_ROOTS.some((root) => resolved.startsWith(root))) throw new Error("invalid_broker_result_path");
  return resolved;
}

export function runtimeIdentity() {
  const uid = process.geteuid?.() ?? process.getuid?.();
  const gid = process.getegid?.() ?? process.getgid?.();
  if (!Number.isInteger(uid) || !Number.isInteger(gid) || uid === 0) throw new Error("result_artifact_runtime_identity_invalid");
  return { uid, gid };
}

export async function verifyPreparedResultDirectory(resultPath, expectedIdentity = runtimeIdentity()) {
  const directory = path.dirname(path.resolve(resultPath));
  let stat;
  try {
    stat = await fs.stat(directory);
  } catch (error) {
    throw resultArtifactError("stat_directory", error);
  }
  if (!stat.isDirectory()) throw resultArtifactError("stat_directory", { code: "ENOTDIR" });
  if (stat.uid !== expectedIdentity.uid || stat.gid !== expectedIdentity.gid) {
    throw resultArtifactError("verify_directory_owner", { code: "EPERM" });
  }
  if ((stat.mode & 0o777) !== 0o700) throw resultArtifactError("verify_directory_mode", { code: "EPERM" });
  return {
    effective_uid: expectedIdentity.uid,
    effective_gid: expectedIdentity.gid,
    directory_uid: stat.uid,
    directory_gid: stat.gid,
    directory_mode: stat.mode & 0o777,
  };
}

export async function prepareBrokerResultDirectory(resultPath) {
  const resolved = resolvedResultPath(resultPath);
  const directory = path.dirname(resolved);
  try {
    await fs.mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw resultArtifactError("create_directory", error);
  }
  try {
    await fs.chmod(directory, 0o700);
  } catch (error) {
    throw resultArtifactError("set_directory_mode", error);
  }
  const topology = await verifyPreparedResultDirectory(resolved);
  const volume = await fs.stat(path.dirname(directory)).catch((error) => {
    throw resultArtifactError("stat_volume_root", error);
  });
  if (volume.dev !== (await fs.stat(directory)).dev) throw resultArtifactError("verify_directory_filesystem", { code: "EXDEV" });
  return { ...topology, same_filesystem: true };
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

function assertReaderEnvironmentIsolated(env) {
  const forbidden = Object.keys(env ?? {}).find((key) => /^(CODEX|OPENAI|OAUTH|NUVITAE_T199_)/.test(key));
  if (forbidden) throw new Error("result_reader_provider_environment_forbidden");
}

function verifyPrivateFile(stat, identity) {
  if (stat.isSymbolicLink()) throw resultArtifactError("lstat_file", { code: "ELOOP" });
  if (!stat.isFile()) throw resultArtifactError("verify_file_type", { code: "EINVAL" });
  if (stat.uid !== identity.uid || stat.gid !== identity.gid) throw resultArtifactError("verify_file_owner", { code: "EPERM" });
  if ((stat.mode & 0o777) !== 0o600) throw resultArtifactError("verify_file_mode", { code: "EPERM" });
  if (stat.size > MAX_RESULT_BYTES) throw resultArtifactError("file_size", { code: "EFBIG" });
}

export async function writeAtomicBrokerResult(result, resultPath = process.env.NUVITAE_T201_RESULT_PATH) {
  const serialized = JSON.stringify(result);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RESULT_BYTES) throw new Error("broker_result_too_large");
  if (containsSecretLikeValue(serialized)) throw new Error("secret_like_value_in_broker_result");
  if (!resultPath) return `${serialized}\n`;
  const resolved = resolvedResultPath(resultPath);
  const topology = await verifyPreparedResultDirectory(resolved);
  const temp = `${resolved}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(`${serialized}\n`);
    await handle.sync();
    const temporary = await handle.stat();
    if (temporary.dev !== (await fs.stat(path.dirname(resolved)).catch((error) => { throw resultArtifactError("stat_directory", error); })).dev) {
      throw resultArtifactError("verify_temp_filesystem", { code: "EXDEV" });
    }
    verifyPrivateFile(temporary, { uid: topology.effective_uid, gid: topology.effective_gid });
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
  try {
    const final = await fs.lstat(resolved);
    verifyPrivateFile(final, { uid: topology.effective_uid, gid: topology.effective_gid });
    if (final.dev !== (await fs.stat(path.dirname(resolved)).catch((error) => { throw resultArtifactError("stat_directory", error); })).dev) {
      throw resultArtifactError("verify_final_filesystem", { code: "EXDEV" });
    }
  } catch (error) {
    if (error?.safe_result_artifact_operation) throw error;
    throw resultArtifactError("verify_final_file", error);
  }
  return `${serialized}\n`;
}

export async function emitBrokerResult(result) {
  const text = await writeAtomicBrokerResult(result);
  process.stdout.write(text);
}

export async function readFinalBrokerResult(resultPath = process.env.NUVITAE_T201_RESULT_PATH, env = process.env) {
  assertReaderEnvironmentIsolated(env);
  const resolved = resolvedResultPath(resultPath);
  const identity = runtimeIdentity();
  await verifyPreparedResultDirectory(resolved, identity);
  let before;
  try {
    before = await fs.lstat(resolved);
  } catch (error) {
    throw resultArtifactError("lstat_file", error);
  }
  verifyPrivateFile(before, identity);
  let handle;
  try {
    handle = await fs.open(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const opened = await handle.stat();
    verifyPrivateFile(opened, identity);
    if (opened.dev !== (await fs.stat(path.dirname(resolved)).catch((error) => { throw resultArtifactError("stat_directory", error); })).dev) {
      throw resultArtifactError("verify_file_filesystem", { code: "EXDEV" });
    }
    const text = await handle.readFile({ encoding: "utf8" });
    const result = exactJson(text);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw resultArtifactError("malformed_json", { code: "EINVAL" });
    return { result, text, reader_uid: identity.uid, reader_gid: identity.gid, file_mode: opened.mode & 0o777, same_filesystem: true };
  } finally {
    await handle?.close().catch(() => undefined);
  }
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
