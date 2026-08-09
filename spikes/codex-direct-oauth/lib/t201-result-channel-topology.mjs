import crypto from "node:crypto";

const hash = (value) => crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");

function envValues(env) {
  return Object.fromEntries(
    (env ?? []).filter((item) => item.startsWith("NUVITAE_T201_")).map((item) => {
      const [name, value] = item.split(/=(.*)/s); return [name, value];
    }),
  );
}

export function normalizeTopology({ label, service, composeProject, inspect, imageDigest, probe }) {
  const config = inspect?.Config ?? {};
  const mounts = (inspect?.Mounts ?? []).filter((mount) => mount.Destination === "/spike/result").map((mount) => ({
    type: mount.Type ?? "unknown",
    source_hash: hash(mount.Name ?? mount.Source ?? ""),
    target: mount.Destination,
    read_write: mount.RW === true,
    volume_kind: mount.Type === "volume" ? (mount.Driver ? "docker_named_volume" : "unknown_volume") : mount.Type ?? "unknown",
    copy_behavior: mount.Type === "volume" ? "docker_default_copy_unless_nocopy" : "not_applicable",
  }));
  const mountRecord = probe?.records?.find((item) => item.operation === "stat_result_mount");
  const parentRecord = probe?.records?.find((item) => item.operation === "stat_result_mount_parent");
  return {
    label,
    compose_project_hash: hash(composeProject),
    service,
    image_digest_hash: imageDigest ? hash(imageDigest) : null,
    container_image_hash: config.Image ? hash(config.Image) : null,
    declared_image_user: config.User || null,
    effective_uid: probe?.identity?.uid ?? null,
    effective_gid: probe?.identity?.gid ?? null,
    working_directory: config.WorkingDir || "/",
    entrypoint: config.Entrypoint ?? null,
    command: config.Cmd ?? null,
    result_mounts: mounts,
    result_path_environment: envValues(config.Env),
    result_mount: mountRecord?.after ?? mountRecord?.before ?? null,
    result_mount_parent: parentRecord?.after ?? parentRecord?.before ?? null,
    filesystem_device_equal: mountRecord?.after?.dev === parentRecord?.after?.dev,
    mount_information: mounts.map((mount) => ({ target: mount.target, read_write: mount.read_write, type: mount.type })),
  };
}

export function compareTopologies(offline, live) {
  const fields = ["service", "image_digest_hash", "container_image_hash", "declared_image_user", "effective_uid", "effective_gid", "working_directory", "entrypoint", "command", "result_mounts", "result_path_environment", "result_mount", "result_mount_parent", "filesystem_device_equal", "mount_information"];
  const differences = fields.filter((field) => JSON.stringify(offline?.[field]) !== JSON.stringify(live?.[field])).map((field) => ({ field, offline: offline?.[field] ?? null, live: live?.[field] ?? null }));
  return { comparison: "sanitized_normalized_t201_result_channel_topology", equal: differences.length === 0, differences };
}

export function staleImageDetected({ builtImageDigest, containerImage }) {
  return Boolean(builtImageDigest && containerImage && builtImageDigest !== containerImage);
}
