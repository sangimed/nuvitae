import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function mode(stat) {
  return stat.mode & 0o777;
}

function identity() {
  return {
    uid: process.geteuid?.() ?? process.getuid?.(),
    gid: process.getegid?.() ?? process.getgid?.(),
  };
}

function category(target, paths) {
  if (target === paths.mount) return "result_mount";
  if (target === paths.mountParent) return "result_mount_parent";
  if (target === paths.runDirectory) return "run_directory";
  return "result_file";
}

async function statSnapshot(target, paths) {
  const value = await fs.stat(target);
  return {
    path_category: category(target, paths), uid: value.uid, gid: value.gid, mode: mode(value), dev: value.dev,
  };
}

function failure(operation, target, paths, error, before) {
  const errno = typeof error?.code === "string" ? error.code : "unknown";
  return {
    operation,
    path_category: category(target, paths),
    errno,
    effective_uid: identity().uid,
    effective_gid: identity().gid,
    owner_uid: before?.uid ?? null,
    owner_gid: before?.gid ?? null,
    mode: before?.mode ?? null,
    filesystem_device_equal: null,
    mount_access: "read_write",
    error_classification: errno === "EACCES" || errno === "EPERM" ? "permission_failure" : "filesystem_failure",
  };
}

async function record(records, operation, target, paths, action) {
  let before = null;
  try {
    before = await statSnapshot(target, paths);
  } catch (_error) {
    // A pre-operation stat may legitimately be absent, e.g. the run directory.
  }
  try {
    const value = await action();
    const after = await statSnapshot(target, paths).catch(() => null);
    records.push({ operation, ok: true, path_category: category(target, paths), before, after, value: value ?? null });
    return true;
  } catch (error) {
    records.push({ ...failure(operation, target, paths, error, before), ok: false });
    return false;
  }
}

export function resultPaths(resultPath) {
  const finalPath = path.resolve(resultPath);
  const runDirectory = path.dirname(finalPath);
  const mount = finalPath.startsWith("/spike/result/") ? "/spike/result" : finalPath.startsWith("/tmp/t201-result/") ? "/tmp/t201-result" : null;
  if (!mount) throw new Error("invalid_result_mount_path");
  return { finalPath, temporary: `${finalPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`, runDirectory, mount, mountParent: path.dirname(mount) };
}

/**
 * Performs the result-channel lifecycle without loading credentials or making a
 * network request. Every failure retains its first filesystem errno.
 */
export async function probeResultChannel(resultPath) {
  const paths = resultPaths(resultPath);
  const records = [];
  const mount = await record(records, "stat_result_mount", paths.mount, paths, () => fs.stat(paths.mount));
  if (!mount) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  const parent = await record(records, "stat_result_mount_parent", paths.mountParent, paths, () => fs.stat(paths.mountParent));
  if (!parent) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  if (!await record(records, "create_run_directory", paths.runDirectory, paths, () => fs.mkdir(paths.runDirectory, { mode: 0o700 }))) {
    return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  }
  if (!await record(records, "chmod_run_directory_0700", paths.runDirectory, paths, () => fs.chmod(paths.runDirectory, 0o700))) {
    return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  }
  const expected = identity();
  const verified = await record(records, "stat_verify_run_directory", paths.runDirectory, paths, async () => {
    const value = await fs.stat(paths.runDirectory);
    if (value.uid !== expected.uid || value.gid !== expected.gid || mode(value) !== 0o700) {
      const error = new Error("unsafe_run_directory"); error.code = "EPERM"; throw error;
    }
    return { owner_matches_effective_identity: true };
  });
  if (!verified) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  let handle;
  if (!await record(records, "create_temp_file_0600", paths.temporary, paths, async () => { handle = await fs.open(paths.temporary, "wx", 0o600); })) {
    return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  }
  const payload = JSON.stringify({ probe: "t201_live_result_channel", records, semantic_invocation_attempted: false });
  if (!await record(records, "write_sanitized_json", paths.temporary, paths, () => handle.writeFile(`${payload}\n`))) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  if (!await record(records, "fsync_temp_file", paths.temporary, paths, () => handle.sync())) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  if (!await record(records, "stat_temp_file", paths.temporary, paths, async () => {
    const temp = await fs.stat(paths.temporary); const directory = await fs.stat(paths.runDirectory);
    if (temp.uid !== expected.uid || temp.gid !== expected.gid || mode(temp) !== 0o600 || temp.dev !== directory.dev) {
      const error = new Error("unsafe_temp_file"); error.code = temp.dev !== directory.dev ? "EXDEV" : "EPERM"; throw error;
    }
    return { same_filesystem: true };
  })) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  await handle.close(); handle = undefined;
  if (!await record(records, "rename_temp_to_final", paths.finalPath, paths, () => fs.rename(paths.temporary, paths.finalPath))) return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.at(-1) };
  const directoryHandle = await fs.open(paths.runDirectory, "r");
  try {
    await record(records, "fsync_run_directory", paths.runDirectory, paths, () => directoryHandle.sync());
  } finally {
    await directoryHandle.close();
  }
  return { probe: "t201_live_result_channel", identity: identity(), records, first_failure: records.find((item) => !item.ok) ?? null };
}

export async function cleanupResultChannel(resultPath) {
  const paths = resultPaths(resultPath);
  const records = [];
  await record(records, "unlink_result", paths.finalPath, paths, () => fs.unlink(paths.finalPath));
  await record(records, "remove_run_directory", paths.runDirectory, paths, () => fs.rmdir(paths.runDirectory));
  return { probe: "t201_live_result_channel_cleanup", identity: identity(), records, first_failure: records.find((item) => !item.ok) ?? null };
}
