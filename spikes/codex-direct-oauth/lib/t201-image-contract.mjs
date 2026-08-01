import crypto from "node:crypto";

export const T201_IMMUTABLE_IMAGE_ENV = "NUVITAE_T201_IMMUTABLE_IMAGE";
const IMMUTABLE_IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const safeHash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

function commandFailure(operation, command) {
  const error = new Error(`immutable_image_${operation}_failed`);
  error.safe_operation = operation;
  error.command = command;
  return error;
}

export function assertImmutableImageReference(reference) {
  if (typeof reference !== "string" || !IMMUTABLE_IMAGE_ID.test(reference)) {
    throw new Error("immutable_image_reference_required");
  }
  return reference;
}

export function declaredRuntimeUserIsNonRoot(user) {
  const value = String(user ?? "").trim();
  if (!value || /^(?:root|0)(?::0)?$/i.test(value)) return false;
  return true;
}

function parseImageInspection(raw) {
  try {
    const value = JSON.parse(raw.stdout ?? "");
    return Array.isArray(value) ? value[0] : value;
  } catch {
    return null;
  }
}

async function command(execute, operation, executable, args, cwd, env) {
  const raw = await execute({ executable, args, cwd, env });
  if (!raw?.process_started || raw.timed_out || raw.exit_code !== 0) throw commandFailure(operation, [executable, ...args]);
  return raw;
}

// This is intentionally the only T201 image-build entry point. The mutable
// build tag is short-lived developer convenience; all later execution uses the
// local content-addressed image ID returned by Docker.
export async function prepareImmutableT201Image({ root, execute, runId = crypto.randomBytes(16).toString("hex"), env = process.env } = {}) {
  if (typeof execute !== "function") throw new Error("immutable_image_execute_required");
  const buildTag = `nuvitae-codex-direct-oauth-t201-prepared-${runId}`;
  await command(execute, "preparation_image_build", "docker", ["build", "--pull=false", "--tag", buildTag, "."], root, env);
  const inspection = parseImageInspection(await command(execute, "preparation_image_inspection", "docker", ["image", "inspect", buildTag], root, env));
  const reference = assertImmutableImageReference(inspection?.Id);
  const declaredUser = inspection?.Config?.User;
  if (!declaredRuntimeUserIsNonRoot(declaredUser)) throw new Error("immutable_image_non_root_user_required");
  return {
    // `reference` is deliberately process-local. Never place it in evidence.
    reference,
    identity_hash: safeHash(reference),
    declared_runtime_user_hash: safeHash(declaredUser),
    build_tag_hash: safeHash(buildTag),
  };
}

export async function verifyPreparedT201Image({ preparedImage, root, execute, env = process.env } = {}) {
  if (typeof execute !== "function") throw new Error("immutable_image_execute_required");
  const reference = assertImmutableImageReference(preparedImage?.reference);
  const inspection = parseImageInspection(await command(execute, "prepared_image_reinspection", "docker", ["image", "inspect", reference], root, env));
  const resolved = assertImmutableImageReference(inspection?.Id);
  if (resolved !== reference) throw new Error("immutable_image_identity_mismatch");
  if (!declaredRuntimeUserIsNonRoot(inspection?.Config?.User)) throw new Error("immutable_image_non_root_user_required");
  return {
    reference,
    identity_hash: safeHash(reference),
    declared_runtime_user_hash: safeHash(inspection.Config.User),
  };
}

export function safePreparedImageEvidence(preparedImage) {
  return {
    immutable_image_identity_hash: preparedImage?.identity_hash ?? null,
    declared_runtime_user_hash: preparedImage?.declared_runtime_user_hash ?? null,
  };
}
